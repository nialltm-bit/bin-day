import json
from datetime import UTC, datetime

from fetcher import testaddress
from fetcher.ratelimit import CouncilRateLimiter

COUNCIL = {
    "ons_code": "E06000099",
    "name": "Testville",
    "status": "supported",
    "schedule": "next_only",
    "inputs": ["postcode", "house_number"],
    "source": {"type": "ukbcd", "module": "TestvilleCouncil", "url": "https://example.gov.uk"},
    "bin_types": {"Black": {"stream": "general"}},
    "test_address": {"postcode": "AB1 2CD", "house_number": "1"},
}
REGIONS = {"england-and-wales": {"verified": True, "dates": []}}
SUNDAYS = [datetime(2026, 11, 1, 6, tzinfo=UTC), datetime(2026, 11, 8, 6, tzinfo=UTC), datetime(2026, 11, 15, 6, tzinfo=UTC)]


def _fetch(dates):
    def fetch(council, address, selenium_url):
        assert address.postcode == "AB1 2CD" and address.house_number == "1"
        return {"bins": [{"type": "Black", "collectionDate": d} for d in dates]}

    return fetch


def _week(now, dates, state, learned, councils=None):
    return testaddress.run_test_addresses(
        councils or {"E06000099": COUNCIL}, now, state, learned, fetch=_fetch(dates), holiday_regions=REGIONS,
        limiter=CouncilRateLimiter(sleep=lambda s: None),
    )


def test_two_weeks_of_test_address_fetches_teach_a_fortnightly_bin():
    state, learned = {"councils": {}}, {"bins": {}}
    _week(SUNDAYS[0], ["02/11/2026"], state, learned)
    assert learned["bins"] == {}  # nothing to compare yet
    _week(SUNDAYS[1], ["16/11/2026"], state, learned)
    assert learned["bins"]["E06000099"]["Black"]["observations"] == {"2": 1}
    _week(SUNDAYS[2], ["16/11/2026"], state, learned)  # the 16th has not passed: no observation
    assert learned["bins"]["E06000099"]["Black"]["observations"] == {"2": 1}


def test_a_council_is_fetched_once_a_week_not_every_run():
    state, learned = {"councils": {}}, {"bins": {}}
    assert [o.status for o in _week(SUNDAYS[0], ["02/11/2026"], state, learned)] == ["fetched"]
    assert [o.status for o in _week(SUNDAYS[0], ["02/11/2026"], state, learned)] == ["skipped"]


def test_a_council_whose_bins_are_all_known_is_not_fetched():
    done = {"bins": {"E06000099": {"Black": {"observations": {"2": 2}, "weeks": 2}}}}
    assert _week(SUNDAYS[0], ["02/11/2026"], {"councils": {}}, done) == []
    fixed = {**COUNCIL, "bin_types": {"Black": {"stream": "general", "every_weeks": 2}}}
    assert _week(SUNDAYS[0], ["02/11/2026"], {"councils": {}}, {"bins": {}}, {"E06000099": fixed}) == []


def test_a_full_schedule_council_is_not_fetched():
    full = {**COUNCIL, "schedule": "full"}
    assert _week(SUNDAYS[0], ["02/11/2026"], {"councils": {}}, {"bins": {}}, {"E06000099": full}) == []


def test_a_failure_is_remembered_by_kind_only_and_not_retried_that_day():
    def failing(council, address, selenium_url):
        from fetcher.model import UpstreamError

        raise UpstreamError("ConnectionError", "https://example.gov.uk/?postcode=AB1 2CD")

    state, learned = {"councils": {}}, {"bins": {}}
    out = testaddress.run_test_addresses({"E06000099": COUNCIL}, SUNDAYS[0], state, learned, fetch=failing, holiday_regions=REGIONS,
                                         limiter=CouncilRateLimiter(sleep=lambda s: None))
    assert out[0].status == "failed" and out[0].log_detail == "ConnectionError"
    assert state["councils"]["E06000099"]["last_error"] == "ConnectionError"
    assert "AB1" not in json.dumps(state)
    assert [o.status for o in _week(SUNDAYS[0], ["02/11/2026"], state, learned)] == ["skipped"]
