from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

import app.services.weather as weather
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


class WeatherSnapshotTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        weather._cache = None
        self.settings = Settings()

    async def test_partial_hourly_arrays_do_not_crash_weather_parsing(self) -> None:
        payload = {
            "current": {
                "time": "2026-06-25T16:45",
                "precipitation": 0,
                "visibility": 12000,
                "relative_humidity_2m": 60,
                "temperature_2m": 75,
                "dew_point_2m": 55,
            },
            "hourly": {
                "time": [
                    "2026-06-25T15:00",
                    "2026-06-25T16:00",
                    "2026-06-25T17:00",
                    "2026-06-25T18:00",
                ],
                "precipitation": [0.0, 0.1],
                "wind_speed_10m": [10.0],
                "wind_gusts_10m": [12.0, 18.0, 20.0],
                "visibility": [10000.0, 9000.0, 8000.0],
            },
            "daily": {"precipitation_sum": [0.1]},
        }

        with patch.object(weather, "get_json", AsyncMock(return_value=payload)):
            snapshot = await weather.fetch_weather_snapshot(_location(), self.settings)

        self.assertEqual(snapshot.recent_24h_precip_in, 0.1)
        self.assertEqual(snapshot.next_6h_precip_in, 0.0)
        self.assertEqual(snapshot.max_wind_speed_next_6h_mph, 0.0)
        self.assertEqual(snapshot.max_wind_gust_next_6h_mph, 20.0)
        self.assertEqual(snapshot.min_visibility_next_6h_m, 8000.0)

    async def test_invalid_current_timestamp_raises_external_service_error(self) -> None:
        payload = {
            "current": {
                "time": 123,
                "precipitation": 0,
            },
            "hourly": {
                "time": [],
            },
        }

        with patch.object(weather, "get_json", AsyncMock(return_value=payload)):
            with self.assertRaises(ExternalServiceError):
                await weather.fetch_weather_snapshot(_location(), self.settings)


if __name__ == "__main__":
    unittest.main()
