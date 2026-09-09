from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
import os
from pathlib import Path

from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parents[2] / ".env")


def _as_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _as_csv(value: str | None, default: tuple[str, ...]) -> tuple[str, ...]:
    if value is None:
        return default
    items = tuple(item.strip() for item in value.split(",") if item.strip())
    return items or default


@dataclass(frozen=True, slots=True)
class Settings:
    app_name: str = "StormRoute API"
    frontend_origins: tuple[str, ...] = field(
        default_factory=lambda: _as_csv(
            os.getenv("FRONTEND_ORIGIN"),
            ("http://localhost:3000", "http://127.0.0.1:3000"),
        )
    )
    request_timeout_seconds: float = field(
        default_factory=lambda: float(os.getenv("REQUEST_TIMEOUT_SECONDS", "8"))
    )
    cache_ttl_seconds: int = field(default_factory=lambda: int(os.getenv("CACHE_TTL_SECONDS", "3600")))
    cache_max_entries: int = field(default_factory=lambda: int(os.getenv("CACHE_MAX_ENTRIES", "1024")))
    overpass_radius_meters: int = field(
        default_factory=lambda: int(os.getenv("OVERPASS_RADIUS_METERS", "350"))
    )
    overpass_timeout_seconds: float = field(
        default_factory=lambda: float(os.getenv("OVERPASS_TIMEOUT_SECONDS", "2.5"))
    )
    enable_overpass: bool = field(default_factory=lambda: _as_bool(os.getenv("ENABLE_OVERPASS"), True))
    enable_noaa_alerts: bool = field(default_factory=lambda: _as_bool(os.getenv("ENABLE_NOAA_ALERTS"), True))
    default_user_agent: str = field(
        default_factory=lambda: os.getenv(
            "DEFAULT_USER_AGENT",
            "StormRoute/0.1 (contact: local-dev@example.com)",
        )
    )
    noaa_user_agent: str = field(
        default_factory=lambda: os.getenv(
            "NOAA_USER_AGENT",
            "StormRoute/0.1 (contact: local-dev@example.com)",
        )
    )
    census_geocode_url: str = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"
    zippopotam_base_url: str = "https://api.zippopotam.us"
    open_meteo_geocode_url: str = "https://geocoding-api.open-meteo.com/v1/search"
    open_meteo_forecast_url: str = "https://api.open-meteo.com/v1/forecast"
    overpass_url: str = field(
        default_factory=lambda: os.getenv("OVERPASS_URL", "https://overpass-api.de/api/interpreter")
    )
    noaa_base_url: str = "https://api.weather.gov"

    def __post_init__(self) -> None:
        if not self.frontend_origins:
            raise ValueError("FRONTEND_ORIGIN must include at least one origin.")
        if self.request_timeout_seconds <= 0:
            raise ValueError("REQUEST_TIMEOUT_SECONDS must be greater than 0.")
        if self.cache_ttl_seconds <= 0:
            raise ValueError("CACHE_TTL_SECONDS must be greater than 0.")
        if self.cache_max_entries <= 0:
            raise ValueError("CACHE_MAX_ENTRIES must be greater than 0.")
        if self.overpass_radius_meters <= 0:
            raise ValueError("OVERPASS_RADIUS_METERS must be greater than 0.")
        if self.overpass_timeout_seconds <= 0:
            raise ValueError("OVERPASS_TIMEOUT_SECONDS must be greater than 0.")
        if not self.default_user_agent.strip():
            raise ValueError("DEFAULT_USER_AGENT must not be empty.")
        if not self.noaa_user_agent.strip():
            raise ValueError("NOAA_USER_AGENT must not be empty.")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
