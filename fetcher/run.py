"""Fetches every address that is due, one request each, politely.

Usage:
  python -m fetcher.run add --store data.json --ons E06000022 --uprn 100120000855
  python -m fetcher.run fetch --store data.json [--selenium-url URL] [--force] [--uprn UPRN]

Use --sheet instead of --store to use the Google Sheet store (BIN_DAY_STORE_URL and BIN_DAY_STORE_SECRET
environment variables).

There are no retry loops: a failed fetch is recorded and the address waits for its next slot.
"""
import argparse
import json
import sys
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path

from fetcher import holidays as holiday_data
from fetcher import registry
from fetcher.changes import check_response, detect_changes
from fetcher.model import Address, FetchError, UpstreamError
from fetcher.normalise import normalise
from fetcher.ratelimit import DEFAULT_MIN_INTERVAL, CouncilRateLimiter
from fetcher.schedule import is_due
from fetcher.sheet_store import SheetStore, StoreError
from fetcher.store import FileStore, Store
from fetcher.upstream import run_ukbcd


@dataclass(frozen=True)
class Outcome:
    uprn: str
    council: str  # ONS code
    status: str  # fetched, failed or skipped
    detail: str = ""  # may contain address details: for the store only, never for logs
    log_detail: str = ""  # safe to print: this repo, and so its Actions logs, are public
    changes: tuple[str, ...] = ()  # the kind of each change found, for the log (never the dates or the address)


def format_outcome(outcome: Outcome) -> dict:
    """What the command line prints. It never includes the UPRN or anything from an upstream error message."""
    line: dict = {"council": outcome.council, "status": outcome.status, "detail": outcome.log_detail}
    if outcome.changes:
        line["changes"] = {kind: outcome.changes.count(kind) for kind in sorted(set(outcome.changes))}
    return line


def run(
    store: Store,
    councils: dict[str, dict],
    now: datetime,
    fetch: Callable[..., dict] = run_ukbcd,
    limiter: CouncilRateLimiter | None = None,
    selenium_url: str | None = None,
    force: bool = False,
    only_uprn: str | None = None,
    holiday_regions: dict[str, dict] | None = None,
) -> list[Outcome]:
    limiter = limiter or CouncilRateLimiter()
    holiday_regions = holiday_data.load() if holiday_regions is None else holiday_regions
    stamp = now.isoformat(timespec="seconds")
    today: date = now.date()
    outcomes: list[Outcome] = []
    for address in store.addresses():
        if only_uprn and address.uprn != only_uprn:
            continue
        council = councils.get(address.ons_code)
        if council is None:
            detail = f"no registry entry for {address.ons_code}"
            outcomes.append(Outcome(address.uprn, address.ons_code, "skipped", detail, detail))
            continue
        if not registry.is_fetchable(council):
            detail = f"{council['name']} is {council['status']}"
            outcomes.append(Outcome(address.uprn, address.ons_code, "skipped", detail, detail))
            continue
        schedule = council.get("schedule", "full")
        if not force and not is_due(address.uprn, store.last_attempt(address.uprn), today, schedule):
            outcomes.append(Outcome(address.uprn, address.ons_code, "skipped", "not due", "not due"))
            continue
        limiter.wait(address.ons_code, council.get("min_interval_seconds", DEFAULT_MIN_INTERVAL))
        try:
            collections = normalise(council, fetch(council, address, selenium_url))
            previous = store.previous_collections(address.uprn)
            check_response(collections, previous, today)
            changes = detect_changes(council, previous, collections, today, holiday_data.dates_for(address.ons_code, holiday_regions))
        except FetchError as err:
            store.save_failure(address.uprn, stamp, str(err))
            safe = err.kind if isinstance(err, UpstreamError) else str(err)
            outcomes.append(Outcome(address.uprn, address.ons_code, "failed", str(err), safe))
        else:
            store.save_success(address.uprn, stamp, collections)
            if changes:
                store.save_changes(address.uprn, address.ons_code, stamp, changes)
            detail = f"{len(collections)} collections"
            outcomes.append(Outcome(address.uprn, address.ons_code, "fetched", detail, detail, tuple(c.kind for c in changes)))
    return outcomes


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)

    add = commands.add_parser("add", help="add an address to a file store")
    add_store = add.add_mutually_exclusive_group(required=True)
    add_store.add_argument("--store", type=Path)
    add_store.add_argument("--sheet", action="store_true")
    add.add_argument("--ons", required=True)
    add.add_argument("--uprn", required=True)
    add.add_argument("--postcode")
    add.add_argument("--house-number")

    fetch = commands.add_parser("fetch", help="fetch the addresses that are due")
    fetch_store = fetch.add_mutually_exclusive_group(required=True)
    fetch_store.add_argument("--store", type=Path)
    fetch_store.add_argument("--sheet", action="store_true")
    fetch.add_argument("--selenium-url")
    fetch.add_argument("--force", action="store_true", help="fetch even if not due")
    fetch.add_argument("--uprn", help="only this address")

    args = parser.parse_args(argv)
    try:
        store = SheetStore.from_env() if args.sheet else FileStore(args.store)
    except StoreError as err:
        print(err, file=sys.stderr)
        return 2
    if args.command == "add":
        store.add_address(Address(uprn=args.uprn, ons_code=args.ons, postcode=args.postcode, house_number=args.house_number))
        return 0

    outcomes = run(
        store,
        registry.load(),
        datetime.now(UTC),
        selenium_url=args.selenium_url,
        force=args.force,
        only_uprn=args.uprn,
    )
    for outcome in outcomes:
        print(json.dumps(format_outcome(outcome)))
    counts = {s: sum(o.status == s for o in outcomes) for s in ("fetched", "failed", "skipped")}
    kinds = [kind for o in outcomes for kind in o.changes]
    print(json.dumps({"summary": counts, "changes": {k: kinds.count(k) for k in sorted(set(kinds))}}))
    return 1 if any(o.status == "failed" for o in outcomes) else 0


if __name__ == "__main__":
    sys.exit(main())
