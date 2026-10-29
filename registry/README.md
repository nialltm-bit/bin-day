# Council registry

`councils.json` says, for each council, how we get its collection data. Adding a council is a data change: add an entry, run the check, open a pull request. No code changes.

## Fields

| Field | Meaning |
|---|---|
| `ons_code` | ONS authority code, for example `E06000022`. This is the key. |
| `name` | Council name. |
| `status` | `supported` (the fetcher calls it), `broken` (we have a source but it is failing, so the fetcher skips it) or `unsupported` (no source yet, so people join the waitlist). |
| `schedule` | `next_only` if a fetch returns only the next collection date for each bin (B&NES does), or `full` if it returns a full schedule. Required for `supported` and `broken` councils. It also sets how often the fetcher fetches each address: once a week on a Sunday for `next_only` (councils don't collect on Sundays, so the date returned is the real one for the coming week, and later dates are projected from `every_weeks`), or once a week on a weekday fixed by the address for `full`. |
| `source.type` | `ukbcd` (a UKBinCollectionData module), `api` (an official API) or `ical` (a published iCal feed). |
| `source.module` | For `ukbcd`: the module name, for example `BathAndNorthEastSomersetCouncil`. |
| `source.url` | The collection URL (for `ukbcd`, the URL argument the module is given). Must be https. |
| `source.skip_get_url` | For `ukbcd`: pass `-s`, as in upstream's `tests/input.json`. |
| `inputs` | What the source needs: any of `uprn`, `postcode`, `house_number`. |
| `house_input` | Optional, only for councils that take a `house_number`. `number_or_name` (the default) means a house number or name is enough. `first_line` means the module needs the whole first line of the address ("12 High Street"), because a bare number finds nothing. The page asks for what this says. |
| `needs_selenium` | `true` if the module drives a browser. Only `ukbcd` sources can. |
| `bin_types` | Maps each of the council's own bin names to a waste `stream` (`general`, `recycling`, `food`, `garden`) with an optional `label` and `colour` to show people, and `every_weeks` (1, 2, 3 or 4): how often the council empties that bin. For `next_only` councils `every_weeks` lets the feed and refresh work out later dates. Leave it out and the fetcher learns it from repeat fetches (see `learned-frequencies.json` below); until it has, the feed shows only the confirmed date. A value set by hand always wins over a learned one. It must not be set for `full` councils. |
| `test_address` | A known-good address (every required input) for health checks. |
| `min_interval_seconds` | Minimum gap between our requests to this council. Optional; the fetcher defaults to 10 seconds. |
| `last_verified` | Date the source was last confirmed to work. |
| `notes` | Anything worth knowing. |

Unknown keys are rejected, so typos get caught.

## Adding a council

1. Find its module and test inputs in upstream's `uk_bin_collection/tests/input.json` (we pin `uk_bin_collection` 0.173.5). Check in `docs/spike-ukbincollectiondata.md` whether the council passed the full-suite run.
2. Copy the B&NES entry and change it. Set `needs_selenium` by checking whether the module uses a browser, not by whether `input.json` lists a web driver (some listed councils do not use one).
3. Work out `schedule` by looking at what the module returns for the test address: one date per bin means `next_only`, many future dates means `full`. For a `next_only` council, either leave `every_weeks` out so it is learned, or set it from the council's own website (not from a guess or from the dates returned) and record the pages you used in `notes`.
4. Run the module for the test address and list the bin names it returns. Add each one to `bin_types`. A name that is missing is treated as a failure by the fetcher, so that an unmapped bin never reaches a calendar silently.
5. Run `python -m fetcher.registry`. CI runs the same check.

## Bank holidays

`bank-holidays.json` holds the weekday bank holidays for England and Wales, Scotland and Northern Ireland. It is used
by the calendar feed (to avoid projecting into a holiday week) and by change detection (to tell holiday shifts from
round changes). A region is only used once it is marked `"verified": true`, after every date has been checked against
its official page. England and Wales is verified; Scotland and Northern Ireland are drafts. See `docs/changes.md`.

Streams are limited to four for now. Some councils collect glass or hygiene waste separately, so the list may need to grow (FRE-269).

## learned-frequencies.json

Written by the scheduled fetch (`fetcher/learned.py`), not by hand. For each `next_only` council's bin with no `every_weeks`,
it tallies how many times a gap of 1, 2, 3 or 4 weeks was seen between one Sunday fetch's date and the next. Once one
value has been seen twice and nothing else has, it is recorded as `weeks` and used by the fetcher and the feed. After that
it is locked: a later disagreement only adds to `conflicts` (and the fetch log shows `learned_conflict`), and change
detection treats the moved date as a round change. Gaps that touch a bank holiday week, or aren't whole weeks, are ignored.
It holds only council codes, the council's own bin names and counts: no addresses.

Learning does not wait for subscribers. The scheduled workflow also fetches each `next_only` council's `test_address` (upstream's
public test address, one call per council per week) while some bin of that council has no frequency, and feeds the result into
the same tally (`fetcher/testaddress.py`). The last date seen for each bin is kept in `test-address-observations.json`: council
codes, the council's own bin names and dates for a public address, nothing about any user. A council stops being fetched this way
once every bin of it has a frequency.

## Bin names the registry hasn't met

If a council returns a bin name that isn't in `bin_types` (a seasonal garden bin that wasn't on offer when the council was probed,
say), the fetcher settles it with the same keyword rules the generator used (`fetcher/streams.py`) when they point to exactly
one stream. A name with no keyword, or with keywords for two streams ("Food and Garden"), still fails the fetch, so nothing is
guessed. Add such a name to `bin_types` to make it permanent.
