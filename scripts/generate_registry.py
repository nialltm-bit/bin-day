"""Add every council that probed cleanly to the registry, with no hand-written entries.

Reads upstream's test inputs and the batch probe results (scripts/batch_probe.py). For each council that returned a full
schedule without a browser, it builds a registry entry: the module and inputs from upstream, the bin names mapped to
streams by keyword, the schedule from what the probe saw, and whether a bare house number finds the same house.
A council that needs a browser is added with needs_selenium set, and the fetch workflows run a Chrome service for it.
A council it can't map completely (an unrecognised bin name, no council code, a postcode that belongs to another
council) is left out and listed in the report, so a person only looks at exceptions. Existing registry entries are never
changed.

Usage: generate_registry.py <upstream input.json> <batch-probe.json> <registry councils.json> <report.md>
"""
import json
import sys
import urllib.request
from datetime import date

from fetcher import registry

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


def stream_for(bin_name: str) -> str | None:
    """The first stream whose keyword the council's own bin name contains, or None if none does."""
    lowered = bin_name.lower()
    for stream, words in STREAM_WORDS:
        if any(word in lowered for word in words):
            return stream
    return None


def council_for_postcode(postcode: str) -> str | None:
    """The ONS code postcodes.io gives for a postcode, to check upstream's code or to fill a gap."""
    url = "https://api.postcodes.io/postcodes/" + postcode.replace(" ", "")
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            return json.load(response)["result"]["codes"]["admin_district"]
    except Exception:
        return None


def build_entry(row: dict, upstream: dict, code: str, today: str) -> tuple[dict | None, str | None]:
    """A registry entry for one probed council, or (None, reason) if it can't be built completely."""
    bin_types = {}
    for name in row["bins"]:
        if any(word in name.lower() for word in IGNORED_WORDS):
            continue
        stream = stream_for(name)
        if stream is None:
            return None, f"unrecognised bin name {name!r}"
        bin_types[name] = {"stream": stream, "label": name}
    if not bin_types:
        return None, "no bin we can map"
    source = {"type": "ukbcd", "module": row["module"], "url": upstream["url"]}
    if upstream.get("skip_get_url") is True:
        source["skip_get_url"] = True
    bare = row.get("bare_number", "not_applicable")
    first_line = bare in ("different_house", "no_result") or bare.startswith("error_")
    if row["schedule"] == "next_only":
        returned = (
            "returned only the next date per bin, so how often each bin is emptied is learned from repeat fetches "
            "(fetcher/learned.py) and the feed shows only confirmed dates until then. "
        )
    else:
        returned = f"returned a full schedule of {row['most_dates_for_one_bin']} dates over {row['span_days']} days. "
    entry = {
        "ons_code": code,
        "name": upstream.get("wiki_name") or row["module"],
        "status": "supported",
        "schedule": "next_only" if row["schedule"] == "next_only" else "full",
        "source": source,
        "inputs": ["postcode", "house_number"],
        "house_input": "first_line" if first_line else "number_or_name",
        "needs_selenium": bool(row.get("browser_in_source")),
        "bin_types": bin_types,
        "test_address": {"postcode": upstream["postcode"], "house_number": str(upstream["house_number"])},
        "last_verified": today,
        "notes": (
            f"Generated from upstream's test inputs and a probe on {today}: "
            f"{'drives a browser (Selenium)' if row.get('browser_in_source') else 'plain HTTP (no browser in the module)'}, "
            f"{returned}"
            f"Bin streams were mapped from the council's own bin names by keyword and are not checked against the "
            f"council's website. A bare house number: {bare.replace('_', ' ')}. No colours are set."
        ),
    }
    return entry, None


def main(input_path, probe_path, registry_path, report_path):
    upstream = json.load(open(input_path))
    probe = json.load(open(probe_path))["results"]
    data = json.load(open(registry_path))
    existing = {c["ons_code"] for c in data["councils"]}
    today = date.today().isoformat()
    added, skipped = [], []
    for row in probe:
        module = row["module"]
        entry_in = upstream[module]
        if not row.get("ok"):
            skipped.append((module, f"probe failed ({row.get('error', 'no result')})"))
            continue
        from_postcode = council_for_postcode(entry_in["postcode"])
        code = entry_in.get("LAD24CD") or from_postcode
        if code is None:
            skipped.append((module, "no council code"))
            continue
        if from_postcode and from_postcode != code:
            skipped.append((module, f"upstream says {code} but the test postcode is in {from_postcode}"))
            continue
        if code in existing:
            skipped.append((module, "already in the registry (left unchanged)"))
            continue
        entry, reason = build_entry(row, entry_in, code, today)
        if entry is None:
            skipped.append((module, reason))
            continue
        problems = registry.validate({"councils": [entry]})
        if problems:
            skipped.append((module, "; ".join(p.split(": ", 1)[-1] for p in problems)))
            continue
        data["councils"].append(entry)
        existing.add(code)
        added.append((module, code))
    data["councils"].sort(key=lambda c: c["ons_code"])
    problems = registry.validate(data)
    if problems:  # every entry was checked on its own, so this is a clash between them, such as a duplicate code
        sys.exit("generated registry is invalid:\n" + "\n".join(problems))
    json.dump(data, open(registry_path, "w"), indent=2, ensure_ascii=False)
    open(registry_path, "a").write("\n")
    lines = [f"# Generated registry report ({today})", "", f"Added {len(added)} councils. Left out {len(skipped)}.", "", "## Added", ""]
    lines += [f"- {m} ({c})" for m, c in added]
    lines += ["", "## Left out, and why", ""] + [f"- {m}: {why}" for m, why in skipped]
    open(report_path, "w").write("\n".join(lines) + "\n")
    print(f"added {len(added)}, left out {len(skipped)}")
    for module, why in skipped:
        print(f"  left out {module}: {why}")


if __name__ == "__main__":
    main(*sys.argv[1:5])
