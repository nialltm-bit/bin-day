"""Compares a fresh fetch with what we stored, and refuses results that look broken.

Two jobs:

- `check_response` is the "suspicious result" rule (FRE-270). A response that parses but looks wrong is recorded as a
  failure, so the last good data is kept and nothing broken reaches a calendar.
- `detect_changes` finds dates that differ from what we expected and classifies them (FRE-281):
    expected_shift  a move of 1 or 2 days in or beside a bank holiday week or Christmas. Updated silently.
    round_change    a different weekday or a different week pattern. Updated, and recorded so an alert can be raised.

For councils that return only the next date for each bin, "what we expected" is the previous confirmed date stepped
forward by the bin's `every_weeks`. That is exactly how the calendar feed projects dates, so a projected date that is
overruled by a confirmed one is checked here like any other difference.
"""
from dataclasses import dataclass
from datetime import date, timedelta

from fetcher.holidays import in_holiday_week
from fetcher.model import Collection, SuspiciousResultError
from fetcher.registry import every_weeks

SHIFT_DAYS = 2  # the largest move that counts as a holiday shift
NEXT_WINDOW_DAYS = 14  # a fetch must show a collection within this many days
EXPECTED_SHIFT = "expected_shift"
ROUND_CHANGE = "round_change"
# Garden waste is seasonal and optional, so it may legitimately drop out of a response.
SEASONAL_STREAMS = {"garden"}


@dataclass(frozen=True)
class Change:
    bin_name: str
    kind: str  # expected_shift or round_change
    before: str | None  # the date we expected (ISO), or None if a collection appeared
    after: str | None  # the date we got (ISO), or None if a collection disappeared
    note: str


def check_response(new: list[Collection], previous: list[dict], today: date) -> None:
    """Raises SuspiciousResultError if the response should not be trusted. (An empty response is rejected earlier.)"""
    dates = [date.fromisoformat(c.date) for c in new]
    if max(dates) < today:
        raise SuspiciousResultError("every date returned is in the past")
    if min(dates) > today + timedelta(days=NEXT_WINDOW_DAYS):
        raise SuspiciousResultError(f"no collection in the next {NEXT_WINDOW_DAYS} days")
    missing = {c["stream"] for c in previous} - {c.stream for c in new} - SEASONAL_STREAMS
    if missing:
        raise SuspiciousResultError("missing stream(s) that the last fetch had: " + ", ".join(sorted(missing)))


def _classify(before: date, after: date, anchor: date, holidays: list[str] | None) -> tuple[str, str] | None:
    diff = (after - before).days
    if diff == 0:
        return None
    if holidays is not None and abs(diff) <= SHIFT_DAYS and any(in_holiday_week(d, holidays) for d in (before, after, anchor)):
        return EXPECTED_SHIFT, f"moved {diff:+d} day(s) in or beside a bank holiday or Christmas week"
    detail = f"week pattern changed by {diff // 7:+d} week(s)" if diff % 7 == 0 else f"weekday changed from {before:%A} to {after:%A}"
    if holidays is None:
        detail += " (bank holidays are not known for this region, so a holiday shift cannot be ruled out)"
    return ROUND_CHANGE, detail


def _expected_next(anchor: date, weeks: int, today: date) -> date:
    expected = anchor
    while expected < today:
        expected += timedelta(weeks=weeks)
    return expected


def _next_only_changes(council: dict, previous: list[dict], new: list[Collection], today: date, holidays: list[str] | None) -> list[Change]:
    changes: list[Change] = []
    for bin_name in sorted({c.bin_name for c in new}):
        before_dates = [date.fromisoformat(p["date"]) for p in previous if p["bin_name"] == bin_name]
        weeks = every_weeks(council, bin_name)
        if not before_dates or weeks is None:
            continue  # a bin we have not seen before, or one we cannot project, has nothing to compare with
        anchor = max(before_dates)
        after = min(date.fromisoformat(c.date) for c in new if c.bin_name == bin_name)
        before = _expected_next(anchor, weeks, today)
        verdict = _classify(before, after, anchor, holidays)
        if verdict:
            changes.append(Change(bin_name, verdict[0], before.isoformat(), after.isoformat(), verdict[1]))
    return changes


def _full_changes(previous: list[dict], new: list[Collection], today: date, holidays: list[str] | None) -> list[Change]:
    """For a full schedule, compare the dates in the window both fetches cover and pair up the ones that moved."""
    changes: list[Change] = []
    for bin_name in sorted({c.bin_name for c in new}):
        old = {date.fromisoformat(p["date"]) for p in previous if p["bin_name"] == bin_name and date.fromisoformat(p["date"]) >= today}
        fresh = {date.fromisoformat(c.date) for c in new if c.bin_name == bin_name}
        if not old or not fresh:
            continue
        window_end = min(max(old), max(fresh))
        gone = sorted(d for d in old - fresh if d <= window_end)
        appeared = sorted(d for d in fresh - old if d <= window_end)
        while gone and appeared:
            before, after = min(((g, a) for g in gone for a in appeared), key=lambda pair: abs((pair[1] - pair[0]).days))
            gone.remove(before)
            appeared.remove(after)
            verdict = _classify(before, after, before, holidays)
            if verdict:
                changes.append(Change(bin_name, verdict[0], before.isoformat(), after.isoformat(), verdict[1]))
        for before in gone:
            changes.append(Change(bin_name, ROUND_CHANGE, before.isoformat(), None, "a collection we expected is no longer listed"))
        for after in appeared:
            changes.append(Change(bin_name, ROUND_CHANGE, None, after.isoformat(), "a collection we did not expect has appeared"))
    return changes


def detect_changes(council: dict, previous: list[dict], new: list[Collection], today: date, holidays: list[str] | None) -> list[Change]:
    """The differences between this fetch and the last one, classified. Empty if there was no previous fetch."""
    if not previous:
        return []
    if council.get("schedule") == "next_only":
        return _next_only_changes(council, previous, new, today, holidays)
    return _full_changes(previous, new, today, holidays)
