from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

import app.api.routes as routes
from app.domain import AlertSummary, ResolvedLocation, WeatherSnapshot
from app.schemas import AnalyzeRequest
from app.services.geocoding import LocationNotFoundError
from app.services.http import ExternalServiceError


class AnalyzeRouteTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        routes._analysis_cache = None

    async def test_location_not_found_maps_to_404(self) -> None:
        payload = AnalyzeRequest(location="99999", type="zip")

        with patch.object(routes, "resolve_location", AsyncMock(side_effect=LocationNotFoundError("missing"))):
            with self.assertRaises(HTTPException) as context:
                await routes.analyze(payload)

        self.assertEqual(context.exception.status_code, 404)
        self.assertIn("ZIP code", str(context.exception.detail))

    async def test_geocoding_upstream_failure_maps_to_503(self) -> None:
        payload = AnalyzeRequest(location="20105", type="zip")

        with patch.object(routes, "resolve_location", AsyncMock(side_effect=ExternalServiceError("upstream down"))):
            with self.assertRaises(HTTPException) as context:
                await routes.analyze(payload)

        self.assertEqual(context.exception.status_code, 503)
        self.assertIn("upstream geocoding service", str(context.exception.detail))

    async def test_slow_overpass_falls_back_to_lower_confidence_result(self) -> None:
        payload = AnalyzeRequest(location="1600 Pennsylvania Avenue NW Washington DC", type="address")
        location = ResolvedLocation(
            query=payload.location,
            normalized_query=payload.location.lower(),
            input_type="address",
            display_name="1600 Pennsylvania Ave NW, Washington, DC, 20500",
            latitude=38.8987,
            longitude=-77.0352,
            state="DC",
            postal_code="20500",
            geocoder="U.S. Census Geocoder",
            geocoder_precision="street-address",
            source_notes=["Resolved with the U.S. Census geocoder for U.S. address-level matching."],
        )
        weather = WeatherSnapshot(
            current_precip_in=0.16,
            recent_24h_precip_in=0.85,
            next_6h_precip_in=0.35,
            max_hourly_precip_next_6h_in=0.18,
            max_wind_gust_next_6h_mph=38.0,
            max_wind_speed_next_6h_mph=24.0,
            min_visibility_next_6h_m=12000.0,
            current_humidity_percent=70.0,
            current_temperature_f=75.0,
            current_dew_point_f=64.0,
        )
        alerts = AlertSummary(
            relevant_alert_count=0,
            flood_alert_count=0,
            wind_alert_count=0,
            severe_alert_count=0,
            headlines=[],
        )

        with patch.object(routes, "resolve_location", AsyncMock(return_value=location)):
            with patch.object(routes, "fetch_weather_snapshot", AsyncMock(return_value=weather)):
                with patch.object(routes, "fetch_alert_summary", AsyncMock(return_value=alerts)):
                    with patch.object(routes, "fetch_tree_cover", AsyncMock(side_effect=ExternalServiceError("slow"))):
                        result = await routes.analyze(payload)

        self.assertEqual(result.inputType, "address")
        self.assertIn("OpenStreetMap Overpass", result.unavailableDataSources)
        self.assertEqual(result.confidenceLevel, "medium")
        self.assertLess(result.confidence, 90)


if __name__ == "__main__":
    unittest.main()
