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
import sys
import urllib.request
from datetime import date
from pathlib import Path

from fetcher import registry
from fetcher.streams import IGNORED_WORDS, STREAM_WORDS, stream_for, streams_in  # noqa: F401  (re-exported for tests)


def council_for_postcode(postcode: str) -> str | None:
    """The ONS code postcodes.io gives for a postcode, to check upstream's code or to fill a gap."""
    url = "https://api.postcodes.io/postcodes/" + postcode.replace(" ", "")
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            return json.load(response)["result"]["codes"]["admin_district"]
    except Exception:
        return None


def current_codes() -> set[str]:
    """The codes of the councils that exist now (the outlines the site's map uses)."""
    path = Path(__file__).resolve().parent.parent / "web" / "public" / "data" / "council-shapes.json"
    return {c["code"] for c in json.load(open(path))["councils"]}


def settle_code(upstream_code: str | None, from_postcode: str | None, current: set[str]) -> tuple[str | None, str | None]:
    """The council code to use, or (None, reason). Upstream sometimes still has a code that has since been retired (a
    council that was merged or recoded); then the code of the council the test postcode is in is the right one. Any
    other disagreement means one of them is wrong, so the council is left out."""
    if upstream_code is None:
        return from_postcode, None if from_postcode else "no council code"
    if from_postcode and from_postcode != upstream_code:
        if upstream_code not in current and from_postcode in current:
            return from_postcode, None
        return None, f"upstream says {upstream_code} but the test postcode is in {from_postcode}"
    return upstream_code, None


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
    missing = incomplete(bin_types)
    if missing:
        return None, missing
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


def incomplete(bin_types: dict) -> str | None:
    """Why a council's bins can't be the whole household service, or None. A calendar with no general waste bin, or no
    recycling bin, would silently leave out the collections people most need, so such a council is left out until it is
    sorted out."""
    streams = {b["stream"] for b in bin_types.values()}
    missing = [name for name, stream in (("general waste", "general"), ("recycling", "recycling")) if stream not in streams]
    return f"the bins found have no {' and no '.join(missing)} bin, so the calendar would be incomplete" if missing else None


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
        if not drop and incomplete(council["bin_types"]):
            drop = True
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
    current = current_codes()
    added, skipped = [], []
    for row in probe:
        module = row["module"]
        entry_in = upstream[module]
        if not row.get("ok"):
            skipped.append((module, f"probe failed ({row.get('error', 'no result')})"))
            continue
        from_postcode = council_for_postcode(entry_in["postcode"])
        code, why = settle_code(entry_in.get("LAD24CD"), from_postcode, current)
        if code is None:
            skipped.append((module, why))
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
