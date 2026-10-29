"""Which councils the Phase 3 probe picks, and how it compares results. The probe itself needs the network."""
import importlib.util
from datetime import date
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "probe_other_inputs.py"
SPEC = importlib.util.spec_from_file_location("probe_other_inputs", SCRIPT)
probe = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(probe)

READS_ALL = 'kwargs.get("uprn") kwargs.get("postcode") kwargs.get("paon")'
INPUTS = {
    "AltCouncil": {"uprn": "1", "postcode": "AA1 1AA", "house_number": "1", "url": "https://a.example"},
    "UprnPostcodeOnly": {"uprn": "1", "postcode": "AA1 1AA", "url": "https://b.example"},
    "UprnOnly": {"uprn": "1", "url": "https://c.example"},
    "PostcodeOnly": {"postcode": "AA1 1AA", "url": "https://d.example"},
    "StreetOnly": {"house_number": "High Street", "url": "https://e.example"},
    "FailsUpstream": {"postcode": "AA1 1AA", "house_number": "4", "url": "https://f.example"},
    "BlockedUpstream": {"postcode": "AA1 1AA", "house_number": "5", "url": "https://g.example"},
    "BatchDone": {"postcode": "AA1 1AA", "house_number": "6", "url": "https://h.example"},
    "UrlProperty": {"url": "https://i.example/x/1", "wiki_note": "Follow the instructions, then copy the URL."},
    "UrlWithUprn": {"url": "https://j.example/x/1", "wiki_note": "Replace XXXX with your UPRN."},
    "Calendar": {"url": "https://k.example/x.ics"},
    "CastlepointDistrictCouncil": {"uprn": "4525", "url": "https://l.example"},
}
SUITE = {
    "FailsUpstream": {"status": "failed", "message": "ValueError: odd"},
    "BlockedUpstream": {"status": "failed", "message": "HTTPError: 403 Client Error: Forbidden"},
}
TEXT = {"AltCouncil": READS_ALL, "Calendar": "from icalevents import events"}


def groups():
    got = probe.picks(INPUTS, SUITE, {"BatchDone"}, text_of=lambda name: TEXT.get(name, ""))
    return {name: group for group, name, _ in got}


def test_a_uprn_council_is_tried_without_its_uprn_only_when_the_test_gives_a_postcode_and_house_number_and_the_code_reads_them():
    assert groups()["AltCouncil"] == "uprn_alt"
    assert "UprnPostcodeOnly" not in groups()
    assert "UprnOnly" not in groups()


def test_postcode_only_and_street_only_councils_are_single_input():
    assert groups()["PostcodeOnly"] == "single"
    assert groups()["StreetOnly"] == "single"


def test_a_council_that_failed_upstream_is_retried_once_but_never_one_that_was_blocked():
    assert groups()["FailsUpstream"] == "remaining"
    assert "BlockedUpstream" not in groups()


def test_councils_already_in_the_batch_probe_are_not_repeated():
    assert "BatchDone" not in groups()


def test_urls_and_reference_numbers_are_picked_but_a_uprn_in_the_url_and_the_calendar_group_are_not():
    assert groups()["UrlProperty"] == "url"
    assert groups()["CastlepointDistrictCouncil"] == "other_id"
    assert "UrlWithUprn" not in groups()
    assert "Calendar" not in groups()


def test_compare_says_whether_the_schedule_matches_without_a_uprn():
    day = date(2026, 11, 2)
    ref = {"Black": [day], "Blue": [day]}
    assert probe.compare(ref, {"Black": [day], "Blue": [day]}) == "same_schedule"
    assert probe.compare(ref, {"Black": [date(2026, 11, 9)], "Blue": [day]}) == "same_bins_different_dates"
    assert probe.compare(ref, {"Green": [day]}) == "different_bins"
    assert probe.compare(ref, {}) == "no_result"
