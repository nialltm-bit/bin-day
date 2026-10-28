"""Build the council outlines the homepage map draws, from ONS Local Authority District boundaries.

Finds the newest "Local Authority Districts ... Boundaries UK BUC" feature service on the ONS Open Geography Portal,
downloads it simplified, and writes one SVG path per council. Boundaries are Crown copyright and database right,
published under the Open Government Licence.
Usage: build_council_shapes.py <output json>
"""
import json
import math
import os
import sys
import urllib.parse
import urllib.request

ARCGIS = "https://www.arcgis.com/sharing/rest"
SIMPLIFY_DEGREES = 0.004  # about 400 m: plenty for a country-wide map
MAP_HEIGHT = 1000.0
CENTRE_LATITUDE = 54.5


def get_json(url, params=None):
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"User-Agent": "bin-day-build"})
    with urllib.request.urlopen(request, timeout=180) as response:
        return json.load(response)


def newest_service():
    found = get_json(
        f"{ARCGIS}/search",
        {
            "q": 'title:"Local Authority Districts" AND title:"Boundaries UK BUC" AND owner:ONSGeography_data AND type:"Feature Service"',
            "sortField": "modified",
            "sortOrder": "desc",
            "num": 5,
            "f": "json",
        },
    )
    results = found.get("results", [])
    if not results:
        sys.exit("no Local Authority District boundary service found")
    for item in results:
        print("candidate:", item["title"], "| modified", item.get("modified"))
    return results[0]


def project(lon, lat, scale_x):
    return (lon * scale_x, -lat)


def build(features):
    scale_x = math.cos(math.radians(CENTRE_LATITUDE))
    rings_by_council = []
    min_x = min_y = float("inf")
    max_x = max_y = float("-inf")
    for feature in features:
        props = feature["properties"]
        code = next(v for k, v in props.items() if k.upper().startswith("LAD") and k.upper().endswith("CD"))
        name = next(v for k, v in props.items() if k.upper().startswith("LAD") and k.upper().endswith("NM"))
        geometry = feature["geometry"]
        polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
        rings = []
        for polygon in polygons:
            for ring in polygon:
                points = [project(lon, lat, scale_x) for lon, lat in ring]
                for x, y in points:
                    min_x, max_x, min_y, max_y = min(min_x, x), max(max_x, x), min(min_y, y), max(max_y, y)
                rings.append(points)
        rings_by_council.append((code, name, rings))

    scale = MAP_HEIGHT / (max_y - min_y)
    councils = []
    for code, name, rings in sorted(rings_by_council):
        parts = []
        for points in rings:
            coords = [((x - min_x) * scale, (y - min_y) * scale) for x, y in points]
            parts.append("M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in coords) + "Z")
        councils.append({"code": code, "name": name, "d": "".join(parts)})
    width = (max_x - min_x) * scale
    return {"viewBox": f"0 0 {width:.0f} {MAP_HEIGHT:.0f}", "councils": councils}


def main(out_path):
    item = newest_service()
    service = get_json(f"{ARCGIS}/content/items/{item['id']}", {"f": "json"})["url"]
    print("service:", service)
    data = get_json(
        f"{service}/0/query",
        {
            "where": "1=1",
            "outFields": "*",
            "outSR": 4326,
            "f": "geojson",
            "maxAllowableOffset": SIMPLIFY_DEGREES,
            "geometryPrecision": 4,
        },
    )
    features = data.get("features", [])
    print("features:", len(features), "| exceeded transfer limit:", data.get("exceededTransferLimit"))
    shapes = build(features)
    shapes["source"] = item["title"]
    text = json.dumps(shapes, separators=(",", ":"))
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as out:
        out.write(text)
    codes = {c["code"] for c in shapes["councils"]}
    print("councils:", len(codes), "| by first letter:", {p: sum(c.startswith(p) for c in codes) for p in "EWSN"})
    print("B&NES present:", "E06000022" in codes, "| bytes:", len(text), "| viewBox:", shapes["viewBox"])


if __name__ == "__main__":
    main(sys.argv[1])
