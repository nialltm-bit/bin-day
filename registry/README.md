# Council registry

`councils.json` says, for each council, how we get its collection data. Adding a council is a data change: add an entry, run the check, open a pull request. No code changes.

## Fields

| Field | Meaning |
|---|---|
| `ons_code` | ONS authority code, for example `E06000022`. This is the key. |
| `name` | Council name. |
| `status` | `supported` (the fetcher calls it), `broken` (we have a source but it is failing, so the fetcher skips it) or `unsupported` (no source yet, so people join the waitlist). |
| `source.type` | `ukbcd` (a UKBinCollectionData module), `api` (an official API) or `ical` (a published iCal feed). |
| `source.module` | For `ukbcd`: the module name, for example `BathAndNorthEastSomersetCouncil`. |
| `source.url` | The collection URL (for `ukbcd`, the URL argument the module is given). Must be https. |
| `source.skip_get_url` | For `ukbcd`: pass `-s`, as in upstream's `tests/input.json`. |
| `inputs` | What the source needs: any of `uprn`, `postcode`, `house_number`. |
| `needs_selenium` | `true` if the module drives a browser. Only `ukbcd` sources can. |
| `bin_types` | Maps each of the council's own bin names to a waste `stream` (`general`, `recycling`, `food`, `garden`) with an optional `label` and `colour` to show people. |
| `test_address` | A known-good address (every required input) for health checks. |
| `min_interval_seconds` | Minimum gap between our requests to this council. Optional; the fetcher defaults to 10 seconds. |
| `last_verified` | Date the source was last confirmed to work. |
| `notes` | Anything worth knowing. |

Unknown keys are rejected, so typos get caught.

## Adding a council

1. Find its module and test inputs in upstream's `uk_bin_collection/tests/input.json` (we pin `uk_bin_collection` 0.173.5). Check in `docs/spike-ukbincollectiondata.md` whether the council passed the full-suite run.
2. Copy the B&NES entry and change it. Set `needs_selenium` by checking whether the module uses a browser, not by whether `input.json` lists a web driver (some listed councils do not use one).
3. Run the module for the test address and list the bin names it returns. Add each one to `bin_types`. A name that is missing is treated as a failure by the fetcher, so that an unmapped bin never reaches a calendar silently.
4. Run `python -m fetcher.registry`. CI runs the same check.

Streams are limited to four for now. Some councils collect glass or hygiene waste separately, so the list may need to grow (FRE-269).
