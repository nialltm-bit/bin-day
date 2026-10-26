import json
from datetime import UTC, datetime

import pytest

from fetcher import registry
from fetcher.model import Address, Collection
from fetcher.ratelimit import CouncilRateLimiter
from fetcher.run import main, run
from fetcher.sheet_store import SheetStore, StoreError, http_post

URL = "https://script.google.com/macros/s/EXAMPLE/exec"
SECRET = "s3cret-value"
NOW = datetime(2026, 10, 26, 12, 0, tzinfo=UTC)


class FakeService:
    """Stands in for the Apps Script web app, recording every request."""

    def __init__(self, replies=None):
        self.requests: list[tuple[str, dict]] = []
        self.replies = replies or {}

    def __call__(self, url, payload):
        self.requests.append((url, payload))
        return self.replies.get(payload["action"], {"ok": True})


def store_with(service):
    return SheetStore(URL, SECRET, post=service)


def test_every_request_carries_the_secret_to_the_configured_url():
    service = FakeService({"addresses": {"ok": True, "addresses": []}})
    store = store_with(service)
    store.addresses()
    store.add_address(Address(uprn="1", ons_code="E06000022"))
    store.save_failure("1", "2026-10-26T12:00:00+00:00", "boom")
    assert [u for u, _ in service.requests] == [URL] * 3
    assert all(p["secret"] == SECRET for _, p in service.requests)


def test_addresses_are_read_with_their_last_attempt():
    service = FakeService(
        {
            "addresses": {
                "ok": True,
                "addresses": [
                    {"uprn": "1", "ons_code": "E06000022", "last_attempt": "2026-10-19T05:00:00+00:00"},
                    {"uprn": "2", "ons_code": "E06000022", "postcode": "BA1 1AA", "house_number": "5", "last_attempt": None},
                ],
            }
        }
    )
    store = store_with(service)
    assert store.addresses() == [
        Address(uprn="1", ons_code="E06000022"),
        Address(uprn="2", ons_code="E06000022", postcode="BA1 1AA", house_number="5"),
    ]
    assert store.last_attempt("1") == "2026-10-19T05:00:00+00:00"
    assert store.last_attempt("2") is None
    assert store.last_attempt("3") is None


def test_save_success_sends_plain_collection_rows():
    service = FakeService()
    store_with(service).save_success("1", "2026-10-26T12:00:00+00:00", [Collection("2026-10-30", "Green Recycling Box", "recycling")])
    _, payload = service.requests[0]
    assert payload["action"] == "save_success"
    assert payload["collections"] == [{"date": "2026-10-30", "bin_name": "Green Recycling Box", "stream": "recycling"}]


def test_add_address_only_sends_the_fields_it_has():
    service = FakeService()
    store_with(service).add_address(Address(uprn="1", ons_code="E06000022"))
    assert service.requests[0][1] == {"secret": SECRET, "action": "add_address", "uprn": "1", "ons_code": "E06000022"}


def test_long_errors_are_trimmed_to_what_the_service_accepts():
    service = FakeService()
    store_with(service).save_failure("1", "2026-10-26T12:00:00+00:00", "x" * 900)
    assert len(service.requests[0][1]["error"]) == 500


def test_a_refusal_from_the_service_is_an_error_without_the_secret():
    service = FakeService({"addresses": {"ok": False, "error": "unauthorised"}})
    with pytest.raises(StoreError, match="addresses failed: unauthorised") as raised:
        store_with(service).addresses()
    assert SECRET not in str(raised.value)


def test_an_unexpected_reply_is_an_error():
    with pytest.raises(StoreError, match="unexpected reply"):
        SheetStore(URL, SECRET, post=lambda url, payload: "oops").addresses()


def test_both_settings_are_required():
    for url, secret in (("", SECRET), (URL, ""), ("", "")):
        with pytest.raises(StoreError):
            SheetStore(url, secret)


def test_from_env_reads_the_two_variables():
    store = SheetStore.from_env({"BIN_DAY_STORE_URL": URL, "BIN_DAY_STORE_SECRET": SECRET})
    assert isinstance(store, SheetStore)
    with pytest.raises(StoreError):
        SheetStore.from_env({})


def test_transport_errors_do_not_leak_the_request(monkeypatch):
    def boom(*args, **kwargs):
        raise OSError(f"connection reset while sending {SECRET}")

    monkeypatch.setattr("fetcher.sheet_store.urllib.request.urlopen", boom)
    with pytest.raises(StoreError) as raised:
        http_post(URL, {"secret": SECRET, "action": "addresses"})
    assert str(raised.value) == "store request failed: OSError"


def test_cli_without_settings_exits_cleanly(monkeypatch, capsys):
    monkeypatch.delenv("BIN_DAY_STORE_URL", raising=False)
    monkeypatch.delenv("BIN_DAY_STORE_SECRET", raising=False)
    assert main(["fetch", "--sheet"]) == 2
    assert "required" in capsys.readouterr().err


def test_a_full_run_against_the_sheet_store_saves_results():
    due = {"uprn": "100120000855", "ons_code": "E06000022", "last_attempt": None}
    service = FakeService({"addresses": {"ok": True, "addresses": [due]}})
    response = {"bins": [{"type": "Food Recycling Collection Bin", "collectionDate": "30/10/2026"}]}
    clock = iter(range(1000))
    limiter = CouncilRateLimiter(lambda: next(clock), lambda s: None)
    outcomes = run(store_with(service), registry.load(), NOW, fetch=lambda *a: response, limiter=limiter)
    assert [o.status for o in outcomes] == ["fetched"]
    saves = [p for _, p in service.requests if p["action"] == "save_success"]
    assert saves[0]["uprn"] == "100120000855"
    assert saves[0]["now"] == "2026-10-26T12:00:00+00:00"
    assert saves[0]["collections"][0]["stream"] == "food"


def test_payloads_are_json_serialisable():
    service = FakeService()
    store_with(service).save_success("1", "2026-10-26T12:00:00+00:00", [Collection("2026-10-30", "Food", "food")])
    json.dumps(service.requests[0][1])
