# The address store (Google Sheet behind Apps Script)

The fetcher reads which addresses to fetch from, and saves what it finds to, a private Google Sheet. The Sheet is
reached through the Apps Script web app in `apps-script/`. Nothing in the Sheet is in this repo.

## What it holds

- `addresses` tab: `uprn`, `ons_code`, `postcode`, `house_number`, `created_at`.
- `results` tab, one row per UPRN: `fetched_at` (last good fetch), `last_attempt`, `last_error`,
  `consecutive_failures`, `collections_json`. A failed fetch keeps the last good collections, so the feed can say
  it couldn't confirm this week's collection.

- `changes` tab, one row per change the fetcher found: `at`, `uprn`, `ons_code`, `bin_name`, `kind`
  (`expected_shift` or `round_change`), `before` (the date we expected), `after` (the date we got), `note`. See
  `changes.md`.
- `subscriptions` tab, one row per feed: `token` (the secret in the person's feed URL), `id`, `uprn`, `ons_code`,
  `garden`, `created_at`, `last_used` (the last day the feed or its dates were asked for; feeds unused for a year are
  deleted by `expire_feeds`). Treat it like the secret itself. See `feed.md`.

The script creates each tab, with a header row, the first time it needs it.

## The API

One endpoint, `POST` to the web app's `/exec` URL with a plain-text JSON body. Every request carries
`"secret"` (the shared secret) and an `"action"`:

| Action | Fields | Reply |
|---|---|---|
| `addresses` | | `{"ok":true,"addresses":[{uprn, ons_code, postcode?, house_number?, last_attempt}]}` |
| `add_address` | `uprn`, `ons_code`, `postcode?`, `house_number?` | `{"ok":true}` (an existing UPRN is left alone) |
| `save_success` | `uprn`, `now`, `collections: [{date, bin_name, stream}]` | `{"ok":true}` |
| `save_failure` | `uprn`, `now`, `error` | `{"ok":true}` |
| `get_result` | `uprn` | `{"ok":true,"result":{...}}`, or `"result":null` if there is none yet |
| `expire_feeds` | `days?` (default 365, at least 30) | `{"ok":true,"expired":N,"addresses_deleted":M}`: deletes feeds unused for more than `days`, and an address with its dates and changes when its last feed goes |
| `save_changes` | `uprn`, `ons_code`, `now`, `changes: [{bin_name, kind, before, after, note}]` | `{"ok":true}` |

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

`.github/workflows/fetch-scheduled.yml` runs daily at 05:17 UTC and does nothing, with a notice in the log, until
the two secrets exist. What it fetches on a given day depends on the council's `schedule` in the registry (see
`fetcher/schedule.py`):

- `next_only` councils (B&NES) return only the next date for each bin. Their addresses are fetched **on Sundays**.
  Councils don't collect on Sundays, so the date returned is always the real date for the coming week, with any bank
  holiday shift already applied. Later dates are projected from each bin's `every_weeks` in the registry. If a Sunday
  run is missed, the addresses are caught up the next day.
- `full` councils return a whole schedule. Their addresses are fetched **weekly**, on a weekday fixed by the UPRN so
  that addresses spread evenly across the week.
- An address that has never been fetched (a new signup) is fetched in the next run on any day, so people don't wait
  for a Sunday. It is fetched again on the following Sunday, as part of the normal cycle.

An address is fetched at most once per run, and a failed attempt counts, so a failing address is not retried until its
next slot and the feed shows it as unconfirmed. Requests to one council are at least 10 seconds apart
(`min_interval_seconds` in the registry changes this). Scheduled workflows are paused by GitHub after 60 days
without repo activity.

Capacity: at the default 10 second gap one council can be fetched about 360 times an hour, and the workflow may run
for up to 6 hours, so about 2,100 addresses per council per run. For `next_only` councils that is the whole Sunday
run, so about 2,100 B&NES addresses in total. B&NES is a single JSON call of under a second, so this is mostly a
politeness limit. To go beyond it, lower `min_interval_seconds` for a council that tolerates it, or spread
`next_only` addresses across the week like `full` ones (accurate too, because later dates are projected, but it
gives up the "always next week" property of a Sunday fetch).

Some councils do collect at weekends, so "Sunday" would need to become a per-council setting when one is added.
