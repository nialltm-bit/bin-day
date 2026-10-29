"""Which waste stream a council's own bin name says, by keyword.

Shared by the registry generator (to write bin_types) and the fetcher (to settle a bin name the registry hasn't met, such
as a seasonal garden bin that wasn't on offer when the council was probed). Never a guess: a name with no keyword, or with
keywords for two streams, maps to nothing.
"""
import re

STREAM_WORDS = (
    ("food", ("food",)),
    ("garden", ("garden", "brown", "green waste")),
    ("recycling", ("recycl", "paper", "card", "glass", "plastic", "mixed", "dry", "blue")),
    ("general", ("general", "refuse", "rubbish", "residual", "landfill", "black", "grey", "waste", "domestic", "wheeled bin")),
)

# Not a household bin we remind about (a schedule marker or an occasional extra collection): left out of bin_types, which
# the fetcher already treats as "not mapped". Colour-only names such as "Green" stay unmapped on purpose: green is the
# garden bin at some councils and the glass or recycling bin at others, and guessing would put the wrong reminder out.
IGNORED_WORDS = ("transition", "batter", "textile", "electrical", "ahp", "hygiene")


def is_ignored(bin_name: str) -> bool:
    """True for a bin we deliberately don't remind about: a schedule marker or an occasional extra collection."""
    return any(word in bin_name.lower() for word in IGNORED_WORDS)


WEEKDAY = r"(?:mon|tues|wednes|thurs|fri|satur|sun)day"
# "FOOD WASTE: your next weekly collection is on" (Winchester): the wording, and the date it used to be followed by, go.
NEXT_COLLECTION = re.compile(r"\s*[:\-\u2013(]?\s*(?:your\s+)?next\s+(?:\w+\s+)?collection\b.*$", re.I)
# "Food waste on Tuesdays" (Maidstone): the weekday is the round, not the bin, and it changes when the round does.
ON_WEEKDAY = re.compile(rf"\s+on\s+{WEEKDAY}s?\b.*$", re.I)
BARE_WEEKDAY = re.compile(rf"\s*[(\-\u2013:,]?\s*\b{WEEKDAY}s?\b\)?", re.I)


def canonical_name(bin_name: str) -> str:
    """The bin's name without the weekday or the "next collection" wording some councils put in it.

    A council that writes "Food waste on Tuesdays" would otherwise get a new name, and so a failed mapping, a lost learned
    frequency and a false change, the day its round moves to Wednesday. A name that is nothing but such wording is kept as it is.
    """
    name = NEXT_COLLECTION.sub("", bin_name)
    name = ON_WEEKDAY.sub("", name)
    name = BARE_WEEKDAY.sub("", name)
    name = re.sub(r"\s+", " ", name).strip(" :-\u2013,(")
    return name or bin_name


NON_RECYCLABLE = re.compile(r"non[\s-]?recycl", re.I)
JOINER = re.compile(r"\s*(?:\+|&|/|,|\band\b)\s*", re.I)


def _parts(bin_name: str) -> list[str]:
    """The name split at "+", "&", "/", "," and "and" that sit outside brackets: "Glass+Food" is two collections."""
    outside, depth = [], 0
    for char in bin_name:
        depth += char == "("
        depth -= char == ")" and depth > 0
        outside.append("\0" if depth and char in "+&/," else char)
    return [p.replace("\0", "/") for p in JOINER.split("".join(outside)) if p.strip()]


def streams_in(bin_name: str) -> set[str]:
    """Every stream the council's own bin name says, one per part: "Food and Garden" says two, "Colour only" says none.

    "Non-recyclable" is general waste, so it is checked before the recycling words it contains. Within one part the first
    stream wins, which is how "Food Recycling" is food.
    """
    found = set()
    for part in _parts(bin_name):
        lowered = part.lower()
        if NON_RECYCLABLE.search(lowered):
            found.add("general")
            continue
        for stream, words in STREAM_WORDS:
            if any(word in lowered for word in words):
                found.add(stream)
                break
    return found


def stream_for(bin_name: str) -> str | None:
    """The stream the council's own bin name says, or None if it says none or says more than one (never a guess)."""
    found = streams_in(bin_name)
    return next(iter(found)) if len(found) == 1 else None
