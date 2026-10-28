"""Run one UKBinCollectionData module once for its test address and describe what it returns.

Usage: probe_council.py <upstream tests/input.json> <module name>
Prints the bin names (public council data), counts and date span. Never prints the address.
"""
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime

from uk_bin_collection.uk_bin_collection.collect_data import UKBinCollectionApp


def main(input_path, module):
    entry = json.load(open(input_path))[module]
    args = [module, entry["url"]]
    for key, flag in (("uprn", "-u"), ("postcode", "-p"), ("house_number", "-n")):
        if entry.get(key):
            args.append(f"{flag}={entry[key]}")
    if entry.get("skip_get_url") is True:
        args.append("-s")
    print("inputs used:", [k for k in ("uprn", "postcode", "house_number") if entry.get(k)], "| web_driver listed:", bool(entry.get("web_driver")))
    app = UKBinCollectionApp()
    app.set_args(args)
    data = json.loads(app.run())
    bins = data.get("bins", [])
    print("entries:", len(bins))
    dates = defaultdict(list)
    for item in bins:
        dates[item["type"]].append(datetime.strptime(item["collectionDate"], "%d/%m/%Y").date())
    for name, found in sorted(dates.items()):
        found.sort()
        gaps = Counter((b - a).days for a, b in zip(found, found[1:]))
        print(f"- {name!r}: {len(found)} dates, {found[0]} to {found[-1]}, gaps in days {dict(gaps)}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
