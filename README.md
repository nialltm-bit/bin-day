# bin-day

Tells you which bins go out on which day, anywhere in the UK.

Enter your postcode, pick your address, say whether you have a garden waste bin, and subscribe to a personal calendar feed. You get a reminder the night before each collection, and the calendar updates itself when collections move for bank holidays, Christmas or a change of round.

**Status:** planning. Nothing to run yet. Work is tracked in the [Bin Day project in Linear](https://linear.app/freshtech/project/bin-day-df9a153b7b73).

## How it will work

1. **Postcode to address.** A postcode lookup returns the addresses at that postcode, each with its UPRN (Unique Property Reference Number). UPRN is the identifier most council bin systems are keyed on.
2. **Address to council.** We work out which council collects bins at that address.
3. **Council to collection dates.** Each council has its own system, so each needs its own integration. We build on [UKBinCollectionData](https://github.com/robbrad/UKBinCollectionData), an open-source project with scrapers for hundreds of UK councils.
4. **Dates to calendar.** Each user gets a private calendar subscription URL for Google, Apple or Outlook. Same-day collections are merged into one event, such as "Bins: recycling + food".
5. **Keeping it right.** Every address is re-checked weekly. Round changes trigger an email and a warning event in the feed. Broken council integrations raise an alert before users notice.

## Decisions so far

- **Nationwide, launched council by council.** People in councils we don't cover yet can join a waitlist. The waitlist tells us which council to build next.
- **Web first.** A native app comes later, if the data shows push notifications or a home screen widget are worth it.
- **Calendar subscription, not one-off events.** Changes flow through without the user doing anything.
- **Night-before reminders.** Google ignores reminders embedded in subscribed feeds, so setup includes a short guide to turning on calendar notifications, with email reminders as an alternative.
- **Waste streams, not bin colours.** We model general, recycling, food and garden waste, then show each council's own colours and names. A "green bin" means different things in different councils.
- **Garden waste is opt-in.** It's usually a paid council subscription.
- **First council end to end:** Bath & North East Somerset.

## Using council data responsibly

We fetch each address at most once a week, rate limit requests to each council, use official APIs or calendar feeds wherever a council offers them, and send scraper fixes back to UKBinCollectionData.

## Contributing

This repo is public. Never commit API keys, tokens or other secrets. Use environment variables.

## Licence

MIT. See [LICENSE](LICENSE).
