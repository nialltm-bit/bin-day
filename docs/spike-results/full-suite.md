# Upstream integration suite (FRE-263)

292 passed, 59 failed, 0 skipped, of 351 tests.

| Test | Status | Seconds | First line of failure |
|---|---|---|---|
| test_scenario_outline[AngusCouncil] | failed | 38.1 | ValueError: Dropdown only has 1 options after 30s wait |
| test_scenario_outline[AshfieldDistrictCouncil] | failed | 13.1 | selenium.common.exceptions.TimeoutException: Message:  |
| test_scenario_outline[BarkingDagenham] | failed | 21.2 | selenium.common.exceptions.TimeoutException: Message: Postcode input not found |
| test_scenario_outline[BostonBoroughCouncil] | failed | 31.2 | selenium.common.exceptions.TimeoutException: Message: |
| test_scenario_outline[BrecklandCouncil] | failed | 0.2 | requests.exceptions.JSONDecodeError: Expecting value: line 1 column 1 (char 0) |
| test_scenario_outline[CanterburyCityCouncil] | failed | 0.4 | ConnectionError: Canterbury's bin collection API is returning 403 Forbidden - this looks like an outage or access restriction on the council's end, not this scraper. Try again later. |
| test_scenario_outline[CastlepointDistrictCouncil] | failed | 134.9 | requests.exceptions.ConnectTimeout: HTTPSConnectionPool(host='apps.castlepoint.gov.uk', port=443): Max retries exceeded with url: /cpapps/index.cfm?fa=myStreet.displayDetails (Caused by ConnectTimeout |
| test_scenario_outline[ChelmsfordCityCouncil] | failed | 1.8 | ValueError: Could not find collection ICS file for address: 1 Celeborn Street, South Woodham Ferrers, Chelmsford, CM3 7AE |
| test_scenario_outline[ChichesterDistrictCouncil] | failed | 111.9 | selenium.common.exceptions.TimeoutException: Message:  |
| test_scenario_outline[ConwyCountyBorough] | failed | 1.0 | jsonschema.exceptions.ValidationError: [] should be non-empty |
| test_scenario_outline[DacorumBoroughCouncil] | failed | 300.4 | selenium.common.exceptions.InvalidSessionIdException: Message: Cannot find session with id: 375b170bfd1c88e53f71cadf919b9429; For documentation on this error, please visit: https://www.selenium.dev/do |
| test_scenario_outline[DartfordBoroughCouncil] | failed | 135.5 | requests.exceptions.ConnectTimeout: HTTPSConnectionPool(host='windmz.dartford.gov.uk', port=443): Max retries exceeded with url: /ufs/WS_CHECK_COLLECTIONS.eb?UPRN=100060861698 (Caused by ConnectTimeou |
| test_scenario_outline[DenbighshireCouncil] | failed | 135.1 | requests.exceptions.ConnectTimeout: HTTPSConnectionPool(host='refusecalendarapi.denbighshire.gov.uk', port=443): Max retries exceeded with url: /Csrf/token (Caused by ConnectTimeoutError(<HTTPSConnect |
| test_scenario_outline[DumfriesandGallowayCouncil] | failed | 0.1 | requests.exceptions.HTTPError: 403 Client Error: Forbidden for url: https://www.dumfriesandgalloway.gov.uk/bins-recycling/waste-collection-schedule/download/137034556 |
| test_scenario_outline[EastDevonDC] | failed | 0.5 | requests.exceptions.HTTPError: 403 Client Error: Forbidden for url: https://eastdevon.gov.uk/recycling-and-waste/recycling-waste-information/when-is-my-bin-collected/future-collections-calendar/?UPRN= |
| test_scenario_outline[EastHampshireDC] | failed | 3.5 | ValueError: East Hampshire's calendar 15 only runs to 29/10/2026, so it has no collections left. The council should have published a new one - if this persists, the calendar link may need revisiting. |
| test_scenario_outline[EastHertsCouncil] | failed | 0.6 | KeyError: 'integration' |
| test_scenario_outline[EastLindseyDistrictCouncil] | failed | 31.0 | selenium.common.exceptions.TimeoutException: Message:  |
| test_scenario_outline[EastRenfrewshireCouncil] | failed | 31.3 | selenium.common.exceptions.TimeoutException: Message:  |
| test_scenario_outline[EastStaffordshireBoroughCouncil] | failed | 766.4 | requests.exceptions.ConnectTimeout: HTTPSConnectionPool(host='www.eaststaffsbc.gov.uk', port=443): Max retries exceeded with url: /bins-rubbish-recycling/collection-dates/68382 (Caused by ConnectTimeo |
| test_scenario_outline[ExeterCityCouncil] | failed | 0.5 | requests.exceptions.HTTPError: 403 Client Error: Forbidden for url: https://exeter.gov.uk/repositories/hidden-pages/address-finder/?qsource=UPRN&qtype=bins&term=100040212270 |
| test_scenario_outline[FarehamBoroughCouncil] | failed | 0.8 | jsonschema.exceptions.ValidationError: [] should be non-empty |
| test_scenario_outline[GatesheadCouncil] | failed | 0.3 | curl_cffi.requests.exceptions.HTTPError: HTTP Error 403: |
| test_scenario_outline[GedlingBoroughCouncil] | failed | 30.1 | requests.exceptions.ReadTimeout: HTTPSConnectionPool(host='api.gbcbincalendars.co.uk', port=443): Read timed out. (read timeout=30) |
| test_scenario_outline[GreatYarmouthBoroughCouncil] | failed | 10.9 | selenium.common.exceptions.TimeoutException: Message:  |
| test_scenario_outline[HaltonBoroughCouncil] | failed | 19.0 | ValueError: Halton rejected the search because the reCAPTCHA was not completed (Google served a challenge to the automated browser). |
| test_scenario_outline[HarboroughDistrictCouncil] | failed | 0.6 | requests.exceptions.HTTPError: 429 Client Error: Too Many Requests for url: https://harborough.fccenvironment.co.uk/ |
| test_scenario_outline[HarrogateBoroughCouncil] | failed | 133.2 | requests.exceptions.ConnectTimeout: HTTPSConnectionPool(host='secure.harrogate.gov.uk', port=443): Max retries exceeded with url: /inmyarea/Property/?uprn=100050414307 (Caused by ConnectTimeoutError(< |
| test_scenario_outline[HorshamDistrictCouncil] | failed | 48.0 | requests.exceptions.ConnectionError: HTTPSConnectionPool(host='satellite.horsham.gov.uk', port=443): Max retries exceeded with url: /environment/refuse/cal2.asp (Caused by ProtocolError('Connection ab |
| test_scenario_outline[InverclydeCouncil] | failed | 30.4 | requests.exceptions.ConnectTimeout: HTTPSConnectionPool(host='www.inverclyde.gov.uk', port=443): Max retries exceeded with url: /assets/attach/15406/Bin-Collection-Days-including-HR-T-12.09.22.pdf (Ca |
| test_scenario_outline[IpswichBoroughCouncil] | failed | 0.6 | jsonschema.exceptions.ValidationError: [] should be non-empty |
| test_scenario_outline[LancasterCityCouncil] | failed | 0.4 | requests.exceptions.MissingSchema: Invalid URL '': No scheme supplied. Perhaps you meant https://? |
| test_scenario_outline[LondonBoroughHammersmithandFulham] | failed | 0.4 | AttributeError: 'NoneType' object has no attribute 'find' |
| test_scenario_outline[MidAndEastAntrimBoroughCouncil] | failed | 0.5 | ValueError: Could not find the collections form start link |
| test_scenario_outline[MidSussexDistrictCouncil] | failed | 0.5 | requests.exceptions.HTTPError: 403 Client Error: Forbidden for url: https://waste.services.midsussex.gov.uk/ |
| test_scenario_outline[NorthKestevenDistrictCouncil] | failed | 0.1 | requests.exceptions.HTTPError: 403 Client Error: Forbidden for url: https://www.n-kesteven.org.uk/bins/display?uprn=10006545854 |
| test_scenario_outline[NorthSomersetCouncil] | failed | 133.7 | requests.exceptions.ConnectTimeout: HTTPSConnectionPool(host='forms.n-somerset.gov.uk', port=443): Max retries exceeded with url: /Waste/CollectionSchedule (Caused by ConnectTimeoutError(<HTTPSConnect |
| test_scenario_outline[NorthTynesideCouncil] | failed | 0.4 | requests.exceptions.HTTPError: 403 Client Error: Forbidden for url: https://www.northtyneside.gov.uk/waste-collection-schedule/view/47097627 |
| test_scenario_outline[NorwichCityCouncil] | failed | 0.5 | requests.exceptions.HTTPError: 403 Client Error: Forbidden for url: https://bnr-wrp.whitespacews.com/ |
| test_scenario_outline[PowysCouncil] | failed | 0.6 | requests.exceptions.HTTPError: 403 Client Error: Forbidden for url: https://en.powys.gov.uk/binday |
| test_scenario_outline[PrestonCityCouncil] | failed | 300.4 | selenium.common.exceptions.InvalidSessionIdException: Message: Cannot find session with id: 068d28752ba808b9d8f9eea585fd5978; For documentation on this error, please visit: https://www.selenium.dev/do |
| test_scenario_outline[SouthHamsDistrictCouncil] | failed | 0.5 | requests.exceptions.JSONDecodeError: Expecting value: line 1 column 1 (char 0) |
| test_scenario_outline[SouthHollandDistrictCouncil] | failed | 0.3 | requests.exceptions.JSONDecodeError: Expecting value: line 1 column 1 (char 0) |
| test_scenario_outline[SouthTynesideCouncil] | failed | 0.3 | json.decoder.JSONDecodeError: Expecting value: line 1 column 1 (char 0) |
| test_scenario_outline[StHelensBC] | failed | 12.6 | jsonschema.exceptions.ValidationError: [] should be non-empty |
| test_scenario_outline[StocktonOnTeesCouncil] | failed | 33.3 | selenium.common.exceptions.TimeoutException: Message:  |
| test_scenario_outline[SunderlandCityCouncil] | failed | 0.2 | curl_cffi.requests.exceptions.HTTPError: HTTP Error 403: |
| test_scenario_outline[SwanseaCouncil] | failed | 0.2 | curl_cffi.requests.exceptions.HTTPError: HTTP Error 403: |
| test_scenario_outline[TamesideMBCouncil] | failed | 133.0 | requests.exceptions.ConnectTimeout: HTTPConnectionPool(host='lite.tameside.gov.uk', port=80): Max retries exceeded with url: /BinCollections/CollectionService.svc/GetBinCollection (Caused by ConnectTi |
| test_scenario_outline[TeignbridgeCouncil] | failed | 0.6 | ConnectionError: Teignbridge's website returned 403 Forbidden - its Azure Application Gateway is blocking this client, not rejecting the UPRN. |
| test_scenario_outline[TonbridgeAndMallingBC] | failed | 0.6 | requests.exceptions.ConnectionError: ('Connection aborted.', ConnectionResetError(104, 'Connection reset by peer')) |
| test_scenario_outline[TorfaenCouncil] | failed | 39.3 | selenium.common.exceptions.TimeoutException: Message:  |
| test_scenario_outline[WalsallCouncil] | failed | 0.5 | jsonschema.exceptions.ValidationError: [] should be non-empty |
| test_scenario_outline[WarringtonBoroughCouncil] | failed | 0.4 | requests.exceptions.HTTPError: 403 Client Error: Forbidden for url: https://www.warrington.gov.uk/bin-collections/get-jobs/10094964379 |
| test_scenario_outline[WaverleyBoroughCouncil] | failed | 0.5 | IndexError: list index out of range |
| test_scenario_outline[WestBerkshireCouncil] | failed | 31.0 | selenium.common.exceptions.TimeoutException: Message:  |
| test_scenario_outline[WestDevonBoroughCouncil] | failed | 16.8 | selenium.common.exceptions.TimeoutException: Message:  |
| test_scenario_outline[WokingBoroughCouncil] | failed | 0.5 | IndexError: list index out of range |
| test_scenario_outline[WolverhamptonCityCouncil] | failed | 0.5 | jsonschema.exceptions.ValidationError: [] should be non-empty |
