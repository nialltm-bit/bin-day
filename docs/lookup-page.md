# The lookup page (FRE-271)

The top of the homepage. A person types a postcode and gets either a calendar link or an honest reason they can't yet.

## The flow

1. **Postcode.** Checked against postcodes.io for the council (`web/src/coverage.ts`). Every outcome has its own wording; see `docs/coverage.md`.
2. **Council we can help with.** The page asks for what that council's source needs, from `house_input` in the registry: a house number or name, or the whole first line of the address. A bare number is refused for a council that needs the first line, in the page and again in the script.
3. **Garden waste.** Yes or no, with no default, because a wrong default would hide a bin someone has.
4. **Show my bin days.** Sends `subscribe` to the Apps Script (council, postcode, house, garden) and gets a private feed token back. The page shows buttons for Google, Apple and Outlook, and the link to copy, and straight away shows the next few collections (see "Fetching at sign-up" below).
5. **Council we can't help with.** The message, a link to the official find-your-council page, and (where a council could be added) a button that adds the person's council to the count. Only the council code is sent.

Nothing is stored in the browser. Editing the postcode clears everything below it.

## What it can't do yet

- **No page address for results** (the ticket asks for a bookmarkable link). The private feed link is the thing to keep.
- **The Google and Outlook "add by link" addresses** are the apps' published add-by-URL forms and have not been tried against a live account. The Apple link is a plain `webcal://` link and the copy box works in any calendar app.
- **No address picker.** There is no free address list (see `docs/spike-address-lookup.md`).
- **UPRN councils** show "can't find addresses yet" until a free UPRN finder exists.
- **The wrong-house risk** in some council sources is described in `docs/coverage.md`. The page can't see which address the source matched.

## Fetching at sign-up

A new address has no dates until the fetcher runs, and the daily run is at 05:17 UTC. So when a sign-up adds an address nobody has fetched, the script asks GitHub to run the "Fetch (scheduled)" workflow now. It takes a minute or two. Meanwhile the page asks the script for the dates every 5 seconds (the `upcoming` action, which takes the feed token and returns the same dates the calendar shows) and shows them when they arrive.

- **Nothing about the address is sent to GitHub.** Workflow inputs are public on this public repository, so the workflow is started with no inputs. It fetches whatever is due, which includes every address nobody has fetched yet. The log shows only council code and status.
- **It only asks for a new address.** A second person at an address that already has dates sees them straight away.
- **Capped at 20 requests an hour,** so the public sign-up can't be used to flood Actions. Beyond that the daily run still picks addresses up.
- **It can't break sign-up.** If GitHub can't be reached, or the setup below isn't done, the sign-up still works and the page says the calendar fills in within a day.
- **If the fetch fails** (for example the house wasn't found), the page says it couldn't get bin days for that address and to check what was typed. The wrong-house risk in `docs/coverage.md` still applies: a source that quietly picks another house can't be caught here.
- Runs share one queue with the daily run, so a sign-up that arrives while the big Sunday run is going waits for it. In that case the page says it is taking longer than usual.

### One-time setup (you)

1. On GitHub, create a **fine-grained personal access token** (Settings, Developer settings, Personal access tokens, Fine-grained tokens). Resource owner: you. Repository access: **only `bin-day`**. Repository permissions: **Actions: Read and write**, nothing else. Choose an expiry and note it down: when the token expires, sign-ups stop asking for a fetch (the daily run still works) until you replace it.
2. In the Apps Script project, open Project Settings, Script properties, and add `GITHUB_TOKEN` (the token) and `GITHUB_REPO` (`nialltm-bit/bin-day`). Never put the token anywhere else.
3. Paste in the latest `apps-script/dist/Code.js`, choose **`testFetchRequest`** in the function list next to the Run button (after you save, the list shows `doGet`, `doPost` and `testFetchRequest`) and press **Run**. The first run asks you to allow the script to connect to an external service; allow it. The log should say `GitHub answered HTTP 204`. Then deploy a new version of the web app.

Any other number in the log means: 401 or 403, the token or its permission is wrong; 404, the repository name is wrong or the token can't see it.

## One setting you need to make

The page talks to the Apps Script web app, whose address is public but isn't in the repository. Set it once as a **repository variable** (Settings, Secrets and variables, Actions, Variables) called `BIN_DAY_SCRIPT_URL`, with the web app's `/exec` address. The deploy workflow passes it to the build as `VITE_SCRIPT_URL`. Until it is set, the page still finds the council and shows every message, but "Show my bin days" and the count button say they aren't switched on yet.

The script must also be redeployed with the latest `apps-script/dist/Code.js` for the postcode and house-number councils, the count and the dates at sign-up to work.

## Checked

`web/src/signup.ts` and `web/src/lookup-view.ts` have unit tests for the checks, the request, the reasons the script can give and the calendar links. The whole page was also driven in a browser at phone width with the postcode service and the script faked: bad and unknown postcodes, the postcode service down, Channel Islands, a council we don't cover (and the count), a UPRN council, a ready council (bare number refused, missing garden answer, successful sign-up, links, clearing). The poll was checked with the script faked to answer pending twice and then ready (dates shown after about 10 seconds), and to answer failed (the message shown at once). The script's `subscribe` and `upcoming` actions, the shared date logic and the request for a fetch are unit tested. None of it has been run against the real script, the real GitHub token or a real fetch.
