"""Which UPRN councils are probed by postcode and house number. The probe itself needs the network."""
import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "without_uprn.py"
SPEC = importlib.util.spec_from_file_location("without_uprn", SCRIPT)
without = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(without)

SEARCHES = "def parse(kwargs):\n    postcode = kwargs.get('postcode')\n    paon = kwargs.get('paon')\n"
SOURCES = {
    "Searches": SEARCHES,
    "UprnOnly": "uprn = kwargs.get('uprn')\n",
    "PostcodeOnly": "postcode = kwargs.get('postcode')\nuprn = kwargs.get('uprn')\n",
}
INPUTS = {
    "Searches": {"uprn": "1", "postcode": "AA1 1AA", "house_number": "2", "url": "https://a.example"},
    "UprnOnly": {"uprn": "1", "postcode": "AA1 1AA", "house_number": "2", "url": "https://b.example"},
    "PostcodeOnly": {"uprn": "1", "postcode": "AA1 1AA", "house_number": "2", "url": "https://c.example"},
    "NoNumberInTest": {"uprn": "1", "postcode": "AA1 1AA", "url": "https://d.example"},
    "NoSource": {"uprn": "1", "postcode": "AA1 1AA", "house_number": "2", "url": "https://e.example"},
    "AlreadyPlain": {"postcode": "AA1 1AA", "house_number": "3", "url": "https://f.example"},
}


def convert():
    return without.convert(INPUTS, SOURCES.get)


def test_drops_the_uprn_only_where_the_module_searches_by_postcode_and_number():
    out, changed = convert()
    assert changed == ["Searches"]
    assert "uprn" not in out["Searches"]
    assert out["Searches"]["house_number"] == "2"
    for name in ("UprnOnly", "PostcodeOnly", "NoNumberInTest", "NoSource"):
        assert out[name]["uprn"] == "1"


def test_leaves_other_entries_and_the_input_untouched():
    out, _ = convert()
    assert out["AlreadyPlain"] == INPUTS["AlreadyPlain"]
    assert INPUTS["Searches"]["uprn"] == "1"
