"""Where addresses and their fetched collections live.

FileStore keeps everything in one JSON file. It is for development and tests. In production the store is the
private Google Sheet behind the Apps Script web app, which implements the same methods over HTTP.
"""
import json
import os
from dataclasses import asdict
from pathlib import Path
from typing import Protocol

from fetcher.model import Address, Collection


class Store(Protocol):
    def addresses(self) -> list[Address]: ...

    def last_attempt(self, uprn: str) -> str | None: ...

    def save_success(self, uprn: str, now: str, collections: list[Collection]) -> None: ...

    def save_failure(self, uprn: str, now: str, error: str) -> None: ...


class FileStore:
    def __init__(self, path: Path):
        self.path = Path(path)
        self._data = json.loads(self.path.read_text()) if self.path.exists() else {"addresses": [], "results": {}}

    def _write(self) -> None:
        tmp = self.path.with_suffix(self.path.suffix + ".tmp")
        tmp.write_text(json.dumps(self._data, indent=2, sort_keys=True) + "\n")
        os.replace(tmp, self.path)

    def add_address(self, address: Address) -> None:
        if all(a["uprn"] != address.uprn for a in self._data["addresses"]):
            self._data["addresses"].append({k: v for k, v in asdict(address).items() if v is not None})
            self._write()

    def addresses(self) -> list[Address]:
        return [Address(**a) for a in self._data["addresses"]]

    def result(self, uprn: str) -> dict | None:
        return self._data["results"].get(uprn)

    def last_attempt(self, uprn: str) -> str | None:
        result = self.result(uprn)
        return result["last_attempt"] if result else None

    def save_success(self, uprn: str, now: str, collections: list[Collection]) -> None:
        self._data["results"][uprn] = {
            "fetched_at": now,
            "last_attempt": now,
            "last_error": None,
            "consecutive_failures": 0,
            "collections": [asdict(c) for c in collections],
        }
        self._write()

    def save_failure(self, uprn: str, now: str, error: str) -> None:
        """Keeps the last good collections (with their old fetched_at) so the feed can say it couldn't confirm."""
        previous = self.result(uprn) or {"fetched_at": None, "collections": [], "consecutive_failures": 0}
        self._data["results"][uprn] = {
            "fetched_at": previous["fetched_at"],
            "last_attempt": now,
            "last_error": error,
            "consecutive_failures": previous["consecutive_failures"] + 1,
            "collections": previous["collections"],
        }
        self._write()
