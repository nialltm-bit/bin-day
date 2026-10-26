"""Shared types for the fetcher."""
from dataclasses import dataclass


class FetchError(Exception):
    """A fetch that must be recorded as a failure, not shown to people."""


class UnmappedBinError(FetchError):
    """The council returned a bin name that the registry has no stream for."""


@dataclass(frozen=True)
class Address:
    uprn: str
    ons_code: str
    postcode: str | None = None
    house_number: str | None = None


@dataclass(frozen=True)
class Collection:
    date: str  # ISO date, YYYY-MM-DD
    bin_name: str  # the council's own name
    stream: str  # general, recycling, food or garden
