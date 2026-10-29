# Phase 3 probe results

One run from a GitHub runner with a Chrome service (`scripts/probe_other_inputs.py`, workflow `probe-other-inputs.yml`), one request per call with a 10 second pause, using upstream's own test inputs. A success means the module returned bins for upstream's test address from a cloud IP; it does not mean the bin names are mapped or the dates are true. Nothing here changes the registry. Raw rows: [`spike-results/phase3-probe.json`](spike-results/phase3-probe.json).

61 councils probed; 36 returned bins.

| Group | Probed | Returned bins | Browser |
|---|---|---|---|
| UPRN councils tried without their UPRN | 16 | 13 | 4 |
| Postcode-only and street-only councils | 14 | 11 | 1 |
| Councils that take a reference number, not a UPRN | 4 | 3 | 0 |
| Councils whose identifier is inside the URL | 8 | 7 | 2 |
| Postcode and house number councils never probed before | 19 | 2 | 13 |

## Does a UPRN council work without its UPRN?

Each council was run with every input upstream's test gives, then with only the postcode and house number from the same test entry, and the two results compared (same bins on the same dates).

| Result without a UPRN | Councils |
|---|---|
| same schedule | 11 |
| reference failed | 2 |
| error ValueError | 1 |
| same bins different dates | 1 |
| no result | 1 |

| Council | Without a UPRN | Schedule |
|---|---|---|
| `BlackpoolCouncil` | same schedule | next_only |
| `BroxtoweBoroughCouncil` | error ValueError | next_only |
| `CalderdaleCouncil` | same schedule | next_only |
| `HorshamDistrictCouncil` | reference failed: ConnectionError |  |
| `LincolnCouncil` | same schedule | full |
| `LondonBoroughCamdenCouncil` | same schedule | next_only |
| `MorayCouncil` | same schedule | full |
| `ScottishBordersCouncil` | same schedule | full |
| `SheffieldCityCouncil` | same schedule | next_only |
| `SouthDerbyshireDistrictCouncil` | same schedule | full |
| `UttlesfordDistrictCouncil` | same schedule | full |
| `ValeofGlamorganCouncil` | same bins different dates | full |
| `WalthamForest` | same schedule | next_only |
| `WestDevonBoroughCouncil` | reference failed: TimeoutException |  |
| `WestMorlandAndFurness` | same schedule | full |
| `WolverhamptonCityCouncil` | no result | none |

`same schedule` means the postcode and house number found the same house as the UPRN did, so the council can be added as a postcode and house number council with no UPRN finder. `same bins different dates` needs a look: the module may have matched a neighbouring address.

## Postcode-only and street-only councils

| Council | Result | Schedule | Browser |
|---|---|---|---|
| `BridgendCountyBoroughCouncil` | returned bins | next_only | no |
| `EppingForestDistrictCouncil` | returned bins | next_only | no |
| `GedlingBoroughCouncil` | failed (ReadTimeout) |  | no |
| `GosportBoroughCouncil` | returned bins | next_only | no |
| `IpswichBoroughCouncil` | failed (no bins) | none | no |
| `LondonBoroughHammersmithandFulham` | failed (AttributeError) |  | no |
| `MerthyrTydfilCountyBoroughCouncil` | returned bins | full | no |
| `MiddlesbroughCouncil` | returned bins | next_only | no |
| `NorthEastDerbyshireDistrictCouncil` | returned bins | full | yes |
| `NuneatonBedworthBoroughCouncil` | returned bins | full | no |
| `OrkneyIslandsCouncil` | returned bins | full | no |
| `RotherhamCouncil` | returned bins | full | no |
| `ShetlandIslandsCouncil` | returned bins | next_only | no |
| `SouthLanarkshireCouncil` | returned bins | next_only | no |

## Councils that take a reference number, not a UPRN

| Council | Result | Schedule | Browser |
|---|---|---|---|
| `CastlepointDistrictCouncil` | failed (ConnectTimeout) |  | no |
| `NewarkAndSherwoodDC` | returned bins | next_only | no |
| `TamworthBoroughCouncil` | returned bins | next_only | no |
| `WestminsterCityCouncil` | returned bins | next_only | no |

## Councils whose identifier is inside the URL

| Council | Result | Schedule | Browser |
|---|---|---|---|
| `AntrimAndNewtonabbeyCouncil` | returned bins | full | no |
| `BromleyBoroughCouncil` | returned bins | full | no |
| `CoventryCityCouncil` | returned bins | full | no |
| `EastStaffordshireBoroughCouncil` | failed (Timeout) |  | yes |
| `KingstonUponThamesCouncil` | returned bins | full | no |
| `NorthLanarkshireCouncil` | returned bins | next_only | no |
| `ShropshireCouncil` | returned bins | next_only | no |
| `WakefieldCityCouncil` | returned bins | full | yes |

## Postcode and house number councils never probed before

| Council | Result | Schedule | Browser |
|---|---|---|---|
| `AshfieldDistrictCouncil` | failed (TimeoutException) |  | yes |
| `BarkingDagenham` | failed (TimeoutException) |  | yes |
| `BostonBoroughCouncil` | failed (TimeoutException) |  | yes |
| `ChichesterDistrictCouncil` | failed (TimeoutException) |  | yes |
| `DacorumBoroughCouncil` | failed (Timeout) |  | yes |
| `EastLindseyDistrictCouncil` | failed (TimeoutException) |  | yes |
| `EastRenfrewshireCouncil` | failed (TimeoutException) |  | yes |
| `InverclydeCouncil` | failed (ConnectTimeout) |  | no |
| `LancasterCityCouncil` | failed (MissingSchema) |  | no |
| `MidAndEastAntrimBoroughCouncil` | failed (ValueError) |  | yes |
| `MidlothianCouncil` | returned bins | next_only | yes |
| `PrestonCityCouncil` | failed (Timeout) |  | yes |
| `SouthTynesideCouncil` | failed (JSONDecodeError) |  | no |
| `StocktonOnTeesCouncil` | failed (TimeoutException) |  | yes |
| `ThurrockCouncil` | returned bins | full | no |
| `TorfaenCouncil` | failed (TimeoutException) |  | yes |
| `WaverleyBoroughCouncil` | failed (IndexError) |  | no |
| `WestBerkshireCouncil` | failed (TimeoutException) |  | yes |
| `WokingBoroughCouncil` | failed (IndexError) |  | no |

## Not probed

- **Google public calendar group** (16 councils): parked. Each needs that council's own public calendar URL.
- **A 403 or captcha in upstream's own test**: not tried again, and a captcha is never worked around (Gateshead, Halton, Mid Sussex, Norwich, Powys, Sunderland, Swansea).
- **UPRN modules that read a postcode but whose test gives no house number** (Dover, Fenland, Haringey, Richmond, Tower Hamlets) or only a UPRN (Exeter, Anglesey, Malvern Hills, Stratford): there is no known house to compare against, so they cannot be checked without a test address from the council.

## Next

- Councils that returned bins with a postcode and a house number can go through `scripts/generate_registry.py` (it needs rows in the batch probe format; these rows are not yet merged into `batch-probe.json`).
- Postcode-only and street-only councils need the page to ask for something other than a house number, which the registry's `inputs` do not model yet.
