"""Spike (FRE-294): could a typed postcode and house number be turned into a UPRN from free open data?

The idea: OS Open UPRN (open, national) gives every UPRN a point. OpenStreetMap has address points and buildings tagged
with a house number and often a postcode. For a resident's postcode and house number we would find the OpenStreetMap
object with that number, then the UPRN nearest it. This does not try that for a resident; it measures how often it would
work, using upstream's public test UPRNs (each is a home we know the UPRN of):

  covered     an OpenStreetMap object with a house number lies within 15 m of the home's UPRN point
  postcode    ...and it carries a postcode that matches the one upstream tests with (when upstream gives one)
  roundtrip   ...and the UPRN nearest that object's centre is the home's own UPRN (so postcode and number would lead back to it)

Only counts and council module names are printed or saved, never a UPRN, postcode or coordinates: logs are public.

The OpenStreetMap side comes from a downloaded extract (Geofabrik's Great Britain file), not the public Overpass service,
which refused most requests from GitHub's network. `osmium` (osmium-tool) cuts a small square around each home out of the
extract and exports it, then this script reads the address objects from those squares.

Usage: spike_osm_uprn.py <upstream input.json> <OS Open UPRN csv> <Great Britain .osm.pbf> <work dir> <output json>
"""
import json
import math
import subprocess
import sys
from pathlib import Path

NEAR_METRES = 15
BOX_DEGREES = 0.004  # about 440 m north-south, enough to hold every UPRN near a test home
CUT_DEGREES = 0.0015  # the square cut from the extract around each home, about 160 m each way


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


def _columns(header_line):
    names = [n.strip().strip('"').upper() for n in header_line.strip().split(",")]
    return names.index("UPRN"), names.index("LATITUDE"), names.index("LONGITUDE")


def read_points(csv_path, wanted):
    """Points for the wanted UPRNs, then every UPRN within a box around each of them. Streams the file twice, line by line
    (the file has about 40 million rows, so this avoids building a dict per row)."""
    points = {}
    with open(csv_path, encoding="utf-8-sig") as handle:
        iu, ila, ilo = _columns(handle.readline())
        for line in handle:
            parts = line.split(",")
            if parts[iu] in wanted:
                points[parts[iu]] = (float(parts[ila]), float(parts[ilo]))
                if len(points) == len(wanted):
                    break
    print(f"first pass done: {len(points)} of {len(wanted)} test UPRNs found", flush=True)
    grid = {}  # a coarse grid, so each row is compared with the few homes near it, not all of them
    for la, lo in points.values():
        grid.setdefault((int(la // BOX_DEGREES), int(lo // BOX_DEGREES)), []).append((la, lo))
    around = {}
    with open(csv_path, encoding="utf-8-sig") as handle:
        iu, ila, ilo = _columns(handle.readline())
        for count, line in enumerate(handle, 1):
            parts = line.split(",")
            lat, lon = float(parts[ila]), float(parts[ilo])
            cy, cx = int(lat // BOX_DEGREES), int(lon // BOX_DEGREES)
            if any(
                abs(lat - la) <= BOX_DEGREES and abs(lon - lo) <= BOX_DEGREES
                for dy in (-1, 0, 1)
                for dx in (-1, 0, 1)
                for la, lo in grid.get((cy + dy, cx + dx), ())
            ):
                around[parts[iu]] = (lat, lon)
            if count % 10_000_000 == 0:
                print(f"second pass: {count // 1_000_000} million rows", flush=True)
    return points, around


def objects_from_geojsonseq(lines):
    """OpenStreetMap objects with a house number, as [{lat, lon, postcode}], from `osmium export -f geojsonseq` lines."""
    out = []
    for line in lines:
        line = line.strip().lstrip("\x1e")
        if not line:
            continue
        feature = json.loads(line)
        props = feature.get("properties") or {}
        if not props.get("addr:housenumber"):
            continue
        geometry = feature.get("geometry") or {}
        if geometry.get("type") == "Point":
            lon, lat = geometry["coordinates"]
        elif geometry.get("type") == "Polygon":
            ring = geometry["coordinates"][0]
            lon = sum(p[0] for p in ring) / len(ring)
            lat = sum(p[1] for p in ring) / len(ring)
        else:
            continue
        out.append({"lat": lat, "lon": lon, "postcode": props.get("addr:postcode")})
    return out


BATCH = 20  # osmium keeps every output open at once; 220 at once used up the runner's memory


def cut_squares(pbf_path, work, points):
    """Cut a square around each home out of the extract, one small file per home (osmium extract with a config file),
    a few homes at a time."""
    (work / "squares").mkdir(parents=True, exist_ok=True)
    items = list(points.items())
    for start in range(0, len(items), BATCH):
        extracts = [
            {"output": f"{uprn}.osm.pbf", "bbox": [lon - CUT_DEGREES, lat - CUT_DEGREES, lon + CUT_DEGREES, lat + CUT_DEGREES]}
            for uprn, (lat, lon) in items[start:start + BATCH]
        ]
        config = work / "extracts.json"
        config.write_text(json.dumps({"directory": str(work / "squares"), "extracts": extracts}))
        subprocess.run(["osmium", "extract", "--overwrite", "-c", str(config), str(pbf_path)], check=True)
        print(f"cut {min(start + BATCH, len(items))} of {len(items)} squares", flush=True)


def square_objects(work, uprn):
    path = work / "squares" / f"{uprn}.osm.pbf"
    if not path.exists():
        return []
    result = subprocess.run(
        ["osmium", "export", "-f", "geojsonseq", "--geometry-types=point,polygon", str(path)],
        check=True, capture_output=True, text=True,
    )
    return objects_from_geojsonseq(result.stdout.splitlines())


def main(input_path, csv_path, pbf_path, work_dir, out_path):
    work = Path(work_dir)
    homes = {m: h for m, h in test_homes(json.load(open(input_path))).items() if not str(h[1] or "").upper().startswith("BT")}
    wanted = {uprn for uprn, _ in homes.values()}
    points, around = read_points(csv_path, wanted)
    print(f"test homes in Great Britain: {len(homes)} | found in OS Open UPRN: {len(points)}")
    cut_squares(pbf_path, work, points)
    rows = []
    for module, (uprn, postcode) in sorted(homes.items()):
        if uprn not in points:
            rows.append({"module": module, "in_open_uprn": False})
            continue
        lat, lon = points[uprn]
        objects = square_objects(work, uprn)
        neighbours = {u: p for u, p in around.items() if abs(p[0] - lat) <= BOX_DEGREES and abs(p[1] - lon) <= BOX_DEGREES}
        rows.append({"module": module, "in_open_uprn": True, **judge(uprn, (lat, lon), neighbours, objects, postcode)})
    measured = [r for r in rows if "covered" in r]
    summary = {key: sum(1 for r in measured if r[key]) for key in ("covered", "postcode", "roundtrip")}
    summary.update({"measured": len(measured), "test_homes": len(homes)})
    json.dump({"summary": summary, "results": rows}, open(out_path, "w"), indent=1)
    print(json.dumps(summary))


if __name__ == "__main__":
    main(*sys.argv[1:6])
