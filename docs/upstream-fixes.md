# Upstream fixes

Things found while classifying UKBinCollectionData 0.173.5 that upstream (robbrad/UKBinCollectionData) could fix. **Nothing has been opened upstream**; this is a list to work from.

## Wrong council codes in `tests/input.json`

These `LAD24CD` values do not match the council the module is for. The census (`docs/coverage-census.md`) corrects them in `scripts/census.py` (`CODE_FIXES`), checked against the May 2026 ONS outlines.

| Module | Council | Upstream has | Should be | Why |
|---|---|---|---|---|
| `BarnsleyMBCouncil` | Barnsley | E08000016 | E08000038 | E08000016 is the pre-2023 code |
| `SheffieldCityCouncil` | Sheffield | E08000019 | E08000039 | E08000019 is the pre-2023 code |
| `EastHertsCouncil` | East Hertfordshire | E07000097 | E07000242 | E07000097 is a retired code |
| `GosportBoroughCouncil` | Gosport | E07000082 | E07000088 | E07000082 is Stroud's code (Stroud's own module has it too) |
| `NorthWarwickshireBoroughCouncil` | North Warwickshire | E07000220 | E07000218 | E07000220 is Rugby's code (Rugby's module has it too) |

Also worth a look: `HarrogateBoroughCouncil` (E07000165, abolished in 2023, its note already says use NorthYorkshire), `EdenDistrictCouncil` (merged into Westmorland and Furness, shares E06000064 with `WestMorlandAndFurness`), `EalingCouncil` (deprecated, shares E09000009 with `LondonBoroughEaling`), and `CneSiarCouncil`, `EnvironmentFirst` and `FyldeCouncil` which have no `LAD24CD` (Fylde has no `input.json` entry at all).

## Postcode + house number councils failing upstream's own tests

26 modules that take a postcode and a house number failed upstream's integration test in our run on 26 October 2026 (GitHub runner, one request each, four councils at a time; `docs/spike-results/full-suite.json`). A cloud IP can cause the 403s and some timeouts, so a failure here is not proof the scraper is broken from a home connection.

| Module | Browser | What failed | Kind |
|---|---|---|---|
| `AshfieldDistrictCouncil` | yes | `selenium.common.exceptions.TimeoutException` | browser timeout |
| `BarkingDagenham` | yes | `selenium.common.exceptions.TimeoutException:  Postcode input not found` | browser timeout |
| `BostonBoroughCouncil` | yes | `selenium.common.exceptions.TimeoutException` | browser timeout |
| `ChichesterDistrictCouncil` | yes | `selenium.common.exceptions.TimeoutException` | browser timeout |
| `DacorumBoroughCouncil` | yes | `selenium.common.exceptions.InvalidSessionIdException:  Cannot find session with id: …` | browser session lost |
| `EastLindseyDistrictCouncil` | yes | `selenium.common.exceptions.TimeoutException` | browser timeout |
| `EastRenfrewshireCouncil` | yes | `selenium.common.exceptions.TimeoutException` | browser timeout |
| `GatesheadCouncil` | yes | `curl_cffi.requests.exceptions.HTTPError: HTTP Error 403` | blocked (403 or captcha) |
| `HaltonBoroughCouncil` | yes | `ValueError: Halton rejected the search because the reCAPTCHA was not completed (Google served a challenge to the automated browser).` | blocked (403 or captcha) |
| `InverclydeCouncil` | no | `requests.exceptions.ConnectTimeout: HTTPSConnectionPool(host='www.inverclyde.gov.uk', port=443): Max retries exceeded with url: /assets/atta` | connection timeout |
| `LancasterCityCouncil` | no | `requests.exceptions.MissingSchema: Invalid URL '': No scheme supplied. Perhaps you meant https://?` | parser or site change |
| `MidAndEastAntrimBoroughCouncil` | no | `ValueError: Could not find the collections form start link` | parser or site change |
| `MidSussexDistrictCouncil` | no | `requests.exceptions.HTTPError: 403 Client Error: Forbidden for url: https://waste.services.midsussex.gov.uk/` | blocked (403 or captcha) |
| `MidlothianCouncil` | yes | `selenium.common.exceptions.TimeoutException` | browser timeout |
| `NorwichCityCouncil` | no | `requests.exceptions.HTTPError: 403 Client Error: Forbidden for url: https://bnr-wrp.whitespacews.com/` | blocked (403 or captcha) |
| `PowysCouncil` | yes | `requests.exceptions.HTTPError: 403 Client Error: Forbidden for url: https://en.powys.gov.uk/binday` | blocked (403 or captcha) |
| `PrestonCityCouncil` | yes | `selenium.common.exceptions.InvalidSessionIdException:  Cannot find session with id: …` | browser session lost |
| `SouthTynesideCouncil` | no | `json.decoder.JSONDecodeError: Expecting value: line 1 column 1 (char 0)` | non-JSON response |
| `StocktonOnTeesCouncil` | yes | `selenium.common.exceptions.TimeoutException` | browser timeout |
| `SunderlandCityCouncil` | no | `curl_cffi.requests.exceptions.HTTPError: HTTP Error 403` | blocked (403 or captcha) |
| `SwanseaCouncil` | yes | `curl_cffi.requests.exceptions.HTTPError: HTTP Error 403` | blocked (403 or captcha) |
| `ThurrockCouncil` | no | `requests.exceptions.ReadTimeout: HTTPSConnectionPool(host='www.thurrock.gov.uk', port=443): Read timed out. (read timeout=15)` | connection timeout |
| `TorfaenCouncil` | yes | `selenium.common.exceptions.TimeoutException` | browser timeout |
| `WaverleyBoroughCouncil` | no | `IndexError: list index out of range` | parser or site change |
| `WestBerkshireCouncil` | yes | `selenium.common.exceptions.TimeoutException` | browser timeout |
| `WokingBoroughCouncil` | no | `IndexError: list index out of range` | parser or site change |
