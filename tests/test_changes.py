import json
from datetime import UTC, date, datetime

import pytest

from fetcher import holidays, registry
from fetcher.changes import EXPECTED_SHIFT, ROUND_CHANGE, check_response, detect_changes
from fetcher.model import Address, Collection, SuspiciousResultError
from fetcher.ratelimit import CouncilRateLimiter
from fetcher.run import format_outcome, run
from fetcher.sheet_store import SheetStore
from fetcher.store import FileStore

BATHNES = "E06000022"
UPRN = "100120000855"
GREEN = "Green Recycling Box"
BLACK = "Black Rubbish Bin (140L)"
FOOD = "Food Recycling Collection Bin"


@pytest.fixture(scope="module")
def council():
    return registry.load()[BATHNES]


@pytest.fixture(scope="module")
def hols():
    return holidays.dates_for(BATHNES)


def stored(day, bin_name=GREEN, stream="recycling"):
    return [{"date": day, "bin_name": bin_name, "stream": stream}]


def got(day, bin_name=GREEN, stream="recycling"):
    return [Collection(date=day, bin_name=bin_name, stream=stream)]


def one(council, hols, before, after, today, bin_name=GREEN):
    changes = detect_changes(council, stored(before, bin_name), got(after, bin_name), date.fromisoformat(today), hols)
    return changes[0] if changes else None


class TestNextOnlyChanges:
    def test_no_change_when_the_date_is_where_we_expected(self, council, hols):
        # fetched Friday 30 October, re-fetched Sunday 1 November: a weekly bin is next due on 6 November
        assert one(council, hols, "2026-10-30", "2026-11-06", "2026-11-01") is None

    def test_a_fortnightly_bin_is_expected_two_weeks_on(self, council, hols):
        assert one(council, hols, "2026-10-30", "2026-11-13", "2026-11-01", BLACK) is None

    def test_a_different_weekday_is_a_round_change(self, council, hols):
        change = one(council, hols, "2026-10-30", "2026-11-09", "2026-11-01")
        assert (change.kind, change.before, change.after) == (ROUND_CHANGE, "2026-11-06", "2026-11-09")
        assert "weekday changed from Friday to Monday" in change.note

    def test_a_flipped_fortnight_is_a_round_change(self, council, hols):
        change = one(council, hols, "2026-10-30", "2026-11-06", "2026-11-01", BLACK)
        assert change.kind == ROUND_CHANGE
        assert "week pattern changed by -1 week" in change.note

    def test_a_one_day_move_in_a_bank_holiday_week_is_an_expected_shift(self, council, hols):
        # 4 May 2026 is a bank holiday, so the Thursday 7 May collection moving to Friday 8 May is expected
        change = one(council, hols, "2026-04-30", "2026-05-08", "2026-05-03")
        assert (change.kind, change.before, change.after) == (EXPECTED_SHIFT, "2026-05-07", "2026-05-08")

    def test_a_two_day_move_at_christmas_is_an_expected_shift(self, council, hols):
        # a weekly bin last seen on Friday 18 December is expected on Friday 25 December
        assert one(council, hols, "2026-12-18", "2026-12-28", "2026-12-20").kind == ROUND_CHANGE  # three days is too many
        assert one(council, hols, "2026-12-18", "2026-12-27", "2026-12-20").kind == EXPECTED_SHIFT  # two days later
        assert one(council, hols, "2026-12-18", "2026-12-26", "2026-12-20").kind == EXPECTED_SHIFT
        assert one(council, hols, "2026-12-18", "2026-12-24", "2026-12-20").kind == EXPECTED_SHIFT  # a day earlier

    def test_the_same_move_outside_a_holiday_week_is_a_round_change(self, council, hols):
        assert one(council, hols, "2026-10-30", "2026-11-07", "2026-11-01").kind == ROUND_CHANGE

    def test_a_shift_that_follows_an_earlier_holiday_shift_is_still_expected(self, council, hols):
        # last fetch saw the revised Wednesday 13 January; the normal Tuesday 19 January is a day earlier than 20 January
        # would suggest, and only the anchor's week is a holiday week
        change = one(council, hols, "2027-01-13", "2027-01-19", "2027-01-17")
        assert change.kind == EXPECTED_SHIFT

    def test_without_that_holiday_the_same_difference_is_a_round_change(self, council, hols):
        assert one(council, hols, "2026-11-06", "2026-11-12", "2026-11-08").kind == ROUND_CHANGE

    def test_unknown_bank_holidays_never_hide_a_change(self, council):
        change = one(council, None, "2026-04-30", "2026-05-08", "2026-05-03")
        assert change.kind == ROUND_CHANGE
        assert "bank holidays are not known" in change.note

    def test_the_first_fetch_has_nothing_to_compare_with(self, council, hols):
        assert detect_changes(council, [], got("2026-10-30"), date(2026, 10, 27), hols) == []

    def test_a_bin_we_have_not_seen_before_is_not_a_change(self, council, hols):
        assert detect_changes(council, stored("2026-10-30", BLACK), got("2026-11-06", FOOD, "food"), date(2026, 11, 1), hols) == []

    def test_a_bin_with_no_frequency_cannot_be_compared(self, council, hols):
        without = {**council, "bin_types": {GREEN: {"stream": "recycling"}}}
        assert detect_changes(without, stored("2026-10-30"), got("2026-11-09"), date(2026, 11, 1), hols) == []

    def test_a_date_stepped_forward_from_an_old_anchor(self, council, hols):
        # last fetched a month ago; a fortnightly bin expected on 13 November, then 27 November
        assert one(council, hols, "2026-10-16", "2026-11-13", "2026-11-01", BLACK) is None

    def test_changes_to_each_bin_are_reported_separately(self, council, hols):
        previous = stored("2026-10-30", GREEN) + stored("2026-10-30", FOOD, "food")
        new = got("2026-11-06", GREEN) + got("2026-11-09", FOOD, "food")
        changes = detect_changes(council, previous, new, date(2026, 11, 1), hols)
        assert [(c.bin_name, c.kind) for c in changes] == [(FOOD, ROUND_CHANGE)]


class TestFullScheduleChanges:
    @pytest.fixture
    def full(self, council):
        bins = {name: {k: v for k, v in entry.items() if k != "every_weeks"} for name, entry in council["bin_types"].items()}
        return {**council, "schedule": "full", "bin_types": bins}

    def previous(self):
        return [{"date": d, "bin_name": GREEN, "stream": "recycling"} for d in ("2026-10-30", "2026-11-06", "2026-11-13", "2026-11-20")]

    def new(self, *days):
        return [Collection(date=d, bin_name=GREEN, stream="recycling") for d in days]

    def test_the_same_schedule_is_no_change(self, full, hols):
        new = self.new("2026-10-30", "2026-11-06", "2026-11-13", "2026-11-20", "2026-11-27")
        assert detect_changes(full, self.previous(), new, date(2026, 10, 27), hols) == []

    def test_a_moved_date_is_paired_with_where_it_went(self, full, hols):
        new = self.new("2026-10-30", "2026-11-09", "2026-11-13", "2026-11-20")
        changes = detect_changes(full, self.previous(), new, date(2026, 10, 27), hols)
        assert [(c.kind, c.before, c.after) for c in changes] == [(ROUND_CHANGE, "2026-11-06", "2026-11-09")]

    def test_a_vanished_collection_is_reported(self, full, hols):
        new = self.new("2026-10-30", "2026-11-13", "2026-11-20")
        changes = detect_changes(full, self.previous(), new, date(2026, 10, 27), hols)
        assert [(c.kind, c.before, c.after) for c in changes] == [(ROUND_CHANGE, "2026-11-06", None)]

    def test_dates_beyond_the_old_schedule_are_not_changes(self, full, hols):
        new = self.new("2026-10-30", "2026-11-06", "2026-11-13", "2026-11-20", "2026-12-04")
        assert detect_changes(full, self.previous(), new, date(2026, 10, 27), hols) == []


class TestSuspiciousResults:
    today = date(2026, 11, 1)

    def test_a_normal_response_passes(self):
        check_response(got("2026-11-06"), stored("2026-10-30"), self.today)

    def test_dates_in_the_past_only(self):
        with pytest.raises(SuspiciousResultError, match="in the past"):
            check_response(got("2026-10-20"), [], self.today)

    def test_no_collection_in_the_next_fourteen_days(self):
        with pytest.raises(SuspiciousResultError, match="next 14 days"):
            check_response(got("2026-11-20"), [], self.today)
        check_response(got("2026-11-15"), [], self.today)  # exactly fourteen days is fine

    def test_a_stream_the_address_had_last_time_going_missing(self):
        previous = stored("2026-10-30", GREEN) + stored("2026-10-30", FOOD, "food")
        with pytest.raises(SuspiciousResultError, match="missing stream.*food"):
            check_response(got("2026-11-06", GREEN), previous, self.today)

    def test_garden_waste_may_come_and_go_with_the_seasons(self):
        previous = stored("2026-10-30", GREEN) + stored("2026-10-30", "Garden Waste Bin", "garden")
        check_response(got("2026-11-06", GREEN), previous, self.today)

    def test_the_messages_never_contain_an_address(self):
        with pytest.raises(SuspiciousResultError) as raised:
            check_response(got("2026-10-20"), [], self.today)
        assert UPRN not in str(raised.value)


# through run()


NOW_MONDAY = datetime(2026, 10, 26, 5, 17, tzinfo=UTC)
NOW_SUNDAY = datetime(2026, 11, 1, 5, 17, tzinfo=UTC)


def response(**dates):
    names = {"green": GREEN, "black": BLACK, "food": FOOD}
    return {"bins": [{"type": names[k], "collectionDate": v} for k, v in dates.items()]}


def runner(tmp_path):
    store = FileStore(tmp_path / "store.json")
    store.add_address(Address(uprn=UPRN, ons_code=BATHNES))
    clock = iter(range(100000))
    limiter = CouncilRateLimiter(lambda: next(clock) * 100.0, lambda s: None)

    def go(now, reply):
        return run(store, registry.load(), now, fetch=lambda *a: reply, limiter=limiter)

    return store, go


FIRST = response(green="30/10/2026", black="30/10/2026", food="30/10/2026")


def test_an_unchanged_refetch_records_no_changes(tmp_path):
    store, go = runner(tmp_path)
    go(NOW_MONDAY, FIRST)
    outcomes = go(NOW_SUNDAY, response(green="06/11/2026", black="13/11/2026", food="06/11/2026"))
    assert outcomes[0].status == "fetched"
    assert outcomes[0].changes == ()
    assert "changes" not in store._data


def test_a_round_change_is_updated_and_recorded_with_before_and_after(tmp_path):
    store, go = runner(tmp_path)
    go(NOW_MONDAY, FIRST)
    outcomes = go(NOW_SUNDAY, response(green="06/11/2026", black="13/11/2026", food="09/11/2026"))
    assert outcomes[0].status == "fetched"
    assert outcomes[0].changes == (ROUND_CHANGE,)
    log = store._data["changes"]
    assert [(c["bin_name"], c["kind"], c["before"], c["after"], c["ons_code"]) for c in log] == [
        (FOOD, ROUND_CHANGE, "2026-11-06", "2026-11-09", BATHNES)
    ]
    assert log[0]["uprn"] == UPRN
    assert log[0]["at"] == "2026-11-01T05:17:00+00:00"
    # the new date is stored: the change is accepted, not held back
    assert {c["date"] for c in store.result(UPRN)["collections"] if c["bin_name"] == FOOD} == {"2026-11-09"}


def test_a_holiday_shift_is_updated_and_recorded_as_expected(tmp_path):
    store, go = runner(tmp_path)
    go(datetime(2026, 4, 27, 5, 17, tzinfo=UTC), response(green="30/04/2026"))
    outcomes = go(datetime(2026, 5, 3, 5, 17, tzinfo=UTC), response(green="08/05/2026"))
    assert outcomes[0].changes == (EXPECTED_SHIFT,)
    assert store._data["changes"][0]["kind"] == EXPECTED_SHIFT


def test_a_suspicious_response_is_a_failure_that_keeps_the_last_good_data(tmp_path):
    store, go = runner(tmp_path)
    go(NOW_MONDAY, FIRST)
    outcomes = go(NOW_SUNDAY, response(green="30/12/2026", black="30/12/2026", food="30/12/2026"))
    assert outcomes[0].status == "failed"
    saved = store.result(UPRN)
    assert saved["fetched_at"] == "2026-10-26T05:17:00+00:00"
    assert saved["consecutive_failures"] == 1
    assert "next 14 days" in saved["last_error"]
    assert {c["date"] for c in saved["collections"]} == {"2026-10-30"}
    assert "changes" not in store._data


def test_a_missing_stream_is_a_failure(tmp_path):
    store, go = runner(tmp_path)
    go(NOW_MONDAY, FIRST)
    outcomes = go(NOW_SUNDAY, response(green="06/11/2026", black="13/11/2026"))
    assert outcomes[0].status == "failed"
    assert "missing stream(s) that the last fetch had: food" in store.result(UPRN)["last_error"]


def test_the_log_line_names_the_kind_of_change_but_never_the_address_or_dates(tmp_path):
    store, go = runner(tmp_path)
    go(NOW_MONDAY, FIRST)
    outcome = go(NOW_SUNDAY, response(green="06/11/2026", black="13/11/2026", food="09/11/2026"))[0]
    line = json.dumps(format_outcome(outcome))
    assert json.loads(line)["changes"] == {ROUND_CHANGE: 1}
    for private in (UPRN, "2026-11-09", "2026-11-06", "Friday", FOOD):
        assert private not in line


def test_a_failed_run_logs_a_safe_reason(tmp_path):
    store, go = runner(tmp_path)
    go(NOW_MONDAY, FIRST)
    outcome = go(NOW_SUNDAY, response(green="30/12/2026", black="30/12/2026", food="30/12/2026"))[0]
    assert format_outcome(outcome) == {"council": BATHNES, "status": "failed", "detail": "no collection in the next 14 days"}


# the Sheet store


class FakeService:
    def __init__(self, replies=None):
        self.requests: list[dict] = []
        self.replies = replies or {}

    def __call__(self, url, payload):
        self.requests.append(payload)
        return self.replies.get(payload["action"], {"ok": True})


def test_the_sheet_store_reads_the_previous_collections():
    previous = stored("2026-10-30")
    service = FakeService({"get_result": {"ok": True, "result": {"collections": previous}}})
    assert SheetStore("https://x/exec", "s", post=service).previous_collections(UPRN) == previous
    assert service.requests[0]["action"] == "get_result"
    assert service.requests[0]["uprn"] == UPRN


def test_the_sheet_store_has_no_previous_collections_for_a_new_address():
    service = FakeService({"get_result": {"ok": True, "result": None}})
    assert SheetStore("https://x/exec", "s", post=service).previous_collections(UPRN) == []


def test_an_older_script_without_get_result_just_skips_change_detection():
    service = FakeService({"get_result": {"ok": False, "error": "unknown action"}})
    assert SheetStore("https://x/exec", "s", post=service).previous_collections(UPRN) == []


def test_other_store_errors_are_not_hidden():
    from fetcher.sheet_store import StoreError

    service = FakeService({"get_result": {"ok": False, "error": "unauthorised"}})
    with pytest.raises(StoreError, match="unauthorised"):
        SheetStore("https://x/exec", "s", post=service).previous_collections(UPRN)


def test_the_sheet_store_sends_changes_as_plain_rows():
    from fetcher.changes import Change

    service = FakeService()
    change = Change(FOOD, ROUND_CHANGE, "2026-11-06", "2026-11-09", "weekday changed from Friday to Monday")
    SheetStore("https://x/exec", "s", post=service).save_changes(UPRN, BATHNES, "2026-11-01T05:17:00+00:00", [change])
    payload = service.requests[0]
    assert payload["action"] == "save_changes"
    assert payload["ons_code"] == BATHNES
    assert payload["changes"] == [
        {
            "bin_name": FOOD,
            "kind": ROUND_CHANGE,
            "before": "2026-11-06",
            "after": "2026-11-09",
            "note": "weekday changed from Friday to Monday",
        }
    ]
