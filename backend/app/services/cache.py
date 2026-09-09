from __future__ import annotations

from collections import OrderedDict
from time import monotonic
from typing import Generic, TypeVar


T = TypeVar("T")


class TTLCache(Generic[T]):
    def __init__(self, ttl_seconds: int, max_entries: int = 1024) -> None:
        self.ttl_seconds = ttl_seconds
        self.max_entries = max_entries
        self._items: OrderedDict[str, tuple[float, T]] = OrderedDict()

    def _purge_expired(self) -> None:
        now = monotonic()
        expired_keys = [key for key, (expires_at, _) in self._items.items() if now > expires_at]
        for key in expired_keys:
            self._items.pop(key, None)

    def get(self, key: str) -> T | None:
        self._purge_expired()
        record = self._items.get(key)
        if record is None:
            return None

        _, value = record
        self._items.move_to_end(key)
        return value

    def set(self, key: str, value: T) -> T:
        self._purge_expired()
        if key in self._items:
            self._items.pop(key, None)
        elif len(self._items) >= self.max_entries:
            self._items.popitem(last=False)
        self._items[key] = (monotonic() + self.ttl_seconds, value)
        return value
