from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

import app.services.overpass as overpass
from app.core.config import Settings
from app.domain import ResolvedLocation
from app.services.http import ExternalServiceError


def _location() -> ResolvedLocation:
    return ResolvedLocation(
        query="123 Main St Fairfax VA",
        normalized_query="123 main st fairfax va",
        input_type="address",
        display_name="123 Main St, Fairfax, VA",
        latitude=38.85,
        longitude=-77.30,
        state="VA",
        postal_code="22030",
        geocoder="U.S. Census Geocoder",
        geocoder_precision="address-range",
    )


class OverpassTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        overpass._cache = None
        self.settings = Settings()

    async def test_invalid_payload_raises_external_service_error(self) -> None:
        with patch.object(overpass, "post_form_json", AsyncMock(return_value={"elements": {}})):
            with self.assertRaises(ExternalServiceError):
                await overpass.fetch_tree_cover(_location(), self.settings)

    def test_malformed_elements_are_ignored_when_scoring_tree_cover(self) -> None:
        summary = overpass._coverage_index_from_elements(
            [
                {"tags": {"natural": "tree"}},
                {"tags": []},
                [],
                {"tags": {"landuse": "forest"}},
            ]
        )

        self.assertEqual(summary.raw_feature_count, 2)
        self.assertGreater(summary.coverage_index, 0)


if __name__ == "__main__":
    unittest.main()
