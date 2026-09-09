from __future__ import annotations

import unittest

from app.domain import AlertSummary, ResolvedLocation, TreeCoverSummary, WeatherSnapshot
from app.services.scoring import calculate_risk_analysis


class ScoringTests(unittest.TestCase):
    def test_zip_risk_stays_low_in_calm_conditions(self) -> None:
        location = ResolvedLocation(
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
        weather = WeatherSnapshot(
            current_precip_in=0.0,
            recent_24h_precip_in=0.05,
            next_6h_precip_in=0.04,
            max_hourly_precip_next_6h_in=0.02,
            max_wind_gust_next_6h_mph=14.0,
            max_wind_speed_next_6h_mph=9.0,
            min_visibility_next_6h_m=16000.0,
            current_humidity_percent=55.0,
            current_temperature_f=72.0,
            current_dew_point_f=50.0,
        )

        result = calculate_risk_analysis(location, weather, alerts=None, tree_cover=None)

        self.assertLessEqual(result.overall_risk, 24)
        self.assertEqual(result.category, "Safe")
        self.assertTrue(result.summary.startswith("Conditions appear safe."))

    def test_zip_risk_can_land_in_slight_risk_for_localized_weather(self) -> None:
        location = ResolvedLocation(
            query="60611",
            normalized_query="60611",
            input_type="zip",
            display_name="Chicago, Illinois, United States",
            latitude=41.90,
            longitude=-87.62,
            state="IL",
            postal_code="60611",
            geocoder="Zippopotam",
            geocoder_precision="postal-area",
            elevation_m=180.0,
        )
        weather = WeatherSnapshot(
            current_precip_in=0.09,
            recent_24h_precip_in=0.34,
            next_6h_precip_in=0.28,
            max_hourly_precip_next_6h_in=0.18,
            max_wind_gust_next_6h_mph=24.0,
            max_wind_speed_next_6h_mph=16.0,
            min_visibility_next_6h_m=7600.0,
            current_humidity_percent=88.0,
            current_temperature_f=69.0,
            current_dew_point_f=66.0,
        )
        alerts = AlertSummary(
            relevant_alert_count=1,
            flood_alert_count=0,
            wind_alert_count=1,
            severe_alert_count=0,
            headlines=["Wind Advisory"],
        )

        result = calculate_risk_analysis(location, weather, alerts=alerts, tree_cover=None)

        self.assertGreaterEqual(result.overall_risk, 25)
        self.assertLessEqual(result.overall_risk, 54)
        self.assertEqual(result.category, "Slight Risk")
        self.assertTrue(result.summary.startswith("Some localized hazards may affect travel."))

    def test_address_risk_rises_under_windy_wet_tree_dense_conditions(self) -> None:
        location = ResolvedLocation(
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
            elevation_m=28.0,
        )
        weather = WeatherSnapshot(
            current_precip_in=0.28,
            recent_24h_precip_in=1.35,
            next_6h_precip_in=0.95,
            max_hourly_precip_next_6h_in=0.46,
            max_wind_gust_next_6h_mph=48.0,
            max_wind_speed_next_6h_mph=29.0,
            min_visibility_next_6h_m=2800.0,
            current_humidity_percent=97.0,
            current_temperature_f=67.0,
            current_dew_point_f=66.0,
        )
        alerts = AlertSummary(
            relevant_alert_count=2,
            flood_alert_count=1,
            wind_alert_count=1,
            severe_alert_count=2,
            headlines=["Flood Watch", "Wind Advisory"],
        )
        tree_cover = TreeCoverSummary(coverage_index=72, raw_feature_count=18)

        result = calculate_risk_analysis(location, weather, alerts=alerts, tree_cover=tree_cover)

        self.assertGreaterEqual(result.overall_risk, 55)
        self.assertEqual(result.category, "High Risk")
        self.assertTrue(result.summary.startswith("High-risk weather conditions may affect travel."))
        self.assertGreaterEqual(result.tree_risk.score, 60)


if __name__ == "__main__":
    unittest.main()
