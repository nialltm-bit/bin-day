"""Per-council politeness: a minimum gap between requests to the same council."""
import time
from collections.abc import Callable

DEFAULT_MIN_INTERVAL = 10.0  # seconds


class CouncilRateLimiter:
    def __init__(self, clock: Callable[[], float] = time.monotonic, sleep: Callable[[float], None] = time.sleep):
        self._clock = clock
        self._sleep = sleep
        self._last: dict[str, float] = {}

    def wait(self, ons_code: str, min_interval: float = DEFAULT_MIN_INTERVAL) -> float:
        """Blocks until it is polite to call this council again, and returns how long it waited."""
        waited = 0.0
        last = self._last.get(ons_code)
        if last is not None:
            waited = max(0.0, min_interval - (self._clock() - last))
            if waited > 0:
                self._sleep(waited)
        self._last[ons_code] = self._clock()
        return waited
