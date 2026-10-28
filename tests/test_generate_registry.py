"""The generator turns probe results into registry entries without a person writing them."""
import importlib.util
from pathlib import Path

from fetcher import registry

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "generate_registry.py"
SPEC = importlib.util.spec_from_file_location("generate_registry", SCRIPT)
generate = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(generate)

ROW = {
    "module": "ExampleCouncil",
    "ok": True,
    "bins": ["Food waste", "General Waste", "Garden waste", "Recycling"],
    "most_dates_for_one_bin": 4,
    "span_days": 42,
    "schedule": "full",
    "bare_number": "same_house",
}
UPSTREAM = {"url": "https://example.gov.uk/bins", "postcode": "AA1 1AA", "house_number": "12", "wiki_name": "Example"}


def test_bin_names_map_to_streams_by_keyword():
    cases = {
        "Food waste": "food",
        "Food Recycling Collection Bin": "food",
        "Garden Waste (Subscription Only)": "garden",
        "Brown bin": "garden",
        "Blue recycling bag": "recycling",
        "Glass, tins and plastics": "recycling",
        "Black Rubbish Bin": "general",
        "General Waste": "general",
        "Residual waste": "general",
    }
    for name, stream in cases.items():
        assert generate.stream_for(name) == stream, name


def test_an_unrecognised_bin_name_is_not_guessed():
    assert generate.stream_for("Nappies") is None
    entry, reason = generate.build_entry({**ROW, "bins": ["General Waste", "Nappies"]}, UPSTREAM, "E06000001", "2026-10-28")
    assert entry is None
    assert "Nappies" in reason


def test_a_built_entry_is_valid_and_maps_every_bin():
    entry, reason = generate.build_entry(ROW, UPSTREAM, "E06000001", "2026-10-28")
    assert reason is None
    assert registry.validate({"councils": [entry]}) == []
    assert entry["schedule"] == "full"
    assert entry["inputs"] == ["postcode", "house_number"]
    assert entry["house_input"] == "number_or_name"
    assert {b["stream"] for b in entry["bin_types"].values()} == {"food", "general", "garden", "recycling"}
    assert "every_weeks" not in next(iter(entry["bin_types"].values()))


def test_a_bare_number_that_finds_another_house_or_nothing_means_the_first_line_is_needed():
    for bare in ("different_house", "no_result", "error_ValueError"):
        entry, _ = generate.build_entry({**ROW, "bare_number": bare}, UPSTREAM, "E06000001", "2026-10-28")
        assert entry["house_input"] == "first_line", bare
    entry, _ = generate.build_entry({**ROW, "bare_number": "not_applicable"}, UPSTREAM, "E06000001", "2026-10-28")
    assert entry["house_input"] == "number_or_name"


def test_skip_get_url_is_copied_from_upstream():
    entry, _ = generate.build_entry(ROW, {**UPSTREAM, "skip_get_url": True}, "E06000001", "2026-10-28")
    assert entry["source"]["skip_get_url"] is True


def test_an_entry_the_registry_would_reject_is_left_out_not_fatal():
    entry, _ = generate.build_entry(ROW, {**UPSTREAM, "url": "http://example.gov.uk/bins"}, "E06000001", "2026-10-28")
    assert any("https" in problem for problem in registry.validate({"councils": [entry]}))
