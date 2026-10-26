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
6. Check it: run the **Fetch (scheduled)** workflow by hand, or add an address and fetch it:

   ```sh
   export BIN_DAY_STORE_URL=... BIN_DAY_STORE_SECRET=...
   python -m fetcher.run add --sheet --ons E06000022 --uprn 100120000855
   python -m fetcher.run fetch --sheet
   ```

   The `addresses` tab should show the UPRN and the `results` tab its collections with a `fetched_at`.

To change the script later, paste the new `Code.js`, then **Deploy**, **Manage deployments**, edit the deployment
and choose a new version. The `/exec` URL stays the same.

## Running on a schedule

`.github/workflows/fetch-scheduled.yml` runs daily at 05:17 UTC. It does nothing, with a notice in the log, until
the two secrets exist. Each run fetches only the addresses that are due that day (see `fetcher/schedule.py`), at
least 10 seconds apart per council. Scheduled workflows are paused by GitHub after 60 days without repo activity.

Rough capacity: at the default 10 second gap, one daily run can fetch about 360 addresses for any one council
inside its 60 minute limit. As each address is fetched once a week, that serves roughly 2,500 addresses per council.
To go further, raise the workflow's `timeout-minutes` (GitHub allows up to 6 hours on its own runners), run it
more than once a day, or lower the gap for a council that tolerates it (`min_interval_seconds` in the registry).
