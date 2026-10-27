# Change detection (FRE-281, and the failure rules from FRE-270)

Every time the fetcher gets fresh dates for an address it compares them with what it stored last time, and it refuses
results that look broken. This is what lets the calendar feed warn people about round changes (FRE-288) and what keeps
a broken scraper from showing anyone "no collections".

## 1. Suspicious results are failures

A response that parses but looks wrong is recorded as a failure. The last good dates are kept, `consecutive_failures`
goes up, and the reason is saved in the Sheet's `last_error`. Nothing is shown to people from the bad response. A
failure is flagged when:

- every date returned is in the past;
- there is no collection in the next 14 days;
- a stream the address had last time is missing (**garden is exempt**, because garden waste is seasonal and
  optional, and councils drop it over winter);
- the response is empty or malformed (rejected earlier, when the response is read).

The feed shows "Couldn't confirm this week's collection" once the last good fetch is more than 14 days old, so a
broken scraper shows up for people within two weeks. Raising an alert for a broken scraper is FRE-282.

## 2. Classifying differences

For councils that return only the next date for each bin (`next_only`, such as B&NES), the date we **expected** is the
previous confirmed date stepped forward by the bin's `every_weeks` until it is today or later. That is exactly how the
calendar feed projects dates, so a projected date that the council then overrules is checked here like any other
difference. For councils that return a full schedule, the dates both fetches cover are compared and the ones that
moved are paired up.

The difference between the date we got and the date we expected is classified as:

| Kind | When | What happens |
|---|---|---|
| none | the dates match | nothing |
| `expected_shift` | a move of 1 or 2 days, and the expected date, the new date or the previous anchor is in a bank holiday week or the Christmas and New Year period | updated and logged. No alert. |
| `round_change` | anything else: a different weekday, or a week pattern that has moved (for example a fortnightly bin flipping) | updated and logged. FRE-288 turns these into an alert. |

"The previous anchor is in a holiday week" matters because a holiday shift is still in the stored date the next time
we look, so the move back to the normal day is also expected. A shift of 3 days or more at Christmas is recorded as a
round change (a rare, once-a-year alert), and a holiday region whose dates are not verified never hides a change.

A bin we have not seen before, or one with no `every_weeks`, has nothing to compare with and is not a change.

**Holiday weeks** are Monday to Sunday weeks that have a bank holiday in them or overlap 22 December to 13 January.
The same rule is in the calendar feed, and both implementations are tested against the same cases in
`registry/test-vectors/holiday-weeks.json`.

## 3. The log

Each change is a row in the Sheet's `changes` tab: when, UPRN, council, bin name, kind, the date we expected, the date
we got, and a note ("weekday changed from Friday to Monday"). The public Actions log shows only the council code, a
count of changes by kind, and never a UPRN, a date or a bin name.

## Bank holidays

`registry/bank-holidays.json` has England and Wales, Scotland and Northern Ireland for 2026 and 2027. Only regions
marked `"verified": true` are used. **England and Wales is verified. Scotland and Northern Ireland are drafts**: some
of their dates are confirmed (4 January and 31 May 2027 in Scotland, 12 July 2027 in Northern Ireland) and the rest
follow the usual pattern but have not been checked against the official pages, gov.scot and nidirect. Until someone
checks them and sets `verified`, those regions are treated as unknown: the feed does not project dates for them, and
every difference is recorded as a round change. No Scottish or Northern Irish council is supported yet.

The calendar runs to the end of 2027. A test fails about 60 days before the data runs out, as a reminder to add the
next years.

## Older script

The fetcher asks the script for the previous result with a `get_result` action. If the script hasn't been redeployed
since this change, the action is unknown and the fetcher carries on without change detection, so a scheduled run never
fails because of it. Redeploy the script (see `store.md`) to switch change detection on.
