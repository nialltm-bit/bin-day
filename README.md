# bin-day

Tells you which bins go out on which day, anywhere in the UK.

Enter your postcode, pick your address, say whether you have a garden waste bin, and subscribe to a personal calendar feed. Your calendar reminds you the night before each collection, and the calendar updates itself when collections move for bank holidays, Christmas or a change of round.

**Status:** setting up. The stack is chosen (see [docs/stack.md](docs/stack.md)) and there is a hello-world site, but no product yet. Work is tracked in the [Bin Day project in Linear](https://linear.app/freshtech/project/bin-day-df9a153b7b73).

## How it will work

1. **Postcode to address.** A postcode lookup returns the addresses at that postcode, each with its UPRN (Unique Property Reference Number). UPRN is the identifier most council bin systems are keyed on.
2. **Address to council.** We work out which council collects bins at that address.
3. **Council to collection dates.** Each council has its own system, so each needs its own integration. We build on [UKBinCollectionData](https://github.com/robbrad/UKBinCollectionData), an open-source project with scrapers for hundreds of UK councils.
4. **Dates to calendar.** Each user gets a private calendar subscription URL for Google, Apple or Outlook. Same-day collections are merged into one event, such as "Bins: recycling + food". Each event carries its own reminder for the evening before, so no email is needed.
5. **Keeping it right.** Every address is re-checked weekly. A round change adds a warning event to the feed a week ahead. Broken council integrations raise an alert before users notice.

## Decisions so far

- **Nationwide, launched council by council.** People in councils we don't cover yet can join a waitlist. The waitlist tells us which council to build next.
- **Web first.** A native app comes later, if the data shows push notifications or a home screen widget are worth it.
- **Calendar subscription, not one-off events.** Changes flow through without the user doing anything.
- **Night-before reminders live in the calendar.** Each event has an alarm for Apple Calendar and Outlook. Google ignores alarms in subscribed feeds, so for Google the collection is a timed evening event ("Bins out tonight: recycling + food") and setup includes a short guide to turning on notifications for the calendar.
- **No email in v1.** We send no email and store no email addresses. A person picks an address and gets a feed URL, and we store only the address identifier and a random feed token. The waitlist records the council only, so we can't tell people when it is added.
- **Optional email sign-up, off at launch.** An opt-in for occasional product updates is built behind a single feature flag that is off by default. With the flag off, nothing is shown or collected. Switching it on reverses the decision above and needs the email consent work in FRE-285 first.
- **One page, no accounts.** Postcode, address, garden waste yes or no, and a button. Results show the next collections and the subscribe buttons. Moving house means looking up again.
- **Waste streams, not bin colours.** We model general, recycling, food and garden waste, then show each council's own colours and names. A "green bin" means different things in different councils.
- **Garden waste is opt-in.** It's usually a paid council subscription.
- **First council end to end:** Bath & North East Somerset.

## Stack

Free to run, with as much as possible in GitHub. Full reasoning in [docs/stack.md](docs/stack.md).

- **Frontend:** TypeScript, built with Vite and hosted on GitHub Pages.
- **Fetching:** a scheduled GitHub Actions workflow runs Python with UKBinCollectionData pinned at 0.173.5.
- **Signup and calendar feed:** Google Apps Script web apps (TypeScript, deployed with `clasp`), with a private Google Sheet as the database.
- **Council lookup:** postcodes.io.

## Development

Frontend, from `web/`: `npm install`, then `npm run dev`, `npm run lint`, `npm test`, `npm run build`. Python scripts, from the repo root: `pip install ruff pytest`, then `ruff check scripts` and `pytest`. CI runs the same checks on every pull request.

## Using council data responsibly

We fetch each address at most once a week, rate limit requests to each council, use official APIs or calendar feeds wherever a council offers them, and send scraper fixes back to UKBinCollectionData.

## Contributing

This repo is public. Never commit API keys, tokens or other secrets. Use environment variables.

## Licence

MIT. See [LICENSE](LICENSE).
