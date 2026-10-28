"""FRE-264 spike: does InstaMaps turn an address into the right UPRN?

Uses the real addresses in UKBinCollectionData's test inputs that have a postcode, a house number and a known UPRN.
Pass 1 sends "house number, postcode". Pass 2 adds the street that InstaMaps itself found in pass 1, to see whether a
street name is what was missing.
Usage: spike_instamaps.py <upstream tests/input.json> <output dir>   (key in INSTAMAPS_API_KEY)
Logs are public, so this prints only council module names and counts, never a postcode, street, house number or UPRN.
"""
import json
import os
import sys
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path

ENDPOINT = "https://get-instamaps.com/v1/geocode_batch"


def build_records(entries):
    records = []
    for name, entry in sorted(entries.items()):
        if entry.get("uprn") and entry.get("postcode") and entry.get("house_number"):
            records.append(
                {"id": name, "house": str(entry["house_number"]), "postcode": entry["postcode"], "uprn": str(entry["uprn"])}
            )
    return records


def call(rows, key):
    body = json.dumps({"records": rows}).encode()
    request = urllib.request.Request(
        ENDPOINT, data=body, method="POST",
        headers={"Content-Type": "application/json", "X-API-Key": key, "User-Agent": "bin-day-spike"},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.load(response)


def summarise(label, answer, wanted):
    rows = []
    for rec in answer.get("records", []):
        uprn = rec.get("uprn") or {}
        got = uprn.get("value") or ""
        rows.append({
            "council": rec.get("id"),
            "quality": (rec.get("address_quality") or {}).get("value"),
            "precision": (rec.get("location") or {}).get("precision"),
            "confidence": (rec.get("confidence") or {}).get("level"),
            "basis": uprn.get("basis"),
            "distance_m": uprn.get("distance_m"),
            "has_uprn": bool(got),
            "match": got == wanted.get(rec.get("id")),
            "street": ((rec.get("admin") or {}).get("value") or {}).get("street"),
        })
    print(f"== {label}: {len(rows)} rows | with a UPRN: {sum(r['has_uprn'] for r in rows)} | exact match: {sum(r['match'] for r in rows)}")
    print("   address quality:", dict(Counter(r["quality"] for r in rows)))
    print("   location precision:", dict(Counter(r["precision"] for r in rows)))
    print("   confidence:", dict(Counter(r["confidence"] for r in rows)))
    print("   UPRN basis:", dict(Counter(r["basis"] for r in rows)))
    wrong = [r for r in rows if r["has_uprn"] and not r["match"]]
    if wrong:
        print("   wrong UPRNs, distance in metres:", sorted(r["distance_m"] for r in wrong if r["distance_m"] is not None))
    print("   matched:", [r["council"] for r in rows if r["match"]])
    return rows


def main(input_path, out_dir):
    key = os.environ.get("INSTAMAPS_API_KEY", "")
    if not key:
        sys.exit("INSTAMAPS_API_KEY is not set")
    records = build_records(json.load(open(input_path)))
    wanted = {r["id"]: r["uprn"] for r in records}
    print("addresses with a known UPRN:", len(records))
    try:
        first = call([{"id": r["id"], "address": f"{r['house']}, {r['postcode']}"} for r in records], key)
        pass1 = summarise("pass 1: house number, postcode", first, wanted)
        streets = {r["council"]: r["street"] for r in pass1 if r["street"]}
        print("   rows where InstaMaps named a street:", len(streets))
        by_id = {r["id"]: r for r in records}
        second_rows = [
            {"id": cid, "address": f"{by_id[cid]['house']} {street}, {by_id[cid]['postcode']}"} for cid, street in streets.items()
        ]
        second = call(second_rows, key)
        pass2 = summarise("pass 2: house number, street, postcode", second, wanted)
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code} from the API")
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    (Path(out_dir) / "instamaps.json").write_text(json.dumps({"pass1": pass1, "pass2": pass2}, indent=1))


if __name__ == "__main__":
    main(*sys.argv[1:3])
