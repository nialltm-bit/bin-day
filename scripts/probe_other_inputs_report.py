# ruff: noqa: E501
"""Writes docs/phase3-probe-results.md from the Phase 3 probe results. Usage: probe_other_inputs_report.py <results json> <out .md>"""
import json
import sys
from collections import Counter, defaultdict

TITLES = {
    "uprn_alt": "UPRN councils tried without their UPRN",
    "single": "Postcode-only and street-only councils",
    "other_id": "Councils that take a reference number, not a UPRN",
    "url": "Councils whose identifier is inside the URL",
    "remaining": "Postcode and house number councils never probed before",
}


def main(results_path, out_path):
    rows = json.load(open(results_path))["results"]
    groups = defaultdict(list)
    for r in rows:
        groups[r["group"]].append(r)
    out = ["# Phase 3 probe results", "",
           "One run from a GitHub runner with a Chrome service (`scripts/probe_other_inputs.py`, workflow `probe-other-inputs.yml`), one request per call "
           "with a 10 second pause, using upstream's own test inputs. A success means the module returned bins for upstream's test address from a cloud "
           "IP; it does not mean the bin names are mapped or the dates are true. Nothing here changes the registry. Raw rows: "
           "[`spike-results/phase3-probe.json`](spike-results/phase3-probe.json).", "",
           f"{len(rows)} councils probed; {sum(r['ok'] for r in rows)} returned bins.", ""]
    out += ["| Group | Probed | Returned bins | Browser |", "|---|---|---|---|"]
    for key, title in TITLES.items():
        g = groups.get(key, [])
        out.append(f"| {title} | {len(g)} | {sum(r['ok'] for r in g)} | {sum(r['browser_in_source'] for r in g)} |")
    out.append("")
    alt = groups.get("uprn_alt", [])
    verdicts = Counter(r.get("without_uprn", "reference failed") for r in alt)
    out += ["## Does a UPRN council work without its UPRN?", "",
            "Each council was run with every input upstream's test gives, then with only the postcode and house number from the same test entry, and the two "
            "results compared (same bins on the same dates).", "",
            "| Result without a UPRN | Councils |", "|---|---|"]
    out += [f"| {k.replace('_', ' ')} | {v} |" for k, v in verdicts.most_common()]
    out += ["", "| Council | Without a UPRN | Schedule |", "|---|---|---|"]
    for r in alt:
        out.append(f"| `{r['module']}` | {r.get('without_uprn', 'reference failed: ' + r.get('error', 'no result')).replace('_', ' ')} | {r.get('schedule') or ''} |")
    out += ["", "`same schedule` means the postcode and house number found the same house as the UPRN did, so the council can be added as a postcode and house "
            "number council with no UPRN finder. `same bins different dates` needs a look: the module may have matched a neighbouring address.", ""]
    for key in ("single", "other_id", "url", "remaining"):
        g = groups.get(key, [])
        out += [f"## {TITLES[key]}", "", "| Council | Result | Schedule | Browser |", "|---|---|---|---|"]
        for r in g:
            result = "returned bins" if r["ok"] else f"failed ({r.get('error', 'no bins')})"
            out.append(f"| `{r['module']}` | {result} | {r.get('schedule') or ''} | {'yes' if r['browser_in_source'] else 'no'} |")
        out.append("")
    out += ["## Not probed", "",
            "- **Google public calendar group** (16 councils): parked. Each needs that council's own public calendar URL.",
            "- **A 403 or captcha in upstream's own test**: not tried again, and a captcha is never worked around (Gateshead, Halton, Mid Sussex, Norwich, Powys, Sunderland, Swansea).",
            "- **UPRN modules that read a postcode but whose test gives no house number** (Dover, Fenland, Haringey, Richmond, Tower Hamlets) or only a UPRN "
            "(Exeter, Anglesey, Malvern Hills, Stratford): there is no known house to compare against, so they cannot be checked without a test address from the council.",
            "", "## Next", "",
            "- Councils that returned bins with a postcode and a house number can go through `scripts/generate_registry.py` (it needs rows in the batch probe format; "
            "these rows are not yet merged into `batch-probe.json`).",
            "- Postcode-only and street-only councils need the page to ask for something other than a house number, which the registry's `inputs` do not model yet.", ""]
    open(out_path, "w").write("\n".join(out))


if __name__ == "__main__":
    main(*sys.argv[1:3])
