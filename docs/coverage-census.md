# Coverage census (Phase 1)

Static analysis of UKBinCollectionData 0.173.5 (the version we pin) and our own registry. No council site was contacted to make this. Every number below is counted from [`coverage-census-councils.csv`](coverage-census-councils.csv) (one row per council) and [`coverage-census-modules.csv`](coverage-census-modules.csv) (one row per upstream module), made by `scripts/census.py` and `scripts/census_report.py`.

A *council* here is one of the 361 Local Authority Districts in the outlines file the site's map uses (`web/public/data/council-shapes.json`, ONS May 2026). Upstream has 353 council modules; some cover two councils and some councils have more than one module (see the end).

> **Population columns say `n/a`.** The ONS mid-year population file could not be fetched from this session (`www.ons.gov.uk` and `www.nomisweb.co.uk` are outside its network allowlist). `scripts/census.py` takes a CSV (`ons_code,population`) as its second argument and the report fills in the population and households columns when it is given one. See "Still to do" at the end.

## Funnel

| Step | Councils | Of all 361 | Population | Note |
|---|---|---|---|---|
| All councils (outlines) | 361 | 100% | n/a |  |
| Have an upstream module | 356 | 99% | n/a | 5 have none: City of London, Fylde, Isles of Scilly, Kensington and Chelsea, Rutland |
| Need a UPRN (set aside for Phase 4) | 225 | 62% | n/a | 1 of these already supported |
| Non-UPRN (postcode, house number, URL or other) | 131 | 36% | n/a |  |
| Probed by us | 67 | 19% | n/a | batch probe covers only postcode + house number, no browser needed, passing upstream's own test |
| Working when probed | 64 | 18% | n/a |  |
| Supported (in the registry) | 40 | 11% | n/a | non-UPRN only |

Supported in the registry in total: 41 (1 needs a UPRN, 40 does not).

### Where the non-UPRN councils stand

| Status with us | Councils |
|---|---|
| never_probed | 64 |
| supported | 40 |
| left_out | 27 |

Why probed councils were left out of the registry (from the generator's last report):

| Reason | Councils |
|---|---|
| unrecognised bin name | 21 |
| probe failed (ConnectionError) | 1 |
| probe failed (ValueError) | 1 |
| the bins found have no general waste bin, so the calendar would be incomplete | 1 |
| the bins found have no general waste and no recycling bin, so the calendar would be incomplete | 1 |
| probe failed (ReadTimeout) | 1 |
| source.url must be an https URL | 1 |

## UPRN councils by platform

Platform is inferred from the module's code and the domains it calls (rules in `PLATFORM_RULES` in `scripts/census.py`). "Bespoke" means no vendor signature was found: the module scrapes or calls the council's own site. Confidence: high = vendor domain or API path, medium = a vendor name in the code or a subclass of a known module, low = bespoke / nothing found.

| Platform | Councils | Population | Supported | Browser needed | Confidence |
|---|---|---|---|---|---|
| Bespoke council site (HTML/JSON) | 127 | n/a | 0 | 0 | low |
| Granicus/Firmstep AchieveForms | 37 | n/a | 0 | 9 | high |
| Bespoke council site (browser form) | 12 | n/a | 0 | 12 | low |
| Bartec | 7 | n/a | 1 | 0 | high |
| Jadu | 6 | n/a | 0 | 0 | medium |
| Whitespace | 6 | n/a | 0 | 0 | high |
| iTouchVision | 4 | n/a | 0 | 2 | high |
| Civica UFS | 3 | n/a | 0 | 1 | high |
| FCC Environment portal | 3 | n/a | 0 | 1 | high |
| RenderForm.aspx form engine | 3 | n/a | 0 | 2 | high |
| Cloud9 Technologies | 2 | n/a | 0 | 0 | high |
| Ebase forms | 2 | n/a | 0 | 0 | high |
| Google Calendar (public iCal) | 2 | n/a | 0 | 0 | high |
| Power Apps portal (Dynamics) | 2 | n/a | 0 | 1 | high |
| PublicDashboard (shared upstream base class) | 2 | n/a | 0 | 0 | high |
| Verint (empro) | 2 | n/a | 0 | 0 | high |
| WSCollExternal SOAP (Azure) | 2 | n/a | 0 | 0 | high |
| ArcGIS/Esri | 1 | n/a | 0 | 0 | high |
| Council CMS apiserver/ajaxlibrary API | 1 | n/a | 0 | 0 | high |
| Salesforce Experience Cloud | 1 | n/a | 0 | 0 | high |

## Non-UPRN councils by input type and browser need

Input class is what upstream's own test passes for the module (`input.json`). Browser need is whether the module's source uses Selenium or a webdriver, the same test `scripts/batch_probe.py` uses. The last two columns split the group by whether upstream's own test passed in our 26 Oct 2026 run.

| Input class | Browser | Councils | Population | Upstream test passed | Failed | Supported |
|---|---|---|---|---|---|---|
| postcode+house_number | yes | 49 | n/a | 34 | 15 | 22 |
| postcode+house_number | no | 43 | n/a | 33 | 10 | 18 |
| ical_url | no | 11 | n/a | 11 | 0 | 0 |
| postcode | no | 9 | n/a | 7 | 2 | 0 |
| url_property_ref | no | 6 | n/a | 4 | 2 | 0 |
| house_number | no | 5 | n/a | 3 | 2 | 0 |
| other_id | no | 4 | n/a | 3 | 1 | 0 |
| url_property_ref | yes | 2 | n/a | 1 | 1 | 0 |
| house_number | yes | 1 | n/a | 1 | 0 | 0 |
| usrn | no | 1 | n/a | 1 | 0 | 0 |

Input class names: `postcode+house_number` is the class we already support. `house_number` alone is a street name (see notes). `ical_url` is a public calendar link, `url_property_ref` an identifier inside a URL found by searching the council's site (`uprn_in_url` is counted as UPRN). `other_id` is a council-specific reference upstream stores in the `uprn` field but which is not a national UPRN. `usrn` is a street reference.

## Platform across all councils (UPRN and not)

| Platform | Councils | Population | Need UPRN | Don't | Supported |
|---|---|---|---|---|---|
| Bespoke council site (HTML/JSON) | 169 | n/a | 127 | 42 | 7 |
| Bespoke council site (browser form) | 49 | n/a | 12 | 37 | 15 |
| Granicus/Firmstep AchieveForms | 42 | n/a | 37 | 5 | 3 |
| Google Calendar (public iCal) | 15 | n/a | 2 | 13 | 0 |
| Whitespace | 12 | n/a | 6 | 6 | 1 |
| Jadu | 8 | n/a | 6 | 2 | 1 |
| Bartec | 7 | n/a | 7 | 0 | 1 |
| ReCollect | 7 | n/a | 0 | 7 | 3 |
| Council CMS apiserver/ajaxlibrary API | 5 | n/a | 1 | 4 | 0 |
| iTouchVision | 5 | n/a | 4 | 1 | 1 |
| PublicDashboard (shared upstream base class) | 4 | n/a | 2 | 2 | 2 |
| Civica UFS | 3 | n/a | 3 | 0 | 0 |
| FCC Environment portal | 3 | n/a | 3 | 0 | 0 |
| RenderForm.aspx form engine | 3 | n/a | 3 | 0 | 0 |
| Salesforce Experience Cloud | 3 | n/a | 1 | 2 | 2 |
| Verint (empro) | 3 | n/a | 2 | 1 | 0 |
| ArcGIS/Esri | 2 | n/a | 1 | 1 | 0 |
| Cloud9 Technologies | 2 | n/a | 2 | 0 | 0 |
| Ebase forms | 2 | n/a | 2 | 0 | 0 |
| Isl Fusion | 2 | n/a | 0 | 2 | 2 |
| Oncreate | 2 | n/a | 0 | 2 | 2 |
| Power Apps portal (Dynamics) | 2 | n/a | 2 | 0 | 0 |
| WSCollExternal SOAP (Azure) | 2 | n/a | 2 | 0 | 0 |
| Mendix | 1 | n/a | 0 | 1 | 0 |
| OnMats | 1 | n/a | 0 | 1 | 0 |
| Supatrak | 1 | n/a | 0 | 1 | 0 |
| iEG4 | 1 | n/a | 0 | 1 | 1 |

## Bespoke modules grouped by endpoint

The 221 modules with no named vendor, grouped by the host pattern and first URL path segment of the endpoint that does the work (the council's own name in the host is replaced by `<council>`). Groups are unnamed: a shared pattern is a hint that councils are on the same product, not proof. Full list, including the single-module clusters: [`coverage-census-bespoke-clusters.csv`](coverage-census-bespoke-clusters.csv).

32 clusters hold more than one module (79 modules); the other 142 are one-offs.

| Endpoint pattern | Modules | How it reads the page | Councils |
|---|---|---|---|
| `www.<council>.gov.uk/` | 5 | browser+html html | HinckleyandBosworthBoroughCouncil, LondonBoroughOfRichmondUponThames, NorthEastLincs, NuneatonBedworthBoroughCouncil, WirralCouncil |
| `www.<council>.gov.uk/bins-and-recycling` | 5 | browser+html html json+html | CneSiarCouncil, HullCityCouncil, NorthEastDerbyshireDistrictCouncil, SalfordCityCouncil, SeftonCouncil |
| `www.<council>.gov.uk/homepage` | 5 | html | CherwellDistrictCouncil, LichfieldDistrictCouncil, NewcastleUnderLymeCouncil, RunnymedeBoroughCouncil, TamworthBoroughCouncil |
| `www.<council>.gov.uk/info` | 4 | html json+html | BirminghamCityCouncil, KingsLynnandWestNorfolkBC, RoyalBoroughofGreenwich, SwindonBoroughCouncil |
| `www.<council>.gov.uk/umbraco` | 4 | umbraco+html umbraco+json+html | CornwallCouncil, MerthyrTydfilCountyBoroughCouncil, RushmoorCouncil, TeignbridgeCouncil |
| `<council>.co.uk/house.php` | 3 | html | EastbourneBoroughCouncil, EnvironmentFirst, LewesDistrictCouncil |
| `www.<council>.gov.uk/article` | 3 | browser+html html | StHelensBC, SunderlandCityCouncil, WestLothianCouncil |
| `api.<council>.gov.uk/api` | 2 | json | MedwayCouncil, ReadingBoroughCouncil |
| `bincollections.<council>.gov.uk/bincollections` | 2 | html | BromsgroveDistrictCouncil, RedditchBoroughCouncil |
| `bins.<council>.net/api` | 2 | json | FenlandDistrictCouncil, RotherhamCouncil |
| `community.<council>.gov.uk/s` | 2 | browser+html | CotswoldDistrictCouncil, ForestOfDeanDistrictCouncil |
| `maps.<council>.gov.uk/` | 2 | html json | EastHampshireDC, MonmouthshireCountyCouncil |
| `my.<council>.gov.uk/location` | 2 | html | CharnwoodBoroughCouncil, OadbyAndWigstonBoroughCouncil |
| `recyclingservices.<council>.gov.uk/` | 2 | other | BrentCouncil, BromleyBoroughCouncil |
| `servicelayer3c.<council>.net/wastecalendar` | 2 | json json+html | CambridgeCityCouncil, SouthCambridgeshireCouncil |
| `waste-services.<council>.gov.uk/` | 2 | other | KingstonUponThamesCouncil, LondonBoroughSutton |
| `www.<council>.co.uk/get_calendar.php` | 2 | json | DundeeCityCouncil, SouthAyrshireCouncil |
| `www.<council>.gov.uk/bincollections` | 2 | html | BasingstokeCouncil, WyreCouncil |
| `www.<council>.gov.uk/binday` | 2 | browser+html | SouthKestevenDistrictCouncil, WestBerkshireCouncil |
| `www.<council>.gov.uk/bins-recycling-and-street-cleaning` | 2 | html | CumberlandCouncil, WestMorlandAndFurness |
| `www.<council>.gov.uk/check-your-collection-day` | 2 | browser+html | BaberghDistrictCouncil, MidSuffolkDistrictCouncil |
| `www.<council>.gov.uk/directory` | 2 | html json+html | EdinburghCityCouncil, ShetlandIslandsCouncil |
| `www.<council>.gov.uk/en` | 2 | browser+html html | BlaenauGwentCountyBoroughCouncil, RhonddaCynonTaffCouncil |
| `www.<council>.gov.uk/recycling-and-waste` | 2 | html wordpress+json+html | WealdenDistrictCouncil, WestDunbartonshireCouncil |
| `www.<council>.gov.uk/resident` | 2 | browser+html html | ArmaghBanbridgeCraigavonCouncil, CeredigionCountyCouncil |
| `www.<council>.gov.uk/rubbish-and-recycling` | 2 | browser+html html | ArgyllandButeCouncil, WokinghamBoroughCouncil |
| `www.<council>.gov.uk/rubbish-recycling` | 2 | browser+html html | BarkingDagenham, HerefordshireCouncil |
| `www.<council>.gov.uk/services` | 2 | browser+html html | EastDunbartonshireCouncil, EnfieldCouncil |
| `www.<council>.gov.uk/site` | 2 | json other | EalingCouncil, LondonBoroughEaling |
| `www.<council>.gov.uk/waste-and-recycling` | 2 | html json+html | BedfordshireCouncil, WolverhamptonCityCouncil |
| `www.<council>.gov.uk/waste-collection-schedule` | 2 | html | EastLothianCouncil, NorthTynesideCouncil |
| `www.<council>.gov.uk/where-i-live` | 2 | browser+html html | SouthStaffordshireDistrictCouncil, WakefieldCityCouncil |

Path patterns worth a closer look in a later phase: `/waste/` pages on `recyclingservices.` and `waste-services.` hosts (Brent, Bromley, Kingston, Sutton) share one page template, and the code does not name its vendor. `/info`, `/homepage` and `/bins-and-recycling` clusters are council web CMS page layouts and do not point to a single product.

## What could not be classified confidently

- **221 modules have no vendor signature** (platform `Bespoke council site`). Many are probably on a shared vendor platform we could not name from the code alone (no vendor domain, API path or name appears). They are not individually listed here; filter `platform_confidence == low` in the modules CSV. No module shows an Echo or Symology signature; Echo-type sites may be hiding in the bespoke group.
- `FyldeCouncil`: no entry in upstream's `input.json`, so its inputs, browser need and test status are unknown; council code assumed from the module name.
- `SocietyWorks`: no entry in upstream's `input.json`, so its inputs, browser need and test status are unknown (a base class, not a council).
- `BarnsleyMBCouncil`: LAD code corrected: upstream has the pre-2023 code E08000016.
- `CneSiarCouncil`: LAD code corrected: no code upstream; matched to Na h-Eileanan Siar.
- `EalingCouncil`: marked deprecated upstream; use LondonBoroughEaling.
- `EastHertsCouncil`: LAD code corrected: upstream has the retired code E07000097.
- `EdenDistrictCouncil`: Eden was merged into Westmorland and Furness in 2023; use WestMorlandAndFurness.
- `GosportBoroughCouncil`: LAD code corrected: upstream has Stroud's code E07000082.
- `HarrogateBoroughCouncil`: Harrogate was absorbed into North Yorkshire in 2023; no current council code.
- `NorthWarwickshireBoroughCouncil`: LAD code corrected: upstream has Rugby's code E07000220; browser flag in input.json disagrees with the source.
- `SheffieldCityCouncil`: LAD code corrected: upstream has the pre-2023 code E08000019.
- `GooglePublicCalendarCouncil` (`ical_url`): upstream lists 16 councils whose calendars it can read, but each needs that council's own public Google Calendar URL, which is not something a user can type. All 16 are counted as non-UPRN because they need no UPRN, but they are not reachable by any input we can ask for. Where a council has a second module, the furthest-along module is the one counted.
- `url_property_ref` modules (Bromley, Coventry, East Staffordshire, Kingston, North Lanarkshire, Shropshire, Wakefield, Antrim and Newtownabbey): the identifier sits in a URL the user would have to reach by searching the council's own site, so they are neither UPRN nor postcode councils. `uprn_in_url` modules (Adur and Worthing, Oldham, Pembrokeshire, Reading, Solihull, Stockport, Stoke-on-Trent, Warwick) are counted as UPRN councils.
- `EnvironmentFirst` serves Lewes and Eastbourne (a UPRN in a URL). It has no council code upstream, so it is not counted for any council; `LewesDistrictCouncil` and `EastbourneBoroughCouncil` are counted instead.
- `CastlepointDistrictCouncil` (other_id): 'uprn' is a 4-digit street code from the council's dropdown.
- `CrawleyBoroughCouncil` (uprn+usrn): needs both a UPRN and a USRN (USRN passed in the house number field).
- `MorayCouncil` (other_id): 'uprn' is the council's property ID taken from its bin day finder URL.
- `NewarkAndSherwoodDC` (other_id): 'uprn' is the council's PID; postcode plus house number also accepted.
- `TamworthBoroughCouncil` (other_id): LAD matched from name; 'uprn' is Lichfield's shared-portal 9-digit reference, not a national UPRN.
- `WestminsterCityCouncil` (usrn): LAD matched from name; 'uprn' is used as the street reference (USRN).
- 28 UPRN modules also read a postcode and a house number in their code (BlackpoolCouncil, BroxtoweBoroughCouncil, CalderdaleCouncil, DoverDistrictCouncil, DumfriesandGallowayCouncil, EastDevonDC…). Whether that path works without a UPRN is not known from the code alone, so they are counted as UPRN councils. Phase 3 should check them first: they are the cheapest way to turn a UPRN council into a non-UPRN one.
- 20 modules where `web_driver` in `input.json` and the use of Selenium in the source disagree (BasildonCouncil, BexleyCouncil, BromleyBoroughCouncil, EastRidingCouncil, EastStaffordshireBoroughCouncil, EppingForestDistrictCouncil, GatesheadCouncil, HinckleyandBosworthBoroughCouncil…). The source wins in this census.
- Upstream's `LAD24CD` is stale or wrong for several modules (corrected by hand, listed above), and `HarrogateBoroughCouncil` carries a code (E07000165) that no longer exists in the May 2026 outlines. Councils reorganised since 2023 may still have one module per former district; that is not checked here.

## How it was counted

- **UPRN council**: the input class from upstream's own test includes a `uprn` (after setting aside the entries that are not really UPRNs). A council with several modules is counted by its furthest-along module.
- **Probed / working**: from `docs/spike-results/batch-probe.json` (the last batch probe), not re-run.
- **Supported**: in `registry/councils.json`, matched on the ONS code.
- **Upstream test**: from `docs/spike-results/full-suite.json` (our own run on 26 Oct 2026), so it carries any cloud-IP blocking.

## Still to do

- Population: add `ons_code,population` for the 361 councils (ONS mid-2024 or newest estimates for LADs, OGL) and run `python scripts/census.py docs population.csv && python scripts/census_report.py docs docs/coverage-census.md`. Allowing `www.ons.gov.uk` or `www.nomisweb.co.uk` in the session's network settings is enough.

