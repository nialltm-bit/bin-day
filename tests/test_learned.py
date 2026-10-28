"""Frequencies learned from repeat fetches for next_only councils (FRE-293)."""
import json
from datetime import UTC, date, datetime

from fetcher import learned
from fetcher.model import Address
from fetcher.ratelimit import CouncilRateLimiter
from fetcher.run import run
from fetcher.store import FileStore

NO_HOLIDAYS: list[str] = []
COUNCIL = {
    "ons_code": "E06000099",
    "name": "Example",
    "status": "supported",
    "schedule": "next_only",
    "bin_types": {"Black": {"stream": "general"}, "Box": {"stream": "recycling", "every_weeks": 1}},
}


def test_a_gap_of_whole_weeks_after_the_last_date_has_passed_is_one_observation():
    assert learned.observed_weeks(date(2026, 11, 3), date(2026, 11, 17), date(2026, 11, 8), NO_HOLIDAYS) == 2
    assert learned.observed_weeks(date(2026, 11, 3), date(2026, 11, 10), date(2026, 11, 8), NO_HOLIDAYS) == 1


def test_a_date_that_has_not_passed_or_passed_over_a_week_ago_shows_nothing():
    assert learned.observed_weeks(date(2026, 11, 10), date(2026, 11, 10), date(2026, 11, 8), NO_HOLIDAYS) is None
    assert learned.observed_weeks(date(2026, 11, 3), date(2026, 11, 24), date(2026, 11, 15), NO_HOLIDAYS) is None


def test_a_gap_that_is_not_whole_weeks_or_touches_a_holiday_shows_nothing():
    assert learned.observed_weeks(date(2026, 11, 3), date(2026, 11, 14), date(2026, 11, 8), NO_HOLIDAYS) is None
    assert learned.observed_weeks(date(2026, 12, 22), date(2026, 12, 30), date(2026, 12, 27), ["2026-12-25"]) is None


def test_a_one_day_shift_still_counts_as_the_same_whole_weeks():
    assert learned.observed_weeks(date(2026, 11, 3), date(2026, 11, 18), date(2026, 11, 8), NO_HOLIDAYS) == 2


def test_a_frequency_is_trusted_after_two_agreeing_observations():
    data = {"bins": {}}
    assert learned.record(data, "E06000099", "Black", 2) is None
    assert "weeks" not in data["bins"]["E06000099"]["Black"]
    learned.record(data, "E06000099", "Black", 2)
    assert data["bins"]["E06000099"]["Black"]["weeks"] == 2


def test_mixed_observations_are_not_trusted():
    data = {"bins": {}}
    for weeks in (1, 2, 2):
        learned.record(data, "E06000099", "Black", weeks)
    assert "weeks" not in data["bins"]["E06000099"]["Black"]


def test_a_later_disagreement_is_flagged_and_does_not_change_what_was_learned():
    data = {"bins": {}}
    learned.record(data, "E06000099", "Black", 2)
    learned.record(data, "E06000099", "Black", 2)
    assert learned.record(data, "E06000099", "Black", 1) == learned.CONFLICT
    entry = data["bins"]["E06000099"]["Black"]
    assert entry["weeks"] == 2 and entry["conflicts"] == 1


def test_applying_fills_only_bins_with_no_frequency_set_by_hand():
    data = {"bins": {"E06000099": {"Black": {"weeks": 2}, "Box": {"weeks": 3}}}}
    applied = learned.apply({"E06000099": COUNCIL}, data)["E06000099"]
    assert applied["bin_types"]["Black"]["every_weeks"] == 2
    assert applied["bin_types"]["Box"]["every_weeks"] == 1
    assert "every_weeks" not in COUNCIL["bin_types"]["Black"]


def test_a_full_schedule_council_is_never_learned():
    assert not learned.needs_learning({**COUNCIL, "schedule": "full"}, "Black")


def _fetch(dates):
    def fetch(council, address, selenium_url):
        return {"bins": [{"type": "Black", "collectionDate": d} for d in dates]}

    return fetch


def test_the_fetcher_learns_a_frequency_over_weekly_fetches_and_saves_nothing_private(tmp_path):
    store = FileStore(tmp_path / "store.json")
    for uprn in ("700001", "700002"):
        store.add_address(Address(uprn=uprn, ons_code="E06000099"))
    data = {"bins": {}}
    sundays = [datetime(2026, 11, 1, 6, tzinfo=UTC), datetime(2026, 11, 8, 6, tzinfo=UTC)]
    returns = [["02/11/2026"], ["16/11/2026"]]  # collected Monday 2 November, next due fortnightly on the 16th
    for now, dates in zip(sundays, returns, strict=True):
        regions = {"england-and-wales": {"verified": True, "dates": []}}
        limiter = CouncilRateLimiter(sleep=lambda s: None)
        run(store, {"E06000099": COUNCIL}, now, fetch=_fetch(dates), holiday_regions=regions, learned=data, force=True, limiter=limiter)
    assert data["bins"]["E06000099"]["Black"]["weeks"] == 2
    assert "700001" not in json.dumps(data) and "uprn" not in json.dumps(data)
