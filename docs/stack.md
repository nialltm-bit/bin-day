# Stack decision (FRE-262)

Constraints: free to run, nearly everything in GitHub, a public repo with no secrets, and no email in v1.

| Layer | Choice | Where it runs |
|---|---|---|
| Repo and CI | GitHub, GitHub Actions | GitHub (free for public repos) |
| Frontend | TypeScript, Vite, static site | GitHub Pages |
| Fetching council data | Scheduled workflow running Python with `uk_bin_collection==0.173.5` | GitHub Actions runner, with a Selenium service container when needed |
| Signup, feed and database | Google Apps Script web apps in TypeScript (deployed with `clasp`), a private Google Sheet | Google, under a project account |
| Postcode to council | postcodes.io (free, no key) | Called from the frontend or the script, with results cached |

The council registry (`registry/councils.json`, checked by `fetcher/registry.py`) is the single table of how each council's data is fetched; adding a council is a data change.

## Why

- The spike (`docs/spike-ukbincollectiondata.md`) found upstream works as a pinned library, so the fetcher is a scheduled job, not a server.
- GitHub Pages only serves static files. Signups and per-person calendar feeds need a small server-side piece, and Apps Script is the free one you already use for EasyClean.
- Subscriber data stays out of the public repo, in a private Google Sheet.
- With no email, the Apps Script email cap (about 100 a day on a free account) doesn't apply.

## Reminders without email

Each event has a built-in alarm for the evening before, which Apple Calendar and Outlook honour. Google ignores alarms in subscribed feeds, so Google users turn on notifications for the subscribed calendar once, following a short guide. We do not add a second, timed evening event for everyone to work around Google.

## Risks

- **Council blocking:** the spike found 15 councils returning 403s or a captcha to a GitHub runner. Launch only councils that pass.
- **Apps Script and calendar clients:** not yet verified that Google, Apple and Outlook calendars subscribe to an Apps Script URL (it redirects), or that GitHub Pages can call the web app across origins. A proof of concept comes first.
- **Free tiers and quotas change.** Check them before relying on them. Scheduled workflows pause after 60 days of repo inactivity.
- **Postcode lookup:** postcodes.io has no uptime guarantee, so cache results.
- **Address list with UPRNs:** no free source chosen yet (needed for the signup flow, FRE-271).

## Secrets

The repo is public. No keys or tokens are committed. The fetcher's shared secret for the Apps Script endpoint is a GitHub Actions secret and an Apps Script property. `.clasprc.json` and `.env` files are git-ignored.
