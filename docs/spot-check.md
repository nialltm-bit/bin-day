# Spot check (2026-10-30)

Every covered council, run once with its public test address. This catches councils that don't fetch and results that
can't be right (a bin on two weekdays, odd gaps, no general or recycling bin). It cannot say the dates are true.

- Councils checked: 51. Fetched: 48. Did not fetch: 3.
- Fetched but flagged: 0.

## To check by hand

Put the address into the council's own bin page and compare the next dates and what each bin is. These are upstream's public
test addresses.

### Redcar and Cleveland

Address: TS10 2RE, 11. Council site: https://www.redcar-cleveland.gov.uk

| Bin (council's name) | We call it | Next dates |
|---|---|---|
| FOOD | food | 2026-11-04, 2026-11-11, 2026-11-18, 2026-11-25 |
| RECYCLING | recycling | 2026-11-04, 2026-11-18 |
| REFUSE | general | 2026-11-11, 2026-11-25 |

### Colchester

Address: CO2 8UN, 29. Council site: https://www.colchester.gov.uk/your-recycling-calendar

| Bin (council's name) | We call it | Next dates |
|---|---|---|
| Food waste | food | 2026-11-05, 2026-11-12, 2026-11-19 |
| Glass | recycling | 2026-11-12 |
| Mixed recycling (paper/card/plastics/tins/cans) | recycling | 2026-11-12 |
| Non-recyclable rubbish | general | 2026-11-05, 2026-11-19 |

### Blackpool

Address: FY3 8EB, 61. Council site: https://www.blackpool.gov.uk/

| Bin (council's name) | We call it | Next dates |
|---|---|---|
| Empty Bin 23ltr Food Caddy | food | 2026-11-04, 2026-11-11 |
| Empty Bin Domestic Refuse 240L | general | 2026-11-04 |
| Empty Bin Paper & Card 240L | recycling | 2026-11-11 |

### Brighton and Hove

Address: BN1 8NE, 44. Council site: https://enviroservices.brighton-hove.gov.uk/link/collections

| Bin (council's name) | We call it | Next dates |
|---|---|---|
| Food waste | food | 2026-11-05 |
| Garden Waste | garden | 2026-11-06 |
| Recycling | recycling | 2026-11-02 |
| Refuse | general | 2026-11-05 |

### Midlothian

Address: EH19 2EB, 52. Council site: https://www.midlothian.gov.uk/info/1054/bins_and_recycling/343/bin_collection_days

| Bin (council's name) | We call it | Next dates |
|---|---|---|
| Cardboard | recycling | 2026-11-16 |
| Food waste | food | 2026-11-04 |
| Garden waste | garden | 2026-10-30 |
| General waste | general | 2026-11-02 |
| Glass | recycling | 2026-11-06 |
| Recycling | recycling | 2026-11-09 |

### Ceredigion

Address: SY23 4RQ, BLAEN CWMMAGWR, TRISANT, CEREDIGION, SY23 4RQ. Council site: https://www.ceredigion.gov.uk/resident/bins-recycling/

| Bin (council's name) | We call it | Next dates |
|---|---|---|
| Clear Recycling Bag | recycling | 2026-11-02 |
| Food Waste | food | 2026-11-02 |
| Glass Bottles and Jars | recycling | 2026-11-02 |
| Non-Recyclable Waste | general | 2026-11-02 |

### Fermanagh and Omagh

Address: BT74 6DQ, 20. Council site: https://www.fermanaghomagh.com/services/environment-and-waste/waste-collection-calendar/

| Bin (council's name) | We call it | Next dates |
|---|---|---|
| Black Landfill | general | 2026-11-06, 2026-11-20 |
| Blue Recycling | recycling | 2026-10-30, 2026-11-13 |
| Brown Composting | garden | 2026-11-09 |

### Barnet

Address: EN4 8TB, 26A. Council site: https://www.barnet.gov.uk/recycling-and-waste/bin-collections/find-your-bin-collection-day

| Bin (council's name) | We call it | Next dates |
|---|---|---|
| Food Waste | food | 2026-11-02, 2026-11-09 |
| General Waste | general | 2026-11-02, 2026-11-09 |
| Recycling Bin | recycling | 2026-11-02, 2026-11-09 |

### East Riding of Yorkshire

Address: HU17 8LG, 14. Council site: https://www.eastriding.gov.uk


- Flag: did not fetch (ReadTimeout)

### St. Helens

Address: L34 2GA, 15. Council site: https://www.sthelens.gov.uk/


- Flag: did not fetch (FetchError: response has no collections)

### Calderdale

Address: HX3 5EQ, 95. Council site: https://www.calderdale.gov.uk/environment/waste/household-collections/collectiondayfinder.jsp


- Flag: did not fetch (HTTPError)

## Did not fetch

- East Riding of Yorkshire: ReadTimeout
- St. Helens: FetchError: response has no collections
- Calderdale: HTTPError

