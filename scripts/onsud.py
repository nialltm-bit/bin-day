"""Helpers for the ONS UPRN Directory (ONSUD): find the newest release, download it, and stream (postcode, council, UPRN) out of it.

ONSUD gives every UPRN its postcode and the council (Local Authority District) it sits in. It holds no address text. It is
Crown copyright and database right, published under the Open Government Licence, on the ONS Open Geography Portal.

The release is a large zip of CSV files. It is read as a stream, one file at a time, and never unpacked to disk.
Used by onsud_stats.py and postcode_sample.py. Nothing here prints a postcode or a UPRN: those runs are in public logs.
"""
import csv
import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request
import zipfile
from collections.abc import Iterator
from dataclasses import dataclass

ARCGIS = "https://www.arcgis.com/sharing/rest"
POSTCODE_COLUMNS = ("pcds", "pcd8", "pcd7", "pcd", "postcode")  # the spaced postcode first
COUNCIL_COLUMN = re.compile(r"^lad(\d{2})cd$")  # lad25cd: the year changes with each release
POSTCODE = re.compile(r"^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$")
MONTHS = ("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec")


class OnsudError(Exception):
    pass


@dataclass(frozen=True)
class Columns:
    uprn: int
    postcode: int
    council: int
    postcode_name: str
    council_name: str


def get_json(url: str, params: dict | None = None) -> dict:
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"User-Agent": "bin-day-onsud"})
    with urllib.request.urlopen(request, timeout=180) as response:
        return json.load(response)


def release_order(item: dict) -> tuple[int, int, int]:
    """Newest first when sorted descending: the month and year in the title if it has them, else when the item changed."""
    title = item.get("title", "").lower()
    match = re.search(r"\b(" + "|".join(MONTHS) + r")[a-z]*\.?\s+(20\d\d)\b", title)
    if match:
        return (int(match.group(2)), MONTHS.index(match.group(1)) + 1, item.get("modified", 0))
    return (0, 0, item.get("modified", 0))


def candidates() -> list[dict]:
    """Items on the ONS portal that look like an ONSUD release, newest first. Several searches, because titles vary."""
    found: dict[str, dict] = {}
    for query in ('title:"ONS UPRN Directory"', 'title:"ONSUD"', '"ONS UPRN Directory" AND owner:ONSGeography_data'):
        try:
            results = get_json(f"{ARCGIS}/search", {"q": query, "sortField": "modified", "sortOrder": "desc", "num": 30, "f": "json"})
        except OSError as err:
            print("search failed:", type(err).__name__, file=sys.stderr)
            continue
        for item in results.get("results", []):
            if "uprn" in item.get("title", "").lower() or "onsud" in item.get("title", "").lower():
                found[item["id"]] = item
    return sorted(found.values(), key=release_order, reverse=True)


def newest_release() -> dict:
    items = candidates()
    for item in items:
        print("candidate:", item["title"], "|", item.get("type"), "| size", item.get("size"), "| modified", item.get("modified"))
    # The portal reports no size for these items, so tell the data from its user guide by title, and take the newest month.
    releases = [i for i in items if "user guide" not in i["title"].lower() and release_order(i)[0] > 0]
    if not releases:
        raise OnsudError("no dated ONSUD release found on the ONS portal")
    return releases[0]


def download(item_id: str, destination: str, attempts: int = 3) -> int:
    """Streams the release to a file and returns its size in bytes."""
    url = f"{ARCGIS}/content/items/{item_id}/data"
    for attempt in range(1, attempts + 1):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "bin-day-onsud"})
            with urllib.request.urlopen(request, timeout=300) as response, open(destination, "wb") as out:
                total, next_report = 0, 500_000_000
                while chunk := response.read(1 << 20):
                    out.write(chunk)
                    total += len(chunk)
                    if total >= next_report:
                        print(f"downloaded {total / 1e9:.1f} GB")
                        next_report += 500_000_000
            print(f"download finished: {total / 1e9:.2f} GB")
            return total
        except OSError as err:
            print(f"download attempt {attempt} failed: {type(err).__name__}", file=sys.stderr)
            if attempt == attempts:
                raise OnsudError("the ONSUD download failed") from err
            time.sleep(10 * attempt)
    raise OnsudError("unreachable")


def find_columns(header: list[str]) -> Columns:
    """Where the UPRN, postcode and council columns are. Raises with the column names (they are field names, not data)."""
    names = [h.strip().lower().lstrip("﻿") for h in header]
    uprn = names.index("uprn") if "uprn" in names else None
    postcode = next((names.index(c) for c in POSTCODE_COLUMNS if c in names), None)
    councils = sorted(((int(m.group(1)), i) for i, n in enumerate(names) if (m := COUNCIL_COLUMN.match(n))), reverse=True)
    council = councils[0][1] if councils else None
    if uprn is None or postcode is None or council is None:
        raise OnsudError(f"missing a UPRN, postcode or council (LADxxCD) column; the columns are: {', '.join(names)}")
    return Columns(uprn, postcode, council, names[postcode], names[council])


def normalise_postcode(raw: str) -> str | None:
    """'BA34XX' or 'ba3  4xx' as 'BA3 4XX'; None for anything that is not a full postcode."""
    squashed = re.sub(r"\s+", "", raw).upper()
    if not POSTCODE.match(squashed):
        return None
    return f"{squashed[:-3]} {squashed[-3:]}"


def outcode(postcode: str) -> str:
    return postcode.split(" ")[0]


def csv_members(archive: zipfile.ZipFile) -> list[zipfile.ZipInfo]:
    return [i for i in archive.infolist() if not i.is_dir() and i.filename.lower().endswith(".csv")]


@dataclass
class Totals:
    files_read: int = 0
    files_skipped: int = 0
    rows: int = 0
    without_postcode: int = 0
    without_council: int = 0
    columns: Columns | None = None


def rows(zip_path: str, totals: Totals) -> Iterator[tuple[str, str, int]]:
    """(postcode, council code, UPRN) for every row that has all three. Counts what it leaves out in `totals`.

    A CSV in the zip that has no UPRN or postcode column (a guide or look-up table) is skipped and counted.
    """
    csv.field_size_limit(1 << 24)
    with zipfile.ZipFile(zip_path) as archive:
        for member in csv_members(archive):
            with archive.open(member) as raw:
                reader = csv.reader(io.TextIOWrapper(raw, encoding="utf-8-sig", errors="replace", newline=""))
                header = next(reader, None)
                try:
                    cols = find_columns(header or [])
                except OnsudError:
                    totals.files_skipped += 1
                    continue
                totals.files_read += 1
                totals.columns = totals.columns or cols
                top = max(cols.uprn, cols.postcode, cols.council)
                for row in reader:
                    if len(row) <= top:
                        continue
                    totals.rows += 1
                    postcode = normalise_postcode(row[cols.postcode])
                    council = row[cols.council].strip()
                    if postcode is None:
                        totals.without_postcode += 1
                        continue
                    if not council:
                        totals.without_council += 1
                        continue
                    try:
                        uprn = int(row[cols.uprn])
                    except ValueError:
                        continue
                    yield postcode, council, uprn
