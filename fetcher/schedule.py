"""Which addresses are due for a fetch today.

Each address gets a fixed weekday slot from its UPRN, which spreads addresses evenly across the week and
means an address is fetched at most once a week by default.
"""
import zlib
from datetime import date, datetime, timedelta

DEFAULT_MIN_DAYS = 6  # a slot comes round every 7 days; 6 allows for a run being a day late


def slot(uprn: str) -> int:
    """A stable weekday number, 0 (Monday) to 6 (Sunday), for this UPRN."""
    return zlib.crc32(uprn.encode()) % 7


def is_due(uprn: str, last_fetched: str | None, today: date, min_days: int = DEFAULT_MIN_DAYS) -> bool:
    """True if today is this address's slot (or it has never been fetched) and it hasn't been fetched recently."""
    if last_fetched is None:
        return True
    last = datetime.fromisoformat(last_fetched).date()
    if today - last < timedelta(days=min_days):
        return False
    return today.weekday() == slot(uprn) or today - last > timedelta(days=7)
