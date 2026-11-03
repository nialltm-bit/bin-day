# ruff: noqa: E501
"""Download the newest ONS UPRN Directory and report what the postcode guess would have to work with (FRE-298, phase 0, step 1).

It confirms the release has a UPRN, postcode and council column, then reports how many UPRNs sit on a postcode (median, 95th
percentile, maximum), how many postcodes straddle two councils, and how big a file per outcode (the first half of a postcode,
"BA3") would be if each held its postcodes' UPRNs as JSON, plain and gzipped. The raw data is read as a stream and thrown away.

Usage: onsud_stats.py <output json> [--zip path to an already downloaded release]
The output is public: counts, sizes, council codes and outcode names, never a UPRN or a full postcode.
"""
import argparse
import json
import math
import os
import sys
import tempfile
import zlib
from array import array
from collections import defaultdict

from scripts import onsud

CAP = 40  # the most UPRNs the check would run for one postcode


def percentile(sorted_values: list[int | float], fraction: float) -> int | float:
    """Nearest-rank percentile of an already sorted list."""
    if not sorted_values:
        return 0
    rank = max(1, math.ceil(fraction * len(sorted_values)))
    return sorted_values[min(rank, len(sorted_values)) - 1]


def spread(values: list[int | float]) -> dict:
    ordered = sorted(values)
    return {
        "median": percentile(ordered, 0.5),
        "p95": percentile(ordered, 0.95),
        "max": ordered[-1] if ordered else 0,
        "mean": round(sum(ordered) / len(ordered), 1) if ordered else 0,
    }


def outcode_file(postcodes: dict[str, dict[str, array]]) -> bytes:
    """The file for one outcode: {"AB1 2CD": {"E0600000X": [uprn, ...]}}, postcodes in order, UPRNs in order, no spaces."""
    body = {pc: {council: sorted(uprns) for council, uprns in sorted(by_council.items())} for pc, by_council in sorted(postcodes.items())}
    return json.dumps(body, separators=(",", ":")).encode()


def build_stats(zip_path: str) -> dict:
    totals = onsud.Totals()
    by_postcode: dict[str, dict[str, array]] = defaultdict(dict)  # postcode -> council -> UPRNs
    for postcode, council, uprn in onsud.rows(zip_path, totals):
        by_council = by_postcode[postcode]
        if council not in by_council:
            by_council[council] = array("Q")
        by_council[council].append(uprn)
    if not by_postcode:
        raise onsud.OnsudError("no rows with a UPRN, postcode and council were found")

    per_postcode = [sum(len(u) for u in by_council.values()) for by_council in by_postcode.values()]
    uprn_total = sum(per_postcode)
    straddling = sum(len(by_council) > 1 for by_council in by_postcode.values())

    councils: dict[str, dict] = defaultdict(lambda: {"uprns": 0, "postcodes": 0, "single_uprn_postcodes": 0, "over_cap_postcodes": 0})
    for by_council in by_postcode.values():
        for council, uprns in by_council.items():
            entry = councils[council]
            entry["uprns"] += len(uprns)
            entry["postcodes"] += 1
            entry["single_uprn_postcodes"] += len(uprns) == 1
            entry["over_cap_postcodes"] += len(uprns) > CAP

    by_outcode: dict[str, dict[str, dict[str, array]]] = defaultdict(dict)
    for postcode, by_council in by_postcode.items():
        by_outcode[onsud.outcode(postcode)][postcode] = by_council
    plain, gzipped, uprns_in_outcode, postcodes_in_outcode = {}, {}, {}, {}
    for code, postcodes in by_outcode.items():
        body = outcode_file(postcodes)
        plain[code] = len(body)
        gzipped[code] = len(zlib.compress(body, 6)) + 18  # a gzip file is a deflate stream with an 18 byte wrapper
        uprns_in_outcode[code] = sum(len(u) for by_council in postcodes.values() for u in by_council.values())
        postcodes_in_outcode[code] = len(postcodes)
    largest = sorted(plain, key=plain.get, reverse=True)[:5]

    return {
        "rows_read": totals.rows,
        "csv_files_read": totals.files_read,
        "csv_files_skipped_no_uprn_or_postcode_column": totals.files_skipped,
        "columns_used": {"uprn": "uprn", "postcode": totals.columns.postcode_name, "council": totals.columns.council_name},
        "rows_without_a_full_postcode": totals.without_postcode,
        "rows_without_a_council": totals.without_council,
        "uprns": uprn_total,
        "postcodes": len(by_postcode),
        "councils": len(councils),
        "uprns_per_postcode": {
            **spread(per_postcode),
            "p99": percentile(sorted(per_postcode), 0.99),
            "single_uprn_share": round(sum(n == 1 for n in per_postcode) / len(per_postcode), 4),
            f"over_{CAP}_share_of_postcodes": round(sum(n > CAP for n in per_postcode) / len(per_postcode), 4),
            f"over_{CAP}_share_of_uprns": round(sum(n for n in per_postcode if n > CAP) / uprn_total, 4),
        },
        "postcodes_spanning_two_or_more_councils": straddling,
        "outcode_files": {
            "layout": 'one JSON object per outcode: {"AB1 2CD":{"E0600000X":[uprn,uprn]}}, UPRNs sorted, no spaces',
            "outcodes": len(by_outcode),
            "postcodes_per_outcode": spread(list(postcodes_in_outcode.values())),
            "uprns_per_outcode": spread(list(uprns_in_outcode.values())),
            "json_bytes": {**spread(list(plain.values())), "total": sum(plain.values())},
            "gzip_bytes": {**spread(list(gzipped.values())), "total": sum(gzipped.values())},
            "largest_outcodes": [{"outcode": c, "json_bytes": plain[c], "gzip_bytes": gzipped[c], "uprns": uprns_in_outcode[c]} for c in largest],
        },
        "per_council": {code: councils[code] for code in sorted(councils)},
    }


def markdown(release: dict, stats: dict) -> str:
    u, o = stats["uprns_per_postcode"], stats["outcode_files"]
    mb = lambda n: f"{n / 1e6:,.2f} MB"  # noqa: E731
    return "\n".join(
        [
            f"## ONSUD: {release.get('title', 'release')}",
            "",
            f"- Columns used: UPRN `{stats['columns_used']['uprn']}`, postcode `{stats['columns_used']['postcode']}`, council `{stats['columns_used']['council']}`",
            f"- {stats['uprns']:,} UPRNs on {stats['postcodes']:,} postcodes in {stats['councils']} councils ({stats['csv_files_read']} CSV files)",
            f"- Rows with no full postcode: {stats['rows_without_a_full_postcode']:,}; with no council: {stats['rows_without_a_council']:,}",
            f"- UPRNs per postcode: median {u['median']}, 95th percentile {u['p95']}, 99th {u['p99']}, max {u['max']}, mean {u['mean']}",
            f"- Postcodes with one UPRN: {u['single_uprn_share']:.1%}. Postcodes over the cap of {CAP}: {u[f'over_{CAP}_share_of_postcodes']:.1%}"
            f" (holding {u[f'over_{CAP}_share_of_uprns']:.1%} of UPRNs)",
            f"- Postcodes whose UPRNs fall in more than one council: {stats['postcodes_spanning_two_or_more_councils']:,}",
            f"- {o['outcodes']:,} outcode files. JSON size: median {mb(o['json_bytes']['median'])}, 95th percentile {mb(o['json_bytes']['p95'])},"
            f" max {mb(o['json_bytes']['max'])}, all together {mb(o['json_bytes']['total'])}",
            f"- Gzipped: median {mb(o['gzip_bytes']['median'])}, 95th percentile {mb(o['gzip_bytes']['p95'])},"
            f" max {mb(o['gzip_bytes']['max'])}, all together {mb(o['gzip_bytes']['total'])}",
            "",
        ]
    )


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("output")
    parser.add_argument("--zip", help="an already downloaded release, instead of downloading")
    args = parser.parse_args(argv)

    release: dict = {}
    with tempfile.TemporaryDirectory() as folder:
        zip_path = args.zip
        if not zip_path:
            release = onsud.newest_release()
            print("using:", release["title"], "| modified", release.get("modified"))
            zip_path = os.path.join(folder, "onsud.zip")
            onsud.download(release["id"], zip_path)
        stats = build_stats(zip_path)
    stats["release"] = {k: release.get(k) for k in ("title", "id", "type", "modified", "size")}
    with open(args.output, "w") as out:
        json.dump(stats, out, indent=1)
    print(markdown(release, stats))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
