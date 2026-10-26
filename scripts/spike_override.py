"""FRE-263 spike: prove one upstream council scraper can be replaced by our own module.

UKBinCollectionApp imports council modules by name and appends upstream's councils directory
to sys.path, so a module of the same name earlier on sys.path wins. One B&NES request.
Usage: spike_override.py <output dir>
"""
import json
import sys
from pathlib import Path

OVERRIDES = Path(__file__).parent / "overrides"
sys.path.insert(0, str(OVERRIDES))

from uk_bin_collection.uk_bin_collection.collect_data import UKBinCollectionApp  # noqa: E402

result = {"council": "BathAndNorthEastSomersetCouncil", "uprn": "100120000855"}
try:
    app = UKBinCollectionApp()
    app.set_args(
        [
            result["council"],
            "https://www.bathnes.gov.uk/webforms/waste/collectionday/",
            f"-u={result['uprn']}",
            "-s",
        ]
    )
    data = json.loads(app.run())
    result["override_used"] = data.get("source") == "bin-day-override"
    result["bins_returned"] = len(data.get("bins", []))
    result["worked"] = result["override_used"] and result["bins_returned"] > 0
except BaseException as err:
    result["worked"] = False
    result["error"] = f"{type(err).__name__}: {str(err)[:300]}"

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
(out / "override.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result))
