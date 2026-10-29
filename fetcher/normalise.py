"""Turns a UKBinCollectionData response into collections, or a failure."""
from datetime import datetime

from fetcher import streams
from fetcher.model import Collection, FetchError, UnmappedBinError
from fetcher.registry import stream_for

UPSTREAM_DATE_FORMAT = "%d/%m/%Y"


def normalise(council: dict, response: object) -> list[Collection]:
    """Maps upstream's {"bins": [{"type", "collectionDate"}]} onto streams.

    Raises FetchError for empty or odd responses, and UnmappedBinError for bin names the registry
    doesn't know, so a wrong or missing bin never reaches a calendar silently. A name the registry hasn't met
    is settled by the same keyword rules that wrote the registry (see fetcher/streams.py) when they give one
    clear stream, such as "Garden" appearing in a season the council was not probed in. Anything they can't
    settle is still a failure.
    """
    if not isinstance(response, dict) or not isinstance(response.get("bins"), list):
        raise FetchError("response has no 'bins' list")
    if not response["bins"]:
        raise FetchError("response has no collections")

    collections: list[Collection] = []
    unmapped: set[str] = set()
    for item in response["bins"]:
        if not isinstance(item, dict) or "type" not in item or "collectionDate" not in item:
            raise FetchError(f"odd collection entry: {item!r}")
        name = streams.canonical_name(str(item["type"]))  # no weekday or "next collection" wording: see fetcher/streams.py
        try:
            date = datetime.strptime(item["collectionDate"], UPSTREAM_DATE_FORMAT).date().isoformat()
        except (TypeError, ValueError) as err:
            raise FetchError(f"bad date {item['collectionDate']!r} for {name!r}") from err
        stream = stream_for(council, name) or streams.stream_for(name)
        if stream is None:
            if streams.is_ignored(name):
                continue  # a marker or an occasional extra collection (batteries, textiles) that we don't remind about
            unmapped.add(name)
            continue
        collections.append(Collection(date=date, bin_name=name, stream=stream))
    if unmapped:
        raise UnmappedBinError("unmapped bin names: " + ", ".join(sorted(unmapped)))
    if not collections:
        raise FetchError("response has no collections we remind about")
    unique = {(c.date, c.bin_name): c for c in collections}  # a module that lists the same bin twice on a day gives one
    return sorted(unique.values(), key=lambda c: (c.date, c.stream, c.bin_name))
