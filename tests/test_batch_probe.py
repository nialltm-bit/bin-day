"""Which councils the batch probe picks. The probe itself needs the upstream package and the network, so it isn't run here."""
import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "batch_probe.py"
SPEC = importlib.util.spec_from_file_location("batch_probe", SCRIPT)
probe = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(probe)

INPUTS = {
    "PlainCouncil": {"postcode": "AA1 1AA", "house_number": "1", "url": "https://a.example"},
    "BrowserCouncil": {"postcode": "AA1 1AA", "house_number": "2", "url": "https://b.example", "web_driver": "http://localhost:4444"},
    "UprnCouncil": {"uprn": "100", "url": "https://c.example"},
    "UprnAndNumber": {"uprn": "100", "postcode": "AA1 1AA", "house_number": "3", "url": "https://d.example"},
    "PostcodeOnly": {"postcode": "AA1 1AA", "url": "https://e.example"},
    "FailsUpstream": {"postcode": "AA1 1AA", "house_number": "4", "url": "https://f.example"},
    "AlreadyDone": {"postcode": "AA1 1AA", "house_number": "5", "url": "https://g.example"},
}
PASSED = {"PlainCouncil", "BrowserCouncil", "UprnCouncil", "UprnAndNumber", "PostcodeOnly", "AlreadyDone"}


def names(done=frozenset()):
    return [name for name, _ in probe.candidates(INPUTS, PASSED, done)]


def test_picks_councils_that_take_a_postcode_and_house_number_without_a_uprn_and_passed_upstream():
    assert names() == ["AlreadyDone", "BrowserCouncil", "PlainCouncil"]


def test_includes_councils_that_drive_a_browser():
    assert "BrowserCouncil" in names()


def test_skips_councils_that_were_already_probed():
    assert names({"AlreadyDone", "PlainCouncil"}) == ["BrowserCouncil"]


def test_leaves_out_uprn_postcode_only_and_failing_councils():
    picked = names()
    for left_out in ("UprnCouncil", "UprnAndNumber", "PostcodeOnly", "FailsUpstream"):
        assert left_out not in picked


def test_the_bare_number_is_the_leading_number_of_the_house():
    assert probe.leading_number("61 High Street") == "61"
    assert probe.leading_number("12A Rose Road") == "12A"
    assert probe.leading_number("Rose Cottage") is None
    assert probe.leading_number("61") == "61"


def test_a_council_that_failed_upstream_is_tried_only_when_asked():
    assert "FailsUpstream" not in names()
    found = [name for name, _ in probe.candidates(INPUTS, PASSED, frozenset(), include_failed=True)]
    assert "FailsUpstream" in found and "UprnCouncil" not in found


def test_uprn_mode_picks_the_councils_that_have_a_uprn_and_passed_upstream():
    found = [name for name, _ in probe.uprn_candidates(INPUTS, PASSED, frozenset({"AlreadyDone"}))]
    assert found == ["UprnAndNumber", "UprnCouncil"]
