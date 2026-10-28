"""Reading a council's website to decide what a colour-only bin name means."""
import importlib.util
from collections import Counter
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "map_bin_colours.py"
SPEC = importlib.util.spec_from_file_location("map_bin_colours", SCRIPT)
mapper = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mapper)


def votes(name, text):
    return mapper.votes_for(mapper.name_pattern(name), [("https://example.gov.uk/bins", text)])[0]


def test_sentences_about_the_bin_vote_for_the_kind_of_waste_they_name():
    text = "Put garden waste in your green bin. The green bin is collected fortnightly for hedge cuttings. Grass goes in the green bin."
    assert votes("Green Bin", text) == Counter({"garden": 3})


def test_a_sentence_naming_several_kinds_of_waste_does_not_vote():
    assert votes("Green", "Your green bin takes garden waste and food waste.") == Counter()


def test_a_sentence_without_a_container_word_does_not_vote():
    assert votes("Green", "Green waste is collected on Tuesdays for garden waste.") == Counter()


def test_filler_words_in_the_name_are_ignored_when_matching():
    assert votes("Empty Bin 240L Green", "Your green bin is for garden waste.") == Counter({"garden": 1})


def test_a_clear_winner_is_mapped_and_a_close_call_is_not():
    assert mapper.decide(Counter({"garden": 4})) == "garden"
    assert mapper.decide(Counter({"garden": 6, "recycling": 1})) == "garden"
    assert mapper.decide(Counter({"garden": 4, "recycling": 2})) is None
    assert mapper.decide(Counter({"garden": 2})) is None
    assert mapper.decide(Counter()) is None


def test_the_page_reader_finds_text_and_links():
    page = mapper.Page()
    page.feed("<p>Hello <a href='/bins'>bins</a></p><script>skip()</script>")
    assert "Hello" in "".join(page.text) and "skip" not in "".join(page.text)
    assert page.links == ["/bins"]
