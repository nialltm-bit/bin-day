"""Spike (FRE-294): could a typed postcode and house number be turned into a UPRN from free open data?

The idea: OS Open UPRN (open, national) gives every UPRN a point. OpenStreetMap has address points and buildings tagged
with a house number and often a postcode. For a resident's postcode and house number we would find the OpenStreetMap
object with that number, then the UPRN nearest it. This does not try that for a resident; it measures how often it would
work, using upstream's public test UPRNs (each is a home we know the UPRN of):

  covered     an OpenStreetMap object with a house number lies within 15 m of the home's UPRN point
  postcode    ...and it carries a postcode that matches the one upstream tests with (when upstream gives one)
  roundtrip   ...and the UPRN nearest that object's centre is the home's own UPRN (so postcode and number would lead back to it)

Only counts and council module names are printed or saved, never a UPRN, postcode or coordinates: logs are public.

Usage: spike_osm_uprn.py <upstream input.json> <OS Open UPRN csv> <output json> [pause seconds]
"""
import csv
import json
import math
import sys
import time
import urllib.parse
import urllib.request

OVERPASS = "https://overpass-api.de/api/interpreter"
NEAR_METRES = 15
BOX_DEGREES = 0.004  # about 440 m north-south, enough to hold every UPRN near a test home


def metres(lat1, lon1, lat2, lon2):
    """Distance in metres between two points that are close together."""
    dy = (lat2 - lat1) * 111_320
    dx = (lon2 - lon1) * 111_320 * math.cos(math.radians((lat1 + lat2) / 2))
    return math.hypot(dx, dy)


def compact(postcode):
    return "".join(ch for ch in str(postcode or "").upper() if ch.isalnum())


def nearest(uprns, lat, lon):
    """The UPRN among {uprn: (lat, lon)} nearest a point, or None."""
    best, best_d = None, None
    for uprn, (la, lo) in uprns.items():
        d = metres(lat, lon, la, lo)
        if best_d is None or d < best_d:
            best, best_d = uprn, d
    return best


def judge(home_uprn, home_point, neighbours, objects, wanted_postcode):
    """The three measures for one home. objects: [{lat, lon, postcode}] with a house number, from OpenStreetMap."""
    lat, lon = home_point
    near = [o for o in objects if metres(lat, lon, o["lat"], o["lon"]) <= NEAR_METRES]
    if not near:
        return {"covered": False, "postcode": False, "roundtrip": False}
    near.sort(key=lambda o: metres(lat, lon, o["lat"], o["lon"]))
    chosen = near[0]
    postcode_ok = bool(wanted_postcode) and compact(chosen.get("postcode")) == compact(wanted_postcode)
    back = nearest(neighbours, chosen["lat"], chosen["lon"])
    return {"covered": True, "postcode": postcode_ok, "roundtrip": back == home_uprn}


def test_homes(inputs):
    """{module: (uprn, postcode)} for upstream's test entries that carry a numeric UPRN."""
    homes = {}
    for module, entry in inputs.items():
        uprn = str(entry.get("uprn") or "").strip()
        if uprn.isdigit() and len(uprn) >= 6:
            homes[module] = (uprn, entry.get("postcode"))
    return homes


def read_points(csv_path, wanted):
    """Points for the wanted UPRNs, then every UPRN within a box around each of them. Streams the file twice."""
    points = {}
    with open(csv_path, newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            if row["UPRN"] in wanted:
                points[row["UPRN"]] = (float(row["LATITUDE"]), float(row["LONGITUDE"]))
                if len(points) == len(wanted):
                    break
    boxes = list(points.values())
    around = {}
    with open(csv_path, newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            lat, lon = float(row["LATITUDE"]), float(row["LONGITUDE"])
            if any(abs(lat - la) <= BOX_DEGREES and abs(lon - lo) <= BOX_DEGREES for la, lo in boxes):
                around[row["UPRN"]] = (lat, lon)
    return points, around


def osm_objects(lat, lon):
    """OpenStreetMap objects with a house number within 30 m of a point."""
    query = f'[out:json][timeout:30];nwr(around:30,{lat},{lon})["addr:housenumber"];out tags center;'
    body = urllib.parse.urlencode({"data": query}).encode()
    request = urllib.request.Request(OVERPASS, data=body, headers={"User-Agent": "bin-day-spike/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        elements = json.load(response)["elements"]
    out = []
    for e in elements:
        centre = e if e["type"] == "node" else e.get("center")
        if centre:
            out.append({"lat": centre["lat"], "lon": centre["lon"], "postcode": e.get("tags", {}).get("addr:postcode")})
    return out


def main(input_path, csv_path, out_path, pause="2"):
    homes = test_homes(json.load(open(input_path)))
    wanted = {uprn for uprn, _ in homes.values()}
    points, around = read_points(csv_path, wanted)
    print(f"test homes: {len(homes)} | found in OS Open UPRN: {sum(1 for u, _ in homes.values() if u in points)}")
    rows = []
    for module, (uprn, postcode) in sorted(homes.items()):
        if uprn not in points:
            rows.append({"module": module, "in_open_uprn": False})
            continue
        lat, lon = points[uprn]
        try:
            objects = osm_objects(lat, lon)
        except Exception as err:  # the public service can be busy
            rows.append({"module": module, "in_open_uprn": True, "error": type(err).__name__})
            time.sleep(float(pause))
            continue
        neighbours = {u: p for u, p in around.items() if abs(p[0] - lat) <= BOX_DEGREES and abs(p[1] - lon) <= BOX_DEGREES}
        rows.append({"module": module, "in_open_uprn": True, **judge(uprn, (lat, lon), neighbours, objects, postcode)})
        time.sleep(float(pause))
    measured = [r for r in rows if "covered" in r]
    summary = {key: sum(1 for r in measured if r[key]) for key in ("covered", "postcode", "roundtrip")}
    summary.update({"measured": len(measured), "test_homes": len(homes), "errors": sum(1 for r in rows if "error" in r)})
    json.dump({"summary": summary, "results": rows}, open(out_path, "w"), indent=1)
    print(json.dumps(summary))


if __name__ == "__main__":
    main(*sys.argv[1:5])
