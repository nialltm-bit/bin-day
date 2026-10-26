# The address store (Google Sheet behind Apps Script)

The fetcher reads which addresses to fetch from, and saves what it finds to, a private Google Sheet. The Sheet is
reached through the Apps Script web app in `apps-script/`. Nothing in the Sheet is in this repo.

## What it holds

- `addresses` tab: `uprn`, `ons_code`, `postcode`, `house_number`, `created_at`.
- `results` tab, one row per UPRN: `fetched_at` (last good fetch), `last_attempt`, `last_error`,
  `consecutive_failures`, `collections_json`. A failed fetch keeps the last good collections, so the feed can say
  it couldn't confirm this week's collection.

The script creates both tabs, with a header row, the first time it needs them.

## The API

One endpoint, `POST` to the web app's `/exec` URL with a plain-text JSON body. Every request carries
`"secret"` (the shared secret) and an `"action"`:

| Action | Fields | Reply |
|---|---|---|
| `addresses` | | `{"ok":true,"addresses":[{uprn, ons_code, postcode?, house_number?, last_attempt}]}` |
| `add_address` | `uprn`, `ons_code`, `postcode?`, `house_number?` | `{"ok":true}` (an existing UPRN is left alone) |
| `save_success` | `uprn`, `now`, `collections: [{date, bin_name, stream}]` | `{"ok":true}` |
| `save_failure` | `uprn`, `now`, `error` | `{"ok":true}` |

Errors are `{"ok":false,"error":"..."}` with a short generic message. A request with the wrong secret learns
nothing else. The secret is in the body because Apps Script can't read request headers. Writes take a script lock.

## Set-up (about 10 minutes, once)

1. Create a new Google Sheet in the account that will own the product (a project account rather than a personal
   one is better). Name it "Bin Day store".
2. In the Sheet: **Extensions**, then **Apps Script**. Replace `Code.gs` with
   [`apps-script/dist/Code.js`](../apps-script/dist/Code.js). In **Project Settings** tick **Show "appsscript.json"
   manifest file**, and replace its contents with [`apps-script/dist/appsscript.json`](../apps-script/dist/appsscript.json).
3. In **Project Settings**, under **Script properties**, add `FETCHER_SECRET` with a long random value. For example,
   run `openssl rand -hex 32` and paste the result. Keep a copy for step 5.
4. **Deploy**, **New deployment**, **Web app**: Execute as **Me**, Who has access **Anyone**. Authorise when asked,
   and copy the `/exec` URL.
5. In the GitHub repo, **Settings**, **Secrets and variables**, **Actions**, add two repository secrets:
   `BIN_DAY_STORE_URL` (the `/exec` URL) and `BIN_DAY_STORE_SECRET` (the value from step 3). Do not put either in
   the repo or in chat.
6. Check it (use only the public test address here: workflow inputs are visible on this public repo, so never put a real person's UPRN in `add_uprn`; add real addresses by typing them into the Sheet's `addresses` tab): in the repo's **Actions** tab, open **Fetch (scheduled)**, choose **Run workflow**, and enter `100120000855` as `add_uprn` (upstream's public B&NES test address). Or from a terminal:

   ```sh
   export BIN_DAY_STORE_URL=... BIN_DAY_STORE_SECRET=...
   python -m fetcher.run add --sheet --ons E06000022 --uprn 100120000855
   python -m fetcher.run fetch --sheet
   ```

   The `addresses` tab should show the UPRN and the `results` tab its collections with a `fetched_at`.

To change the script later, paste the new `Code.js`, then **Deploy**, **Manage deployments**, edit the deployment
and choose a new version. The `/exec` URL stays the same.

## Logs are public

This repo is public, so its Actions logs are too. The fetcher therefore logs only the council's ONS code, a status and
a count or error kind for each address. It never logs a UPRN, a postcode, or the text of an upstream error (which
can contain the request URL, and so the address). The full error is saved to the private Sheet's `last_error`
column for debugging.

## Running on a schedule

`.github/workflows/fetch-scheduled.yml` runs daily at 05:17 UTC. It does nothing, with a notice in the log, until
the two secrets exist. How often each address is fetched depends on the council's `schedule` in the registry
(see `fetcher/schedule.py`):

- `next_only` councils (B&NES) return only the next date for each bin, so every address is fetched **daily**. That
  keeps the next date for each bin from ever being more than a day old.
- `full` councils return a whole schedule, so each address is fetched **weekly**, on a weekday fixed by its UPRN so
  that addresses spread evenly across the week.

An address is fetched at most once per run, and a failed attempt counts, so a failing council is tried once a day
(or once a slot) and never in a loop. Requests to one council are at least 10 seconds apart
(`min_interval_seconds` in the registry changes this). Scheduled workflows are paused by GitHub after 60 days
without repo activity.

Rough capacity at the default 10 second gap, inside the workflow's 60 minute limit: one run fetches about 360
addresses per council. For a `next_only` council that is about 360 addresses in total, because each is fetched every
day. For a `full` council it is about 2,500, because each is fetched once a week. B&NES is a single JSON call of
under a second, so this is mostly a politeness limit, not a technical one. To go further, lower `min_interval_seconds`
for a council that tolerates it, raise the workflow's `timeout-minutes` (GitHub allows up to 6 hours), or fetch each
address only the day after a collection and two days before the next (FRE-281).
