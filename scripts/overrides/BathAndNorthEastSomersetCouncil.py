"""Our own B&NES scraper, used to prove we can replace an upstream council module.

Subclasses upstream's CouncilClass so the interface stays identical, and tags the
result so the spike can tell which implementation answered.
"""
from uk_bin_collection.uk_bin_collection.councils.BathAndNorthEastSomersetCouncil import (
    CouncilClass as UpstreamCouncilClass,
)


class CouncilClass(UpstreamCouncilClass):
    OVERRIDE_MARKER = "bin-day-override"

    def parse_data(self, page: str, **kwargs) -> dict:
        data = super().parse_data(page, **kwargs)
        data["source"] = self.OVERRIDE_MARKER
        return data
