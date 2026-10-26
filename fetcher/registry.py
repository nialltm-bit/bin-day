"""Council registry: which councils we support and how to get each one's collection data.

The data lives in registry/councils.json. Adding a council is a data change: add an entry there and
run `python -m fetcher.registry` to check it. No code change is needed.
"""
import json
import re
import sys
from pathlib import Path

REGISTRY_PATH = Path(__file__).resolve().parent.parent / "registry" / "councils.json"

STATUSES = ("supported", "unsupported", "broken")
SOURCE_TYPES = ("ukbcd", "api", "ical")
INPUTS = ("uprn", "postcode", "house_number")
STREAMS = ("general", "recycling", "food", "garden")

ONS_CODE = re.compile(r"^[ENSW][0-9]{8}$")
MODULE_NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")
DATE = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")

COUNCIL_KEYS = {"ons_code", "name", "status", "source", "inputs", "needs_selenium", "bin_types", "test_address", "last_verified", "notes"}
SOURCE_KEYS = {"type", "module", "url", "skip_get_url"}
BIN_KEYS = {"stream", "label", "colour"}


class RegistryError(ValueError):
    pass


def _is_https_url(value: object) -> bool:
    return isinstance(value, str) and value.startswith("https://") and len(value) > len("https://")


def _check_source(where: str, source: object, problems: list[str]) -> None:
    if not isinstance(source, dict):
        problems.append(f"{where}: source must be an object")
        return
    for key in sorted(set(source) - SOURCE_KEYS):
        problems.append(f"{where}: unknown source key '{key}'")
    source_type = source.get("type")
    if source_type not in SOURCE_TYPES:
        problems.append(f"{where}: source.type must be one of {', '.join(SOURCE_TYPES)}")
        return
    if not _is_https_url(source.get("url")):
        problems.append(f"{where}: source.url must be an https URL")
    if source_type == "ukbcd":
        module = source.get("module")
        if not isinstance(module, str) or not MODULE_NAME.match(module):
            problems.append(f"{where}: ukbcd sources need source.module (the UKBinCollectionData council module name)")
        if "skip_get_url" in source and not isinstance(source["skip_get_url"], bool):
            problems.append(f"{where}: source.skip_get_url must be true or false")


def _check_bin_types(where: str, bin_types: object, problems: list[str]) -> None:
    if not isinstance(bin_types, dict):
        problems.append(f"{where}: bin_types must be an object")
        return
    for name, entry in bin_types.items():
        if not isinstance(entry, dict):
            problems.append(f"{where}: bin_types['{name}'] must be an object")
            continue
        for key in sorted(set(entry) - BIN_KEYS):
            problems.append(f"{where}: bin_types['{name}'] has unknown key '{key}'")
        if entry.get("stream") not in STREAMS:
            problems.append(f"{where}: bin_types['{name}'].stream must be one of {', '.join(STREAMS)}")


def _check_council(index: int, council: object, seen: set[str], problems: list[str]) -> None:
    if not isinstance(council, dict):
        problems.append(f"councils[{index}]: must be an object")
        return
    code = council.get("ons_code")
    where = f"{code}" if isinstance(code, str) else f"councils[{index}]"
    for key in sorted(set(council) - COUNCIL_KEYS):
        problems.append(f"{where}: unknown key '{key}'")
    if not isinstance(code, str) or not ONS_CODE.match(code):
        problems.append(f"{where}: ons_code must look like E06000022")
    elif code in seen:
        problems.append(f"{where}: duplicate ons_code")
    else:
        seen.add(code)
    if not isinstance(council.get("name"), str) or not council["name"].strip():
        problems.append(f"{where}: name is required")
    status = council.get("status")
    if status not in STATUSES:
        problems.append(f"{where}: status must be one of {', '.join(STATUSES)}")
    if "last_verified" in council and not (isinstance(council["last_verified"], str) and DATE.match(council["last_verified"])):
        problems.append(f"{where}: last_verified must be a date like 2026-10-26")
    if "needs_selenium" in council and not isinstance(council["needs_selenium"], bool):
        problems.append(f"{where}: needs_selenium must be true or false")
    inputs = council.get("inputs", [])
    if not isinstance(inputs, list) or any(i not in INPUTS for i in inputs) or len(set(inputs)) != len(inputs):
        problems.append(f"{where}: inputs must be a list of unique values from {', '.join(INPUTS)}")
    if "test_address" in council:
        test_address = council["test_address"]
        if not isinstance(test_address, dict) or any(k not in INPUTS for k in test_address):
            problems.append(f"{where}: test_address keys must be from {', '.join(INPUTS)}")
        elif isinstance(inputs, list) and not set(inputs) <= set(test_address):
            problems.append(f"{where}: test_address must give every required input ({', '.join(inputs)})")
    if "bin_types" in council:
        _check_bin_types(where, council["bin_types"], problems)

    if status in ("supported", "broken"):
        if "source" not in council:
            problems.append(f"{where}: {status} councils need a source")
        else:
            _check_source(where, council["source"], problems)
        if not inputs:
            problems.append(f"{where}: {status} councils need at least one input")
        if "needs_selenium" not in council:
            problems.append(f"{where}: {status} councils must say whether they need Selenium")
    if status == "supported" and not council.get("bin_types"):
        problems.append(f"{where}: supported councils need bin_types")
    if council.get("needs_selenium") is True and isinstance(council.get("source"), dict) and council["source"].get("type") != "ukbcd":
        problems.append(f"{where}: only ukbcd sources can need Selenium")
    if status == "unsupported" and "source" in council:
        problems.append(f"{where}: unsupported councils should not have a source")


def validate(data: object) -> list[str]:
    """Returns a list of problems; empty means the registry is valid."""
    if not isinstance(data, dict) or not isinstance(data.get("councils"), list):
        return ["registry must be an object with a 'councils' list"]
    problems: list[str] = []
    seen: set[str] = set()
    for index, council in enumerate(data["councils"]):
        _check_council(index, council, seen, problems)
    return problems


def load(path: Path = REGISTRY_PATH) -> dict[str, dict]:
    """Loads and validates the registry, returning councils keyed by ONS code."""
    data = json.loads(Path(path).read_text())
    problems = validate(data)
    if problems:
        raise RegistryError("; ".join(problems))
    return {council["ons_code"]: council for council in data["councils"]}


def get_council(registry: dict[str, dict], ons_code: str) -> dict | None:
    return registry.get(ons_code)


def is_fetchable(council: dict) -> bool:
    """True when the fetcher should call this council's source."""
    return council["status"] == "supported"


def stream_for(council: dict, bin_name: str) -> str | None:
    """Maps the council's own bin name to a waste stream, or None if we haven't mapped that name."""
    entry = council.get("bin_types", {}).get(bin_name)
    return entry["stream"] if entry else None


def main() -> int:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else REGISTRY_PATH
    problems = validate(json.loads(path.read_text()))
    if problems:
        print(f"{len(problems)} problem(s) in {path}:")
        for problem in problems:
            print(f"  - {problem}")
        return 1
    print(f"{path}: OK ({len(json.loads(path.read_text())['councils'])} councils)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
