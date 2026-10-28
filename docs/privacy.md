# Privacy and data handling (FRE-285)

The public policy is `web/privacy.html` (live at `/privacy.html`). This page is the working record behind it: what is
kept, where, why, and what is still open. It is not legal advice; have the policy reviewed before launch.

Controller named in the policy: FreshTech (chosen by the owner on 28 October 2026). Contact route: the contact form on the
privacy page, which keeps messages in a private tab of the Sheet (below); no email address and no GitHub page is shown.
Still open: a legal entity name or company number if there is one.

## What is kept, where, and the basis for it

All of it is in the private Google Sheet behind the Apps Script web app (see `store.md`). Lawful basis for all of it is
legitimate interests (UK GDPR Article 6(1)(f)): giving the person the service they asked for, with the minimum data,
which they would expect, and which they can delete themselves.

| Data | Where | Why | Kept until |
|---|---|---|---|
| Postcode and house number or first line (councils with no UPRN), or a UPRN (councils that need one; none live yet) | `addresses` tab | To ask the council for the dates, weekly | The last feed on the address is deleted |
| Council code, garden waste yes/no, feed token, short id, sign-up time, last day used | `subscriptions` tab | To build the calendar and keep the link private; to find feeds nobody uses | The feed is deleted, or unused for 12 months |
| Fetched dates, last attempt, last error text | `results` tab | To build the calendar; to say when a check failed | The address is deleted |
| Recorded changes (moved collections) | `changes` tab | To warn about round changes | The address is deleted |
| A contact-form message and, if given, how to reply | `messages` tab | To answer questions and rights requests | Deleted after 12 months by the daily clear-out |
| Council code and a count, no person | `waitlist` tab | To choose which council to add next | Not personal data |

Not kept: name, email, phone, IP address (the script cannot read visitors' IP addresses), device identifiers. No
cookies and no browser storage (checked in `web/src`: nothing uses `localStorage`, `sessionStorage` or
`document.cookie`; the GoatCounter script below sets none either, by its own documentation).

## Visit counting (GoatCounter)

`web/src/analytics.ts` adds GoatCounter's script (`gc.zgo.at/count.js`) to the home page and the privacy page when the
build is given an address: the deploy workflow uses `https://binday.goatcounter.com/count` unless the repository variable
`GOATCOUNTER_URL` says otherwise (a single space there turns counting off); local builds have none, so no counting. It is skipped for browsers sending Do Not Track, and only a `*.goatcounter.com/count` address is accepted. It
counts page, referrer, browser, screen size and country, not people. Basis: legitimate interests (knowing whether the
site is used). The policy names GoatCounter and links its privacy policy. Check GoatCounter's own statements (no
cookies, no stored IP addresses) still hold when you review the policy before launch. Nothing about an address, a
postcode or a feed is sent to GoatCounter, and no page address carries the feed token today, so it can't leak through the
referrer; do not add the feed link to any page URL.

The feed token is 64 hex characters (256 bits) made from two random UUIDs, so it can't be guessed. The Sheet is
private, and Actions logs never contain addresses, UPRNs, postcodes or tokens (see `store.md`, "Logs are public").

## Who else receives personal data

- **The council's own website**: the fetcher sends the postcode and house number or address line there (via
  UKBinCollectionData), from a GitHub Actions runner.
- **postcodes.io**: the visitor's browser sends the postcode to find the council. It is not sent by us.
- **Google** (Apps Script and Sheets) and **GitHub** (Pages and Actions) as processors/hosts.

## Deleting and revoking

- **Delete** (built): `unsubscribe` action, public, keyed by the feed token. It deletes the subscription, and when no
  subscription is left for the address it deletes the address row, the result row and the change rows. The feed and
  the date lookup answer "not found" straight away. The privacy page has the control.
- **Revoke**: deleting a feed revokes it. To get a new link, look up again.
- **Deleted while a fetch runs**: a fetch that finishes after its address was deleted writes nothing back (the script
  checks the address still exists before saving dates, failures or changes).
- A person who has lost their link can't delete by themselves, because the token is the only proof of ownership.
  They can ask through the contact form, giving their postcode and house number so the owner can find the row.

## Address lookup provider and UPRNs

FRE-264 settled on no address-lookup provider: the page asks for a postcode and house number, and the council's own
system does the matching. Property Passport and InstaMaps were tried and not adopted; no provider's data is stored.
UPRNs are stored only for councils that need one, none of which are live (they wait for a free UPRN finder, FRE-294).
If a UPRN finder is added later, check its licence terms for storing UPRNs before switching it on.

## Open items

- **Retention (built)**: each feed records the last day it was fetched or its dates were asked for (`last_used`, at
  most one write a day). The scheduled fetch calls `expire_feeds` daily (`python -m fetcher.run expire --sheet`), which
  deletes feeds unused for more than 365 days, and an address, its dates and its changes when it was the last feed on
  it. A feed with no `last_used` yet (made before this existed) counts its sign-up day. Only the counts are logged.
  A calendar app that still subscribes fetches the link regularly, so a live subscription never expires.
- **Contact form (built)**: public `contact` action; the message goes to the `messages` tab (text columns, so nothing is
  run as a formula). Limits: 5 to 2000 characters, an optional reply-to of up to 200 characters, 500 messages kept at
  once, 20 accepted an hour, and a hidden trap field a program fills in (answered as success, kept nowhere). Nothing is
  emailed to the owner (that would need extra Google permissions); the owner reads the tab. A rights request is handled
  by hand: find the row by what the person wrote, delete it, and reply to the address they gave. A person who lost their
  calendar link can ask for deletion by giving their postcode and house number in the message (the policy says so).
- **Legal name**: the policy says "FreshTech" only.
- **Email**: no email is collected. The optional update sign-up in FRE-271 is off. The items under "Before the email
  sign-up is switched on" in FRE-285 stay undone until that is switched on.
- **README**: said "we store only the address identifier". Corrected: for councils with no UPRN the postcode and house
  number are stored as the address.
