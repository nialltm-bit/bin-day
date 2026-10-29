"""Feeds frequency learning from each council's public test address, so it doesn't have to wait for subscribers.

Learning (fetcher/learned.py) needs the same address fetched in two consecutive weeks. Until someone subscribes in a
`next_only` council there is nothing to compare, and the learned file stays empty. So the weekly run also fetches each such
council's `test_address` from the registry: one call per council, on the same Sunday slot as a subscribed address, and only
while some bin of that council still has no frequency. These are upstream's public test addresses, never a user's.

What it remembers between runs is the next date seen for each bin, in `registry/test-address-observations.json`. That file
is public and holds council codes, the council's own bin names and dates for a public address: nothing private.
"""
import json
import os
from datetime import date, datetime
from pathlib import Path

from fetcher import holidays as holiday_data
from fetcher import learned as learning
from fetcher import registry
from fetcher.model import Address, FetchError, UpstreamError
from fetcher.normalise import normalise
from fetcher.ratelimit import DEFAULT_MIN_INTERVAL, CouncilRateLimiter
from fetcher.run import Outcome, observe_frequencies
from fetcher.schedule import is_due
from fetcher.upstream import run_ukbcd

STATE_PATH = Path(__file__).resolve().parent.parent / "registry" / "test-address-observations.json"


def load(path: Path = STATE_PATH) -> dict:
    if not Path(path).exists():
        return {"councils": {}}
    data = json.loads(Path(path).read_text())
    data.setdefault("councils", {})
    return data


def save(data: dict, path: Path = STATE_PATH) -> None:
    tmp = Path(path).with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")
    os.replace(tmp, path)


def still_learning(council: dict, learned: dict) -> bool:
    """True if some bin of this council has no frequency, from the registry or learned."""
    done = learned["bins"].get(council["ons_code"], {})
    return any(learning.needs_learning(council, name) and "weeks" not in done.get(name, {}) for name in council.get("bin_types", {}))


def test_address_of(council: dict) -> Address:
    test = council["test_address"]
    return Address(
        uprn=test.get("uprn", "0"),
        ons_code=council["ons_code"],
        postcode=test.get("postcode"),
        house_number=test.get("house_number"),
    )


def run_test_addresses(
    councils: dict[str, dict],
    now: datetime,
    state: dict,
    learned: dict,
    fetch=run_ukbcd,
    limiter: CouncilRateLimiter | None = None,
    selenium_url: str | None = None,
    force: bool = False,
    holiday_regions: dict[str, dict] | None = None,
) -> list[Outcome]:
    """Updates `state` and `learned` in place. Returns one outcome per council tried."""
    limiter = limiter or CouncilRateLimiter()
    holiday_regions = holiday_data.load() if holiday_regions is None else holiday_regions
    stamp = now.isoformat(timespec="seconds")
    today: date = now.date()
    outcomes: list[Outcome] = []
    for ons_code in sorted(councils):
        council = councils[ons_code]
        if not registry.is_fetchable(council) or council.get("schedule") != "next_only" or "test_address" not in council:
            continue
        if not still_learning(council, learned):
            continue
        remembered = state["councils"].setdefault(ons_code, {})
        if not force and not is_due(ons_code, remembered.get("last_attempt"), today, "next_only"):
            outcomes.append(Outcome("test", ons_code, "skipped", "not due", "not due"))
            continue
        limiter.wait(ons_code, council.get("min_interval_seconds", DEFAULT_MIN_INTERVAL))
        remembered["last_attempt"] = stamp
        try:
            collections = normalise(council, fetch(council, test_address_of(council), selenium_url))
        except FetchError as err:
            remembered["last_error"] = err.kind if isinstance(err, UpstreamError) else type(err).__name__
            outcomes.append(Outcome("test", ons_code, "failed", str(err), remembered["last_error"]))
            continue
        remembered.pop("last_error", None)
        previous = [{"bin_name": name, "date": day} for name, day in remembered.get("next", {}).items()]
        holiday_dates = holiday_data.dates_for(ons_code, holiday_regions)
        conflicts = observe_frequencies(council, learned, previous, collections, today, holiday_dates)
        nxt: dict[str, str] = {}
        for c in collections:
            nxt[c.bin_name] = min(c.date, nxt.get(c.bin_name, c.date))
        remembered["next"] = nxt
        detail = f"{len(collections)} collections"
        outcomes.append(Outcome("test", ons_code, "fetched", detail, detail, conflicts))
    return outcomes
