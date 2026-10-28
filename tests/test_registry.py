import copy
import json

import pytest

from fetcher import registry


def valid_entry():
    """B&NES, a next_only council with frequencies, picked by code so the order of the registry doesn't matter."""
    councils = json.loads(registry.REGISTRY_PATH.read_text())["councils"]
    return copy.deepcopy(next(c for c in councils if c["ons_code"] == "E06000022"))


def problems_for(*entries):
    return registry.validate({"councils": list(entries)})


def test_shipped_registry_is_valid():
    assert registry.validate(json.loads(registry.REGISTRY_PATH.read_text())) == []


def test_load_keys_councils_by_ons_code():
    councils = registry.load()
    bathnes = registry.get_council(councils, "E06000022")
    assert bathnes["name"] == "Bath and North East Somerset"
    assert bathnes["source"]["module"] == "BathAndNorthEastSomersetCouncil"
    assert bathnes["inputs"] == ["uprn"]
    assert bathnes["needs_selenium"] is False
    assert registry.is_fetchable(bathnes)


def test_unknown_council_is_none():
    assert registry.get_council(registry.load(), "E00000000") is None


def test_bin_names_map_to_streams():
    bathnes = registry.load()["E06000022"]
    assert registry.stream_for(bathnes, "Food Recycling Collection Bin") == "food"
    assert registry.stream_for(bathnes, "Black Rubbish Bin (140L)") == "general"


def test_unmapped_bin_name_is_none_so_callers_can_treat_it_as_a_failure():
    assert registry.stream_for(registry.load()["E06000022"], "Mystery Bin") is None


def test_adding_a_council_is_only_data():
    second = valid_entry()
    second.update(ons_code="E06000023", name="Bristol, City of")
    assert problems_for(valid_entry(), second) == []


def test_unsupported_council_needs_only_the_basics():
    entry = {"ons_code": "E06000023", "name": "Bristol, City of", "status": "unsupported"}
    assert problems_for(entry) == []
    assert not registry.is_fetchable(entry)


def test_broken_council_is_not_fetchable():
    entry = valid_entry()
    entry["status"] = "broken"
    assert problems_for(entry) == []
    assert not registry.is_fetchable(entry)


def test_load_raises_on_an_invalid_file(tmp_path):
    bad = tmp_path / "councils.json"
    bad.write_text(json.dumps({"councils": [{"ons_code": "nope"}]}))
    with pytest.raises(registry.RegistryError):
        registry.load(bad)


@pytest.mark.parametrize(
    ("change", "expected"),
    [
        (lambda e: e.update(ons_code="B1"), "ons_code must look like"),
        (lambda e: e.update(name=""), "name is required"),
        (lambda e: e.update(status="working"), "status must be one of"),
        (lambda e: e.update(inputs=["uprn", "uprn"]), "unique values"),
        (lambda e: e.update(inputs=["address"]), "unique values"),
        (lambda e: e.update(inputs=[]), "at least one input"),
        (lambda e: e.pop("schedule"), "must say whether they return next_only dates or a full schedule"),
        (lambda e: e.update(schedule="weekly"), "schedule must be one of"),
        (lambda e: e["bin_types"]["Green Recycling Box"].update(every_weeks=0), "every_weeks must be one of 1, 2, 3, 4"),
        (lambda e: e["bin_types"]["Green Recycling Box"].update(every_weeks=5), "every_weeks must be one of 1, 2, 3, 4"),
        (lambda e: e["bin_types"]["Green Recycling Box"].update(every_weeks="2"), "every_weeks must be one of 1, 2, 3, 4"),
        (lambda e: e["bin_types"]["Green Recycling Box"].update(every_weeks=True), "every_weeks must be one of 1, 2, 3, 4"),
        (lambda e: e["bin_types"]["Green Recycling Box"].update(every_weeks=1.5), "every_weeks must be one of 1, 2, 3, 4"),
        (lambda e: e.update(typo_field=1), "unknown key 'typo_field'"),
        (lambda e: e.update(house_input="street"), "house_input must be one of"),
        (lambda e: e.update(house_input="first_line"), "house_input only applies to councils that take a house_number"),
        (lambda e: e.update(last_verified="yesterday"), "last_verified must be a date"),
        (lambda e: e.update(min_interval_seconds=0), "min_interval_seconds must be a positive number"),
        (lambda e: e.update(min_interval_seconds="10"), "min_interval_seconds must be a positive number"),
        (lambda e: e.update(bin_types={}), "supported councils need bin_types"),
        (lambda e: e.update(bin_types={"Bin": {"stream": "glass"}}), "stream must be one of"),
        (lambda e: e.update(bin_types={"Bin": {"stream": "food", "color": "red"}}), "unknown key 'color'"),
        (lambda e: e.update(test_address={}), "test_address must give every required input"),
        (lambda e: e["source"].update(url="http://example.com"), "source.url must be an https URL"),
        (lambda e: e["source"].pop("module"), "need source.module"),
        (lambda e: e["source"].update(type="scraper"), "source.type must be one of"),
        (lambda e: e["source"].update(extra=1), "unknown source key 'extra'"),
        (lambda e: e.pop("source"), "need a source"),
        (lambda e: e.pop("needs_selenium"), "must say whether they need Selenium"),
        (lambda e: e.update(needs_selenium="yes"), "needs_selenium must be true or false"),
        (lambda e: (e["source"].update(type="ical"), e.update(needs_selenium=True)), "only ukbcd sources can need Selenium"),
    ],
)
def test_validation_catches_mistakes(change, expected):
    entry = copy.deepcopy(valid_entry())
    change(entry)
    assert any(expected in problem for problem in problems_for(entry)), problems_for(entry)


def test_duplicate_ons_codes_are_rejected():
    assert any("duplicate ons_code" in p for p in problems_for(valid_entry(), valid_entry()))


def test_top_level_shape_is_checked():
    assert registry.validate([]) == ["registry must be an object with a 'councils' list"]


def test_a_next_only_council_may_leave_frequencies_to_be_learned():
    entry = valid_entry()
    for bin_type in entry["bin_types"].values():
        bin_type.pop("every_weeks")
    assert problems_for(entry) == []


def test_a_full_schedule_council_needs_no_frequencies():
    entry = valid_entry()
    entry["schedule"] = "full"
    for bin_type in entry["bin_types"].values():
        bin_type.pop("every_weeks")
    assert problems_for(entry) == []


def test_a_full_schedule_council_should_not_set_frequencies():
    entry = valid_entry()
    entry["schedule"] = "full"
    assert any("should not set every_weeks" in p for p in problems_for(entry))


def test_unsupported_councils_need_no_schedule():
    entry = {"ons_code": "E06000023", "name": "Bristol, City of", "status": "unsupported"}
    assert problems_for(entry) == []


def test_bathnes_is_next_only_with_each_bins_frequency():
    bathnes = registry.load()["E06000022"]
    assert bathnes["schedule"] == "next_only"
    assert registry.every_weeks(bathnes, "Black Rubbish Bin (140L)") == 2
    assert registry.every_weeks(bathnes, "Food Recycling Collection Bin") == 1
    assert registry.every_weeks(bathnes, "Green Recycling Box") == 1
    assert registry.every_weeks(bathnes, "Blue Recycling Bag for Cardboard") == 1


def test_every_weeks_for_an_unknown_bin_is_none():
    assert registry.every_weeks(registry.load()["E06000022"], "Mystery Bin") is None


def test_newcastle_needs_the_first_line_of_the_address():
    councils = registry.load()
    assert councils["E08000021"]["inputs"] == ["postcode", "house_number"]
    assert councils["E08000021"]["house_input"] == "first_line"
    assert councils["E08000021"]["schedule"] == "full"
    assert councils["E08000021"]["needs_selenium"] is False
