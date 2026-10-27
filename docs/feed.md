# The calendar feed (FRE-272)

Each person gets a private calendar feed URL. Their calendar app subscribes to it and keeps itself up to date. The
feed is built from the dates the fetcher has stored in the Sheet, every time the calendar asks for it, so it is always
as fresh as the last fetch.

## The URL

`https://script.google.com/macros/s/<script id>/exec?feed=<token>` (or the same with `webcal://` for Apple Calendar).
The token is 64 random hex characters, made when the person subscribes. Every subscription gets its own token, even
for the same address, so a link is never shared between people. Anyone with a link can see that address's bin days,
so people are told not to post it. The token and the UPRN never appear inside the calendar.

A person subscribes with a `subscribe` request to the script (UPRN, ONS code, garden waste yes or no). The address is
added to the fetcher's list once, however many people subscribe to it, and a new address is fetched on the next
daily run. Until then the feed holds one all-day event saying it is getting the person's dates.
Limits: 20 feeds per address and 5,000 in total (change the total with the `MAX_SUBSCRIPTIONS` script property).

The `subscribe` request is public, so anyone can call it. It checks every field, only accepts plain characters in
postcodes and house numbers (so nothing can run as a formula in the Sheet), and stops at the limits above. It cannot
tell a real address from an invented one, and someone could use up the 5,000 total with invented ones. If that
happens, raise the limit or put a bot check (such as Cloudflare Turnstile) in front of the sign-up page; Apps Script
cannot limit by IP address.

## What is in the feed

- One **all-day event per collection day**, with same-day bins merged: "Bins: rubbish + recycling + food". The
  description lists the council's own bin names, for example "Put out: Black bin, Blue bag (cardboard), Green box,
  Food caddy."
- Each event has a **reminder (VALARM) for 6pm the day before**, for calendars that honour it. Apple Calendar does.
  Google Calendar ignores reminders in subscribed feeds, so Google users turn on notifications for the calendar
  themselves. Don't rely on the alarm.
- **Garden waste** bins appear only for people who said they have one.
- A bin with no mapping in the registry is never shown.

## Dates for councils that return only the next date

Councils with `schedule: next_only` (B&NES) give one date per bin. For those the feed:

- shows the confirmed next date as a normal event;
- **projects** each bin forward by its `every_weeks` (from the registry), at most **8 weeks** ahead;
- **does not project into a bank holiday week** (a Monday to Sunday week with a bank holiday in it), **or into the
  Christmas and New Year period** (any week overlapping 22 December to 13 January, because councils revise dates into
  mid-January). Those dates appear only once the council confirms them. Projection carries on after the skipped week;
- says **"Expected date, confirmed nearer the time."** in the description of projected events, and nothing of the
  kind on confirmed ones;
- does not project at all for a region whose bank holidays are not verified (only England and Wales so far, in
  `registry/bank-holidays.json`).

Councils that return a full schedule are shown as returned, with no projection.

## Event UIDs

An event's UID is the person's feed id plus the ISO week of its date plus its position among that week's collection
days: `abcd1234-2026-W44-1@bin-day`. So a date that moves within its week (a bank holiday shift, or a projected date
replaced by the confirmed one) keeps its UID and the event moves, and a week's event is updated rather than
duplicated. A collection that moves into a different week is a new event and the old one goes. The calendar's
timestamp is the fetch time, so the feed only changes when the stored dates are refreshed.

## When the data is old

If the last good fetch is more than 14 days old (two missed weekly fetches) the feed shows no dates, only one all-day
event: "Couldn't confirm this week's collection, check the council site". This is a small first step of FRE-288,
so people are never shown stale dates. The warning event for round changes is still FRE-288.

## Trying it

1. Redeploy the script with the new `Code.js` (see "To change the script later" in `store.md`). It adds a
   `subscriptions` tab to the Sheet by itself.
2. Open the test page (`/bin-day/subscribe-test.html` on the site), paste the web app URL, enter your UPRN or the
   public test UPRN `100120000855`, and press the button. It gives an https link and a webcal link.
3. Subscribe to the link in a calendar app. An address needs one fetch first: if it has no data yet you will see
   the "getting your collection dates" event. The test UPRN already has data in the Sheet.

The test page is temporary. The real sign-up page is FRE-271.

## Results

Checked on 27 October 2026 with the B&NES test address (UPRN 100120000855), subscribed from Google Calendar on the web:

- The subscription works, and the events appeared the same day.
- It showed eight events: Fridays 30 October to 18 December. Nothing is shown from 21 December, because of the
  8 week window and the Christmas period rule.
- Titles alternate correctly: "Bins: rubbish + recycling + food" every other week, "Bins: recycling + food" in
  between.
- Every date after 30 October says "Expected date, confirmed nearer the time." and 30 October does not.
- No duplicate events.

Not checked: Apple Calendar and Outlook (not planned for now), and whether a reminder fires in Google. Google ignores
alarms inside the feed. A person can add their own notification in Google Calendar's settings for the subscribed
calendar (all-day event notifications, for example 1 day before at 6:00pm). That has not been confirmed yet.

## Limits

- Calendar apps ask for the feed once or twice a day. Each request runs the script for under a second. Apps Script
  has daily quotas, so thousands of subscribers would need a look at caching; a few hundred is fine.
- Apple Calendar and Outlook should honour the alarm and Google won't; only Google has been checked so far (FRE-289).
