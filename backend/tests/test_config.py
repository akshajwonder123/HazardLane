from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from app.core.config import Settings


class SettingsValidationTests(unittest.TestCase):
    def test_cache_max_entries_must_be_positive(self) -> None:
        with patch.dict(os.environ, {"CACHE_MAX_ENTRIES": "0"}, clear=False):
            with self.assertRaises(ValueError):
                Settings()

    def test_overpass_timeout_must_be_positive(self) -> None:
        with patch.dict(os.environ, {"OVERPASS_TIMEOUT_SECONDS": "0"}, clear=False):
            with self.assertRaises(ValueError):
                Settings()

    def test_default_frontend_origins_cover_localhost_and_loopback_preview(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            settings = Settings()

        self.assertEqual(
            settings.frontend_origins,
            ("http://localhost:3000", "http://127.0.0.1:3000"),
        )


if __name__ == "__main__":
    unittest.main()
