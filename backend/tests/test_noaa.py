from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

import app.services.noaa as noaa
from app.core.config import Settings
from app.domain import ResolvedLocation
from app.services.http import ExternalServiceError


def _location() -> ResolvedLocation:
    return ResolvedLocation(
        query="20105",
        normalized_query="20105",
        input_type="zip",
        display_name="Aldie, Virginia, United States",
        latitude=38.95,
        longitude=-77.64,
        state="VA",
        postal_code="20105",
        geocoder="Open-Meteo Geocoding",
        geocoder_precision="postal-area",
    )


class NoaaAlertTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        noaa._cache = None
        self.settings = Settings()

    async def test_unrelated_advisories_do_not_raise_severe_weather_counts(self) -> None:
        responses = [
            {"properties": {"forecastZone": "https://api.weather.gov/zones/forecast/VAZ025"}},
            {
                "features": [
                    {"properties": {"event": "Heat Advisory", "headline": "Heat Advisory in effect"}},
                    {"properties": {"event": "Air Quality Alert", "headline": "Air Quality Alert in effect"}},
                ]
            },
        ]

        with patch.object(noaa, "get_json", AsyncMock(side_effect=responses)):
            summary = await noaa.fetch_alert_summary(_location(), self.settings)

        self.assertEqual(summary.relevant_alert_count, 0)
        self.assertEqual(summary.severe_alert_count, 0)
        self.assertEqual(summary.headlines, [])

    async def test_relevant_weather_alerts_count_as_severe_when_appropriate(self) -> None:
        responses = [
            {"properties": {"forecastZone": "https://api.weather.gov/zones/forecast/VAZ025"}},
            {
                "features": [
                    {"properties": {"event": "Tornado Warning", "headline": "Tornado Warning in effect"}},
                    {"properties": {"event": "Flood Watch", "headline": "Flood Watch in effect"}},
                ]
            },
        ]

        with patch.object(noaa, "get_json", AsyncMock(side_effect=responses)):
            summary = await noaa.fetch_alert_summary(_location(), self.settings)

        self.assertEqual(summary.relevant_alert_count, 2)
        self.assertEqual(summary.wind_alert_count, 1)
        self.assertEqual(summary.flood_alert_count, 1)
        self.assertEqual(summary.severe_alert_count, 2)

    async def test_invalid_point_payload_raises_external_service_error(self) -> None:
        with patch.object(noaa, "get_json", AsyncMock(return_value={"properties": []})):
            with self.assertRaises(ExternalServiceError):
                await noaa.fetch_alert_summary(_location(), self.settings)


if __name__ == "__main__":
    unittest.main()
