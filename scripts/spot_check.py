"""Run every covered council once with its public test address and look for results that can't be right.

For each supported council in the registry this fetches the council's own test address (upstream's public one, never a real
person's), maps the bin names the same way the live fetcher does, and checks what comes back: does it fetch at all, are
there dates, does each bin keep to one weekday and a whole number of weeks between dates, is there a general waste bin and a
recycling bin. It can't say whether the dates are *true*: that needs a person to put the same address into the council's own
page, so the report also picks a spread of councils to check by hand.

Usage: spot_check.py <registry councils.json> <output json> <output markdown> [selenium url] [pause seconds] [ONS codes, comma separated]
The output is public: council names, bin names, dates for public test addresses, never a real address.
"""
import json
import sys
import time
from datetime import date, datetime

from fetcher import registry
from fetcher.model import Address, FetchError, UnmappedBinError
from fetcher.normalise import normalise
from fetcher.upstream import run_ukbcd

WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
HOLIDAY_SHIFT_DAYS = 2  # a bank holiday can move a collection by this much either way
UPCOMING = 4  # dates shown per bin


def weekday_flags(dates: list[date]) -> list[str]:
    """A bin that is collected on one weekday shows up on one weekday (a holiday shift of a day or two is allowed)."""
    if len(dates) < 2:
        return []
    days = sorted({d.weekday() for d in dates})
    # Weekdays that are all within a holiday shift of the most common one are fine; anything further apart is not.
    common = max(days, key=lambda w: sum(d.weekday() == w for d in dates))
    far = [w for w in days if min((w - common) % 7, (common - w) % 7) > HOLIDAY_SHIFT_DAYS]
    return [f"collected on {', '.join(WEEKDAYS[w] for w in sorted(set(days)))}"] if far else []


def gap_flags(dates: list[date]) -> list[str]:
    """Between one collection and the next of the same bin there is a whole number of weeks, give or take a holiday shift."""
    ordered = sorted(dates)
    odd = []
    for before, after in zip(ordered, ordered[1:], strict=False):
        days = (after - before).days
        weeks = round(days / 7)
        if weeks < 1 or abs(days - weeks * 7) > HOLIDAY_SHIFT_DAYS:
            odd.append(days)
    return [f"gaps of {sorted(set(odd))} days between collections"] if odd else []


def stream_flags(streams: set[str]) -> list[str]:
    flags = []
    if "general" not in streams:
        flags.append("no general waste bin")
    if "recycling" not in streams:
        flags.append("no recycling bin")
    return flags


def check_council(council: dict, collections: list, today: date) -> dict:
    """The bins a fetch gave, with the next dates for each and anything that looks wrong."""
    by_bin: dict[str, dict] = {}
    for item in collections:
        entry = by_bin.setdefault(item.bin_name, {"stream": item.stream, "dates": []})
        entry["dates"].append(date.fromisoformat(item.date))
    flags: list[str] = []
    bins = []
    for name, entry in sorted(by_bin.items()):
        dates = sorted(entry["dates"])
        upcoming = [d for d in dates if d >= today]
        if not upcoming:
            flags.append(f"{name}: every date is in the past")
        if council.get("schedule") == "full":
            flags += [f"{name}: {flag}" for flag in weekday_flags(upcoming) + gap_flags(upcoming)]
        bins.append({"name": name, "stream": entry["stream"], "next": [d.isoformat() for d in upcoming[:UPCOMING]]})
    flags += stream_flags({b["stream"] for b in bins})
    return {"bins": bins, "flags": flags}


def run_one(council: dict, selenium_url: str | None, today: date) -> dict:
    test = council["test_address"]
    address = Address(
        uprn=test.get("uprn", "0"),
        ons_code=council["ons_code"],
        postcode=test.get("postcode"),
        house_number=test.get("house_number"),
    )
    result = {
        "ons_code": council["ons_code"],
        "name": council["name"],
        "schedule": council["schedule"],
        "browser": bool(council.get("needs_selenium")),
        "address": test,
        "url": council["source"]["url"],
    }
    try:
        collections = normalise(council, run_ukbcd(council, address, selenium_url))
    except FetchError as err:
        # Only the kind of failure, never the text: upstream's error text can carry the request.
        kind = getattr(err, "kind", type(err).__name__)
        # A bin name the registry can't map is the council's own wording, not an address, so it is worth showing.
        own_words = isinstance(err, UnmappedBinError) or type(err) is FetchError  # our own messages, never upstream's text
        detail = f": {err}" if own_words else ""
        return {**result, "ok": False, "error": kind + detail, "bins": [], "flags": [f"did not fetch ({kind}{detail})"]}
    return {**result, "ok": True, **check_council(council, collections, today)}


def hand_picks(results: list[dict]) -> list[dict]:
    """A spread to check by hand: each kind of council, each nation, London, and any that raised flags."""
    picks: list[dict] = []

    def add(item: dict | None) -> None:
        if item and all(item["ons_code"] != p["ons_code"] for p in picks):
            picks.append(item)

    good = [r for r in results if r["ok"]]
    for schedule in ("full", "next_only"):
        for browser in (False, True):
            add(next((r for r in good if r["schedule"] == schedule and r["browser"] == browser), None))
    for prefix in ("S", "W", "N"):
        add(next((r for r in good if r["ons_code"].startswith(prefix)), None))
    add(next((r for r in good if r["ons_code"].startswith("E09")), None))
    for r in results:
        if r["flags"] and len(picks) < 12:
            add(r)
    return picks


def markdown(results: list[dict], picks: list[dict], today: date) -> str:
    failed = [r for r in results if not r["ok"]]
    flagged = [r for r in results if r["ok"] and r["flags"]]
    lines = [
        f"# Spot check ({today.isoformat()})",
        "",
        "Every covered council, run once with its public test address. This catches councils that don't fetch and results that",
        "can't be right (a bin on two weekdays, odd gaps, no general or recycling bin). It cannot say the dates are true.",
        "",
        f"- Councils checked: {len(results)}. Fetched: {len(results) - len(failed)}. Did not fetch: {len(failed)}.",
        f"- Fetched but flagged: {len(flagged)}.",
        "",
        "## To check by hand",
        "",
        "Put the address into the council's own bin page and compare the next dates and what each bin is. These are upstream's public",
        "test addresses.",
        "",
    ]
    for r in picks:
        a = r["address"]
        where = ", ".join(str(v) for k, v in a.items() if k != "uprn") or f"UPRN {a.get('uprn')}"
        lines += [f"### {r['name']}", "", f"Address: {where}. Council site: {r['url']}", ""]
        if r["bins"]:
            lines += ["| Bin (council's name) | We call it | Next dates |", "|---|---|---|"]
            lines += [f"| {b['name']} | {b['stream']} | {', '.join(b['next']) or 'none'} |" for b in r["bins"]]
        lines += [""] + [f"- Flag: {f}" for f in r["flags"]] + ([""] if r["flags"] else [])
    if failed:
        lines += ["## Did not fetch", ""] + [f"- {r['name']}: {r['error']}" for r in failed] + [""]
    if flagged:
        lines += ["## Fetched but flagged", ""] + [f"- {r['name']}: {'; '.join(r['flags'])}" for r in flagged] + [""]
    return "\n".join(lines) + "\n"


def main(
    registry_path: str, json_path: str, md_path: str, selenium_url: str | None = None, pause: float = 2.0, only: str = ""
) -> None:
    wanted = {code for code in only.split(",") if code}
    everything = json.load(open(registry_path))["councils"]
    councils = [c for c in everything if registry.is_fetchable(c) and (not wanted or c["ons_code"] in wanted)]
    today = datetime.now().date()
    results = []
    for council in councils:
        result = run_one(council, selenium_url, today)
        results.append(result)
        print(json.dumps({"council": result["ons_code"], "ok": result["ok"], "flags": len(result["flags"])}), flush=True)
        time.sleep(pause)
    picks = hand_picks(results)
    json.dump({"date": today.isoformat(), "results": results}, open(json_path, "w"), indent=2)
    open(md_path, "w").write(markdown(results, picks, today))


if __name__ == "__main__":
    chrome = sys.argv[4] if len(sys.argv) > 4 else None
    pause = float(sys.argv[5]) if len(sys.argv) > 5 else 2.0
    main(sys.argv[1], sys.argv[2], sys.argv[3], chrome, pause, sys.argv[6] if len(sys.argv) > 6 else "")
