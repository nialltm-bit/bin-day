"""FRE-263 spike: call a sample of councils through UKBinCollectionData's library interface.

One request per council, run one after another with a pause between them, no retries.
Usage: spike_ukbcd.py <upstream tests/input.json> <output dir> [selenium url]
"""
import json
import signal
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from uk_bin_collection.uk_bin_collection.collect_data import UKBinCollectionApp

PLAIN = [
    "BathAndNorthEastSomersetCouncil",
    "AberdeenCityCouncil",
    "AmberValleyBoroughCouncil",
    "BCPCouncil",
    "BarnsleyMBCouncil",
    "BasingstokeCouncil",
    "BlackburnCouncil",
    "BoltonCouncil",
    "BradfordMDC",
    "BuckinghamshireCouncil",
    "CambridgeCityCouncil",
    "CardiffCouncil",
]
SELENIUM = ["BexleyCouncil", "BrightonandHoveCityCouncil", "ArunCouncil"]

PAUSE_SECONDS = 5
TIMEOUT_SECONDS = 180


class Timeout(Exception):
    pass


def on_alarm(signum, frame):
    raise Timeout(f"no result after {TIMEOUT_SECONDS}s")


def record_http_statuses(log):
    """Note every HTTP response's status and host. Observes only; does not retry or alter anything."""
    original = requests.Session.send

    def send(self, request, **kwargs):
        response = original(self, request, **kwargs)
        log.append({"host": requests.utils.urlparse(request.url).netloc, "status": response.status_code})
        return response

    requests.Session.send = send


def build_args(name, entry, selenium_url):
    args = [name, entry["url"]]
    if entry.get("uprn"):
        args.append(f"-u={entry['uprn']}")
    if entry.get("postcode"):
        args.append(f"-p={entry['postcode']}")
    if entry.get("house_number"):
        args.append(f"-n={entry['house_number']}")
    if entry.get("web_driver"):
        args.append(f"-w={selenium_url}")
    if entry.get("skip_get_url") is True:
        args.append("-s")
    return args


def run_one(name, entry, selenium_url, http_log):
    result = {"council": name, "selenium": bool(entry.get("web_driver"))}
    http_log.clear()
    start = time.monotonic()
    signal.alarm(TIMEOUT_SECONDS)
    try:
        app = UKBinCollectionApp()
        app.set_args(build_args(name, entry, selenium_url))
        data = json.loads(app.run())
        bins = data.get("bins", [])
        result["ok"] = bool(bins)
        result["bin_types"] = sorted({b["type"] for b in bins})
        result["collections"] = len(bins)
        if not bins:
            result["error"] = "returned no bins"
    except BaseException as err:  # includes Timeout and SystemExit from argparse
        result["ok"] = False
        result["error"] = f"{type(err).__name__}: {str(err)[:300]}"
    finally:
        signal.alarm(0)
    result["seconds"] = round(time.monotonic() - start, 1)
    result["http"] = list(http_log)
    return result


def markdown(results, meta):
    lines = [
        "# Spike results (FRE-263)",
        "",
        f"Run: {meta['run_at']}, uk_bin_collection {meta['version']}",
        "",
        f"{sum(r['ok'] for r in results)} of {len(results)} councils returned bins.",
        "",
        "| Council | Selenium | OK | Seconds | HTTP statuses | Bin types / error |",
        "|---|---|---|---|---|---|",
    ]
    for r in results:
        statuses = ", ".join(sorted({str(h["status"]) for h in r["http"]})) or "-"
        detail = "; ".join(r["bin_types"]) if r["ok"] else r.get("error", "")
        lines.append(
            f"| {r['council']} | {'yes' if r['selenium'] else 'no'} | {'yes' if r['ok'] else 'no'} "
            f"| {r['seconds']} | {statuses} | {detail.replace('|', '/')} |"
        )
    return "\n".join(lines) + "\n"


def main():
    input_path, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    selenium_url = sys.argv[3] if len(sys.argv) > 3 else "http://localhost:4444"
    inputs = json.loads(input_path.read_text())
    out_dir.mkdir(parents=True, exist_ok=True)

    signal.signal(signal.SIGALRM, on_alarm)
    http_log = []
    record_http_statuses(http_log)

    results = []
    for name in PLAIN + SELENIUM:
        results.append(run_one(name, inputs[name], selenium_url, http_log))
        print(json.dumps({k: results[-1][k] for k in ("council", "ok", "seconds")}), flush=True)
        time.sleep(PAUSE_SECONDS)

    from importlib.metadata import version

    meta = {"run_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "version": version("uk_bin_collection")}
    (out_dir / "results.json").write_text(json.dumps({"meta": meta, "results": results}, indent=2) + "\n")
    (out_dir / "results.md").write_text(markdown(results, meta))


if __name__ == "__main__":
    main()
