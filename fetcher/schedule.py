"""Which addresses are due for a fetch today, from the council's `schedule` in the registry.

- `full` councils return a whole schedule, so each address is fetched once a week. Each address gets a fixed
  weekday slot from its UPRN, which spreads addresses evenly across the week.
- `next_only` councils (B&NES is one) return only the next date for each bin, so each address is fetched once a day
  to keep that date from going stale.

Either way an address is fetched at most once per run, and a failed attempt counts, so a failing council is not
retried until the next day (or slot).
"""
import zlib
from datetime import date, datetime, timedelta

DEFAULT_MIN_DAYS = 6  # a weekly slot comes round every 7 days; 6 allows for a run being a day late


def slot(uprn: str) -> int:
    """A stable weekday number, 0 (Monday) to 6 (Sunday), for this UPRN."""
    return zlib.crc32(uprn.encode()) % 7


def _last_date(last_attempt: str) -> date:
    return datetime.fromisoformat(last_attempt).date()


def is_due(uprn: str, last_attempt: str | None, today: date, schedule: str = "full", min_days: int = DEFAULT_MIN_DAYS) -> bool:
    """True if this address should be fetched today.

    `last_attempt` is when we last tried, successfully or not (None if never).
    """
    if last_attempt is None:
        return True
    last = _last_date(last_attempt)
    if schedule == "next_only":
        return last < today
    if today - last < timedelta(days=min_days):
        return False
    return today.weekday() == slot(uprn) or today - last > timedelta(days=7)
