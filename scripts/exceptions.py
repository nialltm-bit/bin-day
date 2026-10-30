"""List every council that is not in the registry, with why and what it would take, so they can be worked through later.

Reads the coverage census (docs/coverage-census-councils.csv), the batch probe results, the registry and the last registry
generator report (the reasons councils were left out). Writes a markdown file grouped by what is needed and a CSV with one
row per council. Nothing here contacts a council; it is rebuilt from files, so rerun it after the registry changes.

Usage: exceptions.py <census councils.csv> <batch-probe.json> <registry councils.json> <generated report.md> <out dir>
"""
import csv
import json
import re
import sys
from pathlib import Path

# (key, heading, what it takes). The order is the order in the file: the cheapest to work through first.
GROUPS = [
    ("colour", "Bin names are colours or ambiguous",
     "A person looks up what each bin is on the council's site and says so; then the council is added."),
    ("combined", "Bin names that combine streams",
     "Decide how a name like 'Food & Garden' or 'Glass+Food' should appear in the calendar (one bin, two kinds of waste)."),
    ("incomplete", "Calendar would be incomplete",
     "The bins found lack a general waste or recycling bin. Check whether the module drops one or the council collects it elsewhere."),
    ("probe_failed", "Probe failed",
     "Re-run the probe; if it still fails, the module may be broken or blocked from GitHub's network."),
    ("unprobed", "Not probed yet",
     "Postcode and house number councils that have not been probed. Run the batch probe."),
    ("upstream_failed", "Failed upstream's own test",
     "The module did not pass upstream's test in our run: broken upstream, or blocked from GitHub's network."),
    ("uprn", "Needs a UPRN",
     "A free address-to-UPRN lookup (FRE-294), then these can be probed."),
    ("other_input", "Takes another kind of input",
     "Public calendar link, street name, council-specific reference or URL. Each needs its own way of asking the resident."),
    ("no_module", "No upstream module",
     "Nobody has written a scraper for this council. Write one, or send it upstream."),
]


def load_reasons(report_path):
    """module -> reason, from the registry generator's 'Left out' list."""
    reasons = {}
    for line in Path(report_path).read_text(encoding="utf-8").splitlines():
        match = re.match(r"- (\w+): (.+)", line)
        if match and "already in the registry" not in match.group(2):
            reasons[match.group(1)] = match.group(2)
    return reasons


def classify(row, probe, reason):
    """(group key, why) for a council that is not in the registry."""
    if not row["has_upstream_module"] == "True":
        return "no_module", "no upstream module"
    cls = row["input_class"]
    if row["needs_uprn"] == "True":
        return "uprn", f"needs a UPRN (input: {cls})"
    if cls != "postcode+house_number":
        return "other_input", f"takes {cls}"
    if probe is None:
        if row["upstream_test"] == "failed":
            return "upstream_failed", "failed upstream's own test"
        return "unprobed", "not probed yet"
    if reason is None:
        return "probe_failed", "probed, but no registry entry was made (no reason recorded)"
    if reason.startswith("probe failed"):
        return "probe_failed", reason
    if "incomplete" in reason:
        return "incomplete", reason
    if "unrecognised bin name" in reason:
        name = re.search(r"'(.+)'", reason).group(1)
        kind = "combined" if re.search(r"\band\b|&|\+|/|,", name.lower()) else "colour"
        return kind, f"unrecognised bin name {name!r}"
    return "probe_failed", reason


def build(census_rows, probes, registered, reasons):
    out = []
    for row in census_rows:
        if row["ons_code"] in registered:
            continue
        probe = probes.get(row["module"]) or probes.get(row["ons_code"])
        key, why = classify(row, probe, reasons.get(row["module"]))
        bins = ", ".join(probe["bins"]) if probe and probe.get("bins") else ""
        out.append({"group": key, "ons_code": row["ons_code"], "name": row["name"], "module": row["module"], "why": why, "bins": bins})
    return out


def markdown(items, total, registered):
    lines = [
        "# Exceptions: councils not on the site yet",
        "",
        f"{len(items)} of {total} councils are not covered; {registered} are. Each is here with why and what it would take.",
        "Rebuilt from the census, the batch probe and the registry by `scripts/exceptions.py`; the same data is in `exceptions.csv`.",
        "",
        "| Group | Councils |",
        "|---|---|",
    ]
    counts = {key: sum(1 for i in items if i["group"] == key) for key, _, _ in GROUPS}
    lines += [f"| {heading} | {counts[key]} |" for key, heading, _ in GROUPS]
    for key, heading, need in GROUPS:
        group = sorted((i for i in items if i["group"] == key), key=lambda i: i["name"])
        if not group:
            continue
        lines += ["", f"## {heading} ({len(group)})", "", f"**What it takes:** {need}", ""]
        if key == "uprn":
            lines.append(", ".join(i["name"] for i in group))
            continue
        lines += ["| Council | ONS | Why | Bins the council returns |", "|---|---|---|---|"]
        lines += [f"| {i['name']} | {i['ons_code']} | {i['why']} | {i['bins']} |" for i in group]
    return "\n".join(lines) + "\n"


def main(census_path, probe_path, registry_path, report_path, out_dir):
    census = list(csv.DictReader(open(census_path, encoding="utf-8")))
    probes = {r["module"]: r for r in json.load(open(probe_path))["results"]}
    registered = {c["ons_code"] for c in json.load(open(registry_path))["councils"]}
    items = build(census, probes, registered, load_reasons(report_path))
    folder = Path(out_dir)
    (folder / "exceptions.md").write_text(markdown(items, len(census), len(registered)), encoding="utf-8")
    with open(folder / "exceptions.csv", "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["group", "ons_code", "name", "module", "why", "bins"])
        writer.writeheader()
        writer.writerows(sorted(items, key=lambda i: (i["group"], i["name"])))
    print(f"{len(items)} councils not covered; {len(registered)} covered")


if __name__ == "__main__":
    main(*sys.argv[1:6])
