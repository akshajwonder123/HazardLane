from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

import app.services.geocoding as geocoding
from app.core.config import Settings
from app.domain import ResolvedLocation
from app.services.geocoding import LocationNotFoundError
from app.services.http import ExternalServiceError


def _zip_location() -> ResolvedLocation:
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
        elevation_m=120.0,
    )


class ResolveLocationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        geocoding._cache = None
        self.settings = Settings()

    async def test_explicit_address_mode_requires_census_match(self) -> None:
        with patch.object(geocoding, "_geocode_with_census", AsyncMock(return_value=None)) as census_mock:
            with patch.object(geocoding, "_geocode_zip_with_open_meteo", AsyncMock()) as open_meteo_mock:
                with self.assertRaises(LocationNotFoundError) as context:
                    await geocoding.resolve_location(
                        "1600 Pennsylvania Ave NW Washington DC",
                        "address",
                        self.settings,
                    )

        self.assertEqual(
            str(context.exception),
            "No address-level geocoding result was found for that location.",
        )
        census_mock.assert_awaited_once()
        open_meteo_mock.assert_not_called()

    async def test_zip_mode_rejects_street_address_input(self) -> None:
        with self.assertRaises(ValueError) as context:
            await geocoding.resolve_location("1600 Pennsylvania Ave NW Washington DC", "zip", self.settings)

        self.assertIn("ZIP searches must use", str(context.exception))

    async def test_zip_mode_uses_open_meteo_lookup(self) -> None:
        resolved = _zip_location()

        with patch.object(geocoding, "_geocode_zip_with_open_meteo", AsyncMock(return_value=resolved)) as open_meteo_mock:
            with patch.object(geocoding, "_geocode_zip_with_zippopotam", AsyncMock(return_value=None)):
                result = await geocoding.resolve_location("20105", "zip", self.settings)

        self.assertEqual(result, resolved)
        open_meteo_mock.assert_awaited_once_with("20105", self.settings)

    async def test_valid_nonlocal_zip_resolves_from_zippopotam(self) -> None:
        payload = {
            "post code": "90210",
            "country": "United States",
            "places": [
                {
                    "place name": "Beverly Hills",
                    "state": "California",
                    "state abbreviation": "CA",
                    "latitude": "34.0901",
                    "longitude": "-118.4065",
                }
            ],
        }

        with patch.object(geocoding, "get_json", AsyncMock(return_value=payload)):
            result = await geocoding._geocode_zip_with_zippopotam("90210", self.settings)

        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.postal_code, "90210")
        self.assertEqual(result.display_name, "Beverly Hills, California, United States")
        self.assertEqual(result.geocoder, "Zippopotam")

    async def test_invalid_zip_is_rejected_when_no_zip_service_returns_a_match(self) -> None:
        with patch.object(geocoding, "_geocode_zip_with_zippopotam", AsyncMock(return_value=None)):
            with patch.object(geocoding, "_geocode_zip_with_open_meteo", AsyncMock(return_value=None)):
                with self.assertRaises(LocationNotFoundError):
                    await geocoding.resolve_location("00000", "zip", self.settings)

    async def test_zip_mode_rejects_non_matching_open_meteo_postal_results(self) -> None:
        payload = {
            "results": [
                {
                    "name": "Aldie",
                    "admin1": "Virginia",
                    "country": "United States",
                    "latitude": 38.95,
                    "longitude": -77.64,
                    "postcodes": ["99999"],
                    "feature_code": "PPL",
                    "population": 25000,
                }
            ]
        }

        with patch.object(geocoding, "get_json", AsyncMock(return_value=payload)):
            with self.assertRaises(LocationNotFoundError):
                with patch.object(geocoding, "_geocode_zip_with_zippopotam", AsyncMock(return_value=None)):
                    await geocoding.resolve_location("20105", "zip", self.settings)

    async def test_malformed_census_payload_raises_external_service_error(self) -> None:
        with patch.object(geocoding, "get_json", AsyncMock(return_value={})):
            with self.assertRaises(ExternalServiceError):
                await geocoding._geocode_with_census(
                    "1600 Pennsylvania Ave NW Washington DC",
                    self.settings,
                )

    async def test_valid_full_address_resolves_from_census_payload(self) -> None:
        payload = {
            "result": {
                "addressMatches": [
                    {
                        "matchedAddress": "1600 PENNSYLVANIA AVE NW, WASHINGTON, DC, 20500",
                        "coordinates": {"x": -77.0352, "y": 38.8987},
                        "addressComponents": {
                            "fromAddress": "1600",
                            "toAddress": "1600",
                            "streetName": "PENNSYLVANIA",
                            "zip": "20500",
                            "state": "DC",
                        },
                    }
                ]
            }
        }

        with patch.object(geocoding, "get_json", AsyncMock(return_value=payload)):
            result = await geocoding._geocode_with_census(
                "1600 Pennsylvania Avenue NW Washington DC",
                self.settings,
            )

        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.input_type, "address")
        self.assertEqual(result.geocoder_precision, "street-address")
        self.assertEqual(result.display_name, "1600 Pennsylvania Ave NW, Washington, DC, 20500")

    async def test_city_only_address_is_rejected_before_geocoding(self) -> None:
        with self.assertRaises(ValueError) as context:
            await geocoding.resolve_location("Fairfax VA", "address", self.settings)

        self.assertIn("full U.S. street address", str(context.exception))

    async def test_address_mode_rejects_zip_only_input(self) -> None:
        with self.assertRaises(ValueError) as context:
            await geocoding.resolve_location("20105", "address", self.settings)

        self.assertIn("Address mode expects", str(context.exception))

    async def test_census_display_name_preserves_direction_and_state_abbreviations(self) -> None:
        display_name = geocoding._display_name_from_census(
            "1600 PENNSYLVANIA AVE NW, WASHINGTON, DC, 20500"
        )

        self.assertEqual(display_name, "1600 Pennsylvania Ave NW, Washington, DC, 20500")


if __name__ == "__main__":
    unittest.main()
