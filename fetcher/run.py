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
from fetcher import learned as learning
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


def observe_frequencies(
    council: dict, learned: dict, previous: list[dict], collections: list, today: date, holidays: list[str] | None
) -> tuple[str, ...]:
    """Records what this fetch shows about how often each bin is emptied. Returns a marker for each conflict."""
    conflicts: list[str] = []
    for bin_name in sorted({c.bin_name for c in collections}):
        if not learning.needs_learning(council, bin_name):
            continue
        before = [date.fromisoformat(p["date"]) for p in previous if p["bin_name"] == bin_name]
        if not before:
            continue
        newest = min(date.fromisoformat(c.date) for c in collections if c.bin_name == bin_name)
        weeks = learning.observed_weeks(max(before), newest, today, holidays)
        if weeks is not None and learning.record(learned, council["ons_code"], bin_name, weeks):
            conflicts.append(learning.CONFLICT)
    return tuple(conflicts)


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
    learned: dict | None = None,
) -> list[Outcome]:
    """`learned` is the tally of frequencies learned so far (fetcher/learned.py). It is updated in place."""
    learned = learned if learned is not None else {"bins": {}}
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
            holiday_dates = holiday_data.dates_for(address.ons_code, holiday_regions)
            conflicts = observe_frequencies(council, learned, previous, collections, today, holiday_dates)
            with_learned = learning.apply({address.ons_code: council}, learned)[address.ons_code]
            changes = detect_changes(with_learned, previous, collections, today, holiday_dates)
        except FetchError as err:
            store.save_failure(address.uprn, stamp, str(err))
            safe = err.kind if isinstance(err, UpstreamError) else str(err)
            outcomes.append(Outcome(address.uprn, address.ons_code, "failed", str(err), safe))
        else:
            store.save_success(address.uprn, stamp, collections)
            if changes:
                store.save_changes(address.uprn, address.ons_code, stamp, changes)
            detail = f"{len(collections)} collections"
            outcomes.append(Outcome(address.uprn, address.ons_code, "fetched", detail, detail, tuple(c.kind for c in changes) + conflicts))
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
    fetch.add_argument("--learned", type=Path, default=learning.LEARNED_PATH, help="where learned bin frequencies are kept")

    expire = commands.add_parser("expire", help="delete feeds nobody has used for a long time, with their addresses")
    expire.add_argument("--sheet", action="store_true", required=True)
    expire.add_argument("--days", type=int, default=365)

    args = parser.parse_args(argv)
    try:
        store = SheetStore.from_env() if args.sheet else FileStore(args.store)
    except StoreError as err:
        print(err, file=sys.stderr)
        return 2
    if args.command == "expire":
        try:
            feeds, addresses, messages = store.expire_feeds(args.days)
        except StoreError as err:
            if "unknown action" in str(err):  # an older script: nothing to expire with until it is redeployed
                print(json.dumps({"expire": "not available until the script is redeployed"}))
                return 0
            raise
        print(json.dumps({"expired_feeds": feeds, "addresses_deleted": addresses, "messages_deleted": messages, "days": args.days}))
        return 0
    if args.command == "add":
        store.add_address(Address(uprn=args.uprn, ons_code=args.ons, postcode=args.postcode, house_number=args.house_number))
        return 0

    learned = learning.load(args.learned)
    before = json.dumps(learned, sort_keys=True)
    outcomes = run(
        store,
        registry.load(),
        datetime.now(UTC),
        selenium_url=args.selenium_url,
        force=args.force,
        only_uprn=args.uprn,
        learned=learned,
    )
    if json.dumps(learned, sort_keys=True) != before:
        learning.save(learned, args.learned)
    for outcome in outcomes:
        print(json.dumps(format_outcome(outcome)))
    counts = {s: sum(o.status == s for o in outcomes) for s in ("fetched", "failed", "skipped")}
    kinds = [kind for o in outcomes for kind in o.changes]
    print(json.dumps({"summary": counts, "changes": {k: kinds.count(k) for k in sorted(set(kinds))}}))
    return 1 if any(o.status == "failed" for o in outcomes) else 0


if __name__ == "__main__":
    sys.exit(main())
