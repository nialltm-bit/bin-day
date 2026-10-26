# Scraper overrides

A module in this folder replaces the upstream UKBinCollectionData module of the same name. For example,
`BathAndNorthEastSomersetCouncil.py` here would be used instead of upstream's. It must define a `CouncilClass`
with the same interface (subclass upstream's `AbstractGetBinDataClass`, or the upstream council's class to tweak it).

This works because upstream's loader appends its own councils folder to `sys.path`, and the fetcher puts this
folder first. The spike (`docs/spike-ukbincollectiondata.md`) proved it. After any upstream upgrade, re-check that
overrides still import and still return the same shape.

Keep overrides small and send fixes back upstream where we can.
