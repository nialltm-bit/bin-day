"""Runs one UKBinCollectionData council module, once.

Imports the upstream package lazily so the rest of the fetcher and its tests don't need it installed.
There are no retry loops here: one call per fetch.
"""
import json
import signal
import sys
from pathlib import Path

from fetcher.model import Address, FetchError, UpstreamError

OVERRIDES_DIR = Path(__file__).resolve().parent / "overrides"
TIMEOUT_SECONDS = 180


class _Timeout(Exception):
    pass


def build_args(council: dict, address: Address, selenium_url: str | None) -> list[str]:
    source = council["source"]
    args = [source["module"], source["url"]]
    values = {"uprn": address.uprn, "postcode": address.postcode, "house_number": address.house_number}
    flags = {"uprn": "-u", "postcode": "-p", "house_number": "-n"}
    for name in council["inputs"]:
        if not values[name]:
            raise FetchError(f"{council['name']} needs {name}, but the address has none")
        args.append(f"{flags[name]}={values[name]}")
    if council.get("needs_selenium"):
        if not selenium_url:
            raise FetchError(f"{council['name']} needs Selenium, but no Selenium URL was given")
        args.append(f"-w={selenium_url}")
    if source.get("skip_get_url"):
        args.append("-s")
    return args


def run_ukbcd(council: dict, address: Address, selenium_url: str | None = None, overrides_dir: Path = OVERRIDES_DIR) -> dict:
    """Calls the council's module through the library interface and returns upstream's parsed JSON."""
    args = build_args(council, address, selenium_url)
    if str(overrides_dir) not in sys.path:
        sys.path.insert(0, str(overrides_dir))  # a same-named module here wins over upstream's
    from uk_bin_collection.uk_bin_collection.collect_data import UKBinCollectionApp

    def on_alarm(signum, frame):
        raise _Timeout(f"no result after {TIMEOUT_SECONDS}s")

    previous = signal.signal(signal.SIGALRM, on_alarm)
    signal.alarm(TIMEOUT_SECONDS)
    try:
        app = UKBinCollectionApp()
        app.set_args(args)
        return json.loads(app.run())
    except (Exception, SystemExit) as err:  # upstream modules raise anything; argparse raises SystemExit
        raise UpstreamError(type(err).__name__, str(err)[:300]) from err
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, previous)
