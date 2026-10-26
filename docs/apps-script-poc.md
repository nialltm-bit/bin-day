# Apps Script proof of concept (FRE-289)

Checks the open risks in [stack.md](stack.md) before we build signup and the calendar feed on Google Apps Script:

1. Do Google, Apple and Outlook calendars subscribe to an Apps Script web app URL that returns an `.ics` file?
2. Which reminder fires in each: the all-day event with an alarm (**A**), or the timed 6pm event the day before (**B**)?
3. Can the GitHub Pages site call the web app?

The script is in [`apps-script/`](../apps-script). It has no database and no secrets. `apps-script/dist/` holds the built files to paste in (CI checks they are up to date). The feed has test events on the next three Tuesdays, each in both forms (A and B), plus a "bin days change" warning event.

## Set up the script (about 5 minutes)

1. Go to <https://script.google.com> and choose **New project**. Name it "Bin Day PoC".
2. Replace the contents of `Code.gs` with the contents of [`apps-script/dist/Code.js`](../apps-script/dist/Code.js).
3. Open **Project Settings** and tick **Show "appsscript.json" manifest file in editor**. Open `appsscript.json` and replace its contents with [`apps-script/dist/appsscript.json`](../apps-script/dist/appsscript.json).
4. Choose **Deploy**, then **New deployment**, then the gear icon and **Web app**. Set **Execute as: Me** and **Who has access: Anyone**. Deploy and authorise when asked. Copy the web app URL, which ends in `/exec`.

Use the account you'd be happy to use for the product. Anyone with the URL can call this test script, but it only returns test data.

## Checks

**A. The script answers.** Open the URL in a browser. You should see `{"ok":true,"service":"bin-day-poc",...}`. Add `?feed=poc` and you should see calendar text starting `BEGIN:VCALENDAR`.

**B. Pages can call the script.** Open <https://nialltm-bit.github.io/bin-day/poc.html> (live once the PR is merged), paste the URL and press both buttons. GET and POST should both show `HTTP 200` and JSON.

**C. Subscribe from each calendar app** using the feed URL (`...exec?feed=poc`; the poc page shows the `https` and `webcal` links):
- Google Calendar on the web: **Other calendars**, **+**, **From URL**.
- Apple Calendar: on iPhone, Settings, Calendar, Accounts, Add Account, Other, Add Subscribed Calendar. On Mac, File, New Calendar Subscription.
- Outlook: Add calendar, Subscribe from web.

**D. Reminders.**
- Apple and Outlook: check whether A shows an alert at 6pm the day before, and whether B shows an alert at 6pm.
- Google ignores alarms in feeds, so in Google Calendar open the subscribed calendar's settings and turn on notifications (event notifications and all-day event notifications), then check what fires for A and for B.

Google can take many hours to show a new subscribed calendar's events and to refresh them. Note roughly how long it took.

## Results

Fill in after testing.

| Check | Result |
|---|---|
| Script returns JSON and `.ics` | |
| Pages GET and POST to the script | |
| Google Calendar subscribes, and how long events took to appear | |
| Apple Calendar subscribes | |
| Outlook subscribes | |
| Reminder for A (all-day with alarm): Google / Apple / Outlook | |
| Reminder for B (6pm event the day before): Google / Apple / Outlook | |

## Decision

Go or no-go on Apps Script for signup and the feed: to be decided.
