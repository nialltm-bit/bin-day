"""Bank holidays, from registry/bank-holidays.json (shared with the calendar feed).

Only regions marked `verified` are used. For any other region these functions say "unknown" (None), and callers
must then avoid anything that depends on knowing the holidays.
"""
import json
from datetime import date, timedelta
from pathlib import Path

HOLIDAYS_PATH = Path(__file__).resolve().parent.parent / "registry" / "bank-holidays.json"

# Weeks overlapping 22 December to 13 January are treated as Christmas and New Year: councils revise dates into mid-January.
CHRISTMAS_START = (12, 22)
CHRISTMAS_END = (1, 13)


def region_for(ons_code: str) -> str:
    """England and Wales share bank holidays; S is Scotland and N is Northern Ireland."""
    if ons_code[:1] in ("E", "W"):
        return "england-and-wales"
    return "scotland" if ons_code[:1] == "S" else "northern-ireland"


def load(path: Path = HOLIDAYS_PATH) -> dict[str, dict]:
    return json.loads(Path(path).read_text())["regions"]


def dates_for(ons_code: str, regions: dict[str, dict] | None = None) -> list[str] | None:
    """Bank holiday dates for the council's region, or None if that region is not verified."""
    regions = load() if regions is None else regions
    region = regions.get(region_for(ons_code))
    return list(region["dates"]) if region and region.get("verified") else None


def last_date(ons_code: str, regions: dict[str, dict] | None = None) -> str | None:
    dates = dates_for(ons_code, regions)
    return max(dates) if dates else None


def _monday(day: date) -> date:
    return day - timedelta(days=day.weekday())


def _overlaps_christmas(week_start: date, week_end: date) -> bool:
    for year in (week_start.year - 1, week_start.year):
        start = date(year, *CHRISTMAS_START)
        end = date(year + 1, *CHRISTMAS_END)
        if week_start <= end and week_end >= start:
            return True
    return False


def in_holiday_week(day: date, holidays: list[str]) -> bool:
    """True if the Monday-to-Sunday week containing `day` has a bank holiday or overlaps Christmas and New Year."""
    start = _monday(day)
    end = start + timedelta(days=6)
    return any(start <= date.fromisoformat(h) <= end for h in holidays) or _overlaps_christmas(start, end)
