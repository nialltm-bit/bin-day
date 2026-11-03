# Postcode guess: phase 0 results (FRE-298)

The question: for a council that needs a UPRN, can we take only the resident's postcode, check the homes on it, and if they all
have the same bin days, give those days to everyone on the postcode? This measures it before anything is built. Raw results are
in `docs/spike-results/onsud-stats.json`, `postcode-agreement.json` (the final table) and `postcode-agreement-run1.json` (the
first run, kept because four councils were run twice, see below).

**Short answer: go, for the councils whose scraper is reliable, with the split message for the few postcodes that disagree.** In
six councils on five platforms, 157 of 163 postcodes (96%, plausible range 92% to 98%) had no two homes disagreeing, and only 6
of 2,866 homes (0.2%) were off their postcode's majority. B&NES, the control, agreed with the hand measurement. The weak points
are not agreement. They are the council scrapers falling over on UPRNs that are not homes, how long a first check takes, and a
sample that is smaller than the 50 postcodes per council the ticket asked for. Details and per-council calls are below.

## Method

**Where the UPRNs come from.** The ONS UPRN Directory (ONSUD), September 2026 release (Epoch 128), found by searching the ONS
Open Geography Portal. Workflow `onsud-stats.yml` streams the zip and keeps counts only. Nothing raw is committed.

**The agreement check** (workflow `postcode-agreement.yml`, scripts `postcode_sample.py`, `postcode_agreement.py`):

1. For each council, take the postcodes that have at least two UPRNs in that council. A postcode with one UPRN has nothing to
   agree about. About 3% to 8% of each council's postcodes have just one, and they are not in the sample.
2. Draw random postcodes (fixed seed, so a run can be repeated). For each, take every ONSUD UPRN on it, or 40 random ones if
   there are more.
3. Run the council's real UKBinCollectionData scraper (pinned 0.173.5) for each UPRN, through the fetcher's own `run_ukbcd` and
   `normalise`, at the fetcher's 10 second gap per council. No retries. Each council ran in its own job, so none was asked twice
   at once.
4. Map bin names to streams with `fetcher/streams.py` (the same rules as the registry generator). Take each home's next date for
   general, recycling and food. Garden waste is ignored. A bin whose name maps to no stream (such as "Collect Mattress") is
   dropped and counted, not allowed to lose the home.
5. A postcode **agrees** if no two homes have the same stream on different dates. A home missing a stream is not a conflict. Only
   postcodes where at least two homes returned dates can be compared. A home is **off the majority** if for some stream its date
   is not the most common one on the postcode (a tie goes to the earlier date; there were no ties).

Seven councils, chosen from `docs/spike-results/uprn-probe.json` because their scraper returned dates, every bin name maps to a
stream, and they need only a UPRN and a postcode:

| Platform | Council |
|---|---|
| Bespoke | Cheltenham |
| Whitespace | Hart |
| Jadu | Oxford |
| Bartec | Durham |
| AchieveForms | Stevenage |
| Bespoke, needs a browser | Ashford |
| Control (measured by hand on 2 Nov) | Bath and North East Somerset |

Elmbridge was the first AchieveForms choice. In a 2 postcode smoke run its scraper failed on 26 of 29 random UPRNs, so Stevenage
replaced it. That is a finding in itself: a scraper that passes upstream's single test UPRN can fail on most real ones.

## ONSUD: what the postcode guess has to work with

| | |
|---|---|
| Columns used | `uprn`, `pcds` (postcode), `lad26cd` (council). All present |
| UPRNs / postcodes / councils | 41,058,558 / 1,735,815 / 350 |
| Rows with no full postcode (dropped) | 534,569 (1.3%) |
| UPRNs per postcode | median **18**, 95th percentile **62**, 99th 93, mean 23.7, **max 6,830** |
| Postcodes with one UPRN | 4.1% |
| Postcodes over the cap of 40 | 16.2% of postcodes, holding **41.6% of UPRNs** |
| Postcodes whose UPRNs fall in more than one council | 17,092 |

**Per-outcode files** (one JSON file per outcode such as `BA3`, holding each postcode's UPRNs grouped by council):

| | Median | 95th percentile | Max | All 2,838 files |
|---|---|---|---|---|
| JSON | 173 KB | 430 KB | 1.28 MB (CR0) | 528 MB |
| Gzipped (what a browser downloads) | 40 KB | 95 KB | 268 KB | 122 MB |

All councils together are 528 MB uncompressed, which is over half the 1 GB GitHub Pages site limit, so publish only the councils
whose guess is switched on. One council is 1/350th of that on average. Nothing about the page needs the whole country.

## Results by council

"Comparable" means at least two homes returned dates. For four councils the first run stopped early (see "What went wrong"), so
they were run again with fresh random postcodes and the two runs are added together. Ranges are 95% (Wilson).

| Council (platform) | Comparable postcodes | Postcodes that agree | Plausible range | Homes off the majority | Seconds per lookup (median / 95th pct) |
|---|---|---|---|---|---|
| Hart (Whitespace) | 38 | 38 (100%) | 91% to 100% | 0 of 559 | 0.8 / 0.9 |
| Cheltenham (bespoke) | 34 | 34 (100%) | 90% to 100% | 0 of 573 | 6.0 / 17.8 |
| Durham (Bartec) | 35 | 31 (89%) | 74% to 95% | 4 of 590 | 2.8 / 3.6 |
| Stevenage (AchieveForms) | 18 | 18 (100%) | 82% to 100% | 0 of 349 | 1.7 / 4.0 |
| Oxford (Jadu) | 20 | 19 (95%) | 76% to 99% | 1 of 417 | 6.5 / 7.9 |
| Ashford (bespoke, browser) | 18 | 17 (94%) | 74% to 99% | 1 of 378 | 4.3 / 5.7 |
| **Six councils together** | **163** | **157 (96%)** | **92% to 98%** | **6 of 2,866 (0.2%)** | |
| B&NES (control) | 13 | 13 (100%) | 77% to 100% | 0 of 182 | 0.7 / 0.9 |

The ticket asked for 50 or more postcodes per council. Only Hart (38), Durham (35) and Cheltenham (34) came near. See
"What this does not show".

**The control.** The hand measurement on 2 Nov found 94% of 209 usable B&NES postcodes agreed. This method found 13 of 13. That
is consistent (13 postcodes cannot tell 94% from 100%), and the method found no disagreement the hand count did not. It does not
prove the method matches the hand count.

## What the mismatches look like

Six postcodes disagreed, and in every one **exactly one home** was off the majority. Nothing here looks like a postcode split
into two halves.

- Durham, 4 postcodes: three had the one home on a **different weekday**, one on the **other week** (same weekday).
- Oxford, 1 postcode: a home on a different weekday (general waste).
- Ashford, 1 postcode: a home on a different weekday.
- All 6 disagreeing postcodes had 10 or more UPRNs: 2 of 61 postcodes of 10 to 24 UPRNs and 4 of 67 of 25 or more disagreed,
  against none of 35 postcodes of 2 to 9 UPRNs. That fits B&NES, where flats were over-represented among the odd homes. ONSUD has no address text, so I could not
  check whether these homes are flats.
- With only the next date I cannot tell "other week" from "extra weekly collection for some homes", the third pattern in the
  B&NES hand data.

## What non-homes return

ONSUD cannot tell a home from a garage, so non-homes were looked up like any other UPRN. Between a fifth and a half of UPRNs returned
no dates, which is consistent with ONSUD containing many non-residential UPRNs. What came back depends on the scraper:

| Council | Lookups | Returned dates | Returned an empty list | Raised an error |
|---|---|---|---|---|
| Hart | 742 | 75% | 25% | 0 |
| B&NES | 244 | 75% | 25% | 0 |
| Durham | 718 | 82% | 18% | 0 |
| Cheltenham | 498 (run 2) | 91% | 0 | 9% (KeyError) |
| Oxford | 277 (run 2) | 68% | 6% | 25% (ValueError) |
| Stevenage | 493 (run 2) | 61% | 0 | 39% (ValueError) |
| Ashford | 306 (run 2) | 53% | 0 | 47% (NoSuchElement) |

Hart, B&NES and Durham answer cleanly: an empty list. The other four crash. An error can mean "not a home" or "the scraper
cannot read this record", and I could not separate them. The fetcher must treat an error on one UPRN as "skip this UPRN" while
other UPRNs on the postcode still return dates, and must not mark the council broken.

## Speed and request cost

- A lookup took under a second at Hart and B&NES, about 2 to 4 seconds at Stevenage and Durham, and 4 to 7 seconds at the rest
  (Ashford's browser: median 4.3 seconds, no slower than the plain HTTP ones). Cheltenham had a slow tail (95th percentile 18
  seconds, maximum 32).
- The 10 second gap per council, not the lookup, sets the pace. The average postcode needed **about 21 lookups** (the cap is
  40), so a first check of a new postcode takes about **3 to 4 minutes** at the default gap. The page would show "checking" for that
  long. Councils like Hart and B&NES answer in under a second and could take a lower `min_interval_seconds` in the registry.
- Total requests in phase 0: about 4,300 (a 2 postcode smoke run, a full run of 2,479, and a re-run of 1,574).

## What went wrong, and what this does not show

- **Fewer postcodes than asked.** The ticket wanted 50 or more per council. 50 postcodes at about 21 lookups each is 1,050 or
  more requests per council, over 6,000 for six councils, which does not fit "a few thousand requests". I kept to the budget, so
  the best-covered councils have 34 to 38 comparable postcodes and Stevenage, Oxford and Ashford have 18 to 20. The ranges in the
  table show how much that leaves open. The six councils together (163 postcodes) are enough to say agreement is high, not enough
  to give any one council a precise rate.
- **My safety stop fired too early.** It stopped a council after 15 lookups in a row with no dates, to avoid hammering a blocked
  council. But these scrapers crash on non-homes, so a run of non-homes looks like a block. Four councils stopped after 4 to 12
  postcodes. I changed the rule to 40 in a row and re-ran those four with new random postcodes, capped at 500 lookups each. Oxford
  and Ashford still hit the 40-in-a-row stop in the second run (70 and 142 errors), so their samples remain thin. I cannot tell
  whether that was a long run of non-homes or the council or the scraper failing partway through.
- **One cycle only.** The check compares the next date, taken on 3 Nov. Two homes on alternating weeks who happen to fall on the
  same next date would look the same. A second look in a different week would show this.
- **Capped at 40.** 16% of postcodes have more than 40 UPRNs, holding 42% of all UPRNs. For those, 40 random homes were checked.
  A single odd home among 60 could be missed. The ticket's own rule (a postcode agrees only if every home checked agrees) applies,
  but not every home was checked.
- **Data currency.** ONS says newer homes may be missing from ONSUD. A resident in a new build may land on a postcode whose
  UPRN list does not include them.
- **Scraper quality is the real limit.** The guess is only as good as the scraper. Elmbridge failed on 90% of random UPRNs and
  would have been a wrongly confident "split" or no result.

## Recommendation, by council

Plain calls. "Go" means switch the guess on for this council when the build exists. "Not yet" means collect more evidence first.

| Council | Call | Why |
|---|---|---|
| Hart (Whitespace) | **Go** | 38 of 38 postcodes agree, 559 homes with none off, fast and clean |
| Cheltenham (bespoke) | **Go** | 34 of 34 agree, 573 homes with none off. 9% of lookups error and the slow tail is long, so allow for both |
| Durham (Bartec) | **Go, with the split message** | 89% agree (74% to 95%). Every split is one odd home, so the resident sees "we can't cover your address yet" about one time in nine. Bartec is also B&NES's platform |
| Stevenage (AchieveForms) | **Not yet** | 18 of 18 agree, but only 18 postcodes, and 39% of lookups error. Needs a larger run and a look at the errors |
| Oxford (Jadu) | **Not yet** | 19 of 20 agree, but the run stopped early twice and 26% of lookups error |
| Ashford (bespoke, browser) | **Not yet** | 17 of 18 agree, but 47% of lookups error and the run stopped early twice. A browser council is also costlier to run |
| B&NES | **Go** | Control. 13 of 13 here and 94% of 209 by hand |

**Across platforms:** nothing in these results suggests the postcode guess works on one platform and not another. The failures
are scrapers that crash on non-homes, which differ council by council. That supports a per-council switch in the registry,
turned on only after a council has been measured, which is what the ticket proposes.

**If you decide go:** the build should (1) skip a UPRN that errors without failing the council, (2) allow a longer first check
or a lower `min_interval_seconds` for fast councils, (3) treat a postcode as agreed only when at least two homes returned dates
and none disagree, and (4) recheck monthly, as the ticket says. A larger measurement for Stevenage, Oxford and Ashford can run
first, or at the same time as the build for the councils marked Go.

## Reproducing

Workflows: `onsud-stats.yml` and `postcode-agreement.yml`. A push that changes `scripts/postcode_agreement_request.json` runs the
agreement check on the branch (target postcodes, an optional limit on lookups, the seed, and an optional list of councils). Once
the workflows are on `main` they can also be started from the Actions tab. The same seed draws the same postcodes. Logs and
results hold counts, timings, error kinds and outcodes only: never a postcode, a UPRN or an upstream error message.

ONSUD is Crown copyright and database right, published under the Open Government Licence.
