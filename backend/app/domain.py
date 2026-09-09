from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(slots=True)
class ResolvedLocation:
    query: str
    normalized_query: str
    input_type: str
    display_name: str
    latitude: float
    longitude: float
    state: str | None
    postal_code: str | None
    geocoder: str
    geocoder_precision: str
    elevation_m: float | None = None
    source_notes: list[str] = field(default_factory=list)


@dataclass(slots=True)
class WeatherSnapshot:
    current_precip_in: float
    recent_24h_precip_in: float
    next_6h_precip_in: float
    max_hourly_precip_next_6h_in: float
    max_wind_gust_next_6h_mph: float
    max_wind_speed_next_6h_mph: float
    min_visibility_next_6h_m: float | None
    current_humidity_percent: float | None
    current_temperature_f: float | None
    current_dew_point_f: float | None
    source: str = "Open-Meteo"


@dataclass(slots=True)
class AlertSummary:
    relevant_alert_count: int
    flood_alert_count: int
    wind_alert_count: int
    severe_alert_count: int
    headlines: list[str]
    source: str = "NOAA/NWS"


@dataclass(slots=True)
class TreeCoverSummary:
    coverage_index: int
    raw_feature_count: int
    source: str = "OpenStreetMap Overpass"


@dataclass(slots=True)
class RiskComponentDetail:
    score: int
    drivers: list[str]


@dataclass(slots=True)
class AnalysisResult:
    overall_risk: int
    category: str
    flood_risk: RiskComponentDetail
    tree_risk: RiskComponentDetail
    wind_risk: RiskComponentDetail
    visibility_risk: RiskComponentDetail
    confidence: int
    summary: str
    factors: list[str]
