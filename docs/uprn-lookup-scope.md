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

## The options

| # | Option | Resident experience | Free | Councils it opens | Build effort | Main risk |
|---|---|---|---|---|---|---|
| A | **Paste your UPRN**, with a link to a free finder (findmyaddress.co.uk, uprn.uk) | Looks up their UPRN on another site, copies a number back | Yes | Up to about 187, all at once, once their entries are generated | Small: a UPRN box on the sign-up page, validation, wording; entries come from the existing probe and generator | Friction and drop-off. A wrong UPRN gives the wrong bin day. Depends on a third-party site staying up, and its terms need checking before we send people there |
| B | **Per-platform address search**: call the same postcode-to-address API the council's system uses, one resolver per platform | Types postcode, picks address. Best experience | Yes, but each council's API terms are unchecked | About 20 to 25 (Whitespace 6, Jadu 6, Bartec 4, AchieveForms where it exposes a lookup, and a few more) | Medium per platform, and each is reverse engineering that can break | The 133 bespoke councils get nothing from it |
| C | **Open data postcode to homes on a map**: ONS UPRN Directory plus OS Open UPRN (open, national, UPRN with coordinates, no address text), resident taps their home | Types postcode, taps a dot on a map | Yes, but needs about 100 to 200 MB of static data on Pages | All of them, in principle | Large: build the data shards, a map picker, test | Tapping the right house in a terrace is error-prone and the wrong tap is a wrong bin day. Adding OpenStreetMap house numbers could help; coverage unknown. The ONS file could not be fetched from this session, so the size is an estimate |
| D | **Paid lookup** (Ideal Postcodes, OS Places) | Types postcode, picks address | No: about £30 to £45 per 1,000 sign-ups (see `spike-address-lookup.md`) | All | Small | Breaks the free rule. Ruled out for now |
| E | **Ask the finder sites for an API** (uprn.uk, whatsmyuprn.com, findmyaddress.co.uk) | Best, if it works | Unknown | All | One email each | No reply, or a charge. Costs nothing to try |

## Recommendation

1. **Do E now.** An email costs nothing and a yes would replace A, B and C.
2. **Do A first as the quick win.** It is the only option that lights up a large number of councils with a small
   build. Make it honest and safe: say plainly that this council needs a UPRN, link to a finder, and after sign-up show
   the dates we found ("does this look right? Bins on Thursday") so a wrong UPRN is noticed straight away. Keep it
   behind a clear label so the councils with a normal postcode-and-number flow stay simple.
3. **Do B for platforms that cover several councils** if A's drop-off turns out to be bad: Whitespace, Jadu, Bartec,
   AchieveForms. That is about 20 to 25 councils with the nicest experience.
4. **Leave C** until A and B are tried. It is the only route to everyone, but it is the most work and the least safe.

## What A needs, in order

1. **Measure the prize** (running now, see the end of this file): each UPRN council once with upstream's public test
   UPRN, to see how many fetch and give a usable calendar. That is the real upper bound for A.
2. **Generate registry entries** for the ones that work. The probe, bin-name mapping and generator already exist; they
   need a UPRN mode (the registry entry takes `inputs: ["uprn"]`, which the fetcher, store and feed already support
   because B&NES runs on one).
3. **Sign-up page.** `canFindUprn` already exists in `web/src/coverage.ts` for exactly this; add a UPRN box and wording
   for councils whose entry has `inputs: ["uprn"]`, and a "show me what you found" step after sign-up.
4. **Privacy.** A UPRN identifies a property, so it is personal data like the postcode and house number. The privacy
   policy and `docs/privacy.md` already list "UPRN (councils that need one)"; add the finder sites by name (we send people
   to them, we don't send them anything).
5. **Check the finders' terms** before linking, and what happens if one disappears (the page should still work for
   anyone who already knows their UPRN).

## What I can't tell you yet

- How many of the 187 really produce a complete calendar (bin names, general and recycling bins present).
- Whether residents will go and find their UPRN. Nothing here measures that; the first people to try it will tell us.
- How many people these councils cover (the population file is missing from the census).
- The terms of the finder sites, and whether any will give us an API.
