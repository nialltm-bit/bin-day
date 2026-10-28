"""Add every council that probed cleanly to the registry, with no hand-written entries.

Reads upstream's test inputs and the batch probe results (scripts/batch_probe.py). For each council that returned a full
schedule without a browser, it builds a registry entry: the module and inputs from upstream, the bin names mapped to
streams by keyword, the schedule from what the probe saw, and whether a bare house number finds the same house.
A council that needs a browser is added with needs_selenium set, and the fetch workflows run a Chrome service for it.
A council it can't map completely (an unrecognised bin name, no council code, a postcode that belongs to another
council) is left out and listed in the report, so a person only looks at exceptions. Entries written by hand are never
changed; entries this script generated are re-checked each run against the current bin-name rules (see repair).

Usage: generate_registry.py <upstream input.json> <batch-probe.json> <registry councils.json> <report.md> [bin-colour-evidence.json]

The optional evidence file (scripts/map_bin_colours.py) says what a colour-only bin name means according to the council's
own website; a name it maps with enough evidence is used, and the entry's notes say so.
"""
import json
import re
import sys
import urllib.request
from datetime import date
from pathlib import Path

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


def council_for_postcode(postcode: str) -> str | None:
    """The ONS code postcodes.io gives for a postcode, to check upstream's code or to fill a gap."""
    url = "https://api.postcodes.io/postcodes/" + postcode.replace(" ", "")
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            return json.load(response)["result"]["codes"]["admin_district"]
    except Exception:
        return None


def build_entry(row: dict, upstream: dict, code: str, today: str, evidence: dict | None = None) -> tuple[dict | None, str | None]:
    """A registry entry for one probed council, or (None, reason) if it can't be built completely."""
    bin_types = {}
    from_site: list[str] = []
    for name in row["bins"]:
        if any(word in name.lower() for word in IGNORED_WORDS):
            continue
        stream = stream_for(name)
        if stream is None and not streams_in(name):  # a name that says several streams is never settled by a website
            stream = ((evidence or {}).get(row["module"], {}).get("bins", {}).get(name) or {}).get("stream")
            if stream is not None:
                from_site.append(name)
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
    site_note = ""
    if from_site:
        names = ", ".join(map(repr, from_site))
        site_note = f", except {names}, which were read from the council's website (see docs/spike-results/bin-colour-evidence.json)"
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
            f"Bin streams were mapped from the council's own bin names by keyword"
            f"{site_note}"
            + f", and are not checked by a person. A bare house number: {bare.replace('_', ' ')}. No colours are set."
        ),
    }
    return entry, None


GENERATED = "Generated from upstream's test inputs"


def repair(data: dict, evidence: dict | None) -> tuple[list[str], list[str]]:
    """Re-checks the generated entries against the current mapping rules, because the rules get better.

    A bin whose stream now comes out differently is corrected. A council with a bin the rules can no longer settle is taken
    out of the registry, as if it had not been generated, and comes back when a rule or the evidence settles it. Entries
    that were not generated (written by hand) are never touched. Returns the names corrected and the names removed.
    """
    corrected, removed, keep = [], [], []
    for council in data["councils"]:
        if not council.get("notes", "").startswith(GENERATED):
            keep.append(council)
            continue
        module = council["source"].get("module")
        seen_on_site = ((evidence or {}).get(module) or {}).get("bins", {})
        changed, drop = False, False
        for name, bin_type in council["bin_types"].items():
            stream = stream_for(name)
            if stream is None and not streams_in(name):
                stream = (seen_on_site.get(name) or {}).get("stream")
            if stream is None:
                drop = True
            elif stream != bin_type["stream"]:
                bin_type["stream"] = stream
                changed = True
        if drop:
            removed.append(council["name"])
        else:
            keep.append(council)
            if changed:
                corrected.append(council["name"])
    data["councils"] = keep
    return corrected, removed


def main(input_path, probe_path, registry_path, report_path, evidence_path=None):
    evidence = json.load(open(evidence_path)) if evidence_path and Path(evidence_path).exists() else None
    upstream = json.load(open(input_path))
    probe = json.load(open(probe_path))["results"]
    data = json.load(open(registry_path))
    corrected, removed = repair(data, evidence)
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
        entry, reason = build_entry(row, entry_in, code, today, evidence)
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
    if corrected or removed:
        lines += ["", "## Re-checked against the current mapping rules", ""]
        lines += [f"- corrected: {name}" for name in corrected]
        lines += [f"- taken out until its bin names can be settled: {name}" for name in removed]
    lines += ["", "## Left out, and why", ""] + [f"- {m}: {why}" for m, why in skipped]
    open(report_path, "w").write("\n".join(lines) + "\n")
    print(f"added {len(added)}, left out {len(skipped)}, corrected {len(corrected)}, taken out {len(removed)}")
    for module, why in skipped:
        print(f"  left out {module}: {why}")


if __name__ == "__main__":
    main(*sys.argv[1:6])
