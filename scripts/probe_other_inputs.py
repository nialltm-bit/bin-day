"""Probes every UKBinCollectionData council that scripts/batch_probe.py leaves out, once each, politely (Phase 3).

Groups, picked from upstream's test inputs and the module's own source:
- uprn_alt: takes a UPRN in upstream's test, but its source also reads a postcode and a house number, and the test gives all
  three. Run once with every input upstream's test gives (the known-good answer) and once with the postcode and house number
  only, and compare: does the council return the same schedule without a UPRN?
- single: takes a postcode only, or a house number (usually a street name) only.
- other_id: takes a council-specific reference stored under `uprn` (a street code, a property ID, a USRN), run as upstream's test does.
- url: the identifier is inside the URL, run with upstream's test URL.
- remaining: postcode and house number, never probed before, so including the councils that failed upstream's own test.
A council that answered upstream's test with a 403 or a captcha is not tried again, and a captcha is never worked around.
The Google public calendar group needs a calendar URL per council and is parked. Councils already in the output are skipped.

Usage: probe_other_inputs.py <upstream input.json> <full-suite.json> <batch-probe.json> <output json> [pause seconds] [selenium url]
Logs and output are public, so they hold council module names, bin names and counts, never an address.
"""
import importlib
import importlib.util
import json
import os
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import batch_probe as bp  # noqa: E402

BLOCKED = re.compile(r"403|captcha|forbidden", re.I)
OTHER_ID = {"CastlepointDistrictCouncil", "TamworthBoroughCouncil", "WestminsterCityCouncil", "NewarkAndSherwoodDC"}
PARKED = "icalevents"  # the Google public calendar family: a calendar URL per council


def module_text(name: str) -> str:
    package = Path(list(importlib.util.find_spec("uk_bin_collection").submodule_search_locations)[0])
    return (package / "uk_bin_collection" / "councils" / f"{name}.py").read_text(encoding="utf-8").lower()


def reads(text: str, key: str) -> bool:
    return bool(re.search(r"kwargs(?:\.get\(\s*|\[\s*)[\"']" + key + r"[\"']", text))


def suite_messages(suite_path) -> dict[str, dict]:
    suite = json.load(open(suite_path))
    return {re.search(r"\[(.+)\]", c["test"]).group(1): c for c in suite["cases"]}


def picks(inputs, suite, done_batch, text_of=module_text):
    """(group, module, entry) for every council to probe, in a fixed order."""
    for name, entry in sorted(inputs.items()):
        case = suite.get(name, {})
        if case.get("status") == "failed" and BLOCKED.search(case.get("message", "")):
            continue
        have = {k for k in ("uprn", "postcode", "house_number") if entry.get(k)}
        if "supported_councils" in entry:
            continue
        text = text_of(name)
        if PARKED in text:
            continue
        if name in OTHER_ID:
            yield "other_id", name, entry
        elif "uprn" in have:
            if have == {"uprn", "postcode", "house_number"} and reads(text, "postcode") and (reads(text, "paon") or reads(text, "number")):
                yield "uprn_alt", name, entry
        elif have in ({"postcode"}, {"house_number"}):
            yield "single", name, entry
        elif have == {"postcode", "house_number"}:
            if name not in done_batch:
                yield "remaining", name, entry
        elif not have and entry.get("url") and name != "EnvironmentFirst":
            if not re.search(r"uprn", (entry.get("wiki_note") or "").lower()):  # a UPRN in the URL is a UPRN council
                yield "url", name, entry


def run_with(name, entry, use, selenium_url=None):
    """Runs the module with only the inputs in `use` (any of uprn, postcode, house_number)."""
    from uk_bin_collection.uk_bin_collection.collect_data import UKBinCollectionApp

    flags = {"uprn": "-u", "postcode": "-p", "house_number": "-n"}
    args = [name, entry["url"]] + [f"{flags[k]}={entry[k]}" for k in use]
    if entry.get("web_driver") and selenium_url:
        args.append(f"-w={selenium_url}")
    if entry.get("skip_get_url") is True:
        args.append("-s")
    app = UKBinCollectionApp()
    app.set_args(args)
    bp.signal.signal(bp.signal.SIGALRM, bp._on_alarm)
    bp.signal.alarm(bp.TIMEOUT_SECONDS)
    try:
        data = json.loads(app.run())
    finally:
        bp.signal.alarm(0)
    found = {}
    for item in data.get("bins", []):
        found.setdefault(item["type"], []).append(bp.datetime.strptime(item["collectionDate"], "%d/%m/%Y").date())
    return found


def compare(reference, other) -> str:
    if not other:
        return "no_result"
    if reference == other:
        return "same_schedule"
    if sorted(reference) == sorted(other):
        return "same_bins_different_dates"
    return "different_bins"


def probe_one(group, name, entry, selenium_url):
    row = {"group": group, "module": name, "ons_code": entry.get("LAD24CD"), "browser_in_source": bp.uses_browser(name)}
    use = [k for k in ("uprn", "postcode", "house_number") if entry.get(k)]
    try:
        if group == "uprn_alt":
            reference = run_with(name, entry, use, selenium_url)  # every input, as upstream's own test does
            row.update(bp.describe(reference))
            row["ok"] = bool(reference)
            time.sleep(PAUSE)
            try:
                row["without_uprn"] = compare(reference, run_with(name, entry, ["postcode", "house_number"], selenium_url))
            except Exception as err:  # upstream modules raise anything
                row["without_uprn"] = f"error_{type(err).__name__}"
        else:
            found = run_with(name, entry, use, selenium_url)
            row.update(bp.describe(found))
            row["ok"] = bool(found)
    except Exception as err:
        row.update({"ok": False, "error": type(err).__name__})
    return row


PAUSE = 10.0


def main(input_path, suite_path, batch_path, out_path, pause="10", selenium_url=None):
    global PAUSE
    PAUSE = float(pause)
    inputs = json.load(open(input_path))
    done_batch = {r["module"] for r in json.load(open(batch_path))["results"]}
    previous = json.load(open(out_path))["results"] if os.path.exists(out_path) and os.environ.get("PROBE_ALL") != "1" else []
    done = {r["module"] for r in previous}
    results = list(previous)
    todo = [p for p in picks(inputs, suite_messages(suite_path), done_batch) if p[1] not in done]
    print(f"already probed: {len(done)} | to probe now: {len(todo)}")
    for group, name, entry in todo:
        row = probe_one(group, name, entry, selenium_url)
        results.append(row)
        print(group, name, {k: row.get(k) for k in ("ok", "schedule", "without_uprn", "browser_in_source", "error")})
        json.dump({"results": results}, open(out_path, "w"), indent=1)
        time.sleep(PAUSE)
    json.dump({"results": results}, open(out_path, "w"), indent=1)
    print("probed in total:", len(results), "| worked:", sum(r["ok"] for r in results))


if __name__ == "__main__":
    main(*sys.argv[1:7])
