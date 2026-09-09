from __future__ import annotations

from app.domain import AnalysisResult, AlertSummary, ResolvedLocation, RiskComponentDetail, TreeCoverSummary, WeatherSnapshot


def clamp(value: float, minimum: float = 0.0, maximum: float = 100.0) -> float:
    return max(minimum, min(maximum, value))


def scale_up(value: float, low: float, high: float) -> float:
    if high <= low:
        return 0.0
    return clamp(((value - low) / (high - low)) * 100.0)


def scale_down(value: float, low_risk_value: float, high_risk_value: float) -> float:
    if low_risk_value <= high_risk_value:
        return 0.0
    return clamp(((low_risk_value - value) / (low_risk_value - high_risk_value)) * 100.0)


def risk_category(score: int) -> str:
    if score <= 24:
        return "Safe"
    if score <= 54:
        return "Slight Risk"
    return "High Risk"


def _mph(value: float) -> str:
    return f"{round(value)} mph"


def _inches(value: float) -> str:
    return f"{value:.2f} in"


def _miles_from_meters(value: float | None) -> float | None:
    if value is None:
        return None
    return value * 0.000621371


def _flood_component(weather: WeatherSnapshot, alerts: AlertSummary | None, location: ResolvedLocation) -> RiskComponentDetail:
    rain_intensity = max(
        scale_up(weather.current_precip_in, 0.03, 0.40),
        scale_up(weather.max_hourly_precip_next_6h_in, 0.06, 0.75),
    )
    accumulation = scale_up(weather.recent_24h_precip_in + weather.next_6h_precip_in, 0.25, 2.25)
    elevation_risk = 35.0
    if location.elevation_m is not None:
        elevation_risk = scale_down(location.elevation_m, 220.0, 8.0)
    alert_risk = clamp((alerts.flood_alert_count * 35.0) + (alerts.severe_alert_count * 18.0)) if alerts else 0.0

    score = round(
        clamp(
            (rain_intensity * 0.38)
            + (accumulation * 0.32)
            + (elevation_risk * 0.10)
            + (alert_risk * 0.20)
        )
    )

    drivers: list[str] = []
    if weather.max_hourly_precip_next_6h_in >= 0.35 or weather.current_precip_in >= 0.20:
        drivers.append(f"Heavy rain intensity reaches about {_inches(max(weather.max_hourly_precip_next_6h_in, weather.current_precip_in))} per hour.")
    if weather.recent_24h_precip_in + weather.next_6h_precip_in >= 1.0:
        drivers.append(f"Recent plus near-term rainfall adds up to roughly {_inches(weather.recent_24h_precip_in + weather.next_6h_precip_in)}.")
    if location.elevation_m is not None and location.elevation_m <= 30:
        drivers.append(f"Lower elevation around {round(location.elevation_m)} m can increase pooling risk.")
    if alerts and alerts.flood_alert_count:
        drivers.append("Active NWS flood-related alerts raise confidence in localized water hazards.")
    if alerts and alerts.severe_alert_count:
        drivers.append("Severe-weather alerts increase concern for rapid flooding and difficult road conditions.")
    if not drivers:
        drivers.append("Rainfall signals are limited, keeping flood exposure lower than the other hazards.")

    return RiskComponentDetail(score=score, drivers=drivers[:3])


def _tree_component(
    weather: WeatherSnapshot,
    tree_cover: TreeCoverSummary | None,
    input_type: str,
    tree_cover_status: str,
) -> RiskComponentDetail:
    gust_risk = scale_up(weather.max_wind_gust_next_6h_mph, 20.0, 55.0)
    sustained_risk = scale_up(weather.max_wind_speed_next_6h_mph, 14.0, 34.0)
    wet_ground_risk = scale_up(weather.recent_24h_precip_in + weather.next_6h_precip_in, 0.25, 1.80)
    tree_density_risk = float(tree_cover.coverage_index) if tree_cover else 25.0
    instability_risk = max(gust_risk, wet_ground_risk)

    if input_type == "address":
        score = round(
            clamp(
                (gust_risk * 0.30)
                + (sustained_risk * 0.15)
                + (wet_ground_risk * 0.20)
                + (tree_density_risk * 0.20)
                + (instability_risk * 0.15)
            )
        )
    else:
        score = round(
            clamp(
                (gust_risk * 0.45)
                + (sustained_risk * 0.20)
                + (wet_ground_risk * 0.35)
            )
        )

    drivers: list[str] = []
    if weather.max_wind_gust_next_6h_mph >= 30:
        drivers.append(f"Gusts near {_mph(weather.max_wind_gust_next_6h_mph)} increase the chance of limbs and debris on roads.")
    if weather.recent_24h_precip_in + weather.next_6h_precip_in >= 0.75:
        drivers.append("Wetter ground can reduce root stability during stronger wind.")
    if input_type == "address" and tree_cover and tree_cover.coverage_index >= 45:
        drivers.append("Nearby mapped tree and green features increase blockage potential near the address.")
    if score >= 60:
        drivers.append("Combined wind and wet-ground pressure make tree-fall concerns more acute.")
    if input_type == "address" and tree_cover is None and tree_cover_status == "unavailable":
        drivers.append("Tree coverage data was unavailable, so tree risk leans on wind and rainfall only.")
    if input_type == "address" and tree_cover is None and tree_cover_status == "skipped":
        drivers.append("Tree coverage lookup was skipped because wind and wet-ground signals stayed limited.")
    if not drivers:
        drivers.append("Tree-fall signals remain muted because wind and wet-ground inputs stay modest.")

    return RiskComponentDetail(score=score, drivers=drivers[:3])


def _wind_component(weather: WeatherSnapshot, alerts: AlertSummary | None) -> RiskComponentDetail:
    gust_risk = scale_up(weather.max_wind_gust_next_6h_mph, 18.0, 55.0)
    sustained_risk = scale_up(weather.max_wind_speed_next_6h_mph, 12.0, 34.0)
    alert_risk = clamp((alerts.wind_alert_count * 32.0) + (alerts.severe_alert_count * 22.0)) if alerts else 0.0

    score = round(clamp((gust_risk * 0.55) + (sustained_risk * 0.20) + (alert_risk * 0.25)))

    drivers: list[str] = []
    if weather.max_wind_gust_next_6h_mph >= 25:
        drivers.append(f"Peak gusts could reach {_mph(weather.max_wind_gust_next_6h_mph)}.")
    if weather.max_wind_speed_next_6h_mph >= 20:
        drivers.append(f"Sustained wind may hold near {_mph(weather.max_wind_speed_next_6h_mph)}.")
    if alerts and alerts.wind_alert_count:
        drivers.append("Active wind-focused NWS alerts reinforce handling and debris concerns.")
    if alerts and alerts.severe_alert_count:
        drivers.append("Severe-weather alerts point to stronger wind disruption than weather data alone would suggest.")
    if not drivers:
        drivers.append("Wind stays below the levels that usually drive major road handling issues.")

    return RiskComponentDetail(score=score, drivers=drivers[:3])


def _fog_proxy(weather: WeatherSnapshot) -> float:
    if (
        weather.current_humidity_percent is None
        or weather.current_temperature_f is None
        or weather.current_dew_point_f is None
    ):
        return 15.0

    spread = weather.current_temperature_f - weather.current_dew_point_f
    humidity_risk = scale_up(weather.current_humidity_percent, 80.0, 100.0)
    spread_risk = scale_down(spread, 8.0, 1.0)
    return clamp((humidity_risk * 0.60) + (spread_risk * 0.40))


def _visibility_component(weather: WeatherSnapshot) -> RiskComponentDetail:
    visibility_risk = 18.0
    visibility_miles = _miles_from_meters(weather.min_visibility_next_6h_m)
    if weather.min_visibility_next_6h_m is not None:
        visibility_risk = scale_down(weather.min_visibility_next_6h_m, 12000.0, 600.0)

    rain_risk = max(
        scale_up(weather.current_precip_in, 0.03, 0.40),
        scale_up(weather.max_hourly_precip_next_6h_in, 0.06, 0.70),
    )
    fog_risk = _fog_proxy(weather)

    score = round(clamp((visibility_risk * 0.60) + (rain_risk * 0.22) + (fog_risk * 0.18)))

    drivers: list[str] = []
    if visibility_miles is not None and visibility_miles <= 3.0:
        drivers.append(f"Visibility could drop to about {visibility_miles:.1f} miles.")
    if weather.max_hourly_precip_next_6h_in >= 0.20:
        drivers.append("Heavier rainfall can sharply reduce driver sightlines.")
    if fog_risk >= 55:
        drivers.append("Humidity and dew-point spread suggest a meaningful fog signal.")
    if weather.min_visibility_next_6h_m is None:
        drivers.append("Visibility was not returned directly, so fog and rainfall proxies were used.")
    if not drivers:
        drivers.append("Visibility stays relatively open compared with the other weather hazards.")

    return RiskComponentDetail(score=score, drivers=drivers[:3])


def _overall_score(
    input_type: str,
    flood_score: int,
    tree_score: int,
    wind_score: int,
    visibility_score: int,
    alerts: AlertSummary | None,
) -> int:
    if input_type == "address":
        total = (
            (tree_score * 0.34)
            + (flood_score * 0.32)
            + (wind_score * 0.20)
            + (visibility_score * 0.15)
        )
    else:
        total = (
            (flood_score * 0.38)
            + (wind_score * 0.24)
            + (visibility_score * 0.20)
            + (tree_score * 0.18)
        )

    alert_boost = 0.0
    if alerts is not None:
        alert_boost = min(
            18.0,
            (alerts.relevant_alert_count * 2.0)
            + (alerts.flood_alert_count * 4.0)
            + (alerts.wind_alert_count * 3.0)
            + (alerts.severe_alert_count * 6.0),
        )

    return round(clamp(total + alert_boost))


def _confidence_score(
    location: ResolvedLocation,
    tree_cover_status: str,
    weather: WeatherSnapshot,
    alerts_available: bool,
) -> int:
    confidence = 90.0
    if location.geocoder_precision != "street-address" and location.input_type == "address":
        confidence -= 18.0
    if location.input_type == "address" and tree_cover_status == "unavailable":
        confidence -= 15.0
    if location.input_type == "address" and tree_cover_status == "skipped":
        confidence -= 5.0
    if not alerts_available:
        confidence -= 8.0
    if weather.min_visibility_next_6h_m is None:
        confidence -= 10.0
    return round(clamp(confidence, 35.0, 98.0))


def _summary(
    category: str,
    components: dict[str, RiskComponentDetail],
) -> str:
    ranked = sorted(components.items(), key=lambda item: item[1].score, reverse=True)
    top_name, top_component = ranked[0]
    second_name, second_component = ranked[1]

    lead = {
        "flood": "rainfall-driven flooding",
        "tree": "tree-fall and road-blockage",
        "wind": "wind exposure",
        "visibility": "visibility loss",
    }[top_name]
    secondary = {
        "flood": "flooding",
        "tree": "tree blockage",
        "wind": "crosswind handling",
        "visibility": "reduced sightlines",
    }[second_name]

    if category == "Safe":
        return "Conditions appear safe. Weather-driven road hazards currently look limited."
    if category == "Slight Risk":
        if second_component.score >= 35:
            return f"Some localized hazards may affect travel. The strongest signals point to {lead} with added {secondary} pressure."
        return f"Some localized hazards may affect travel. The main concern right now is {lead}."
    if second_component.score >= 35:
        return f"High-risk weather conditions may affect travel. The strongest signals point to {lead} with added {secondary} pressure."
    return f"High-risk weather conditions may affect travel. The main concern right now is {lead}."


def calculate_risk_analysis(
    location: ResolvedLocation,
    weather: WeatherSnapshot,
    alerts: AlertSummary | None,
    tree_cover: TreeCoverSummary | None,
    *,
    alerts_available: bool = True,
    tree_cover_status: str = "not_applicable",
) -> AnalysisResult:
    flood = _flood_component(weather, alerts, location)
    tree = _tree_component(weather, tree_cover, location.input_type, tree_cover_status)
    wind = _wind_component(weather, alerts)
    visibility = _visibility_component(weather)

    overall = _overall_score(
        location.input_type,
        flood.score,
        tree.score,
        wind.score,
        visibility.score,
        alerts,
    )
    category = risk_category(overall)
    confidence = _confidence_score(location, tree_cover_status, weather, alerts_available)

    components = {
        "flood": flood,
        "tree": tree,
        "wind": wind,
        "visibility": visibility,
    }

    all_factors: list[str] = []
    for component in sorted(components.values(), key=lambda item: item.score, reverse=True):
        all_factors.extend(component.drivers)

    deduped_factors: list[str] = []
    for factor in all_factors:
        if factor not in deduped_factors:
            deduped_factors.append(factor)
        if len(deduped_factors) == 5:
            break

    return AnalysisResult(
        overall_risk=overall,
        category=category,
        flood_risk=flood,
        tree_risk=tree,
        wind_risk=wind,
        visibility_risk=visibility,
        confidence=confidence,
        summary=_summary(category, components),
        factors=deduped_factors,
    )
