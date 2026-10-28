import json
from datetime import UTC, date, datetime, timedelta

import pytest

from fetcher import registry, upstream
from fetcher.model import Address, FetchError, UnmappedBinError, UpstreamError
from fetcher.normalise import normalise
from fetcher.ratelimit import CouncilRateLimiter
from fetcher.run import format_outcome, main, run
from fetcher.schedule import is_due, slot
from fetcher.store import FileStore

BATHNES = "E06000022"
NOW = datetime(2026, 10, 26, 12, 0, tzinfo=UTC)

GOOD_RESPONSE = {
    "bins": [
        {"type": "Food Recycling Collection Bin", "collectionDate": "03/11/2026"},
        {"type": "Black Rubbish Bin (140L)", "collectionDate": "03/11/2026"},
        {"type": "Green Recycling Box", "collectionDate": "10/11/2026"},
    ]
}


@pytest.fixture
def councils():
    return registry.load()


@pytest.fixture
def bathnes(councils):
    return councils[BATHNES]


class FakeClock:
    def __init__(self):
        self.now = 0.0
        self.sleeps: list[float] = []

    def clock(self):
        return self.now

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += seconds


# normalise


def test_normalise_maps_dates_and_streams(bathnes):
    result = normalise(bathnes, GOOD_RESPONSE)
    assert [(c.date, c.stream) for c in result] == [("2026-11-03", "food"), ("2026-11-03", "general"), ("2026-11-10", "recycling")]


def test_normalise_rejects_empty_and_odd_responses(bathnes):
    for response in ({"bins": []}, {}, [], None, {"bins": [{"type": "x"}]}):
        with pytest.raises(FetchError):
            normalise(bathnes, response)


def test_normalise_rejects_bad_dates(bathnes):
    with pytest.raises(FetchError, match="bad date"):
        normalise(bathnes, {"bins": [{"type": "Green Recycling Box", "collectionDate": "2026-11-03"}]})


def test_unmapped_bin_is_a_failure_naming_the_bin(bathnes):
    response = {"bins": [{"type": "Purple Sack", "collectionDate": "03/11/2026"}]}
    with pytest.raises(UnmappedBinError, match="Purple Sack"):
        normalise(bathnes, response)


# schedule


def test_slot_is_stable_and_spread_across_the_week():
    assert slot("100120000855") == slot("100120000855")
    assert {slot(str(u)) for u in range(1000, 1100)} == set(range(7))


def test_never_fetched_is_due():
    assert is_due("100120000855", None, date(2026, 10, 26))


def test_not_due_within_six_days():
    last = (NOW - timedelta(days=3)).isoformat()
    assert not is_due("100120000855", last, date(2026, 10, 26))


def day_with_slot(uprn, on_slot):
    """A date in the week from 26 Oct 2026 that is (or is not) this UPRN's weekday slot."""
    days = (date(2026, 10, 26) + timedelta(days=n) for n in range(7))
    return next(d for d in days if (d.weekday() == slot(uprn)) == on_slot)


def test_due_on_its_slot_a_week_after_the_last_fetch():
    uprn = "100120000855"
    day = day_with_slot(uprn, on_slot=True)
    last = datetime.combine(day - timedelta(days=7), datetime.min.time(), tzinfo=UTC)
    assert is_due(uprn, last.isoformat(), day)


def test_overdue_addresses_are_caught_up_off_slot():
    uprn = "100120000855"
    off_slot = day_with_slot(uprn, on_slot=False)
    last = datetime.combine(off_slot - timedelta(days=9), datetime.min.time(), tzinfo=UTC)
    assert is_due(uprn, last.isoformat(), off_slot)


def test_a_fresh_fetch_is_not_repeated_off_slot():
    uprn = "100120000855"
    off_slot = day_with_slot(uprn, on_slot=False)
    last = datetime.combine(off_slot - timedelta(days=6), datetime.min.time(), tzinfo=UTC)
    assert not is_due(uprn, last.isoformat(), off_slot)


# rate limiter


def test_second_request_to_the_same_council_waits():
    fake = FakeClock()
    limiter = CouncilRateLimiter(fake.clock, fake.sleep)
    assert limiter.wait(BATHNES, 10) == 0
    fake.now += 4
    assert limiter.wait(BATHNES, 10) == 6
    assert fake.sleeps == [6]


def test_different_councils_do_not_wait_for_each_other():
    fake = FakeClock()
    limiter = CouncilRateLimiter(fake.clock, fake.sleep)
    limiter.wait("E06000022", 10)
    assert limiter.wait("E06000023", 10) == 0


def test_no_wait_once_the_gap_has_passed():
    fake = FakeClock()
    limiter = CouncilRateLimiter(fake.clock, fake.sleep)
    limiter.wait(BATHNES, 10)
    fake.now += 11
    assert limiter.wait(BATHNES, 10) == 0


# upstream arguments


def test_build_args_for_bathnes(bathnes):
    args = upstream.build_args(bathnes, Address(uprn="100120000855", ons_code=BATHNES), None)
    assert args == [
        "BathAndNorthEastSomersetCouncil",
        "https://www.bathnes.gov.uk/webforms/waste/collectionday/",
        "-u=100120000855",
        "-s",
    ]


def test_build_args_needs_the_inputs_the_council_requires(bathnes):
    bathnes = {**bathnes, "inputs": ["uprn", "postcode"]}
    with pytest.raises(FetchError, match="needs postcode"):
        upstream.build_args(bathnes, Address(uprn="1", ons_code=BATHNES), None)


def test_build_args_selenium_needs_a_url(bathnes):
    selenium = {**bathnes, "needs_selenium": True}
    address = Address(uprn="1", ons_code=BATHNES)
    with pytest.raises(FetchError, match="Selenium"):
        upstream.build_args(selenium, address, None)
    assert "-w=http://localhost:4444" in upstream.build_args(selenium, address, "http://localhost:4444")


# run


def make_store(tmp_path, *uprns):
    store = FileStore(tmp_path / "store.json")
    for uprn in uprns:
        store.add_address(Address(uprn=uprn, ons_code=BATHNES))
    return store


def no_wait():
    fake = FakeClock()
    return CouncilRateLimiter(fake.clock, fake.sleep)


def test_run_stores_collections_with_a_timestamp(tmp_path, councils):
    store = make_store(tmp_path, "100120000855")
    outcomes = run(store, councils, NOW, fetch=lambda *a: GOOD_RESPONSE, limiter=no_wait())
    assert [o.status for o in outcomes] == ["fetched"]
    saved = store.result("100120000855")
    assert saved["fetched_at"] == "2026-10-26T12:00:00+00:00"
    assert saved["last_error"] is None
    assert [c["stream"] for c in saved["collections"]] == ["food", "general", "recycling"]


def test_a_second_run_the_same_day_does_not_refetch(tmp_path, councils):
    store = make_store(tmp_path, "100120000855")
    calls = []

    def fetch(*args):
        calls.append(args)
        return GOOD_RESPONSE

    run(store, councils, NOW, fetch=fetch, limiter=no_wait())
    again = run(store, councils, NOW + timedelta(hours=1), fetch=fetch, limiter=no_wait())
    assert len(calls) == 1
    assert [o.detail for o in again] == ["not due"]


def test_force_refetches(tmp_path, councils):
    store = make_store(tmp_path, "100120000855")
    calls = []
    run(store, councils, NOW, fetch=lambda *a: calls.append(1) or GOOD_RESPONSE, limiter=no_wait())
    run(store, councils, NOW, fetch=lambda *a: calls.append(1) or GOOD_RESPONSE, limiter=no_wait(), force=True)
    assert len(calls) == 2


def test_failure_keeps_old_collections_and_counts_failures(tmp_path, councils):
    store = make_store(tmp_path, "100120000855")
    run(store, councils, NOW, fetch=lambda *a: GOOD_RESPONSE, limiter=no_wait())

    def broken(*args):
        raise FetchError("site down")

    later = NOW + timedelta(days=7)
    outcomes = run(store, councils, later, fetch=broken, limiter=no_wait(), force=True)
    assert [o.status for o in outcomes] == ["failed"]
    saved = store.result("100120000855")
    assert saved["fetched_at"] == "2026-10-26T12:00:00+00:00"  # last good fetch
    assert saved["last_attempt"] == later.isoformat(timespec="seconds")
    assert saved["last_error"] == "site down"
    assert saved["consecutive_failures"] == 1
    assert len(saved["collections"]) == 3


def test_a_failed_address_is_not_retried_until_due_again(tmp_path, councils):
    store = make_store(tmp_path, "100120000855")
    calls = []

    def broken(*args):
        calls.append(1)
        raise FetchError("site down")

    run(store, councils, NOW, fetch=broken, limiter=no_wait())
    run(store, councils, NOW + timedelta(hours=2), fetch=broken, limiter=no_wait())
    assert len(calls) == 1


def test_unmapped_bin_is_recorded_as_a_failure(tmp_path, councils):
    store = make_store(tmp_path, "100120000855")
    odd = {"bins": [{"type": "Purple Sack", "collectionDate": "03/11/2026"}]}
    outcomes = run(store, councils, NOW, fetch=lambda *a: odd, limiter=no_wait())
    assert outcomes[0].status == "failed"
    assert "Purple Sack" in store.result("100120000855")["last_error"]


def test_unknown_and_unsupported_councils_are_skipped(tmp_path, councils):
    store = FileStore(tmp_path / "store.json")
    store.add_address(Address(uprn="1", ons_code="E06000099"))
    broken = {**councils[BATHNES], "status": "broken"}
    store.add_address(Address(uprn="2", ons_code=BATHNES))
    outcomes = run(store, {BATHNES: broken}, NOW, fetch=lambda *a: GOOD_RESPONSE, limiter=no_wait())
    assert [(o.uprn, o.status) for o in outcomes] == [("1", "skipped"), ("2", "skipped")]


def test_requests_to_one_council_are_spaced_out(tmp_path, councils):
    store = make_store(tmp_path, "100120000855", "100120000856")
    fake = FakeClock()
    limiter = CouncilRateLimiter(fake.clock, fake.sleep)
    run(store, councils, NOW, fetch=lambda *a: GOOD_RESPONSE, limiter=limiter)
    assert fake.sleeps == [10.0]


def test_registry_can_set_a_longer_gap(tmp_path, councils):
    slow = {**councils[BATHNES], "min_interval_seconds": 30}
    store = make_store(tmp_path, "100120000855", "100120000856")
    fake = FakeClock()
    run(store, {BATHNES: slow}, NOW, fetch=lambda *a: GOOD_RESPONSE, limiter=CouncilRateLimiter(fake.clock, fake.sleep))
    assert fake.sleeps == [30.0]


def test_only_uprn_limits_the_run(tmp_path, councils):
    store = make_store(tmp_path, "100120000855", "100120000856")
    outcomes = run(store, councils, NOW, fetch=lambda *a: GOOD_RESPONSE, limiter=no_wait(), only_uprn="100120000856")
    assert [o.uprn for o in outcomes] == ["100120000856"]


# store and command line


def test_file_store_survives_a_reload(tmp_path, councils):
    store = make_store(tmp_path, "100120000855")
    run(store, councils, NOW, fetch=lambda *a: GOOD_RESPONSE, limiter=no_wait())
    reloaded = FileStore(tmp_path / "store.json")
    assert reloaded.addresses() == [Address(uprn="100120000855", ons_code=BATHNES)]
    assert len(reloaded.result("100120000855")["collections"]) == 3


def test_add_does_not_duplicate_addresses(tmp_path):
    store = make_store(tmp_path, "100120000855", "100120000855")
    assert len(store.addresses()) == 1


def test_cli_add_writes_the_address(tmp_path, capsys):
    path = tmp_path / "store.json"
    assert main(["add", "--store", str(path), "--ons", BATHNES, "--uprn", "100120000855"]) == 0
    assert json.loads(path.read_text())["addresses"] == [{"ons_code": BATHNES, "uprn": "100120000855"}]


# logs are public: they must never carry an address


UPRN = "100120000855"


def run_one(tmp_path, councils, fetch):
    store = make_store(tmp_path, UPRN)
    return run(store, councils, NOW, fetch=fetch, limiter=no_wait())[0], store


def test_a_successful_fetch_logs_only_council_status_and_count(tmp_path, councils):
    outcome, _ = run_one(tmp_path, councils, lambda *a: GOOD_RESPONSE)
    assert format_outcome(outcome) == {"council": BATHNES, "status": "fetched", "detail": "3 collections"}


def test_upstream_errors_log_only_their_kind_but_the_store_keeps_the_message(tmp_path, councils):
    def broken(*args):
        raise UpstreamError("ConnectionError", f"HTTPSConnectionPool: url: /CollectionSummary/{UPRN}")

    outcome, store = run_one(tmp_path, councils, broken)
    logged = json.dumps(format_outcome(outcome))
    assert UPRN not in logged
    assert format_outcome(outcome)["detail"] == "ConnectionError"
    assert UPRN in store.result(UPRN)["last_error"]  # the private store keeps the full error for debugging


def test_no_log_line_contains_the_uprn(tmp_path, councils):
    odd = {"bins": [{"type": "Purple Sack", "collectionDate": "03/11/2026"}]}
    for index, fetch in enumerate((lambda *a: GOOD_RESPONSE, lambda *a: odd, lambda *a: {"bins": []})):
        folder = tmp_path / str(index)
        folder.mkdir()
        outcome, _ = run_one(folder, councils, fetch)
        assert UPRN not in json.dumps(format_outcome(outcome))


def test_skipped_outcomes_do_not_log_the_uprn(tmp_path, councils):
    store = FileStore(tmp_path / "store.json")
    store.add_address(Address(uprn=UPRN, ons_code="E06000099"))
    outcomes = run(store, councils, NOW, fetch=lambda *a: GOOD_RESPONSE, limiter=no_wait())
    assert UPRN not in json.dumps(format_outcome(outcomes[0]))


# next_only councils are fetched on Sundays, full-schedule councils on their weekly slot

SUNDAY = date(2026, 11, 1)  # a Sunday
assert SUNDAY.weekday() == 6


def stamp_for(day, hour=5):
    return datetime(day.year, day.month, day.day, hour, 17, tzinfo=UTC).isoformat()


def test_next_only_councils_are_due_on_sunday_a_week_after_the_last_fetch():
    assert is_due(UPRN, stamp_for(SUNDAY - timedelta(days=7)), SUNDAY, "next_only")


def test_next_only_councils_are_not_due_on_other_days():
    last = stamp_for(SUNDAY - timedelta(days=7))
    for offset in range(-6, 0):  # Monday to Saturday before that Sunday
        assert not is_due(UPRN, last, SUNDAY + timedelta(days=offset), "next_only")


def test_next_only_councils_are_not_due_twice_on_a_sunday():
    assert not is_due(UPRN, stamp_for(SUNDAY), SUNDAY, "next_only")


def test_a_new_next_only_address_is_due_straight_away_on_any_day():
    for offset in range(7):
        assert is_due(UPRN, None, SUNDAY + timedelta(days=offset), "next_only")


def test_a_midweek_signup_is_fetched_again_on_the_following_sunday():
    wednesday = SUNDAY - timedelta(days=4)
    assert not is_due(UPRN, stamp_for(wednesday), SUNDAY - timedelta(days=1), "next_only")
    assert is_due(UPRN, stamp_for(wednesday), SUNDAY, "next_only")


def test_a_missed_sunday_is_caught_up_the_next_day():
    last = stamp_for(SUNDAY - timedelta(days=7))
    assert is_due(UPRN, last, SUNDAY + timedelta(days=1), "next_only")
    assert is_due(UPRN, last, SUNDAY, "next_only")  # and the Sunday itself is of course due


def test_full_schedule_councils_stay_weekly_on_their_slot():
    day = day_with_slot(UPRN, on_slot=True)
    assert is_due(UPRN, stamp_for(day - timedelta(days=7)), day, "full")
    assert not is_due(UPRN, stamp_for(day - timedelta(days=3)), day, "full")


def run_on(store, councils, day, fetch, hour=5):
    now = datetime(day.year, day.month, day.day, hour, 17, tzinfo=UTC)
    return run(store, councils, now, fetch=fetch, limiter=no_wait())


def test_bathnes_is_fetched_on_sundays_not_other_days(tmp_path, councils):
    store = make_store(tmp_path, UPRN)
    calls = []

    def fetch(*args):
        calls.append(1)
        return GOOD_RESPONSE

    monday = SUNDAY - timedelta(days=6)
    run_on(store, councils, monday, fetch)  # new signup: fetched straight away
    assert len(calls) == 1
    for day in range(1, 6):  # Tuesday to Saturday: nothing
        run_on(store, councils, monday + timedelta(days=day), fetch)
    assert len(calls) == 1
    run_on(store, councils, SUNDAY, fetch)  # the Sunday after: fetched again
    assert len(calls) == 2
    run_on(store, councils, SUNDAY + timedelta(days=1), fetch)
    assert len(calls) == 2
    run_on(store, councils, SUNDAY + timedelta(days=7), fetch)  # the next Sunday
    assert len(calls) == 3


def test_a_full_schedule_council_is_only_fetched_weekly(tmp_path, councils):
    full = {**councils[BATHNES], "schedule": "full"}
    for bin_type in full["bin_types"].values():
        bin_type.pop("every_weeks", None)
    store = make_store(tmp_path, UPRN)
    calls = []

    def fetch(*args):
        calls.append(1)
        return GOOD_RESPONSE

    for days in range(4):
        run_on(store, {BATHNES: full}, SUNDAY + timedelta(days=days), fetch)
    assert len(calls) == 1


def test_a_failing_next_only_address_is_not_retried_until_the_next_sunday(tmp_path, councils):
    store = make_store(tmp_path, UPRN)
    calls = []

    def broken(*args):
        calls.append(1)
        raise FetchError("site down")

    run_on(store, councils, SUNDAY, broken)
    for day in range(1, 7):
        run_on(store, councils, SUNDAY + timedelta(days=day), broken)
    assert len(calls) == 1
    run_on(store, councils, SUNDAY + timedelta(days=7), broken)
    assert len(calls) == 2


def test_a_bin_the_registry_has_not_met_is_settled_by_the_keyword_rules_when_they_are_clear(bathnes):
    day = "03/11/2026"
    response = {"bins": [{"type": "Garden", "collectionDate": day}, {"type": "Black Rubbish Bin (140L)", "collectionDate": day}]}
    streams = {c.bin_name: c.stream for c in normalise(bathnes, response)}
    assert streams == {"Garden": "garden", "Black Rubbish Bin (140L)": "general"}


def test_a_bin_the_keyword_rules_say_two_things_about_is_still_a_failure(bathnes):
    response = {"bins": [{"type": "Food and Garden", "collectionDate": "03/11/2026"}]}
    with pytest.raises(UnmappedBinError, match="Food and Garden"):
        normalise(bathnes, response)


def test_the_same_bin_listed_twice_on_one_day_gives_one_collection(bathnes):
    day = "03/11/2026"
    black = {"type": "Black Rubbish Bin (140L)", "collectionDate": day}
    assert len(normalise(bathnes, {"bins": [black, black]})) == 1
