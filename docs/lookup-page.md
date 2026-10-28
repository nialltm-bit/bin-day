# The lookup page (FRE-271)

The top of the homepage. A person types a postcode and gets either a calendar link or an honest reason they can't yet.

## The flow

1. **Postcode.** Checked against postcodes.io for the council (`web/src/coverage.ts`). Every outcome has its own wording; see `docs/coverage.md`.
2. **Council we can help with.** The page asks for what that council's source needs, from `house_input` in the registry: a house number or name, or the whole first line of the address. A bare number is refused for a council that needs the first line, in the page and again in the script.
3. **Garden waste.** Yes or no, with no default, because a wrong default would hide a bin someone has.
4. **Show my bin days.** Sends `subscribe` to the Apps Script (council, postcode, house, garden) and gets a private feed token back. The page shows buttons for Google, Apple and Outlook, and the link to copy.
5. **Council we can't help with.** The message, a link to the official find-your-council page, and (where a council could be added) a button that adds the person's council to the count. Only the council code is sent.

Nothing is stored in the browser. Editing the postcode clears everything below it.

## What it can't do yet

- **It doesn't show the dates on the page.** The fetcher runs once a day (05:17 UTC), so a new address has no dates until the next run. The page says the calendar fills in within a day. Showing the next collections straight away needs a fetch triggered at sign-up, which is a separate piece of work.
- **No page address for results** (the ticket asks for a bookmarkable link). The private feed link is the thing to keep.
- **The Google and Outlook "add by link" addresses** are the apps' published add-by-URL forms and have not been tried against a live account. The Apple link is a plain `webcal://` link and the copy box works in any calendar app.
- **No address picker.** There is no free address list (see `docs/spike-address-lookup.md`).
- **UPRN councils** show "can't find addresses yet" until a free UPRN finder exists.
- **The wrong-house risk** in some council sources is described in `docs/coverage.md`. The page can't see which address the source matched.

## One setting you need to make

The page talks to the Apps Script web app, whose address is public but isn't in the repository. Set it once as a **repository variable** (Settings, Secrets and variables, Actions, Variables) called `BIN_DAY_SCRIPT_URL`, with the web app's `/exec` address. The deploy workflow passes it to the build as `VITE_SCRIPT_URL`. Until it is set, the page still finds the council and shows every message, but "Show my bin days" and the count button say they aren't switched on yet.

The script must also be redeployed with the latest `apps-script/dist/Code.js` for the postcode and house-number councils and the count to work.

## Checked

`web/src/signup.ts` and `web/src/lookup-view.ts` have unit tests for the checks, the request, the reasons the script can give and the calendar links. The whole page was also driven in a browser at phone width with the postcode service and the script faked: bad and unknown postcodes, the postcode service down, Channel Islands, a council we don't cover (and the count), a UPRN council, a ready council (bare number refused, missing garden answer, successful sign-up, links, clearing). It has not been run against the real script.
