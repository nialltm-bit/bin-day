# ruff: noqa: E501
"""Do homes on the same postcode share a bin schedule? Measure it in one UPRN council (FRE-298, phase 0, step 2).

For one council it takes the random postcodes drawn from the ONS UPRN Directory (postcode_sample.py), runs the council's real
UKBinCollectionData scraper for every UPRN on each postcode (up to 40), and compares each home's next collection date for the
general, recycling and food streams. Garden waste is ignored. The scraper is called, and its answer mapped to streams, with the
same code the live fetcher uses (fetcher/upstream.py and fetcher/normalise.py), at the same per-council rate limit.

A postcode *agrees* when no two homes have the same stream on different dates. A home that lacks a stream is not a conflict. Only
postcodes where at least two homes returned dates can be compared; the rest are counted apart. A home is *off the majority* when,
for some stream, its date is not the most common date on the postcode (a tie goes to the earlier date).

Some UPRNs on a postcode are not homes (garages, phone boxes). ONSUD cannot tell them apart, so they are looked up like any other
and what comes back (nothing, or an error) is counted. There are no retries: one call per UPRN.

Usage: postcode_agreement.py <config json> <samples json> <upstream input.json> <module> <output json>
         [--selenium-url URL] [--target-postcodes N] [--max-lookups N] [--max-minutes N]
The output and logs are public: counts, timings, error kinds, outcodes and bin names. Never a postcode, a UPRN or an upstream
error message (those can contain the address).
"""
import argparse
import json
import math
import sys
import time
from collections import Counter
from datetime import UTC, date, datetime

from fetcher import registry, streams
from fetcher.model import Address, FetchError, UnmappedBinError, UpstreamError
from fetcher.normalise import normalise
from fetcher.ratelimit import DEFAULT_MIN_INTERVAL, CouncilRateLimiter
from fetcher.upstream import run_ukbcd

COMPARED = ("general", "recycling", "food")  # garden waste is opt-in and paid, so it is left out
MAX_CONSECUTIVE_ERRORS = 15  # a council that fails this many in a row is blocking us or broken: stop asking
SIZE_BUCKETS = (("2-9 UPRNs", 2, 9), ("10-24 UPRNs", 10, 24), ("25+ UPRNs", 25, 10_000))


def wilson(successes: int, total: int, z: float = 1.96) -> tuple[float, float]:
    """95% confidence interval for a share (Wilson score): how far a sample of this size can be trusted."""
    if total == 0:
        return (0.0, 0.0)
    p = successes / total
    denominator = 1 + z * z / total
    centre = (p + z * z / (2 * total)) / denominator
    half = z * math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denominator
    return (max(0.0, centre - half), min(1.0, centre + half))


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    return ordered[min(len(ordered), max(1, math.ceil(fraction * len(ordered)))) - 1] if ordered else 0.0


def next_dates(collections: list, today: date) -> dict[str, str]:
    """The earliest date from today on for each compared stream, as ISO dates. A stream with no future date is left out."""
    found: dict[str, str] = {}
    for item in collections:
        if item.stream in COMPARED and item.date >= today.isoformat() and (item.stream not in found or item.date < found[item.stream]):
            found[item.stream] = item.date
    return found


def compare_postcode(homes: list[dict[str, str]]) -> dict:
    """Compares homes' next dates per stream. `homes` has one {stream: date} for each home that has at least one compared stream."""
    off: set[int] = set()
    kinds: set[str] = set()
    disagreeing: list[str] = []
    tied = False
    for stream in COMPARED:
        dates = [home[stream] for home in homes if stream in home]
        counts = Counter(dates)
        if len(counts) <= 1:
            continue
        disagreeing.append(stream)
        top = max(counts.values())
        leaders = sorted(d for d, n in counts.items() if n == top)
        tied = tied or len(leaders) > 1
        majority = leaders[0]
        for index, home in enumerate(homes):
            if stream in home and home[stream] != majority:
                off.add(index)
        for other in counts:
            if other != majority:
                same_weekday = date.fromisoformat(other).weekday() == date.fromisoformat(majority).weekday()
                kinds.add("other_week" if same_weekday else "different_weekday")
    return {"agree": not disagreeing, "off_majority": len(off), "kinds": sorted(kinds), "streams": disagreeing, "tied": tied}


def classify_error(err: Exception) -> str:
    """A short, address-free label for why a lookup gave nothing."""
    if isinstance(err, UnmappedBinError):
        return "unmapped_bin_name"
    if isinstance(err, UpstreamError):
        return f"upstream:{err.kind}"
    if isinstance(err, FetchError):
        return "empty" if "no collections" in str(err) else "odd_response"
    return f"other:{type(err).__name__}"


def drop_unmapped_bins(council: dict, response: object) -> tuple[object, list[str]]:
    """Takes out bins whose name maps to no stream ("Collect Mattress"), so one odd bin does not lose the whole home.

    The live fetcher fails the fetch on such a name, on purpose. Here only the compared streams matter, so the names are
    counted and reported instead.
    """
    if not isinstance(response, dict) or not isinstance(response.get("bins"), list):
        return response, []
    kept, dropped = [], []
    for item in response["bins"]:
        name = str(item.get("type")) if isinstance(item, dict) else None
        if name and not registry.stream_for(council, name) and not streams.stream_for(name) and not streams.is_ignored(name):
            dropped.append(name)
        else:
            kept.append(item)
    return {**response, "bins": kept}, dropped


def lookup(council: dict, address: Address, selenium_url: str | None, limiter: CouncilRateLimiter, interval: float) -> dict:
    limiter.wait(council["ons_code"], interval)
    started = time.monotonic()
    result: dict = {"outcome": "dates", "collections": [], "unmapped": []}
    try:
        response, result["unmapped"] = drop_unmapped_bins(council, run_ukbcd(council, address, selenium_url))
        result["collections"] = normalise(council, response)
    except Exception as err:  # the fetcher's errors, or anything a scraper raises that it did not wrap
        result["outcome"] = classify_error(err)
    result["seconds"] = time.monotonic() - started
    return result


def council_from_input(config: dict, entry: dict) -> dict:
    """The registry-shaped description run_ukbcd needs, built from upstream's own test input (url, whether a postcode is passed)."""
    inputs = ["uprn"] + (["postcode"] if entry.get("postcode") else [])
    return {
        "ons_code": config["ons_codes"][0],
        "name": config["name"],
        "source": {"type": "ukbcd", "module": config["module"], "url": entry["url"], "skip_get_url": entry.get("skip_get_url") is True},
        "inputs": inputs,
        "needs_selenium": config["needs_selenium"],
    }


def check_postcode(council: dict, sample: dict, selenium_url: str | None, limiter: CouncilRateLimiter, interval: float, stats: dict) -> dict:
    homes, outcomes = [], Counter()
    for uprn in sample["uprns"]:
        result = lookup(council, Address(uprn=str(uprn), ons_code=council["ons_code"], postcode=sample["postcode"]), selenium_url, limiter, interval)
        outcomes[result["outcome"]] += 1
        stats["seconds"].append(result["seconds"])
        stats["unmapped"].update(result["unmapped"])
        if result["outcome"] == "dates":
            streams = next_dates(result["collections"], datetime.now(UTC).date())
            if streams:
                homes.append(streams)
            else:
                outcomes["dates_but_no_compared_stream"] += 1
        stats["outcomes"][result["outcome"]] += 1
        stats["consecutive_errors"] = 0 if result["outcome"] in ("dates", "empty") else stats["consecutive_errors"] + 1
        if stats["consecutive_errors"] >= MAX_CONSECUTIVE_ERRORS:
            break
    record = {
        "outcode": sample["postcode"].split(" ")[0],
        "uprns_total": sample["total"],
        "looked_up": sum(outcomes.values()) - outcomes["dates_but_no_compared_stream"],
        "homes_with_dates": len(homes),
        "comparable": len(homes) >= 2,
    }
    if record["comparable"]:
        record.update(compare_postcode(homes))
    return record


def bucket_of(total: int) -> str:
    return next(name for name, low, high in SIZE_BUCKETS if low <= total <= high)


def summarise(config: dict, drawn: dict, records: list[dict], stats: dict, stopped: str, started_at: str) -> dict:
    comparable = [r for r in records if r["comparable"]]
    agreeing = [r for r in comparable if r["agree"]]
    homes = sum(r["homes_with_dates"] for r in comparable)
    off = sum(r["off_majority"] for r in comparable)
    low, high = wilson(len(agreeing), len(comparable))
    seconds = stats["seconds"]
    lookups = sum(stats["outcomes"].values())
    return {
        "module": config["module"],
        "name": config["name"],
        "platform": config["platform"],
        "control": bool(config.get("control")),
        "ons_codes": config["ons_codes"],
        "started_at": started_at,
        "finished_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "stopped_because": stopped,
        "postcodes_in_council": drawn["postcodes_in_council"],
        "postcodes_with_one_uprn": drawn["postcodes_with_one_uprn"],
        "postcodes_checked": len(records),
        "postcodes_comparable": len(comparable),
        "postcodes_agreeing": len(agreeing),
        "agreeing_share": round(len(agreeing) / len(comparable), 4) if comparable else None,
        "agreeing_share_95pc_range": [round(low, 4), round(high, 4)] if comparable else None,
        "postcodes_not_comparable": len(records) - len(comparable),
        "postcodes_ties_for_majority": sum(r.get("tied", False) for r in comparable),
        "homes_compared": homes,
        "homes_off_majority": off,
        "homes_off_majority_share": round(off / homes, 4) if homes else None,
        "disagreeing_postcodes_by_kind": dict(Counter(k for r in comparable if not r["agree"] for k in r["kinds"])),
        "disagreeing_postcodes_by_stream": dict(Counter(s for r in comparable if not r["agree"] for s in r["streams"])),
        "by_postcode_size": {
            name: {
                "comparable": sum(1 for r in comparable if bucket_of(r["uprns_total"]) == name),
                "agreeing": sum(1 for r in agreeing if bucket_of(r["uprns_total"]) == name),
            }
            for name, _, _ in SIZE_BUCKETS
        },
        "lookups": lookups,
        "lookup_outcomes": dict(stats["outcomes"]),
        "lookups_giving_dates_share": round(stats["outcomes"]["dates"] / lookups, 4) if lookups else None,
        "seconds_per_lookup": {
            "mean": round(sum(seconds) / len(seconds), 2) if seconds else 0,
            "median": round(percentile(seconds, 0.5), 2),
            "p95": round(percentile(seconds, 0.95), 2),
            "max": round(max(seconds), 2) if seconds else 0,
        },
        "unmapped_bin_names": dict(stats["unmapped"]),
        "postcodes": [{k: v for k, v in r.items() if k != "streams"} for r in records],  # outcodes only, never a full postcode
    }


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("config")
    parser.add_argument("samples")
    parser.add_argument("inputs")
    parser.add_argument("module")
    parser.add_argument("output")
    parser.add_argument("--selenium-url")
    parser.add_argument("--target-postcodes", type=int, default=50)
    parser.add_argument("--max-lookups", type=int)
    parser.add_argument("--max-minutes", type=float, default=330)
    args = parser.parse_args(argv)

    config = next(c for c in json.load(open(args.config))["councils"] if c["module"] == args.module)
    drawn = json.load(open(args.samples))["councils"][args.module]
    council = council_from_input(config, json.load(open(args.inputs))[args.module])
    ceiling = args.max_lookups or config["max_lookups"]
    interval = float(config.get("min_interval_seconds", DEFAULT_MIN_INTERVAL))
    limiter = CouncilRateLimiter()
    started_at = datetime.now(UTC).isoformat(timespec="seconds")
    deadline = time.monotonic() + args.max_minutes * 60
    stats: dict = {"seconds": [], "outcomes": Counter(), "unmapped": Counter(), "consecutive_errors": 0}
    records: list[dict] = []
    stopped = "ran out of drawn postcodes"
    print(f"{args.module}: {len(drawn['postcodes'])} postcodes drawn, aiming for {args.target_postcodes} comparable, at most {ceiling} lookups")

    for sample in drawn["postcodes"]:
        done = sum(stats["outcomes"].values())
        slowest = max(stats["seconds"], default=60.0)
        if sum(r["comparable"] for r in records) >= args.target_postcodes:
            stopped = "reached the target number of postcodes"
            break
        if done + len(sample["uprns"]) > ceiling:
            stopped = "reached the limit on lookups"
            break
        if time.monotonic() + len(sample["uprns"]) * max(interval, slowest) > deadline:
            stopped = "ran out of time"
            break
        records.append(check_postcode(council, sample, args.selenium_url, limiter, interval, stats))
        r = records[-1]
        print(f"postcode {len(records)}: {r['looked_up']} lookups, {r['homes_with_dates']} with dates, agree={r.get('agree')} | total lookups {done + r['looked_up']}")
        with open(args.output, "w") as out:  # saved as we go, so a long run keeps its progress
            json.dump(summarise(config, drawn, records, stats, "still running", started_at), out, indent=1)
        if stats["consecutive_errors"] >= MAX_CONSECUTIVE_ERRORS:
            stopped = f"stopped after {MAX_CONSECUTIVE_ERRORS} failed lookups in a row (blocked or broken)"
            break

    summary = summarise(config, drawn, records, stats, stopped, started_at)
    with open(args.output, "w") as out:
        json.dump(summary, out, indent=1)
    print(json.dumps({k: v for k, v in summary.items() if k != "postcodes"}, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
