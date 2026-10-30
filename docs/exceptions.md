# Exceptions: councils not on the site yet

309 of 361 councils are not covered; 52 are. Each is here with why and what it would take.
Rebuilt from the census, the batch probe and the registry by `scripts/exceptions.py`; the same data is in `exceptions.csv`.

| Group | Councils |
|---|---|
| Bin names are colours or ambiguous | 14 |
| Bin names that combine streams | 7 |
| Calendar would be incomplete | 2 |
| Probe failed | 4 |
| Not probed yet | 0 |
| Failed upstream's own test | 23 |
| Needs a UPRN | 215 |
| Takes another kind of input | 39 |
| No upstream module | 5 |

## Bin names are colours or ambiguous (14)

**What it takes:** A person looks up what each bin is on the council's site and says so; then the council is added.

| Council | ONS | Why | Bins the council returns |
|---|---|---|---|
| City of Edinburgh | S12000036 | unrecognised bin name 'Green Bin' | Brown Garden Waste Bin, Food Waste Bin, Glass Box, Green Bin, Grey Bin |
| Cotswold | E07000079 | unrecognised bin name 'White Bag' | 180 Litre Refuse, Black Recycling Box, Blue Bag, Garden Bin, Outdoor Food Caddy, White Bag |
| Fife | S12000047 | unrecognised bin name 'Green' | Blue, Brown, Green, Grey |
| Greenwich | E09000011 | unrecognised bin name 'Green Bin' | Black Bin, Blue Bin, Green Bin |
| Hertsmere | E07000098 | unrecognised bin name 'Green' | Food, Green, Recycling, Refuse |
| Hillingdon | E09000017 | unrecognised bin name 'Household' | Food, Household, Recycling |
| Knowsley | E08000011 | unrecognised bin name 'Maroon' | Blue, Grey, Maroon |
| North West Leicestershire | E07000134 | unrecognised bin name 'Purple Bag' | Blue Bag, Garden Waste, Purple Bag, Red Box, Refuse, Yellow Bag |
| Peterborough | E06000031 | unrecognised bin name 'Empty Bin 240L Green' | Empty Bin 240L Black, Empty Bin 240L Green |
| Sefton | E08000014 | unrecognised bin name 'Green' | Green, Recycling, Residual |
| South Cambridgeshire | E07000012 | unrecognised bin name 'Organic' | Domestic, Food, Organic, Recycle |
| South Kesteven | E07000141 | unrecognised bin name 'Purple Bin' | Black Bin, Food Bin, GREEN, Grey Bin, Purple Bin |
| Swale | E07000113 | unrecognised bin name 'green bin' | blue bin, garden waste, green bin |
| West Lindsey | E07000142 | unrecognised bin name 'Green' | Black, Blue, Green, Orange, Purple |

## Bin names that combine streams (7)

**What it takes:** Decide how a name like 'Food & Garden' or 'Glass+Food' should appear in the calendar (one bin with two kinds of waste).

| Council | ONS | Why | Bins the council returns |
|---|---|---|---|
| Caerphilly | W06000018 | unrecognised bin name 'Food & Garden' | Food & Garden, Recycling, Refuse |
| East Ayrshire | S12000008 | unrecognised bin name 'Glass+Food' | Garden Waste, General Waste+Food (+food only after transition week), Glass+Food, Paper/Card+Food, Plastic/Cans+Food, Transition Week, Trolley+Food |
| East Lothian | S12000010 | unrecognised bin name 'Food waste and recycling' | Food waste and recycling, Non recyclable waste |
| Mid Ulster | N09000009 | unrecognised bin name 'Garden and food waste bin (Brown)' | Garden and food waste bin (Brown), General waste bin (Black) |
| Na h-Eileanan Siar | S12000013 | unrecognised bin name 'Organic Food & Garden Waste / Mixed Recycling (Blue Bin)' | Glass (Green Bin), Non-Recyclable Waste (Grey Bin), Organic Food & Garden Waste / Mixed Recycling (Blue Bin) |
| Stirling | S12000030 | unrecognised bin name 'Food and Garden' | AHP, Food and Garden, Glass, Non-recyclable Waste, Paper & Cardboard, Plastic, cans and cartons |
| West Lothian | S12000040 | unrecognised bin name 'Brown Bin (Now for Garden and Food Waste)' | Blue Bin, Brown Bin (Now for Garden and Food Waste), Green Bin, Grey Bin |

## Calendar would be incomplete (2)

**What it takes:** The bins found lack a general waste or recycling bin. Check whether the module drops one, or whether the council really collects it elsewhere.

| Council | ONS | Why | Bins the council returns |
|---|---|---|---|
| East Hampshire | E07000085 | the bins found have no general waste bin, so the calendar would be incomplete | Recycling (green bin) and glass box(es) |
| Test Valley | E07000093 | the bins found have no general waste and no recycling bin, so the calendar would be incomplete | Food Waste, Garden Waste |

## Probe failed (4)

**What it takes:** Re-run the probe; if it still fails, the module may be broken or blocked from GitHub's network.

| Council | ONS | Why | Bins the council returns |
|---|---|---|---|
| Chelmsford | E07000070 | probe failed (ValueError) |  |
| Hinckley and Bosworth | E07000132 | probe failed (ReadTimeout) |  |
| Isle of Wight | E06000046 | probe failed (ConnectionError) |  |
| Wyre Forest | E07000239 | source.url must be an https URL | Black/Grey Rubbish Bin, Green Recycling Bin |

## Failed upstream's own test (23)

**What it takes:** The module did not pass upstream's test in our run: broken upstream, or blocked from GitHub's network. Needs a look at the module.

| Council | ONS | Why | Bins the council returns |
|---|---|---|---|
| Ashfield | E07000170 | failed upstream's own test |  |
| Barking and Dagenham | E09000002 | failed upstream's own test |  |
| Boston | E07000136 | failed upstream's own test |  |
| Chichester | E07000225 | failed upstream's own test |  |
| Dacorum | E07000096 | failed upstream's own test |  |
| East Lindsey | E07000137 | failed upstream's own test |  |
| East Renfrewshire | S12000011 | failed upstream's own test |  |
| Gateshead | E08000037 | failed upstream's own test |  |
| Halton | E06000006 | failed upstream's own test |  |
| Inverclyde | S12000018 | failed upstream's own test |  |
| Lancaster | E07000121 | failed upstream's own test |  |
| Mid Sussex | E07000228 | failed upstream's own test |  |
| Mid and East Antrim | N09000008 | failed upstream's own test |  |
| Norwich | E07000148 | failed upstream's own test |  |
| Powys | W06000023 | failed upstream's own test |  |
| Preston | E07000123 | failed upstream's own test |  |
| South Tyneside | E08000023 | failed upstream's own test |  |
| Stockton-on-Tees | E06000004 | failed upstream's own test |  |
| Sunderland | E08000024 | failed upstream's own test |  |
| Swansea | W06000011 | failed upstream's own test |  |
| Waverley | E07000216 | failed upstream's own test |  |
| West Berkshire | E06000037 | failed upstream's own test |  |
| Woking | E07000217 | failed upstream's own test |  |

## Needs a UPRN (215)

**What it takes:** A free address-to-UPRN lookup (FRE-294), then these can be probed.

Aberdeen City, Aberdeenshire, Adur, Amber Valley, Angus, Ards and North Down, Argyll and Bute, Armagh City, Banbridge and Craigavon, Ashford, Barnsley, Basildon, Basingstoke and Deane, Bedford, Belfast, Bexley, Birmingham, Blaby, Blackburn with Darwen, Blaenau Gwent, Bolsover, Bolton, Bournemouth, Christchurch and Poole, Bradford, Braintree, Breckland, Bristol, City of, Bromsgrove, Broxbourne, Broxtowe, Buckinghamshire, Burnley, Cambridge, Cannock Chase, Canterbury, Cardiff, Carmarthenshire, Central Bedfordshire, Charnwood, Cheltenham, Cherwell, Cheshire East, Cheshire West and Chester, Chesterfield, Chorley, Conwy, Cornwall, County Durham, Crawley, Cumberland, Darlington, Dartford, Denbighshire, Derby, Derbyshire Dales, Dorset, Dover, Dudley, Dumfries and Galloway, Dundee City, Ealing, East Cambridgeshire, East Devon, East Dunbartonshire, East Hertfordshire, East Suffolk, Eastbourne, Eastleigh, Elmbridge, Epsom and Ewell, Erewash, Exeter, Falkirk, Fareham, Fenland, Flintshire, Folkestone and Hythe, Glasgow City, Gloucester, Great Yarmouth, Gwynedd, Harborough, Haringey, Harlow, Harrow, Hart, Hartlepool, Hastings, Havering, Herefordshire, County of, Highland, Horsham, Hounslow, Huntingdonshire, Hyndburn, Isle of Anglesey, Islington, King's Lynn and West Norfolk, Kingston upon Hull, City of, Kirklees, Lambeth, Leeds, Leicester, Lewes, Lewisham, Lichfield, Lincoln, Liverpool, Luton, Maldon, Malvern Hills, Manchester, Mansfield, Medway, Melton, Merton, Mid Devon, Milton Keynes, Mole Valley, Monmouthshire, New Forest, Newcastle-under-Lyme, Newham, Newport, North Ayrshire, North Devon, North East Lincolnshire, North Kesteven, North Lincolnshire, North Northamptonshire, North Somerset, North Tyneside, North Yorkshire, Northumberland, Nottingham, Oadby and Wigston, Oldham, Oxford, Pembrokeshire, Perth and Kinross, Plymouth, Portsmouth, Reading, Redbridge, Redditch, Reigate and Banstead, Renfrewshire, Rhondda Cynon Taf, Richmond upon Thames, Rochdale, Rother, Rugby, Runnymede, Rushcliffe, Rushmoor, Salford, Sandwell, Solihull, South Ayrshire, South Derbyshire, South Gloucestershire, South Hams, South Holland, South Norfolk, South Oxfordshire, South Ribble, South Staffordshire, Southampton, Southend-on-Sea, Southwark, St Albans, Stafford, Staffordshire Moorlands, Stevenage, Stockport, Stoke-on-Trent, Stratford-on-Avon, Stroud, Sutton, Swindon, Tameside, Tandridge, Teignbridge, Telford and Wrekin, Tendring, Tewkesbury, Thanet, Three Rivers, Tonbridge and Malling, Torbay, Torridge, Tower Hamlets, Tunbridge Wells, Vale of White Horse, Walsall, Wandsworth, Warrington, Warwick, Watford, Wealden, Welwyn Hatfield, West Devon, West Dunbartonshire, West Lancashire, West Northamptonshire, West Suffolk, Wigan, Wiltshire, Windsor and Maidenhead, Wolverhampton, Worcester, Worthing, Wrexham, Wychavon, Wyre, York

## Takes another kind of input (39)

**What it takes:** Public calendar link, street name, council-specific reference or URL. Each needs its own way of asking the resident.

| Council | ONS | Why | Bins the council returns |
|---|---|---|---|
| Antrim and Newtownabbey | N09000001 | takes url_property_ref |  |
| Brentwood | E07000068 | takes ical_url |  |
| Bridgend | W06000013 | takes postcode |  |
| Bromley | E09000006 | takes url_property_ref |  |
| Castle Point | E07000069 | takes other_id |  |
| Causeway Coast and Glens | N09000004 | takes ical_url |  |
| Clackmannanshire | S12000005 | takes postcode |  |
| Coventry | E08000026 | takes url_property_ref |  |
| Derry City and Strabane | N09000005 | takes ical_url |  |
| East Staffordshire | E07000193 | takes url_property_ref |  |
| Epping Forest | E07000072 | takes postcode |  |
| Gedling | E07000173 | takes house_number |  |
| Gosport | E07000088 | takes postcode |  |
| Hammersmith and Fulham | E09000013 | takes postcode |  |
| Havant | E07000090 | takes ical_url |  |
| Ipswich | E07000202 | takes house_number |  |
| Kingston upon Thames | E09000021 | takes url_property_ref |  |
| Merthyr Tydfil | W06000024 | takes postcode |  |
| Middlesbrough | E06000002 | takes house_number |  |
| Moray | S12000020 | takes other_id | Blue Bin, Brown Bin, Glass Container, Green Bin, Purple Bin |
| Newark and Sherwood | E07000175 | takes other_id |  |
| Newry, Mourne and Down | N09000010 | takes ical_url |  |
| North East Derbyshire | E07000038 | takes house_number |  |
| North Lanarkshire | S12000050 | takes url_property_ref |  |
| North Warwickshire | E07000218 | takes ical_url |  |
| Nuneaton and Bedworth | E07000219 | takes house_number |  |
| Orkney Islands | S12000023 | takes house_number |  |
| Pendle | E07000122 | takes ical_url |  |
| Ribble Valley | E07000124 | takes ical_url |  |
| Rossendale | E07000125 | takes ical_url |  |
| Rotherham | E08000018 | takes postcode |  |
| Shetland Islands | S12000027 | takes postcode |  |
| Shropshire | E06000051 | takes url_property_ref |  |
| South Lanarkshire | S12000029 | takes postcode |  |
| Tamworth | E07000199 | takes other_id |  |
| Torfaen | W06000020 | takes ical_url |  |
| Trafford | E08000009 | takes ical_url |  |
| Wakefield | E08000036 | takes url_property_ref |  |
| Westminster | E09000033 | takes usrn |  |

## No upstream module (5)

**What it takes:** Nobody has written a scraper for this council. Write one, or send it upstream.

| Council | ONS | Why | Bins the council returns |
|---|---|---|---|
| City of London | E09000001 | no upstream module |  |
| Fylde | E07000119 | no upstream module |  |
| Isles of Scilly | E06000053 | no upstream module |  |
| Kensington and Chelsea | E09000020 | no upstream module |  |
| Rutland | E06000017 | no upstream module |  |
