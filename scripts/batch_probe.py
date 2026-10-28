"""Probe every UKBinCollectionData council that takes a postcode and a house number, once each, politely.

For each council it runs the module with upstream's test address, then again with only the leading house number, and
records: whether it worked, the bin names, whether it returns one date per bin or a schedule, and whether the bare
number finds the same house as the full text. It also notes whether the module's source mentions a browser.

Usage: batch_probe.py <upstream input.json> <full-suite.json> <output json> [pause seconds]
Logs and output are public, so they hold council module names, bin names and counts, never an address.
"""
import importlib
import json
import re
import sys
import time
from datetime import datetime

from uk_bin_collection.uk_bin_collection.collect_data import UKBinCollectionApp


def passed_modules(suite_path):
    suite = json.load(open(suite_path))
    return {re.search(r"\[(.+)\]", c["test"]).group(1) for c in suite["cases"] if c["status"] == "passed"}


def candidates(inputs, passed):
    for name, entry in sorted(inputs.items()):
        if entry.get("uprn") or not (entry.get("postcode") and entry.get("house_number")):
            continue
        if entry.get("web_driver") or name not in passed:
            continue
        yield name, entry


def run_module(name, entry, house_number):
    args = [name, entry["url"], f"-p={entry['postcode']}", f"-n={house_number}"]
    if entry.get("skip_get_url") is True:
        args.append("-s")
    app = UKBinCollectionApp()
    app.set_args(args)
    data = json.loads(app.run())
    found = {}
    for item in data.get("bins", []):
        found.setdefault(item["type"], []).append(datetime.strptime(item["collectionDate"], "%d/%m/%Y").date())
    return found


def uses_browser(name):
    module = importlib.import_module(f"uk_bin_collection.uk_bin_collection.councils.{name}")
    text = open(module.__file__, encoding="utf-8").read().lower()
    return "selenium" in text or "webdriver" in text


def describe(found):
    most = max((len(v) for v in found.values()), default=0)
    span = max((max(v) - min(v)).days for v in found.values()) if found else 0
    return {
        "bins": sorted(found),
        "most_dates_for_one_bin": most,
        "span_days": span,
        "schedule": "full" if most >= 3 and span >= 21 else "next_only" if found else "none",
        "gaps_days": sorted({(b - a).days for v in found.values() for a, b in zip(sorted(v), sorted(v)[1:])}),
    }


def leading_number(house_number):
    match = re.match(r"^\s*(\d+[A-Za-z]?)\b", house_number)
    return match.group(1) if match else None


def main(input_path, suite_path, out_path, pause="10"):
    inputs = json.load(open(input_path))
    results = []
    for name, entry in candidates(inputs, passed_modules(suite_path)):
        row = {"module": name, "ons_code": entry.get("LAD24CD"), "browser_in_source": uses_browser(name)}
        try:
            full = run_module(name, entry, str(entry["house_number"]))
            row.update(describe(full))
            row["ok"] = bool(full)
        except Exception as err:  # upstream modules raise anything
            row.update({"ok": False, "error": type(err).__name__})
            full = None
        number = leading_number(str(entry["house_number"]))
        if full and number and number != str(entry["house_number"]).strip():
            time.sleep(float(pause))
            try:
                bare = run_module(name, entry, number)
                row["bare_number"] = "same_house" if bare == full else "different_house" if bare else "no_result"
            except Exception as err:
                row["bare_number"] = f"error_{type(err).__name__}"
        elif full:
            row["bare_number"] = "not_applicable"
        results.append(row)
        print(name, {k: row.get(k) for k in ("ok", "schedule", "bare_number", "browser_in_source", "error")})
        time.sleep(float(pause))
    json.dump({"results": results}, open(out_path, "w"), indent=1)
    print("councils probed:", len(results), "| worked:", sum(r["ok"] for r in results))


if __name__ == "__main__":
    main(*sys.argv[1:5])
