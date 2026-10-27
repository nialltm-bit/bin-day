"""The production store: the private Google Sheet behind the Apps Script web app, reached over HTTPS.

Configured with two environment variables, never in the repo:
  BIN_DAY_STORE_URL     the web app's /exec URL
  BIN_DAY_STORE_SECRET  the shared secret (also the FETCHER_SECRET script property)

The secret travels in the request body, because Apps Script can't read request headers. Apps Script answers a
POST with a redirect to the response, which urllib follows with a GET, as Apps Script expects.
"""
import json
import os
import urllib.request
from collections.abc import Callable
from dataclasses import asdict

from fetcher.changes import Change
from fetcher.model import Address, Collection

TIMEOUT_SECONDS = 60

Post = Callable[[str, dict], dict]


class StoreError(Exception):
    pass


def http_post(url: str, payload: dict) -> dict:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "text/plain;charset=utf-8"},  # a plain-text body avoids a CORS preflight
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return json.loads(response.read())
    except Exception as err:  # never include the payload (it holds the secret) in the message
        raise StoreError(f"store request failed: {type(err).__name__}") from err


class SheetStore:
    def __init__(self, url: str, secret: str, post: Post = http_post):
        if not url or not secret:
            raise StoreError("the store URL and secret are both required")
        self._url = url
        self._secret = secret
        self._post = post
        self._last_attempts: dict[str, str | None] = {}

    @classmethod
    def from_env(cls, environ: dict[str, str] | None = None) -> "SheetStore":
        environ = os.environ if environ is None else environ
        return cls(environ.get("BIN_DAY_STORE_URL", ""), environ.get("BIN_DAY_STORE_SECRET", ""))

    def _call(self, action: str, **fields: object) -> dict:
        reply = self._post(self._url, {"secret": self._secret, "action": action, **fields})
        if not isinstance(reply, dict) or not reply.get("ok"):
            error = reply.get("error", "unknown error") if isinstance(reply, dict) else "unexpected reply"
            raise StoreError(f"{action} failed: {error}")
        return reply

    def add_address(self, address: Address) -> None:
        fields = {"uprn": address.uprn, "ons_code": address.ons_code}
        if address.postcode:
            fields["postcode"] = address.postcode
        if address.house_number:
            fields["house_number"] = address.house_number
        self._call("add_address", **fields)

    def addresses(self) -> list[Address]:
        reply = self._call("addresses")
        self._last_attempts = {a["uprn"]: a.get("last_attempt") for a in reply["addresses"]}
        return [
            Address(
                uprn=a["uprn"],
                ons_code=a["ons_code"],
                postcode=a.get("postcode"),
                house_number=a.get("house_number"),
            )
            for a in reply["addresses"]
        ]

    def last_attempt(self, uprn: str) -> str | None:
        return self._last_attempts.get(uprn)

    def save_success(self, uprn: str, now: str, collections: list[Collection]) -> None:
        rows = [{"date": c.date, "bin_name": c.bin_name, "stream": c.stream} for c in collections]
        self._call("save_success", uprn=uprn, now=now, collections=rows)

    def save_failure(self, uprn: str, now: str, error: str) -> None:
        self._call("save_failure", uprn=uprn, now=now, error=error[:500])

    def previous_collections(self, uprn: str) -> list[dict]:
        """The collections stored at the last fetch. An older script that doesn't know `get_result` gives none, so
        fetching carries on without change detection until the script is redeployed."""
        try:
            result = self._call("get_result", uprn=uprn).get("result")
        except StoreError as err:
            if "unknown action" in str(err):
                return []
            raise
        return list(result["collections"]) if result else []

    def save_changes(self, uprn: str, ons_code: str, now: str, changes: list[Change]) -> None:
        rows = [{**asdict(change), "note": change.note[:300]} for change in changes]
        self._call("save_changes", uprn=uprn, ons_code=ons_code, now=now, changes=rows)
