"""Shared types for the fetcher."""
from dataclasses import dataclass


class FetchError(Exception):
    """A fetch that must be recorded as a failure, not shown to people."""


class UpstreamError(FetchError):
    """An exception raised inside an upstream council module.

    Its message can contain request URLs, which include the address, so logs show only `kind`.
    """

    def __init__(self, kind: str, message: str):
        super().__init__(f"{kind}: {message}")
        self.kind = kind


class SuspiciousResultError(FetchError):
    """A response that parses but should not be trusted, such as one with no collection in the next two weeks."""


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
