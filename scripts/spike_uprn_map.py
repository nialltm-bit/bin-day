"""FRE-264 spike: can the ONS UPRN Directory give us postcode -> homes-on-a-map for one council?

Usage: spike_uprn_map.py <ONSUD zip> <LAD code> <output dir>
Prints only counts and column names, never individual UPRNs or postcodes.
"""
import csv
import io
import json
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

from pyproj import Transformer


def find_column(header, *wanted):
    for name in header:
        if name.upper().startswith(wanted):
            return name
    return None


def main(zip_path, lad, out_dir):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    to_wgs84 = Transformer.from_crs("EPSG:27700", "EPSG:4326", always_xy=True)
    homes = defaultdict(list)
    with zipfile.ZipFile(zip_path) as z:
        csvs = [n for n in z.namelist() if n.lower().endswith(".csv")]
        print("csv files in the zip:", len(csvs))
        for name in csvs:
            with z.open(name) as raw:
                reader = csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig"))
                header = reader.fieldnames or []
                lad_cols = [h for h in header if h.upper().startswith("LAD")]
                uprn_col = find_column(header, "UPRN")
                pc_col = find_column(header, "PCDS", "PCD")
                east_col = find_column(header, "GRIDGB1E")
                north_col = find_column(header, "GRIDGB1N")
                if name == csvs[0]:
                    print("columns:", len(header), "| lad columns:", lad_cols, "|", uprn_col, pc_col, east_col, north_col)
                if not (uprn_col and pc_col and east_col and north_col and lad_cols):
                    continue
                for row in reader:
                    if lad not in {row[c] for c in lad_cols}:
                        continue
                    if not row[east_col] or not row[north_col]:
                        continue
                    lon, lat = to_wgs84.transform(float(row[east_col]), float(row[north_col]))
                    homes[row[pc_col].strip()].append([int(row[uprn_col]), round(lat, 6), round(lon, 6)])
    total = sum(len(v) for v in homes.values())
    print("postcodes:", len(homes), "| homes with a position:", total)
    if homes:
        sizes = sorted(len(v) for v in homes.values())
        print("homes per postcode: median", sizes[len(sizes) // 2], "max", sizes[-1])
    data = json.dumps(homes, separators=(",", ":"))
    (out / "homes.json").write_text(data)
    print("single file size, bytes:", len(data))


if __name__ == "__main__":
    main(*sys.argv[1:4])
