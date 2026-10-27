"""FRE-264 spike: does InstaMaps turn "house number, postcode" into the right UPRN?

Uses the real addresses in UKBinCollectionData's test inputs that have a postcode, a house number and a known UPRN.
Usage: spike_instamaps.py <upstream tests/input.json> <output dir>   (key in INSTAMAPS_API_KEY)
Logs are public, so this prints only the council module name and the outcome, never a postcode, house number or UPRN.
"""
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ENDPOINT = "https://get-instamaps.com/v1/geocode_batch"


def build_records(entries):
    records = []
    for name, entry in sorted(entries.items()):
        if entry.get("uprn") and entry.get("postcode") and entry.get("house_number"):
            records.append({"id": name, "address": f"{entry['house_number']}, {entry['postcode']}", "uprn": str(entry["uprn"])})
    return records


def call(records, key):
    body = json.dumps({"records": [{"id": r["id"], "address": r["address"]} for r in records]}).encode()
    request = urllib.request.Request(
        ENDPOINT, data=body, method="POST",
        headers={"Content-Type": "application/json", "X-API-Key": key, "User-Agent": "bin-day-spike"},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.load(response)


def main(input_path, out_dir):
    key = os.environ.get("INSTAMAPS_API_KEY", "")
    if not key:
        sys.exit("INSTAMAPS_API_KEY is not set")
    records = build_records(json.load(open(input_path)))
    print("addresses with a known UPRN:", len(records))
    try:
        answer = call(records, key)
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code} from the API")
    wanted = {r["id"]: r["uprn"] for r in records}
    rows = []
    for rec in answer.get("records", []):
        uprn = rec.get("uprn") or {}
        got = (uprn.get("value") or "")
        rows.append({
            "council": rec.get("id"),
            "status": rec.get("status"),
            "confidence": (rec.get("confidence") or {}).get("level"),
            "uprn_basis": uprn.get("basis"),
            "distance_m": uprn.get("distance_m"),
            "has_uprn": bool(got),
            "match": got == wanted.get(rec.get("id")),
        })
    matched = sum(r["match"] for r in rows)
    with_uprn = sum(r["has_uprn"] for r in rows)
    print(f"rows back: {len(rows)} | with a UPRN: {with_uprn} | exact UPRN match: {matched}")
    for r in rows:
        print(f"{r['council']}: {r['status']}, confidence {r['confidence']}, uprn {r['uprn_basis']} {r['distance_m']}m, match={r['match']}")
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    (Path(out_dir) / "instamaps.json").write_text(json.dumps(rows, indent=1))


if __name__ == "__main__":
    main(*sys.argv[1:3])
