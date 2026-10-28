# When we don't cover a council (FRE-265)

Most postcodes in the UK will not be ready on day one. This is how the page behaves for each case. The logic is in
`web/src/coverage.ts` and the wording is tested there.

## The rule

We show bin days only when the council is supported **and** we can find the address from what the person types (a house
number or name). In every other case we say plainly what is going on, we never guess a neighbouring council, and we
never promise to tell anyone anything later, because we hold no contact details.

## The cases

| Case | What the person sees | Count for the council? |
|---|---|---|
| Not shaped like a postcode | Check it and try again | no |
| Right shape, not a real postcode | Check for typos | no |
| Our postcode service is down or sends rubbish | "Something went wrong, nothing is wrong with your postcode, try again" | no |
| Channel Islands or Isle of Man | Not covered; link to find your council | no |
| Service gives no council for the postcode | Couldn't place the postcode; link to find your council | no |
| Council not in the registry, or `unsupported` | "We don't cover X yet" | yes |
| Council supported, but its source needs a UPRN, and nothing can find the UPRN | "We can't find addresses in X yet" | yes |
| Council `broken` | "X's bin day data isn't working right now, try later" | no |
| Council supported and takes a house number | Ask for the house number or name | n/a |
| Council supported, needs a UPRN, and a UPRN finder is wired in | Show the addresses to pick from | n/a |

Every case that leaves someone without bin days, apart from a typo or a temporary fault, links to the official
[Find your local council](https://www.gov.uk/find-local-council) page, so nobody is left with nowhere to go.

## The count

"Add your council to the count" sends the council code and nothing else (`join_waitlist` in the Apps Script). The
postcode, address and IP address are never sent or stored. The Sheet's `waitlist` tab holds one row per council: code,
count, first and last time. This replaces the email waitlist in FRE-274 for v1, because v1 collects no email.

- The count is a signal, not proof of demand, because anyone can send it. It is for choosing which council to add next.
- The action answers the same for a council we support and one we don't, so it can't be used to list what we cover.
- At most 500 different councils are counted, so junk codes can't pile up. Counting for a known council never stops.

## The council comes from postcodes.io

`admin_district` is the collecting council in both unitary and two-tier areas (the district, not the county). A postcode
that straddles a boundary is given to one council, so the page asks for the house number and the council's own system
has the last word. We have not tested a straddling postcode.

## The homepage coverage section ("Where we cover")

Two views of the same data, chosen with tabs: **List** (with a "find your council" box) and **Map**.

- **Same rules as the lookup.** Each council is `covered`, `on the way` (we have a source but can't find addresses yet),
  `not working right now`, or `not covered yet`, worked out by `availabilityOf` in `web/src/coverage.ts`. The list, the
  map and the postcode lookup use that one function, so they can't disagree.
- **The page says so when nothing is covered.** The summary line is built from the counts ("We can show bin days for 0
  of 361 councils. 1 more is on the way."), so it is true however much is covered.
- **List.** Covered, on the way and not working are listed. The long "not covered yet" list is folded away and opens
  when you type in the search box. The list is also the accessible version of the map.
- **Map.** One SVG path per council, drawn from `web/public/data/council-shapes.json` (no map tiles, no third-party map
  service, no key). Covered is green, on the way is striped amber, not working is orange, not covered is grey, and a ring
  marks every council we have any work on, because a small council would otherwise be lost on a map of the whole
  country. Tap a council to see its status in words. Colour is never the only signal: the legend names every state and the
  tap text spells it out.
- **If the outlines don't load,** the list still works from the registry and says the full list didn't load.
- **Outlines.** `scripts/build_council_shapes.py` (run by the *Build council outlines* workflow) downloads the newest ONS
  Local Authority District boundaries (361 councils: England 296, Scotland 32, Wales 22, Northern Ireland 11, May 2026),
  simplifies them to about 400 m, and writes about 300 KB (about 100 KB compressed). Boundaries are Crown copyright and
  database right under the Open Government Licence, and the page carries that credit. Re-run the workflow when councils
  merge or change.

## Adding councils that need a UPRN

Nothing else needs to change for these. The fetcher, store and feed already work from UPRNs, and B&NES runs end to
end on one. The registry entry is added the usual way (`registry/README.md`). What is missing is something that turns
a typed address into a UPRN for free. When one exists, it is plugged in by passing `canFindUprn: true` to `lookup` in
`web/src/coverage.ts`, and every supported UPRN council becomes ready with an address list to pick from. Until then
they show "We can't find addresses in X yet". Adding their registry entries now is possible but they would stay dark,
and each one needs its bin names and frequencies checked first.

## Still open

- **Our store is keyed by UPRN.** House-number councils have no UPRN, so the store, the feed and the fetcher need an
  address key that can be a UPRN or a council plus postcode plus house number. This is not done yet and must be
  decided before the lookup page (FRE-271).
- **No house-number council is in the registry yet.** Until one is added, the page would ready no council at all.
- FRE-274 still describes an email waitlist and should be reworded.
