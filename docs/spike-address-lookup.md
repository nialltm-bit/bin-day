# Spike: postcode and address lookup (FRE-264)

**Status: research complete, decision needed.** Everything below comes from web searches and the providers' public
pages as summarised by search. I could not open the providers' own pages or terms from my environment, so every
price and licence point marked "check" must be confirmed by a person before money is spent.

## The question

People know their postcode and house, not their UPRN. We need postcode, then a list of addresses, then the chosen
address's UPRN (FRE-265), and the council from the postcode or UPRN (FRE-266). You asked for this to be free. The
ticket also asks for UPRN in the response, cost per lookup and free tier, licence terms for storing, new-build
accuracy, and monthly cost at 1k, 10k and 100k signups.

## The short answer

**There is no free way to get a licence-clean list of addresses with UPRNs at scale.** The address text itself is Royal
Mail data (PAF), and Royal Mail enforces it: getAddress.io, one of the options in the ticket, closed on 4 February 2026
after losing a High Court case about its use of PAF. The UPRN on its own, though, is open data. That shapes the
recommendation: **store only the UPRN, never the address text**, and choose how to pay for the lookup.

- **Free, for a small beta:** use the Ideal Postcodes free trial (50 credits, one month, no card), so testers get the
  proper experience of typing a postcode and picking their address, and ask B&NES whether it will share its own
  address lookup. Cost £0 for the first 50 or so sign-ups, then £9 for the next 200.
- **Paid, for a public launch:** about **£30 to £45 per 1,000 completed signups**. The best fit I found is
  **Ideal Postcodes** (prepaid credit packs, UPRN included).

**People will not know what a UPRN is, and should never see one.** They type a postcode and pick their address; the
UPRN stays behind the scenes. Typing a UPRN is only a last-resort fallback for the few whose address is not listed,
with a link to a finder and plain wording ("your Unique Property Reference Number"). It is not a way to run a beta.

## What I compared

| Option | UPRN | Cost | Free allowance | Licence for storing | Verdict |
|---|---|---|---|---|---|
| **Ideal Postcodes** (live API) | Yes, in every UK lookup at no extra charge | £0.045 per lookup (200 credits, £9) down to £0.028 (32,100 credits, £900). A lookup is one *successful address retrieval*; typing-time searches are free. | One month trial, 50 credits, no card (official site; some listings say 30 days) | Not found. Uses licensed PAF. **Check** `terms.ideal-postcodes.co.uk` | **Recommended when going public.** Prepaid, so spend is capped. |
| **OS Places API** (Ordnance Survey) | Yes | £0.0282 per request (up to 100 addresses). £0.0182 paid up front in blocks of 100 transactions, valid 12 months, plus £0.01 monthly. | **None.** The £1,000 monthly Premium allowance excludes OS Places. | Not found. AddressBase Premium contains Royal Mail IPR. **Check** the OS licence | The runner-up. Billed per *search*, including abandoned ones, and billed after use. |
| **getAddress.io** | Yes (on retrieve) | n/a | n/a | n/a | **Closed 4 Feb 2026** after the High Court case. Ruled out. |
| **OS Open UPRN** | UPRN only | Free | Free | Open Government Licence | Identifiers and coordinates, **no addresses**. Useful, but cannot make an address list. |
| **EPC open data** | UPRN on ~92% of records (2021 figure) | Free | Free | OGL, **except address and postcode fields, which are under restrictive Royal Mail terms** | Ruled out: the restricted fields are the ones we would show. Also only covers homes with an energy certificate. |
| **The council's own lookup** (B&NES) | Probably, via its collection-day finder | Free | n/a | Unknown | **Worth asking.** I could not find a documented public API. Third-party sites (binmap, WhenBin) offer postcode-then-address lookups for B&NES. |
| **Type your own UPRN** | Yes | Free | n/a | None needed | Last-resort fallback only. Nobody knows their UPRN, so it is not usable as the main route. |

## Licence: what we can store

- **UPRNs:** open (OS Open UPRN is under the Open Government Licence), and a UPRN obtained from an open source
  carries no extra restrictions beyond that licence. Storing them is low risk. (One 2015 source says this; check current OS guidance.)
- **Address text:** Royal Mail PAF, licensed. getAddress.io's closure shows the risk of being loose with it.
- **So the design is:** show the address list to the person during sign-up, keep only the chosen **UPRN** (and the
  postcode only for councils whose scraper needs it, as the registry already says), and do not store or cache
  the address list. Caching postcode results to save money is only worth doing once a provider's terms say it is
  allowed. This matches what the Sheet holds today.

## New-build accuracy (not verified)

- PAF, from Royal Mail, is updated daily. AddressBase Premium, which OS Places serves, is rebuilt every six weeks, so it
  can be up to six weeks behind, though it includes some addresses PAF lacks.
- One vendor says new builds can stay out of PAF for months, and that a separate "Not Yet Built" dataset (over 700,000
  addresses) covers some of them. GeoPlace notes a UPRN may not exist until after planning approval.
- I found no published match rates. **Plan for a "my address isn't listed" path** whichever provider we choose
  (typing a UPRN, or joining a waitlist with the postcode), because some new builds will be missing.

## Expected cost

Assumptions: one paid lookup per **completed** signup. "Signups per month" means people who finish and get a feed link.
For OS Places, one search per signup, and a second row where people search twice on average (a typo or a
wrong postcode), because OS Places is charged per search.

| Signups per month | Ideal Postcodes | OS Places, 1 search each | OS Places, 2 searches each |
|---|---|---|---|
| 1,000 | £28 to £45 | £28 | £56 |
| 10,000 | £280 to £450 | £282 | £564 |
| 100,000 | about £2,800 at the best published pack rate; a quote may be lower | £2,820 | £5,640 |

Notes:
- Ideal Postcodes' cheapest rate (£0.028) needs the 32,100-credit pack, **£900 upfront**. The smallest pack is
  £0.045 per lookup. Credits last 12 months. Only the two ends of the scale are published to me; I have not seen the packs in between.
  Larger enterprise tiers are quoted per million lookups (one G-Cloud price document lists 1 million lookups at £6,000
  a year), so 100,000 a month would need a direct quote.
- **Prepaid versus billed after use matters.** With prepaid credits the most you can lose to a flood of fake requests is
  what you bought. OS Places bills afterwards, so an abused public lookup could run up a bill. Either way the
  lookup must go through our own server code (the provider key can never be in the browser) and needs limits.
- The 1k figure is tiny. At beta scale the trial credits cover testing, and one £9 pack covers the first 200 signups.

## Recommendation

1. **Now, to keep moving at no cost:** build the lookup page (postcode, then pick your address) on the **Ideal
   Postcodes free trial** (50 credits, one month, no card; confirm with them that trial credits work on a live site),
   and **ask B&NES** whether it can share the address lookup that its own collection-day finder uses. If it can,
   that is free and authoritative for the one council we support. For the first few testers you can also look
   up their UPRNs yourself, by hand.
   Add a "my address isn't listed" fallback where they can enter their UPRN, explained in plain words.
2. **Before opening to the public:** use **Ideal Postcodes**, behind a small interface in FRE-265 so the provider can be
   swapped. The cost is about £0.03 to £0.045 per signup, spend is capped by prepaid credits, UPRNs are included and
   typing-time searches are free. Only lookups that complete are charged. OS Places is the alternative and about the
   same cost, but it needs an OS Premium plan, bills afterwards, and charges for abandoned searches.
3. **Keep the data rule:** store the UPRN, not the address, and do not cache provider results until the terms allow it.

## Before spending any money, check

- Ideal Postcodes terms on storing and caching: https://terms.ideal-postcodes.co.uk/ and the pack prices at https://ideal-postcodes.co.uk/pricing
- OS Places terms and the Premium plan: https://osdatahub.os.uk/plans
- Whether B&NES will share its address lookup.
- Whether your own use needs a Royal Mail end-user licence. Ideal Postcodes says it handles PAF royalties for its customers, but I did not confirm what that covers for a public sign-up page.

## Sources

- OS Data Hub plans: https://osdatahub.os.uk/plans
- Ideal Postcodes: https://ideal-postcodes.co.uk/pricing and https://ideal-postcodes.co.uk/uprn
- getAddress.io closure and the court case: https://blog.ideal-postcodes.co.uk/getaddress-update, https://www.afd.co.uk/getaddress-replacement/ and the judgment [2025] EWHC 2561 (Ch)
- OS Open UPRN: https://docs.os.uk/os-downloads/identifiers/os-open-uprn
- EPC open data and its licensing: https://guides.opendatacommunities.org/article/35-energy-performance-certificates-overview
- New builds: https://autoaddress.com/articles/not-yet-built-address-data-uk/ and GeoPlace, The UPRN lifecycle
- Ideal Postcodes volume pricing (G-Cloud 15 price document): https://assets.applytosupply.digitalmarketplace.service.gov.uk/g-cloud-15/documents/703280/495164157376040-pricing-document-2025-11-24-1344.pdf
