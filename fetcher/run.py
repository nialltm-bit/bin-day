"""Fetches every address that is due, one request each, politely.

Usage:
  python -m fetcher.run add --store data.json --ons E06000022 --uprn 100120000855
  python -m fetcher.run fetch --store data.json [--selenium-url URL] [--force] [--uprn UPRN]

There are no retry loops: a failed fetch is recorded and the address waits for its next slot.
"""
import argparse
import json
import sys
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path

from fetcher import registry
from fetcher.model import Address, FetchError
from fetcher.normalise import normalise
from fetcher.ratelimit import DEFAULT_MIN_INTERVAL, CouncilRateLimiter
from fetcher.schedule import is_due
from fetcher.store import FileStore, Store
from fetcher.upstream import run_ukbcd


@dataclass(frozen=True)
class Outcome:
    uprn: str
    status: str  # fetched, failed or skipped
    detail: str = ""


def run(
    store: Store,
    councils: dict[str, dict],
    now: datetime,
    fetch: Callable[..., dict] = run_ukbcd,
    limiter: CouncilRateLimiter | None = None,
    selenium_url: str | None = None,
    force: bool = False,
    only_uprn: str | None = None,
) -> list[Outcome]:
    limiter = limiter or CouncilRateLimiter()
    stamp = now.isoformat(timespec="seconds")
    today: date = now.date()
    outcomes: list[Outcome] = []
    for address in store.addresses():
        if only_uprn and address.uprn != only_uprn:
            continue
        council = councils.get(address.ons_code)
        if council is None:
            outcomes.append(Outcome(address.uprn, "skipped", f"no registry entry for {address.ons_code}"))
            continue
        if not registry.is_fetchable(council):
            outcomes.append(Outcome(address.uprn, "skipped", f"{council['name']} is {council['status']}"))
            continue
        if not force and not is_due(address.uprn, store.last_attempt(address.uprn), today):
            outcomes.append(Outcome(address.uprn, "skipped", "not due"))
            continue
        limiter.wait(address.ons_code, council.get("min_interval_seconds", DEFAULT_MIN_INTERVAL))
        try:
            collections = normalise(council, fetch(council, address, selenium_url))
        except FetchError as err:
            store.save_failure(address.uprn, stamp, str(err))
            outcomes.append(Outcome(address.uprn, "failed", str(err)))
        else:
            store.save_success(address.uprn, stamp, collections)
            outcomes.append(Outcome(address.uprn, "fetched", f"{len(collections)} collections"))
    return outcomes


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)

    add = commands.add_parser("add", help="add an address to a file store")
    add.add_argument("--store", type=Path, required=True)
    add.add_argument("--ons", required=True)
    add.add_argument("--uprn", required=True)
    add.add_argument("--postcode")
    add.add_argument("--house-number")

    fetch = commands.add_parser("fetch", help="fetch the addresses that are due")
    fetch.add_argument("--store", type=Path, required=True)
    fetch.add_argument("--selenium-url")
    fetch.add_argument("--force", action="store_true", help="fetch even if not due")
    fetch.add_argument("--uprn", help="only this address")

    args = parser.parse_args(argv)
    store = FileStore(args.store)
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
        print(json.dumps({"uprn": outcome.uprn, "status": outcome.status, "detail": outcome.detail}))
    return 1 if any(o.status == "failed" for o in outcomes) else 0


if __name__ == "__main__":
    sys.exit(main())
