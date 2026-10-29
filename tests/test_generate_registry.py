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
        "Wheeled Bin (180ltr)": "general",
        "Domestic": "general",
    }
    for name, stream in cases.items():
        assert generate.stream_for(name) == stream, name


def test_an_unrecognised_bin_name_is_not_guessed():
    assert generate.stream_for("Nappies") is None
    entry, reason = generate.build_entry({**ROW, "bins": ["General Waste", "Nappies"]}, UPSTREAM, "E06000001", "2026-10-28")
    assert entry is None
    assert "Nappies" in reason


def test_an_ambiguous_colour_is_left_out_not_guessed():
    entry, reason = generate.build_entry({**ROW, "bins": ["General Waste", "Green Bin"]}, UPSTREAM, "E06000001", "2026-10-28")
    assert entry is None
    assert "Green Bin" in reason


def test_extra_collections_and_markers_are_left_out_of_the_entry():
    bins = ["General Waste", "Recycling", "Transition Week", "Batteries/small electricals/textiles", "AHP"]
    entry, reason = generate.build_entry({**ROW, "bins": bins}, UPSTREAM, "E06000001", "2026-10-28")
    assert reason is None
    assert list(entry["bin_types"]) == ["General Waste", "Recycling"]
    assert registry.validate({"councils": [entry]}) == []


def test_a_council_with_no_mappable_bin_is_left_out():
    entry, reason = generate.build_entry({**ROW, "bins": ["AHP"]}, UPSTREAM, "E06000001", "2026-10-28")
    assert entry is None


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


def test_a_council_that_drives_a_browser_is_added_with_needs_selenium():
    entry, _ = generate.build_entry({**ROW, "browser_in_source": True}, UPSTREAM, "E06000001", "2026-10-28")
    assert entry["needs_selenium"] is True
    assert "browser" in entry["notes"]
    assert registry.validate({"councils": [entry]}) == []
    plain, _ = generate.build_entry({**ROW, "browser_in_source": False}, UPSTREAM, "E06000001", "2026-10-28")
    assert plain["needs_selenium"] is False


def test_a_next_only_council_is_added_without_frequencies_to_be_learned():
    row = {**ROW, "schedule": "next_only", "most_dates_for_one_bin": 1, "span_days": 0}
    entry, reason = generate.build_entry(row, UPSTREAM, "E06000001", "2026-10-28")
    assert reason is None
    assert entry["schedule"] == "next_only"
    assert registry.validate({"councils": [entry]}) == []
    assert all("every_weeks" not in b for b in entry["bin_types"].values())
    assert "learned" in entry["notes"]


def test_a_colour_only_name_is_mapped_from_the_councils_website_evidence():
    evidence = {"ExampleCouncil": {"bins": {"Green Bin": {"stream": "garden", "votes": {"garden": 4}}}}}
    row = {**ROW, "bins": ["General Waste", "Recycling", "Green Bin"]}
    entry, reason = generate.build_entry(row, UPSTREAM, "E06000001", "2026-10-28", evidence)
    assert reason is None
    assert entry["bin_types"]["Green Bin"]["stream"] == "garden"
    assert "read from the council's website" in entry["notes"]
    assert registry.validate({"councils": [entry]}) == []


def test_a_colour_with_no_clear_evidence_is_still_left_out():
    evidence = {"ExampleCouncil": {"bins": {"Green Bin": {"stream": None, "votes": {"garden": 1, "recycling": 1}}}}}
    entry, reason = generate.build_entry({**ROW, "bins": ["General Waste", "Green Bin"]}, UPSTREAM, "E06000001", "2026-10-28", evidence)
    assert entry is None


def test_non_recyclable_is_general_waste_not_recycling():
    names = ("Non-recyclable rubbish", "General non-recyclable waste", "Non recyclable Waste", "Non-Recyclables (Purple Lid)")
    for name in names + ("Green non-recyclable",):
        assert generate.stream_for(name) == "general", name


def test_a_name_that_says_two_streams_is_not_guessed():
    for name in ("Food and Garden", "Glass+Food", "Paper/Card+Food", "Garden and food waste bin (Brown)", "Food & Garden"):
        assert generate.stream_for(name) is None, name
        assert generate.streams_in(name) == {"food", "garden"} or len(generate.streams_in(name)) == 2


def test_one_stream_said_twice_or_in_brackets_is_fine():
    assert generate.stream_for("Cardboard, Cartons and Paper (White Bag)") == "recycling"
    assert generate.stream_for("Recycling (green bin) and glass box(es)") == "recycling"
    assert generate.stream_for("Mixed recycling (paper/card/plastics/tins/cans)") == "recycling"
    assert generate.stream_for("Green Bin (General Waste)") == "general"
    assert generate.stream_for("Food Recycling Collection Bin") == "food"


def test_a_name_that_says_two_streams_is_not_settled_by_website_evidence():
    evidence = {"ExampleCouncil": {"bins": {"Food and Garden": {"stream": "garden"}}}}
    row = {**ROW, "bins": ["General Waste", "Food and Garden"]}
    entry, reason = generate.build_entry(row, UPSTREAM, "E06000001", "2026-10-28", evidence)
    assert entry is None


def _generated(bins):
    entry, _ = generate.build_entry(ROW, UPSTREAM, "E06000001", "2026-10-28")
    entry["bin_types"] = {name: {"stream": stream, "label": name} for name, stream in bins.items()}
    return entry


def test_repair_corrects_a_wrong_stream_and_removes_a_council_it_cannot_settle():
    wrong = _generated({"Non-recyclable waste": "recycling", "Recycling": "recycling"})
    mixed = {"Food and Garden": "food", "General": "general", "Recycling": "recycling"}
    unsettled = {**_generated(mixed), "ons_code": "E06000002", "name": "Unsettled"}
    by_hand = {**_generated({"Food and Garden": "food"}), "ons_code": "E06000003", "name": "By hand", "notes": "Checked by a person"}
    data = {"councils": [wrong, unsettled, by_hand]}
    corrected, removed = generate.repair(data, None)
    assert corrected == ["Example"] and removed == ["Unsettled"]
    assert wrong["bin_types"]["Non-recyclable waste"]["stream"] == "general"
    assert [c["name"] for c in data["councils"]] == ["Example", "By hand"]


def test_a_council_whose_bins_have_no_general_or_no_recycling_bin_is_left_out():
    only_food = {**ROW, "bins": ["Food Waste", "Garden Waste"]}
    entry, reason = generate.build_entry(only_food, UPSTREAM, "E06000001", "2026-10-28")
    assert entry is None and "no general waste and no recycling" in reason
    no_recycling = {**ROW, "bins": ["General Waste", "Food waste"]}
    entry, reason = generate.build_entry(no_recycling, UPSTREAM, "E06000001", "2026-10-28")
    assert entry is None and "no recycling" in reason


def test_repair_takes_out_a_generated_council_with_an_incomplete_set_of_bins():
    entry, _ = generate.build_entry(ROW, UPSTREAM, "E06000001", "2026-10-28")
    entry["bin_types"] = {"Food Waste": {"stream": "food", "label": "Food Waste"}}
    data = {"councils": [entry]}
    corrected, removed = generate.repair(data, None)
    assert removed == ["Example"] and data["councils"] == []


def test_an_untested_bare_number_means_the_first_line_is_asked_for():
    row = {
        "module": "Untested", "ok": True, "bins": ["Black Bin", "Recycling"], "schedule": "full",
        "most_dates_for_one_bin": 4, "span_days": 42, "bare_number": "untested", "browser_in_source": False,
    }
    upstream = {"url": "https://x.gov.uk", "postcode": "AA1 1AA", "house_number": "12 High Street"}
    entry, reason = generate.build_entry(row, upstream, "E06000099", "2026-10-29")
    assert reason is None and entry["house_input"] == "first_line"
