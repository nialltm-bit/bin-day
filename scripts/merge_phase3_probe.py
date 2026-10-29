"""Adds the Phase 3 councils that can be registered as postcode + house number councils to the batch probe results.

scripts/generate_registry.py reads rows in the batch probe's format. Two Phase 3 groups fit: UPRN councils whose postcode and house
number returned the same schedule as the UPRN did (`uprn_alt`, `same_schedule`), and postcode + house number councils never probed
before that returned bins (`remaining`). A row already in the batch probe is left alone.

Phase 3 did not test a bare house number against the full text. Where the test house number is just a number or number with a letter
it is its own bare number, so the question does not arise; otherwise it is marked `untested`, and the generator treats that as
needing the first line of the address, which is the safe way round (a person types more, never less, than the council needs).

Usage: merge_phase3_probe.py <phase3-probe.json> <batch-probe.json> <upstream input.json>
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import batch_probe  # noqa: E402

KEEP = ("module", "ons_code", "browser_in_source", "bins", "most_dates_for_one_bin", "span_days", "schedule", "gaps_days", "ok")


def eligible(row: dict) -> bool:
    if row["group"] == "uprn_alt":
        return bool(row.get("ok")) and row.get("without_uprn") == "same_schedule"
    return row["group"] == "remaining" and bool(row.get("ok"))


def batch_row(row: dict, house_number: str) -> dict:
    out = {key: row[key] for key in KEEP if key in row}
    number = batch_probe.leading_number(house_number)
    out["bare_number"] = "not_applicable" if number == house_number.strip() else "untested"
    out["source"] = f"phase3 {row['group']}"
    return out


def main(phase3_path, batch_path, input_path):
    upstream = json.load(open(input_path))
    batch = json.load(open(batch_path))
    have = {r["module"] for r in batch["results"]}
    added = []
    for row in json.load(open(phase3_path))["results"]:
        if eligible(row) and row["module"] not in have:
            batch["results"].append(batch_row(row, str(upstream[row["module"]]["house_number"])))
            added.append(row["module"])
    json.dump(batch, open(batch_path, "w"), indent=1)
    print(f"added {len(added)} rows to the batch probe:", ", ".join(added))


if __name__ == "__main__":
    main(*sys.argv[1:4])
