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
| Council supported, but its source needs a UPRN | "We can't find addresses in X yet" | yes |
| Council `broken` | "X's bin day data isn't working right now, try later" | no |
| Council supported and takes a house number | Ask for the house number or name | n/a |

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

## Still open

- **Our store is keyed by UPRN.** House-number councils have no UPRN, so the store, the feed and the fetcher need an
  address key that can be a UPRN or a council plus postcode plus house number. This is not done yet and must be
  decided before the lookup page (FRE-271).
- **No house-number council is in the registry yet.** Until one is added, the page would ready no council at all.
- FRE-274 still describes an email waitlist and should be reworded.
