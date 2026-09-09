from __future__ import annotations

import time
import unittest

from app.services.cache import TTLCache


class TTLCacheTests(unittest.TestCase):
    def test_expired_entries_are_removed_when_read(self) -> None:
        cache: TTLCache[str] = TTLCache(ttl_seconds=0, max_entries=2)
        cache.set("expired", "value")

        time.sleep(0.01)

        self.assertIsNone(cache.get("expired"))
        self.assertEqual(len(cache._items), 0)

    def test_oldest_entry_is_evicted_when_cache_is_full(self) -> None:
        cache: TTLCache[str] = TTLCache(ttl_seconds=60, max_entries=2)
        cache.set("first", "a")
        cache.set("second", "b")
        cache.set("third", "c")

        self.assertIsNone(cache.get("first"))
        self.assertEqual(cache.get("second"), "b")
        self.assertEqual(cache.get("third"), "c")


if __name__ == "__main__":
    unittest.main()
