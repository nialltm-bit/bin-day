"""Summarise upstream's integration-test junit.xml into per-council pass/fail.

Usage: summarise_junit.py <junit.xml> <output dir>
"""
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

root = ET.parse(sys.argv[1]).getroot()
out = Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)

cases = []
for case in root.iter("testcase"):
    problem = next((c for c in case if c.tag in ("failure", "error")), None)
    skipped = case.find("skipped") is not None
    status = "failed" if problem is not None else "skipped" if skipped else "passed"
    message = ""
    if problem is not None:
        message = (problem.get("message") or problem.text or "").strip().splitlines()
        message = message[0][:200] if message else ""
    cases.append({"test": case.get("name"), "status": status, "seconds": float(case.get("time") or 0), "message": message})

counts = {s: sum(c["status"] == s for c in cases) for s in ("passed", "failed", "skipped")}
(out / "full-suite.json").write_text(json.dumps({"counts": counts, "total": len(cases), "cases": cases}, indent=2) + "\n")

lines = [
    "# Upstream integration suite (FRE-263)",
    "",
    f"{counts['passed']} passed, {counts['failed']} failed, {counts['skipped']} skipped, of {len(cases)} tests.",
    "",
    "| Test | Status | Seconds | First line of failure |",
    "|---|---|---|---|",
]
for c in sorted(cases, key=lambda c: (c["status"] != "failed", c["test"])):
    if c["status"] == "failed":
        lines.append(f"| {c['test']} | failed | {c['seconds']:.1f} | {c['message'].replace('|', '/')} |")
(out / "full-suite.md").write_text("\n".join(lines) + "\n")
print(json.dumps(counts))
