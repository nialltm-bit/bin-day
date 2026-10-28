# ruff: noqa: E501
"""Census of every council in the pinned UKBinCollectionData: inputs, browser need, platform and status with us.

Static analysis only. It reads upstream's package (its tests/input.json and the council modules' source) and our own
files (registry, batch probe results, the generator's report, the upstream full-suite run). It makes no network request.

Writes two CSVs and prints nothing else:
- <out>/coverage-census-modules.csv : one row per upstream council module
- <out>/coverage-census-councils.csv: one row per council (Local Authority District), from the outlines file

and docs/coverage-census.md is then written by scripts/census_report.py from those CSVs.

Usage: census.py <out dir> [population csv (ons_code,population)]
The upstream package is the one installed (uk_bin_collection==0.173.5, see fetcher/requirements.txt).
"""
import csv
import importlib.util
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
SHAPES = ROOT / "web" / "public" / "data" / "council-shapes.json"
REGISTRY = ROOT / "registry" / "councils.json"
PROBE = ROOT / "docs" / "spike-results" / "batch-probe.json"
SUITE = ROOT / "docs" / "spike-results" / "full-suite.json"
REPORT = ROOT / "docs" / "spike-results" / "generated-registry-report.md"

# Platforms, in the order they are tried. Each rule is a regex on the module's source with comments removed (lower case),
# and says how strong the evidence is: "domain" (a vendor domain or path the module calls), "path" (a vendor-specific API
# path or field), or "keyword" (a vendor name in the code).
PLATFORM_RULES = [
    ("Granicus/Firmstep AchieveForms", "domain", r"achieveservice\.com|/apibroker/|/authapi/isauthenticated|fillform|appshost/firmstep|\bfirmstep\b"),
    ("Whitespace", "path", r"whitespacews\.com|bbd-whitespace|whitespacecomms|\.whitespace\.|/whitespace/|getcollectionbyuprnanddate|whitespacewebservice"),
    ("Bartec", "domain", r"bartec|collectiveview"),
    ("iTouchVision", "domain", r"itouchvision"),
    ("ReCollect", "domain", r"recollect\.net"),
    ("Verint (empro)", "domain", r"verintcloudservices"),
    ("Jadu", "keyword", r"\bjadu\b|myforms\.[a-z\-]+\.gov\.uk"),
    ("Power Apps portal (Dynamics)", "domain", r"powerappsportals\.com|\.crm[0-9]*\.dynamics\.com"),
    ("Oncreate", "domain", r"oncreate\.app"),
    ("Mendix", "keyword", r"mendix"),
    ("Cloud9 Technologies", "domain", r"cloud9technologies"),
    ("GOSS", "domain", r"gosscms|goss\.|/goss/|goss-"),
    ("ArcGIS/Esri", "domain", r"arcgis|mapserver|esri"),
    ("Google Calendar (public iCal)", "domain", r"calendar\.google\.com|icalevents"),
    ("Civica UFS", "path", r"/ufs/|ufs\.aspx"),
    ("Confirm (Pitney Bowes)", "keyword", r"confirm(?:connect|\.api|[a-z]*\.(?:gov|org))"),
    ("Isl Fusion", "domain", r"isl-fusion"),
    ("Salesforce Experience Cloud", "path", r"/aura\?|aura\.context|fwuid|lightning-base|force\.com"),
    ("FCC Environment portal", "domain", r"fccenvironment|fcc_binday"),
    ("iEG4", "domain", r"ieg4\.net"),
    ("Supatrak", "domain", r"supatrak"),
    ("OnMats", "domain", r"onmats"),
    ("WSCollExternal SOAP (Azure)", "path", r"wscollexternal"),
    ("PublicDashboard (shared upstream base class)", "path", r"publicdashboard"),
    ("Council CMS apiserver/ajaxlibrary API", "path", r"apiserver/(?:ajaxlibrary|postcode)"),
    ("RenderForm.aspx form engine", "path", r"renderform\.aspx"),
]
# Upstream's LAD24CD is stale or wrong for these (ONS recoded, or a copy-paste slip). Value: (right code, why).
CODE_FIXES = {
    "BarnsleyMBCouncil": ("E08000038", "upstream has the pre-2023 code E08000016"),
    "SheffieldCityCouncil": ("E08000039", "upstream has the pre-2023 code E08000019"),
    "EastHertsCouncil": ("E07000242", "upstream has the retired code E07000097"),
    "GosportBoroughCouncil": ("E07000088", "upstream has Stroud's code E07000082"),
    "NorthWarwickshireBoroughCouncil": ("E07000218", "upstream has Rugby's code E07000220"),
    "CneSiarCouncil": ("S12000013", "no code upstream; matched to Na h-Eileanan Siar"),
    "FyldeCouncil": ("E07000119", "no input.json entry upstream; code assumed from the module name"),
}
# Modules that cover more than one council, or are superseded. Value: extra codes, or None for 'superseded'.
EXTRA_CODES = {"AdurAndWorthingCouncils": ["E07000229"]}
SUPERSEDED = {
    "EalingCouncil": "marked deprecated upstream; use LondonBoroughEaling",
    "EdenDistrictCouncil": "Eden was merged into Westmorland and Furness in 2023; use WestMorlandAndFurness",
    "HarrogateBoroughCouncil": "Harrogate was absorbed into North Yorkshire in 2023; no current council code",
}

# Hosts that are not the collection platform (address helpers, schemas, docs).
NOISE_HOSTS = ("postcodes.io", "nominatim.openstreetmap.org", "github.com", "w3.org", "xmlsoap.org", "tempuri.org",
               "stackoverflow.com", "getaddress.io", "google.com", "schemas.", "example.com", "gov.uk/find")

# Upstream's `uprn` field is not a UPRN for these (read from the module and its wiki note). Value: (class, note).
NOT_A_REAL_UPRN = {
    "CastlepointDistrictCouncil": ("other_id", "'uprn' is a 4-digit street code from the council's dropdown"),
    "MorayCouncil": ("other_id", "'uprn' is the council's property ID taken from its bin day finder URL"),
    "WestminsterCityCouncil": ("usrn", "'uprn' is used as the street reference (USRN)"),
    "TamworthBoroughCouncil": ("other_id", "'uprn' is Lichfield's shared-portal 9-digit reference, not a national UPRN"),
    "NewarkAndSherwoodDC": ("other_id", "'uprn' is the council's PID; postcode plus house number also accepted"),
    "CrawleyBoroughCouncil": ("uprn+usrn", "needs both a UPRN and a USRN (USRN passed in the house number field)"),
    "AntrimAndNewtonabbeyCouncil": ("url_property_ref", "needs the council's street ID inside the URL"),
}

# Councils whose input.json entry has no LAD24CD, matched by hand to the outlines file's name.
NAME_FIXES = {"Bedford Borough Council": "Bedford", "Rhondda Cynon Taff": "Rhondda Cynon Taf"}


def clean_name(text: str) -> str:
    text = text.lower().replace("&", "and")
    text = re.sub(r"\b(city|borough|county|district|metropolitan|council|of|london|royal|the|mb|dc|bc|cc|unitary|authority)\b", " ", text)
    return re.sub(r"[^a-z0-9]+", "", text)


def uncommented(source: str) -> str:
    return "\n".join(line for line in source.splitlines() if not line.strip().startswith("#")).lower()


def reads(source: str, key: str) -> bool:
    return bool(re.search(r"kwargs(?:\.get\(\s*|\[\s*)[\"']" + key + r"[\"']", source))


def hosts_in(source: str) -> list[str]:
    found = []
    for host in re.findall(r"https?://([A-Za-z0-9.\-]+)", source):
        host = host.lower().rstrip(".")
        if "." in host and not any(noise in host for noise in NOISE_HOSTS) and host not in found:
            found.append(host)
    return found


def platform_of(name: str, source: str, url: str, entry: dict) -> tuple[str, str, str]:
    """(platform, confidence, evidence). Confidence is high for a vendor domain or path, medium for a keyword, low if
    the module is a bespoke scraper of the council's own site or a third-party page we could not name."""
    haystack = source + "\n" + url.lower()
    for platform, kind, pattern in PLATFORM_RULES:
        match = re.search(pattern, haystack)
        if match:
            return platform, "high" if kind in ("domain", "path") else "medium", match.group(0)
    return "", "", ""


def read_population(path: str | None) -> dict[str, int]:
    if not path or not Path(path).exists():
        return {}
    with open(path, newline="") as fh:
        return {r["ons_code"]: int(r["population"]) for r in csv.DictReader(fh)}


def load_upstream():
    spec = importlib.util.find_spec("uk_bin_collection")
    if spec is None or not spec.submodule_search_locations:
        sys.exit("uk_bin_collection is not installed (pip install uk_bin_collection==0.173.5)")
    pkg = Path(list(spec.submodule_search_locations)[0])
    inputs = json.load(open(pkg / "tests" / "input.json"))
    councils_dir = pkg / "uk_bin_collection" / "councils"
    return inputs, councils_dir


def report_reasons() -> dict[str, str]:
    reasons = {}
    for line in REPORT.read_text().splitlines():
        match = re.match(r"- (\w+): (.+)", line)
        if match:
            reasons[match.group(1)] = match.group(2)
    return reasons


def main(out_dir, population_path=None):
    inputs, councils_dir = load_upstream()
    shapes = json.load(open(SHAPES))["councils"]
    lads = {s["code"]: s["name"] for s in shapes}
    by_name = {clean_name(n): c for c, n in lads.items()}
    registry = {c["source"].get("module"): c for c in json.load(open(REGISTRY))["councils"]}
    registry_codes = {c["ons_code"] for c in registry.values()}
    probe = {r["module"]: r for r in json.load(open(PROBE))["results"]}
    suite = {re.search(r"\[(.+)\]", c["test"]).group(1): c for c in json.load(open(SUITE))["cases"]}
    reasons = report_reasons()
    population = read_population(population_path)

    rows = []
    for path in sorted(councils_dir.glob("*.py")):
        module = path.stem
        if module.startswith("__"):
            continue
        source = uncommented(path.read_text(encoding="utf-8"))
        entry = inputs.get(module)
        row = {"module": module, "in_input_json": entry is not None}
        if entry is None:
            row.update(wiki_name=module, lad_codes="", input_class="n/a", notes="no entry in upstream's input.json (not a runnable council)")
            rows.append(row)
            continue
        codes = [entry["LAD24CD"]] if entry.get("LAD24CD") else []
        codes += entry.get("supported_councils_LAD24CD", [])
        note = []
        if module in CODE_FIXES:
            codes, why = [CODE_FIXES[module][0]], CODE_FIXES[module][1]
            note.append("LAD code corrected: " + why)
        codes += EXTRA_CODES.get(module, [])
        if module in SUPERSEDED:
            note.append(SUPERSEDED[module])
            row["superseded"] = True
        if not codes:
            code = by_name.get(clean_name(NAME_FIXES.get(entry["wiki_name"], entry["wiki_name"])))
            if code:
                codes, note = [code], ["LAD matched from name"]
        row["wiki_name"] = entry["wiki_name"]
        row["lad_codes"] = " ".join(codes)
        row["lad_source"] = "corrected" if module in CODE_FIXES else "input.json" if entry.get("LAD24CD") or entry.get("supported_councils_LAD24CD") else ("name match" if codes else "none")

        given = [k for k, label in (("uprn", "uprn"), ("postcode", "postcode"), ("house_number", "house_number")) if entry.get(k)]
        if not given and entry.get("url"):
            given = ["url"]
        input_class = "+".join(given) if given else "none"
        reads_all = {k: reads(source, k) for k in ("uprn", "postcode", "paon", "url")} | {"number": reads(source, "number")}
        row["reads_uprn"] = reads_all["uprn"]
        row["reads_postcode"] = reads_all["postcode"]
        row["reads_house_number"] = reads_all["paon"] or reads_all["number"]
        row["accepts_alt_non_uprn"] = bool(entry.get("uprn") and reads_all["postcode"] and (reads_all["paon"] or reads_all["number"]))
        if input_class == "url":
            # The identifier is inside the URL. Upstream's wiki note says which kind.
            wiki = (entry.get("wiki_note") or "").lower()
            if "ics file" in wiki:
                input_class = "ical_url"
            elif re.search(r"replace[^.]*uprn|uprn in url", wiki) and not wiki.startswith("follow"):
                input_class = "uprn_in_url"
            else:
                input_class = "url_property_ref"
                note.append("identifier in the URL is a council property reference or street ID found by searching the council's site")
        if module in NOT_A_REAL_UPRN:
            input_class, why = NOT_A_REAL_UPRN[module]
            note.append(why)
        row["input_class"] = input_class
        row["test_inputs"] = " ".join(given)
        row["needs_uprn"] = "uprn" in input_class.split("+") or input_class == "uprn_in_url"
        row["takes_url"] = "url" in input_class.split("+") or reads_all["url"]

        row["selenium_in_source"] = bool(re.search(r"selenium|webdriver", source))
        row["web_driver_in_input"] = bool(entry.get("web_driver"))
        if row["selenium_in_source"] != row["web_driver_in_input"]:
            note.append("browser flag in input.json disagrees with the source")

        url = entry.get("url", "")
        platform, confidence, evidence = platform_of(module, source, url, entry)
        parent = re.search(r"councils\.(\w+) import", source)
        if parent and parent.group(1) != module:
            row["inherits_from"] = parent.group(1)
        hosts = hosts_in(source)
        if urlparse(url).hostname:
            host = urlparse(url).hostname
            if host not in hosts:
                hosts.insert(0, host)
        row["platform"], row["platform_confidence"], row["platform_evidence"] = platform, confidence, evidence
        row["domains"] = " ".join(hosts[:6])

        reg = registry.get(module)
        probed = probe.get(module)
        upstream_test = suite.get(module, {}).get("status", "not_run")
        row["upstream_test"] = upstream_test
        if reg:
            status = "supported"
        elif probed is not None and module in reasons:
            status = "left_out: " + reasons[module]
        elif probed is not None and not probed.get("ok"):
            status = "left_out: probe failed (" + probed.get("error", "no result") + ")"
        elif probed is not None:
            status = "probed_ok_not_added"
        else:
            status = "never_probed"
        row["probed"] = probed is not None
        row["probe_ok"] = bool(probed and probed.get("ok"))
        row["our_status"] = status
        row["notes"] = "; ".join(note)
        rows.append(row)

    by_module = {r["module"]: r for r in rows}
    for r in rows:
        if not r.get("platform") and r.get("inherits_from") in by_module and by_module[r["inherits_from"]].get("platform"):
            r["platform"], r["platform_confidence"] = by_module[r["inherits_from"]]["platform"], "medium"
            r["platform_evidence"] = "subclass of " + r["inherits_from"]
        if r["in_input_json"] and not r.get("platform"):
            kind = "browser form" if r["selenium_in_source"] else "HTML/JSON"
            r["platform"], r["platform_confidence"] = f"Bespoke council site ({kind})", "low"
            r["platform_evidence"] = "no vendor signature found in the module"

    # Council level: one row per outline. If several modules cover a council, the furthest-along one wins.
    rank = {"supported": 0, "probed_ok_not_added": 1}
    def furthest(r):
        return (rank.get(r["our_status"], 2 if r["our_status"].startswith("left_out") else 3), r["upstream_test"] != "passed")

    by_lad: dict[str, list[dict]] = {}
    for r in rows:
        for code in r.get("lad_codes", "").split():
            by_lad.setdefault(code, []).append(r)
    unknown_codes = sorted(set(by_lad) - set(lads))

    council_rows = []
    for code, name in sorted(lads.items()):
        mods = sorted((m for m in by_lad.get(code, []) if not m.get("superseded")), key=furthest)
        best = mods[0] if mods else None
        council_rows.append({
            "ons_code": code, "name": name, "nation": {"E": "England", "W": "Wales", "S": "Scotland", "N": "Northern Ireland"}[code[0]],
            "population": population.get(code, ""),
            "modules": " ".join(m["module"] for m in mods),
            "module": best["module"] if best else "",
            "has_upstream_module": bool(best),
            "input_class": best["input_class"] if best else "",
            "needs_uprn": best["needs_uprn"] if best else "",
            "selenium_in_source": best["selenium_in_source"] if best else "",
            "platform": (best["platform"] or "unclassified") if best else "",
            "platform_confidence": best["platform_confidence"] if best else "",
            "upstream_test": best["upstream_test"] if best else "",
            "probed": best["probed"] if best else False,
            "probe_ok": best["probe_ok"] if best else False,
            "in_registry": code in registry_codes,
            "our_status": ("supported" if code in registry_codes else best["our_status"]) if best else "no_upstream_module",
        })

    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    for name, data in (("coverage-census-modules.csv", rows), ("coverage-census-councils.csv", council_rows)):
        fields = list(dict.fromkeys(k for r in data for k in r))
        with open(out / name, "w", newline="") as fh:
            writer = csv.DictWriter(fh, fieldnames=fields)
            writer.writeheader()
            writer.writerows(data)
    print(f"{len(rows)} modules, {len(council_rows)} councils, LAD codes not in outlines: {unknown_codes}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
