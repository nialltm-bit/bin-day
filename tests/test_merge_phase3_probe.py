import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "merge_phase3_probe.py"
SPEC = importlib.util.spec_from_file_location("merge_phase3_probe", SCRIPT)
merge = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(merge)

ROW = {"group": "uprn_alt", "module": "X", "ok": True, "without_uprn": "same_schedule", "bins": ["Black"], "schedule": "full", "extra": 1}


def test_only_uprn_councils_with_the_same_schedule_and_working_remaining_councils_are_taken():
    assert merge.eligible(ROW)
    assert not merge.eligible({**ROW, "without_uprn": "same_bins_different_dates"})
    assert not merge.eligible({**ROW, "ok": False})
    assert merge.eligible({"group": "remaining", "ok": True})
    assert not merge.eligible({"group": "single", "ok": True})


def test_a_plain_house_number_is_its_own_bare_number_and_a_street_is_untested():
    assert merge.batch_row(ROW, "26A")["bare_number"] == "not_applicable"
    assert merge.batch_row(ROW, "12 High Street")["bare_number"] == "untested"
    assert merge.batch_row(ROW, "Rose Cottage")["bare_number"] == "untested"
    assert "extra" not in merge.batch_row(ROW, "1")
