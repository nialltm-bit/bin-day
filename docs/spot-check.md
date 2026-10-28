# Spot check (2026-10-28)

Every covered council, run once with its public test address. This catches councils that don't fetch and results that
can't be right (a bin on two weekdays, odd gaps, no general or recycling bin). It cannot say the dates are true.

- Councils checked: 43. Fetched: 40. Did not fetch: 3.
- Fetched but flagged: 2.

## To check by hand

Put the address into the council's own bin page and compare the next dates and what each bin is. These are upstream's public
test addresses.

### Redcar and Cleveland

Address: TS10 2RE, 11. Council site: https://www.redcar-cleveland.gov.uk

| Bin (council's name) | We call it | Next dates |
|---|---|---|
| FOOD | food | 2026-10-28, 2026-11-04, 2026-11-11, 2026-11-18 |
| RECYCLING | recycling | 2026-11-04, 2026-11-18 |
| REFUSE | general | 2026-10-28, 2026-11-11, 2026-11-25 |

### Colchester

Address: CO2 8UN, 29. Council site: https://www.colchester.gov.uk/your-recycling-calendar

| Bin (council's name) | We call it | Next dates |
|---|---|---|
| Food waste | food | 2026-10-29, 2026-11-05, 2026-11-12, 2026-11-19 |
| Glass | recycling | 2026-10-29, 2026-11-12 |
| Mixed recycling (paper/card/plastics/tins/cans) | recycling | 2026-10-29, 2026-11-12 |
| Non-recyclable rubbish | general | 2026-11-05, 2026-11-19 |

### East Riding of Yorkshire

Address: HU17 8LG, 14. Council site: https://www.eastriding.gov.uk

| Bin (council's name) | We call it | Next dates |
|---|---|---|
| Blue Bin (Recycling) | recycling | 2026-10-30 |
| Brown Bin (Garden Waste) | garden | 2026-10-28 |
| Green Bin (General Waste) | general | 2026-11-06 |

### Somerset

Address: TA6 4AA, 5. Council site: https://www.somerset.gov.uk/

| Bin (council's name) | We call it | Next dates |
|---|---|---|
| Food Recycling | food | 2026-10-28 |
| Recycling Collection | recycling | 2026-10-28 |
| Rubbish Collection | general | 2026-10-28 |

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
| Black Landfill | general | 2026-11-06 |
| Blue Recycling | recycling | 2026-10-30, 2026-11-13 |
| Brown Composting | garden | 2026-11-09 |

### Barnet

Address: EN4 8TB, 26A. Council site: https://www.barnet.gov.uk/recycling-and-waste/bin-collections/find-your-bin-collection-day

| Bin (council's name) | We call it | Next dates |
|---|---|---|
| Food Waste | food | 2026-11-02, 2026-11-09 |
| General Waste | general | 2026-11-02, 2026-11-09 |
| Recycling Bin | recycling | 2026-11-02, 2026-11-09 |

### Brighton and Hove

Address: BN1 8NE, 44. Council site: https://enviroservices.brighton-hove.gov.uk/link/collections


- Flag: did not fetch (FetchError)

### East Hampshire

Address: GU31 4AG, 15 College Street. Council site: https://www.easthants.gov.uk

| Bin (council's name) | We call it | Next dates |
|---|---|---|
| Recycling (green bin) and glass box(es) | recycling | 2026-10-29 |

- Flag: no general waste bin

### Test Valley

Address: SO51 0BY, 2. Council site: https://testvalley.gov.uk/wasteandrecycling/when-are-my-bins-collected/when-are-my-bins-collected

| Bin (council's name) | We call it | Next dates |
|---|---|---|
| Food Waste | food | 2026-11-03, 2026-11-10 |
| Garden Waste | garden | 2026-10-30, 2026-11-13 |

- Flag: no general waste bin
- Flag: no recycling bin

### Surrey Heath

Address: GU20 6PN, 36. Council site: https://asjwsw-wrpsurreyheathmunicipal-live.whitespacews.com/


- Flag: did not fetch (UnmappedBinError: unmapped bin names: Batteries/small electricals/textiles)

### Neath Port Talbot

Address: SA13 3BA, 2. Council site: https://www.npt.gov.uk


- Flag: did not fetch (UnmappedBinError: unmapped bin names: Batteries (Battery Bag))

## Did not fetch

- Brighton and Hove: FetchError
- Surrey Heath: UnmappedBinError: unmapped bin names: Batteries/small electricals/textiles
- Neath Port Talbot: UnmappedBinError: unmapped bin names: Batteries (Battery Bag)

## Fetched but flagged

- East Hampshire: no general waste bin
- Test Valley: no general waste bin; no recycling bin

