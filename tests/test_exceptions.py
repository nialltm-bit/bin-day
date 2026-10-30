"""Which group each uncovered council goes into. The files it reads are made by other scripts."""
import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "exceptions.py"
SPEC = importlib.util.spec_from_file_location("exceptions", SCRIPT)
exc = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(exc)


def row(**kw):
    base = {
        "ons_code": "E1", "name": "Town", "module": "TownCouncil", "has_upstream_module": "True",
        "input_class": "postcode+house_number", "needs_uprn": "False", "upstream_test": "passed",
    }
    return base | kw


def group(r, probe=None, reason=None):
    return exc.classify(r, probe, reason)[0]


def test_each_kind_of_gap_has_its_own_group():
    assert group(row(has_upstream_module="False")) == "no_module"
    assert group(row(needs_uprn="True", input_class="uprn")) == "uprn"
    assert group(row(input_class="ical_url")) == "other_input"
    assert group(row()) == "unprobed"
    assert group(row(upstream_test="failed")) == "upstream_failed"
    probed = {"bins": ["Green"]}
    assert group(row(), probed, "probe failed (ReadTimeout)") == "probe_failed"
    assert group(row(), probed, "the bins found have no general waste bin, so the calendar would be incomplete") == "incomplete"
    assert group(row(), probed, "unrecognised bin name 'Green Bin'") == "colour"
    assert group(row(), probed, "unrecognised bin name 'Food & Garden'") == "combined"
    assert group(row(), probed, "unrecognised bin name 'Glass+Food'") == "combined"


def test_covered_councils_are_left_out_and_the_bins_are_listed():
    probes = {"TownCouncil": {"bins": ["A", "B"]}}
    reasons = {"TownCouncil": "unrecognised bin name 'Green'"}
    items = exc.build([row(), row(ons_code="E2", module="Other")], probes, {"E2"}, reasons)
    assert [i["ons_code"] for i in items] == ["E1"]
    assert items[0]["bins"] == "A, B" and items[0]["group"] == "colour"
