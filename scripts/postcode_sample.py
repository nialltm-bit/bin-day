"""Draw the random postcodes for the agreement check from the ONS UPRN Directory (FRE-298, phase 0, step 2).

For each council in the config it takes the postcodes that have at least two UPRNs in that council (a postcode with one
UPRN has nothing to agree about), draws a random sample in a random order, and keeps up to 40 random UPRNs for each. It
also records what share of the council's postcodes have just one UPRN, so those are not forgotten.

Usage: postcode_sample.py <councils json> <output json> [--seed N] [--per-council N] [--zip path]
The output file holds postcodes and UPRNs. They are random ONSUD rows, not residents, but they are kept out of the logs: the
workflow uploads the file as a short-lived artifact and prints only counts.
"""
import argparse
import json
import os
import random
import sys
import tempfile
from collections import defaultdict

from scripts import onsud

CAP = 40  # the most UPRNs checked on one postcode
DEFAULT_SAMPLE = 150  # drawn per council; the check stops once it has enough usable ones


def draw(by_postcode: dict[str, list[int]], rng: random.Random, how_many: int) -> dict:
    """Random postcodes with at least two UPRNs, each with at most CAP of its UPRNs, in the order they will be checked."""
    frame = sorted(pc for pc, uprns in by_postcode.items() if len(uprns) >= 2)
    chosen = rng.sample(frame, min(how_many, len(frame)))
    postcodes = []
    for pc in chosen:
        uprns = sorted(by_postcode[pc])
        postcodes.append({"postcode": pc, "total": len(uprns), "uprns": sorted(rng.sample(uprns, min(CAP, len(uprns))))})
    return {
        "postcodes_in_council": len(by_postcode),
        "postcodes_with_one_uprn": sum(len(u) == 1 for u in by_postcode.values()),
        "frame_postcodes": len(frame),
        "postcodes": postcodes,
    }


def collect(zip_path: str, wanted: set[str]) -> tuple[dict[str, dict[str, list[int]]], onsud.Totals]:
    totals = onsud.Totals()
    found: dict[str, dict[str, list[int]]] = defaultdict(lambda: defaultdict(list))  # council -> postcode -> UPRNs
    for postcode, council, uprn in onsud.rows(zip_path, totals):
        if council in wanted:
            found[council][postcode].append(uprn)
    return found, totals


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("councils")
    parser.add_argument("output")
    parser.add_argument("--seed", type=int, default=298)
    parser.add_argument("--per-council", type=int, default=DEFAULT_SAMPLE)
    parser.add_argument("--zip")
    args = parser.parse_args(argv)

    config = json.load(open(args.councils))["councils"]
    wanted = {code for council in config for code in council["ons_codes"]}
    release: dict = {}
    with tempfile.TemporaryDirectory() as folder:
        zip_path = args.zip
        if not zip_path:
            release = onsud.newest_release()
            print("using:", release["title"], "| modified", release.get("modified"))
            zip_path = os.path.join(folder, "onsud.zip")
            onsud.download(release["id"], zip_path)
        found, totals = collect(zip_path, wanted)
    print(f"read {totals.rows:,} rows from {totals.files_read} files")

    result = {"release": {k: release.get(k) for k in ("title", "id", "modified")}, "seed": args.seed, "councils": {}}
    for council in config:
        merged: dict[str, list[int]] = defaultdict(list)
        for code in council["ons_codes"]:
            for postcode, uprns in found.get(code, {}).items():
                merged[postcode].extend(uprns)
        if not merged:
            print(f"{council['module']}: no UPRNs found for its council code(s); the code may have changed")
        drawn = draw(merged, random.Random(f"{args.seed}-{council['module']}"), args.per_council)
        result["councils"][council["module"]] = drawn
        print(
            f"{council['module']}: {drawn['postcodes_in_council']:,} postcodes, {drawn['frame_postcodes']:,} with 2 or more UPRNs,"
            f" {len(drawn['postcodes'])} drawn"
        )
    with open(args.output, "w") as out:
        json.dump(result, out)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
