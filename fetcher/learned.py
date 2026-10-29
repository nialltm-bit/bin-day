"""Learns how often each bin is emptied, for councils that return only the next date per bin (FRE-293).

The fetcher visits a `next_only` address once a week, on a Sunday (and, so that learning needs no subscribers, each such council's
public test address, fetcher/testaddress.py). If the date it got last time has since passed, the gap
between that date and the new next date is the bin's frequency: 7, 14, 21 or 28 days. Each such gap is one observation
for that council's bin (never for an address), and the tallies live in `registry/learned-frequencies.json`. That file is
public, so it holds only council codes, the council's own bin names and counts: no addresses.

A frequency is trusted ("learned") once it has been seen twice and nothing else has been seen. After that it is locked:
a later observation that disagrees is counted as a conflict and flagged, and the learned value is not changed. A
`every_weeks` set by hand in the registry always wins, and learning only happens for bins that have none.
"""
import json
import os
from copy import deepcopy
from datetime import date
from pathlib import Path

from fetcher.holidays import in_holiday_week
from fetcher.registry import EVERY_WEEKS

LEARNED_PATH = Path(__file__).resolve().parent.parent / "registry" / "learned-frequencies.json"
TRUST_AFTER = 2  # agreeing observations needed before a frequency is used
SHIFT_DAYS = 2  # a holiday can move a collection by this many days either way
CONFLICT = "learned_conflict"


def load(path: Path = LEARNED_PATH) -> dict:
    if not Path(path).exists():
        return {"bins": {}}
    data = json.loads(Path(path).read_text())
    data.setdefault("bins", {})
    return data


def save(data: dict, path: Path = LEARNED_PATH) -> None:
    tmp = Path(path).with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")
    os.replace(tmp, path)


def needs_learning(council: dict, bin_name: str) -> bool:
    """True for a bin of a next_only council that has no frequency set by hand."""
    entry = council.get("bin_types", {}).get(bin_name)
    return council.get("schedule") == "next_only" and entry is not None and "every_weeks" not in entry


def observed_weeks(last_date: date, new_date: date, today: date, holidays: list[str] | None) -> int | None:
    """The frequency one pair of dates shows, or None if the pair can't be trusted to show one.

    Only a pair where last time's date has passed, by less than a week, qualifies: then no collection of this bin can have
    been missed between the two dates, so the gap is exactly one cycle. A gap that isn't a whole number of weeks, give or
    take a holiday shift, or that touches a bank holiday week, says nothing.
    """
    if not 0 < (today - last_date).days < 7:
        return None
    if holidays is not None and (in_holiday_week(last_date, holidays) or in_holiday_week(new_date, holidays)):
        return None
    days = (new_date - last_date).days
    weeks = round(days / 7)
    if weeks not in EVERY_WEEKS or abs(days - weeks * 7) > SHIFT_DAYS:
        return None
    return weeks


def record(learned: dict, ons_code: str, bin_name: str, weeks: int) -> str | None:
    """Adds one observation. Returns CONFLICT if it disagrees with a frequency already learned."""
    entry = learned["bins"].setdefault(ons_code, {}).setdefault(bin_name, {"observations": {}})
    seen = entry["observations"]
    seen[str(weeks)] = seen.get(str(weeks), 0) + 1
    if "weeks" in entry:
        if weeks != entry["weeks"]:
            entry["conflicts"] = entry.get("conflicts", 0) + 1
            return CONFLICT
    elif seen[str(weeks)] >= TRUST_AFTER and len(seen) == 1:
        entry["weeks"] = weeks
    return None


def apply(councils: dict[str, dict], learned: dict) -> dict[str, dict]:
    """The councils with each learned frequency filled in where the registry has none."""
    result = councils
    for ons_code, bins in learned["bins"].items():
        council = councils.get(ons_code)
        if council is None:
            continue
        for bin_name, entry in bins.items():
            if "weeks" in entry and needs_learning(council, bin_name):
                if result is councils:
                    result = dict(councils)
                if result[ons_code] is council:
                    result[ons_code] = deepcopy(council)
                result[ons_code]["bin_types"][bin_name]["every_weeks"] = entry["weeks"]
    return result
