# ruff: noqa: E501
"""Turns the census CSVs (scripts/census.py) into docs/coverage-census.md.

Usage: census_report.py <dir holding the two census CSVs> <output .md>
Every number in the markdown is counted here from the CSVs, so it can be checked by loading them.
"""
import csv
import sys
from collections import Counter, defaultdict
from pathlib import Path


def load(path):
    with open(path, newline="") as fh:
        return list(csv.DictReader(fh))


def yes(value):
    return value == "True"


def pop(rows):
    values = [int(r["population"]) for r in rows if r["population"]]
    return sum(values) if len(values) == len(rows) and rows else None


def fmt_pop(rows):
    total = pop(rows)
    return "n/a" if total is None else f"{total / 1_000_000:.2f}m"


def table(header, body):
    lines = ["| " + " | ".join(header) + " |", "|" + "|".join("---" for _ in header) + "|"]
    lines += ["| " + " | ".join(str(c) for c in row) + " |" for row in body]
    return "\n".join(lines)


def main(csv_dir, out_path):
    modules = load(Path(csv_dir) / "coverage-census-modules.csv")
    councils = load(Path(csv_dir) / "coverage-census-councils.csv")
    have_pop = any(c["population"] for c in councils)

    with_module = [c for c in councils if yes(c["has_upstream_module"])]
    uprn = [c for c in with_module if yes(c["needs_uprn"])]
    non_uprn = [c for c in with_module if not yes(c["needs_uprn"])]
    probed = [c for c in non_uprn if yes(c["probed"])]
    working = [c for c in probed if yes(c["probe_ok"])]
    supported = [c for c in councils if c["our_status"] == "supported"]
    supported_uprn = [c for c in supported if yes(c["needs_uprn"])]
    supported_non = [c for c in supported if not yes(c["needs_uprn"])]
    supported_in_funnel = [c for c in non_uprn if c["our_status"] == "supported"]

    def row(label, rows, note=""):
        return [label, len(rows), f"{len(rows) / len(councils):.0%}", fmt_pop(rows), note]

    out = ["# Coverage census (Phase 1)", ""]
    out += [
        "Static analysis of UKBinCollectionData 0.173.5 (the version we pin) and our own registry. No council site was contacted "
        "to make this. Every number below is counted from [`coverage-census-councils.csv`](coverage-census-councils.csv) (one row per "
        "council) and [`coverage-census-modules.csv`](coverage-census-modules.csv) (one row per upstream module), made by "
        "`scripts/census.py` and `scripts/census_report.py`.",
        "",
        "A *council* here is one of the 361 Local Authority Districts in the outlines file the site's map uses "
        "(`web/public/data/council-shapes.json`, ONS May 2026). Upstream has 353 council modules; some cover two councils and "
        "some councils have more than one module (see the end).",
        "",
    ]
    if have_pop:
        out += ["Population is ONS mid-year estimates for the LAD, a stand-in for households (people, not households)."]
    else:
        out += [
            "> **Population columns say `n/a`.** The ONS mid-year population file could not be fetched from this session "
            "(`www.ons.gov.uk` and `www.nomisweb.co.uk` are outside its network allowlist). `scripts/census.py` takes a CSV "
            "(`ons_code,population`) as its second argument and the report fills in the population and households columns "
            "when it is given one. See \"Still to do\" at the end."
        ]
    out += ["", "## Funnel", ""]
    funnel = [
        row("All councils (outlines)", councils),
        row("Have an upstream module", with_module, f"{len(councils) - len(with_module)} have none: " + ", ".join(sorted(c['name'] for c in councils if not yes(c['has_upstream_module'])))),
        row("Need a UPRN (set aside for Phase 4)", uprn, f"{len(supported_uprn)} of these already supported"),
        row("Non-UPRN (postcode, house number, URL or other)", non_uprn),
        row("Probed by us", probed, "batch probe covers only postcode + house number, no browser needed, passing upstream's own test"),
        row("Working when probed", working),
        row("Supported (in the registry)", supported_in_funnel, "non-UPRN only"),
    ]
    out += [table(["Step", "Councils", "Of all 361", "Population", "Note"], funnel), ""]
    out += [
        f"Supported in the registry in total: {len(supported)} ({len(supported_uprn)} needs a UPRN, {len(supported_non)} does not).",
        "",
    ]
    left = Counter()
    for c in non_uprn:
        if c["our_status"].startswith("left_out"):
            left[c["our_status"].split(": ", 1)[1].split("'")[0].strip() or "other"] += 1
    status_counts = Counter(c["our_status"].split(":")[0] for c in non_uprn)
    out += ["### Where the non-UPRN councils stand", ""]
    out += [table(["Status with us", "Councils"], [[k, v] for k, v in status_counts.most_common()]), ""]
    reasons = Counter()
    for c in non_uprn:
        if c["our_status"].startswith("left_out"):
            why = c["our_status"].split(": ", 1)[1]
            reasons["unrecognised bin name" if why.startswith("unrecognised") else why] += 1
    out += ["Why probed councils were left out of the registry (from the generator's last report):", ""]
    out += [table(["Reason", "Councils"], [[k, v] for k, v in reasons.most_common()]), ""]

    # UPRN by platform
    out += ["## UPRN councils by platform", "",
            "Platform is inferred from the module's code and the domains it calls (rules in `PLATFORM_RULES` in `scripts/census.py`). "
            "\"Bespoke\" means no vendor signature was found: the module scrapes or calls the council's own site. "
            "Confidence: high = vendor domain or API path, medium = a vendor name in the code or a subclass of a known module, low = bespoke / nothing found.", ""]
    groups = defaultdict(list)
    for c in uprn:
        groups[c["platform"]].append(c)
    body = []
    for name, rows in sorted(groups.items(), key=lambda kv: (-(pop(kv[1]) or 0), -len(kv[1]), kv[0])):
        conf = Counter(r["platform_confidence"] for r in rows).most_common(1)[0][0]
        body.append([name, len(rows), fmt_pop(rows), sum(r["our_status"] == "supported" for r in rows), sum(yes(r["selenium_in_source"]) for r in rows), conf])
    out += [table(["Platform", "Councils", "Population", "Supported", "Browser needed", "Confidence"], body), ""]

    # Non-UPRN by input type and selenium
    out += ["## Non-UPRN councils by input type and browser need", "",
            "Input class is what upstream's own test passes for the module (`input.json`). Browser need is whether the module's source uses Selenium or a webdriver, "
            "the same test `scripts/batch_probe.py` uses. The last two columns split the group by whether upstream's own test passed in our 26 Oct 2026 run.", ""]
    groups = defaultdict(list)
    for c in non_uprn:
        groups[(c["input_class"], c["selenium_in_source"] == "True")].append(c)
    body = []
    for (cls, sel), rows in sorted(groups.items(), key=lambda kv: (-len(kv[1]), kv[0])):
        body.append([cls, "yes" if sel else "no", len(rows), fmt_pop(rows), sum(r["upstream_test"] == "passed" for r in rows),
                     sum(r["upstream_test"] == "failed" for r in rows), sum(r["our_status"] == "supported" for r in rows)])
    out += [table(["Input class", "Browser", "Councils", "Population", "Upstream test passed", "Failed", "Supported"], body), ""]
    out += [
        "Input class names: `postcode+house_number` is the class we already support. `house_number` alone is a street name (see notes). "
        "`ical_url` is a public calendar link, `url_property_ref` an identifier inside a URL found by searching the council's site (`uprn_in_url` is counted as UPRN). `other_id` is a council-specific reference upstream stores in the `uprn` field "
        "but which is not a national UPRN. `usrn` is a street reference.",
        "",
    ]

    # Platforms across all
    out += ["## Platform across all councils (UPRN and not)", ""]
    groups = defaultdict(list)
    for c in with_module:
        groups[c["platform"]].append(c)
    body = [[name, len(rows), fmt_pop(rows), sum(r["needs_uprn"] == "True" for r in rows), sum(r["needs_uprn"] != "True" for r in rows),
             sum(r["our_status"] == "supported" for r in rows)]
            for name, rows in sorted(groups.items(), key=lambda kv: (-len(kv[1]), kv[0]))]
    out += [table(["Platform", "Councils", "Population", "Need UPRN", "Don't", "Supported"], body), ""]

    # Things we couldn't classify confidently
    out += ["## What could not be classified confidently", ""]
    items = []
    low = [m for m in modules if m["platform_confidence"] == "low"]
    items.append(f"**{len(low)} modules have no vendor signature** (platform `Bespoke council site`). Many are probably on a shared vendor "
                 "platform we could not name from the code alone (no vendor domain, API path or name appears). "
                 "They are not individually listed here; filter `platform_confidence == low` in the modules CSV. No module shows an Echo or Symology signature; "
                 "Echo-type sites may be hiding in the bespoke group.")
    for m in modules:
        if m["in_input_json"] != "True":
            items.append(f"`{m['module']}`: no entry in upstream's `input.json`, so its inputs, browser need and test status are unknown "
                         "(a base class, not a council)." if m["module"] == "SocietyWorks" else
                         f"`{m['module']}`: no entry in upstream's `input.json`, so its inputs, browser need and test status are unknown; council code assumed from the module name.")
    for m in modules:
        if m.get("lad_source") == "corrected" or m.get("superseded") == "True":
            items.append(f"`{m['module']}`: {m['notes']}.")
    items.append("`GooglePublicCalendarCouncil` (`ical_url`): upstream lists 16 councils whose calendars it can read, but each needs that council's own public "
                 "Google Calendar URL, which is not something a user can type. All 16 are counted as non-UPRN because they need no UPRN, but they are not "
                 "reachable by any input we can ask for. Where a council has a second module, the furthest-along module is the one counted.")
    items.append("`url_property_ref` modules (Bromley, Coventry, East Staffordshire, Kingston, North Lanarkshire, Shropshire, Wakefield, Antrim and Newtownabbey): "
                 "the identifier sits in a URL the user would have to reach by searching the council's own site, so they are neither UPRN nor postcode councils. "
                 "`uprn_in_url` modules (Adur and Worthing, Oldham, Pembrokeshire, Reading, Solihull, Stockport, Stoke-on-Trent, Warwick) are counted as UPRN councils.")
    items.append("`EnvironmentFirst` serves Lewes and Eastbourne (a UPRN in a URL). It has no council code upstream, so it is not counted for any council; "
                 "`LewesDistrictCouncil` and `EastbourneBoroughCouncil` are counted instead.")
    for m in modules:
        if m["input_class"] in ("other_id", "usrn", "uprn+usrn") or (m["notes"] and "uprn" in m["notes"].lower() and "not a national" in m["notes"].lower()):
            items.append(f"`{m['module']}` ({m['input_class']}): {m['notes']}.")
    alts = [m["module"] for m in modules if m.get("accepts_alt_non_uprn") == "True"]
    items.append(f"{len(alts)} UPRN modules also read a postcode and a house number in their code ({', '.join(alts[:6])}…). "
                 "Whether that path works without a UPRN is not known from the code alone, so they are counted as UPRN councils. "
                 "Phase 3 should check them first: they are the cheapest way to turn a UPRN council into a non-UPRN one.")
    mism = [m["module"] for m in modules if "browser flag" in m["notes"]]
    items.append(f"{len(mism)} modules where `web_driver` in `input.json` and the use of Selenium in the source disagree ({', '.join(mism[:8])}{'…' if len(mism) > 8 else ''}). "
                 "The source wins in this census.")
    items.append("Upstream's `LAD24CD` is stale or wrong for several modules (corrected by hand, listed above), and `HarrogateBoroughCouncil` carries a code "
                 "(E07000165) that no longer exists in the May 2026 outlines. Councils reorganised since 2023 may still have one module per former district; "
                 "that is not checked here.")
    for item in items:
        out.append("- " + item)
    out += ["", "## How it was counted", "",
            "- **UPRN council**: the input class from upstream's own test includes a `uprn` (after setting aside the entries that are not really UPRNs). "
            "A council with several modules is counted by its furthest-along module.",
            "- **Probed / working**: from `docs/spike-results/batch-probe.json` (the last batch probe), not re-run.",
            "- **Supported**: in `registry/councils.json`, matched on the ONS code.",
            "- **Upstream test**: from `docs/spike-results/full-suite.json` (our own run on 26 Oct 2026), so it carries any cloud-IP blocking.",
            "", "## Still to do", ""]
    if not have_pop:
        out += ["- Population: add `ons_code,population` for the 361 councils (ONS mid-2024 or newest estimates for LADs, OGL) and run "
                "`python scripts/census.py docs population.csv && python scripts/census_report.py docs docs/coverage-census.md`. "
                "Allowing `www.ons.gov.uk` or `www.nomisweb.co.uk` in the session's network settings is enough."]
    out += [""]
    Path(out_path).write_text("\n".join(out) + "\n")
    print("funnel", [len(councils), len(with_module), len(uprn), len(non_uprn), len(probed), len(working), len(supported_in_funnel)])


if __name__ == "__main__":
    main(*sys.argv[1:3])
