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

Tested on 26 October 2026 with a free Google account's script, deployed as a web app (Execute as: Me, access: Anyone).

| Check | Result |
|---|---|
| Script returns JSON and `.ics` | Pass. GET returned JSON, and `?feed=poc` downloads a calendar file (Apps Script serves it as `text/calendar`, and the browser names the download `echo.ics`, which does not matter for subscriptions). |
| Pages GET and POST to the script | Pass. Both returned `HTTP 200` with JSON from the GitHub Pages test page. A plain-text POST body avoids the cross-origin block. |
| Google Calendar subscribes, and how long events took to appear | Pass. Subscribed with the `https` feed URL. All-day collection events (A), timed 6pm events (B) and the warning event all appeared the same evening, with the right London times. Events show as Free. |
| Apple Calendar subscribes | Not tested. |
| Outlook subscribes | Not tested. |
| Reminder for A (all-day with alarm): Google / Apple / Outlook | Not observed. Google ignores feed alarms by design. The next opportunity is 6pm on 2 November. |
| Reminder for B (6pm event the day before): Google / Apple / Outlook | Not observed. Today's 6pm had passed when we subscribed. The next is 6pm on 2 November. |

## Decision

**Go on Apps Script for the MVP.** The two structural risks are cleared: Google Calendar accepts an Apps Script URL as a subscription (despite the redirect), and the GitHub Pages site can call the script. Google Calendar is the client we most needed, since it is the one that ignores alarms and so shaped the evening-event design.

**Update, 27 October 2026:** the timed evening event (B) was not built. Google users turn on notifications for the subscribed calendar themselves (see `feed.md`), and no second event is added for everyone.

Left open, and not blocking the MVP:
- Whether the 6pm "Bins out tonight" event (B) actually produces a notification in Google once the person has turned on notifications for the calendar. Check on 2 November, and record it here.
- Apple Calendar and Outlook subscription and alarm behaviour.
- Limits at scale (Apps Script quotas, Sheet speed), which the stack doc already lists as risks.
