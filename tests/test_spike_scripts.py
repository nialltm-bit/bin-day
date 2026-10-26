import importlib.util
import sys
import types
from pathlib import Path

# spike_ukbcd.py imports upstream at module level; CI doesn't install it, so stub it.
for name in ("requests", "uk_bin_collection", "uk_bin_collection.uk_bin_collection", "uk_bin_collection.uk_bin_collection.collect_data"):
    sys.modules.setdefault(name, types.ModuleType(name))
sys.modules["uk_bin_collection.uk_bin_collection.collect_data"].UKBinCollectionApp = object

spec = importlib.util.spec_from_file_location("spike_ukbcd", Path(__file__).parent.parent / "scripts" / "spike_ukbcd.py")
spike = importlib.util.module_from_spec(spec)
spec.loader.exec_module(spike)


def test_build_args_uses_uprn_and_skip_flag():
    entry = {"url": "https://example.gov.uk", "uprn": "123", "skip_get_url": True}
    assert spike.build_args("ExampleCouncil", entry, "http://localhost:4444") == [
        "ExampleCouncil",
        "https://example.gov.uk",
        "-u=123",
        "-s",
    ]


def test_build_args_points_selenium_councils_at_the_given_driver():
    entry = {"url": "https://example.gov.uk", "postcode": "AB1 2CD", "web_driver": "http://selenium:4444"}
    assert "-w=http://localhost:4444" in spike.build_args("ExampleCouncil", entry, "http://localhost:4444")


def test_markdown_counts_successes():
    results = [
        {"council": "A", "selenium": False, "ok": True, "seconds": 1.0, "http": [{"host": "h", "status": 200}], "bin_types": ["Food"]},
        {"council": "B", "selenium": False, "ok": False, "seconds": 2.0, "http": [], "error": "boom"},
    ]
    text = spike.markdown(results, {"run_at": "now", "version": "0.173.5"})
    assert "1 of 2 councils returned bins." in text
