# Scope: getting a UPRN for the councils that need one (FRE-294)

215 councils are not covered because their scraper wants a UPRN (the national property reference), and a resident knows
their postcode and house, not their UPRN. They are 60% of the 361 councils, so this is the biggest remaining gain.
The rules are the same as ever: free to run, free to use, no stored address text from a provider, and the resident
should only have to type things they know.

## What the 215 are

| Platform | Councils | Note |
|---|---|---|
| Bespoke council site | 133 | 122 plain HTTP, 11 need a browser. One-offs: no shared code between them |
| Granicus / Firmstep AchieveForms | 36 | 8 need a browser |
| Whitespace | 6 | |
| Jadu | 6 | |
| Bartec | 4 | |
| Everything else (about 30 councils) | 30 | 17 vendors, mostly 1 to 3 councils each |

187 of the 215 passed upstream's own test in our run, so those scrapers work at least with upstream's test UPRN; 28
failed it. By nation: England 184, Scotland 15, Wales 13, Northern Ireland 3. Population is not known yet (the census
could not fetch the ONS file), so I can't say how many people these cover.

## Ruled out

- **Asking the resident to find and paste their UPRN** (with a link to a finder site). Decided against: nobody knows
  what a UPRN is, and it is the sort of step that makes people give up. The resident types a postcode and a house number or
  name, and nothing else.
- **Paid lookups** (Ideal Postcodes, OS Places): about £30 to £45 per 1,000 sign-ups. The project must be free to run
  (`spike-address-lookup.md`).

## The options left

| # | Option | Resident experience | Free | Councils it opens | Build effort | Main risk |
|---|---|---|---|---|---|---|
| B | **Per-platform address search**: call the same postcode-to-address API the council's own system uses, one resolver per platform | Types postcode and number. Same as now | Yes, but each council's API terms are unchecked | About 20 to 25 (Whitespace 6, Jadu 6, Bartec 4, AchieveForms where it exposes a lookup, and a few more) | Medium per platform, and each is reverse engineering that can break | The 133 bespoke councils get nothing from it |
| F | **Open data lookup**: OS Open UPRN (every UPRN with a point, open licence) plus OpenStreetMap house numbers. Find the OpenStreetMap object with their postcode and number, then the UPRN nearest it | Types postcode and number. Same as now | Yes. The data is open; hosting it (static files on Pages) is free | All 215, where OpenStreetMap knows the house number | Large: build the lookup files, a resolver in the sign-up step, tests | Depends on how complete OpenStreetMap house numbers are, which nobody has measured for us. Flats (many UPRNs, one door) and wrong matches give a wrong bin day. OpenStreetMap is licensed ODbL: a lookup file derived from it has to be shared under the same licence and credited |
| E | **Ask a finder site for an API** (uprn.uk, whatsmyuprn.com, findmyaddress.co.uk) | Same as now, if it works | Unknown | All | One email each | No reply, or a charge. Costs nothing to try |
| C | **Postcode to homes on a map**, resident taps theirs | Taps a dot on a map | Yes | All, in principle | Large | Tapping the right house in a terrace is error-prone. Probably also unacceptable |

## Recommendation

1. **Measure F before building anything** (a spike is running, see the end of this file). It runs upstream's public test
   UPRNs through the idea in reverse: is there an OpenStreetMap house number at that home, does it carry the postcode,
   and does the UPRN nearest it lead back to the same home. If the rate is high, F is the only route that covers every
   council with the experience we want. If it is low, F is out and the answer is B plus E.
2. **Do E in parallel.** An email costs nothing and a yes would replace B and F.
3. **Do B for platforms that cover several councils** (Whitespace, Jadu, Bartec, AchieveForms): about 20 to 25 councils
   with the experience we want. Check each platform's address-search terms first.
4. **Leave C** unless nothing else works, and ask first.

## What building F would involve (if the spike says yes)

1. Registry entries for the UPRN councils whose scraper works with a UPRN (the measurement below says how many).
2. A workflow that builds lookup files from OS Open UPRN and OpenStreetMap, sharded by postcode area so a lookup
   downloads a small file, published on Pages under ODbL with credit.
3. In the sign-up step: for a UPRN council, look the postcode and number up in the shard, show what we found for the
   resident to confirm ("Bins on Thursday, next food waste 5 November. Is that right?"), and offer "that's not right"
   rather than guess. Refuse rather than guess if the number is ambiguous or missing.
4. Privacy: the lookup files are public data, we store only the UPRN, and the policy lists OpenStreetMap and OS Open UPRN
   as sources.

## What I can't tell you yet

- How complete OpenStreetMap house numbers are around the homes we need. The spike measures this on a sample of about
  190 homes; it is a sample, not the country.
- How many of the 187 UPRN councils that passed upstream's test really produce a complete calendar (the UPRN probe below).
- How many people these councils cover (the population file is missing from the census).
- The terms of the finder sites and of each platform's address search.
