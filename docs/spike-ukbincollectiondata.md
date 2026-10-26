# Spike: UKBinCollectionData (FRE-263)

**Status: partial.** Findings below come from reading the upstream source at commit `0d1b26a` (v0.173.5, 2026-10-17). I could **not** run the API server, the scrapers or the test suite: this session had no Docker daemon, and installing and running the upstream code was blocked. Everything marked "to verify" needs a live run before the recommendation is final.

## Answers so far

**Does the B&NES scraper work today?** To verify live. By reading the code: `BathAndNorthEastSomersetCouncil.py` is a plain HTTP scraper (no Selenium). It needs only a **UPRN** and calls `api.bathnes.gov.uk/.../BartecFeaturesandSchedules/CollectionSummary/{uprn}`, which returns JSON. It takes the `featureDisplayName` of each feature as the bin type. Its test UPRN is `100120000855`. It forces a custom SSL context (`ctx.options |= 0x4`), a sign the council's TLS is quirky.

**How many councils pass the nightly tests?** To verify. Upstream's own `integration_test_results.md` (run 2026-03-28, so about 7 months old) reports 288 of 334 passing after fixes, 46 failing. Most of the failures are Selenium timeouts, 403s or redesigned sites. Check the current CI results before relying on this.

**Which councils need Selenium?** 82 of 353 council modules reference Selenium, and 87 entries in `tests/input.json` take a `web_driver`. The Docker compose file runs a `selenium/standalone-chrome` sidecar. Cost at scale is to be measured. A weekly refresh per address, cached per council and per address, should keep Chrome sessions few, but a headless browser per request is far heavier than an HTTP call.

**Inputs.** From `tests/input.json` (351 entries): UPRN 226, postcode 174, house number 124 (these overlap). Most councils (316) set `skip_get_url`. So UPRN is the common key, but a meaningful minority also need postcode and/or house number. The council registry (FRE-267) must record the inputs per council.

**Response shape and bin names.** The server returns `{"bins": [{"type": ..., "collectionDate": "dd/mm/YYYY"}]}`. `type` is the council's own free text, so names are not normalised. This is why FRE-269 (map onto four waste streams) is needed. To verify with real responses from a sample of councils.

**Pinning and overriding scrapers.** The API server is a thin wrapper (`server.py`) around `UKBinCollectionApp`, so it can be driven as a Python library. Pin by version (`pyproject.toml` is semver, currently 0.173.5) or commit SHA. Overriding one scraper means shipping our own module with the same `CouncilClass` interface and routing that council to it in the registry. To verify by trying it.

## Tentative recommendation

Build on upstream, but treat it as a library behind our own fetch service (FRE-268) rather than exposing its Docker API directly. Pin a version, run the plain HTTP scrapers first (B&NES is one), and defer Selenium councils until we need them. Confirm with a live run before closing this ticket.

## Still to do

1. Run the API server (Docker with the Selenium sidecar, or `pip install` plus `uvicorn server:create_app`) and call B&NES with the test UPRN.
2. Pull current nightly CI results and count passing councils.
3. Sample responses from 10 to 15 councils and list the distinct bin names.
4. Measure Selenium memory and time per request.
5. Prove an override of one scraper.
