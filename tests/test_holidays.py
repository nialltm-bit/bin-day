import json
from datetime import UTC, date, datetime, timedelta

import pytest

from fetcher import holidays

VECTORS = json.loads((holidays.HOLIDAYS_PATH.parent / "test-vectors" / "holiday-weeks.json").read_text())


@pytest.mark.parametrize("case", VECTORS["cases"], ids=lambda c: c["date"])
def test_holiday_week_rule_matches_the_shared_vectors(case):
    dates = holidays.dates_for("E06000022")
    assert holidays.in_holiday_week(date.fromisoformat(case["date"]), dates) is case["holiday_week"], case["why"]


def test_regions_follow_the_ons_code():
    assert holidays.region_for("E06000022") == "england-and-wales"
    assert holidays.region_for("W06000015") == "england-and-wales"
    assert holidays.region_for("S12000033") == "scotland"
    assert holidays.region_for("N09000001") == "northern-ireland"


def test_only_verified_regions_are_used():
    assert holidays.dates_for("E06000022")
    assert holidays.dates_for("S12000033") is None  # drafted, not yet checked against gov.scot
    assert holidays.dates_for("N09000001") is None  # drafted, not yet checked against nidirect


def test_a_region_marked_verified_is_used():
    regions = {"scotland": {"verified": True, "dates": ["2026-01-02"]}}
    assert holidays.dates_for("S12000033", regions) == ["2026-01-02"]
    assert holidays.last_date("S12000033", regions) == "2026-01-02"


def test_every_region_has_sorted_unique_weekday_dates():
    for name, region in holidays.load().items():
        dates = region["dates"]
        assert dates == sorted(set(dates)), name
        assert all(date.fromisoformat(d).weekday() < 5 for d in dates), f"{name} has a weekend date"


def test_the_christmas_weeks_are_covered_for_every_region():
    for name, region in holidays.load().items():
        for year in (2026, 2027):
            assert f"{year}-12-25" in region["dates"] or f"{year}-12-27" in region["dates"], f"{name} {year}"


def test_the_calendar_reaches_far_enough_ahead():
    """A reminder to add the next years before the data runs out: this starts failing about 60 days before it does."""
    today = datetime.now(UTC).date()
    last = date.fromisoformat(holidays.last_date("E06000022") or "1970-01-01")
    assert last >= today + timedelta(days=60), "Add the next year's bank holidays to registry/bank-holidays.json"
