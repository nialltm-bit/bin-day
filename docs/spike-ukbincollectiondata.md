# Spike: UKBinCollectionData (FRE-263)

**Status: partial.** Live results are in, with one question not answered: upstream's current nightly pass count (see below). Everything else was measured by running `uk_bin_collection` 0.173.5 (tag `0.173.5`, commit `0d1b26a`) on a GitHub-hosted runner. Raw results: [`docs/spike-results/results.md`](spike-results/results.md) and `results.json`, produced by [`scripts/spike_ukbcd.py`](../scripts/spike_ukbcd.py) via [the workflow](../.github/workflows/spike-ukbcd.yml).

How the run worked: the library interface (`UKBinCollectionApp`), one request per council, run one after another with 5 seconds between councils, no retries, using each council's entry from upstream's `tests/input.json`. A `selenium/standalone-chrome` service container handled the Selenium councils.

## Answers

**Does the B&NES scraper work today?** Yes. With upstream's test UPRN `100120000855` it returned 4 bin types in 0.9 s via a single HTTP 200 from `api.bathnes.gov.uk`. It needs only a UPRN. It is plain HTTP, no Selenium.

**Sample coverage.** 16 of 16 sampled councils returned bins: 12 plain HTTP, Bexley (which lists a web driver but doesn't use one) and 3 that really drive a browser (Arun, Brighton and Hove, Barnet). This is one request per council with upstream's own test address, so it shows the scrapers work for a known-good address, not that they work for any address. It says nothing about the other 340 councils.

**Did any council block the GitHub runner?** No. Every recorded HTTP response was 200 (Cardiff also returned one 204 on an auth call). There were no 403s. Two caveats: Selenium browser traffic isn't captured by the status log (Brighton and Hove recorded no HTTP calls at all, and Arun and Barnet only one or two), and one request per council on one day is a weak test. Councils known from upstream's own March results to return 403 to automated clients (for example Blaby and Brent) were not in the sample, so cloud-IP blocking remains a risk for hosting. Plan for a fallback egress or a per-council allowlist.

**Which councils need Selenium, and what does it cost?** 82 of 353 council modules reference Selenium (static count). In the sample, three councils drove a browser: Arun (5.3 s), Barnet (7.1 s) and Brighton and Hove (8.8 s). Bexley lists a web driver in `input.json` but its module doesn't use one, and answered in 1.5 s over HTTP. So browser-driven requests took about 5 to 9 s against 0.6 to 3.7 s for plain HTTP, and need a Chrome container (the runner used `--shm-size=2g`). I did not measure memory. At weekly refresh per address, Selenium councils are affordable if requests are queued through a small pool of browser sessions.

**Inputs.** From `tests/input.json` (351 entries): UPRN 226, postcode 174, house number 124 (overlapping). The sample shows UPRN alone is enough for most, while Barnsley also takes a postcode. The council registry (FRE-267) must record the inputs per council.

**Response shape and bin type names.** The library returns `{"bins": [{"type": ..., "collectionDate": "dd/mm/YYYY"}]}`. Names are the council's own free text and vary wildly. Examples from the run:

| Council | Names |
|---|---|
| Aberdeen City | Garden; General; Recycling |
| Amber Valley | RECYCLING; REFUSE |
| Barnsley | Blue bin; Brown bin; Green bin; Grey bin |
| Blackburn | Blue 240L (paper and cardboard bin); Burgundy 140L (refuse bin); Grey 240L (glass, tins and plastics bin) |
| B&NES | Black Rubbish Bin (140L); Blue Recycling Bag for Cardboard; Food Recycling Collection Bin; Green Recycling Box |
| Cambridge City | Black Bin; Blue Bin; FOOD; Green Bin |
| Cardiff | Food; Garden; General; Glass; Hygiene; Recycling |

Some councils name the stream ("Food waste"), some give only a colour ("Blue bin"), and some embed capacity or contents. Colour-only names can't be mapped to a stream without per-council knowledge. FRE-269 needs a per-council mapping table, not keyword matching, and "waste streams" will need more than four values for councils that collect glass or hygiene waste separately.

**Pinning and overriding scrapers.** Pin with `uk_bin_collection==0.173.5` (the tag matches the PyPI version). Overriding works: `scripts/overrides/BathAndNorthEastSomersetCouncil.py` subclasses upstream's `CouncilClass`, and with that directory first on `sys.path` the same `UKBinCollectionApp` call used our module (`override_used: true`, 4 bins returned; see `docs/spike-results/override.json`). Upstream's loader appends its own councils directory to `sys.path`, so a same-named module placed earlier wins. This relies on upstream's import behaviour, so pin the version and re-run the override check on every upgrade.

**How many councils pass upstream's nightly tests right now? Not answered.** Upstream's scheduled workflow ("Scheduled - Test All Councils") shows green for the last 10 nightly runs (17 to 26 Oct 2026), but that is misleading: the integration step is `continue-on-error: true`, so the run is green whatever the councils do. Per-council results go to Codecov, which this environment couldn't reach, and the Actions logs need a sign-in. Upstream's own `integration_test_results.md` (28 Mar 2026, 288 of 334 passing) is too old to rely on. To finish this, someone with a browser can open run 669's Codecov test results, or we can run the full suite ourselves in a separate workflow.

## Recommendation

Build on upstream, as a pinned library behind our own fetch service (FRE-268), not by exposing its Docker API.

- Pin `uk_bin_collection` and run the override check on each upgrade, so a bad release can't change behaviour silently.
- Start with plain HTTP councils. B&NES is straightforward, fast and needs only a UPRN. Put Selenium councils behind a small pool of browser sessions and add them as demand appears.
- Keep our own mapping from each council's bin names to waste streams (FRE-269). Upstream's names can't be normalised automatically.
- Record required inputs per council in the registry (FRE-267).
- Test hosting from the real production egress before launch, because 15 successes from a GitHub runner don't rule out 403s elsewhere.

## Open items

1. Upstream's current nightly pass count (see above).
2. Selenium memory per session wasn't measured.
