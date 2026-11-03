# ruff: noqa: E501
"""Put the per-council agreement results together (FRE-298, phase 0, step 2).

Usage: postcode_report.py <folder of per-council result json files> <output json>
Writes one JSON file with every council and prints a Markdown table. Counts, timings and outcodes only, so it is safe in a public log.
"""
import json
import sys
from pathlib import Path


def pc(share: float | None) -> str:
    return "n/a" if share is None else f"{share:.0%}"


def table(results: list[dict]) -> str:
    lines = [
        "| Council | Platform | Postcodes comparable | Agree | 95% range | Homes off majority | Lookups giving dates | Seconds per lookup (median / p95) | Stopped because |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for r in results:
        low, high = r["agreeing_share_95pc_range"] or (None, None)
        lines.append(
            f"| {r['name']}{' (control)' if r['control'] else ''} | {r['platform']} | {r['postcodes_comparable']} of {r['postcodes_checked']} checked"
            f" | {r['postcodes_agreeing']} ({pc(r['agreeing_share'])}) | {pc(low)} to {pc(high)}"
            f" | {r['homes_off_majority']} of {r['homes_compared']} ({pc(r['homes_off_majority_share'])})"
            f" | {pc(r['lookups_giving_dates_share'])} of {r['lookups']} | {r['seconds_per_lookup']['median']} / {r['seconds_per_lookup']['p95']}"
            f" | {r['stopped_because']} |"
        )
    return "\n".join(lines)


def main(folder: str, output: str) -> int:
    fresh = [json.load(open(p)) for p in sorted(Path(folder).glob("**/*.json"))]
    if not fresh:
        print("no results found")
        return 1
    # A run of only some councils replaces just those and keeps the others already in the file.
    kept = []
    if Path(output).exists():
        kept = [r for r in json.load(open(output))["councils"] if r["module"] not in {f["module"] for f in fresh}]
    results = kept + fresh
    results.sort(key=lambda r: (r["control"], r["name"]))
    with open(output, "w") as out:
        json.dump({"councils": results}, out, indent=1)
    print(table(results))
    for r in results:
        print(f"\n{r['name']}: lookup outcomes {r['lookup_outcomes']}; disagreeing postcodes by kind {r['disagreeing_postcodes_by_kind']};"
              f" by size {r['by_postcode_size']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:3]))
