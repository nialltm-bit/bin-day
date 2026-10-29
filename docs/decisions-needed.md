# Decisions needed

Things that are yours to decide. Each says what is blocked and what each choice costs.

## Bins that carry more than one stream (found while reviewing unrecognised bin names)

About half of the 21 councils in [bin-name-review.md](bin-name-review.md) are held back by a bin name that says two or three streams at
once: `Food & Garden` (Caerphilly, Stirling), `Glass+Food` and `Paper/Card+Food` (East Ayrshire), `Organic Food & Garden Waste / Mixed
Recycling (Blue Bin)` (Na h-Eileanan Siar), `Garden and food waste bin (Brown)` (Mid Ulster), `Food waste and recycling` (East Lothian).
The registry gives each bin one `stream`, so mapping to one of them would silently drop a reminder, and the generator refuses to.

- **A. Let a bin name more than one stream** (`"streams": ["food", "garden"]`), with the feed showing "food + garden". Changes the
  registry schema, the fetcher, the Apps Script feed and the page. Unlocks most of those councils, each still to be checked by hand.
- **B. Keep one stream per bin** and map such a bin by hand to the stream people most need reminding of (garden/food to `garden`, say).
  No code change, but a calendar can say "garden" on a day the food caddy goes out too.
- **C. Leave these councils out** until a person has looked at each.

Nothing was changed in the registry pending your answer.
