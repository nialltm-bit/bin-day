"""The sanity checks in the spot check: they flag what can't be right and leave a holiday shift alone."""
import importlib.util
from datetime import date
from pathlib import Path

from fetcher.model import Collection

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "spot_check.py"
SPEC = importlib.util.spec_from_file_location("spot_check", SCRIPT)
spot = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(spot)

TODAY = date(2026, 11, 1)


def days(*iso):
    return [date.fromisoformat(d) for d in iso]


def test_one_weekday_is_fine_and_a_holiday_shift_is_allowed():
    assert spot.weekday_flags(days("2026-11-03", "2026-11-10", "2026-11-17")) == []
    assert spot.weekday_flags(days("2026-11-03", "2026-11-10", "2026-11-18")) == []  # a one-day shift


def test_a_bin_on_two_far_apart_weekdays_is_flagged():
    assert spot.weekday_flags(days("2026-11-03", "2026-11-10", "2026-11-13"))  # Tuesday, Tuesday, Friday


def test_whole_weeks_between_dates_are_fine_and_odd_gaps_are_flagged():
    assert spot.gap_flags(days("2026-11-03", "2026-11-17", "2026-12-01")) == []
    assert spot.gap_flags(days("2026-11-03", "2026-11-17", "2026-11-27"))  # a gap of 10 days is neither


def test_a_council_with_no_general_or_no_recycling_bin_is_flagged():
    assert spot.stream_flags({"general", "recycling"}) == []
    assert spot.stream_flags({"recycling", "food"}) == ["no general waste bin"]
    assert spot.stream_flags({"general"}) == ["no recycling bin"]


def _collections():
    return [
        Collection(date="2026-11-03", bin_name="Black", stream="general"),
        Collection(date="2026-11-17", bin_name="Black", stream="general"),
        Collection(date="2026-11-10", bin_name="Blue", stream="recycling"),
        Collection(date="2026-11-17", bin_name="Blue", stream="recycling"),
    ]


def test_check_council_lists_each_bin_and_flags_the_odd_one():
    clean = spot.check_council({"schedule": "full"}, _collections()[:3], TODAY)
    assert [b["name"] for b in clean["bins"]] == ["Black", "Blue"]
    assert clean["bins"][0]["next"] == ["2026-11-03", "2026-11-17"]
    extra = Collection(date="2026-11-20", bin_name="Black", stream="general")
    odd = spot.check_council({"schedule": "full"}, _collections()[:2] + [extra], TODAY)
    assert any(f.startswith("Black") for f in odd["flags"])


def test_a_next_only_council_is_not_judged_on_weekday_or_gaps():
    result = spot.check_council({"schedule": "next_only"}, [Collection(date="2026-11-03", bin_name="Black", stream="general")], TODAY)
    assert result["flags"] == ["no recycling bin"]


def test_a_bin_with_only_past_dates_is_flagged():
    result = spot.check_council({"schedule": "full"}, [Collection(date="2026-10-01", bin_name="Black", stream="general")], TODAY)
    assert any("in the past" in f for f in result["flags"])


def test_hand_picks_spread_over_kinds_nations_and_flagged_councils():
    def r(code, schedule="full", browser=False, flags=()):
        return {
            "ons_code": code, "name": code, "schedule": schedule, "browser": browser, "ok": True,
            "flags": list(flags), "bins": [], "address": {}, "url": "u",
        }

    results = [
        r("E06000001"), r("E06000002", browser=True), r("E06000003", "next_only"), r("E06000004", "next_only", True),
        r("S12000001"), r("W06000001"), r("N09000001"), r("E09000001"), r("E06000009", flags=["odd"]),
    ]
    codes = [p["ons_code"] for p in spot.hand_picks(results)]
    assert codes[:4] == ["E06000001", "E06000002", "E06000003", "E06000004"]
    assert {"S12000001", "W06000001", "N09000001", "E09000001", "E06000009"} <= set(codes)
    assert len(codes) == len(set(codes))
