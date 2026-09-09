from __future__ import annotations

from datetime import datetime
from typing import Any

from app.core.config import Settings
from app.domain import ResolvedLocation, WeatherSnapshot
from app.services.cache import TTLCache
from app.services.http import ExternalServiceError, get_json


_cache: TTLCache[WeatherSnapshot] | None = None


def _get_cache(settings: Settings) -> TTLCache[WeatherSnapshot]:
    global _cache
    if (
        _cache is None
        or _cache.ttl_seconds != settings.cache_ttl_seconds
        or _cache.max_entries != settings.cache_max_entries
    ):
        _cache = TTLCache(settings.cache_ttl_seconds, max_entries=settings.cache_max_entries)
    return _cache


def _parse_iso8601(value: str) -> datetime:
    return datetime.fromisoformat(value)


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _series_value(series: list[Any] | None, index: int) -> Any:
    if series is None or index >= len(series):
        return None
    return series[index]


async def fetch_weather_snapshot(location: ResolvedLocation, settings: Settings) -> WeatherSnapshot:
    cache_key = f"{location.latitude:.4f},{location.longitude:.4f}"
    cached = _get_cache(settings).get(cache_key)
    if cached is not None:
        return cached

    payload = await get_json(
        settings,
        settings.open_meteo_forecast_url,
        params={
            "latitude": location.latitude,
            "longitude": location.longitude,
            "current": ",".join(
                [
                    "temperature_2m",
                    "relative_humidity_2m",
                    "dew_point_2m",
                    "precipitation",
                    "wind_speed_10m",
                    "wind_gusts_10m",
                    "visibility",
                ]
            ),
            "hourly": ",".join(
                [
                    "precipitation",
                    "wind_speed_10m",
                    "wind_gusts_10m",
                    "visibility",
                ]
            ),
            "past_hours": 24,
            "forecast_hours": 12,
            "temperature_unit": "fahrenheit",
            "wind_speed_unit": "mph",
            "precipitation_unit": "inch",
            "timezone": "auto",
        },
        timeout_seconds=min(settings.request_timeout_seconds, 4.5),
    )

    if payload is None:
        raise ExternalServiceError("Open-Meteo returned an incomplete weather payload.")

    current = payload.get("current")
    hourly = payload.get("hourly")
    if not isinstance(current, dict) or not isinstance(hourly, dict):
        raise ExternalServiceError("Open-Meteo returned an incomplete weather payload.")

    current_time = current.get("time")
    if not isinstance(current_time, str):
        raise ExternalServiceError("Open-Meteo returned an invalid current weather timestamp.")

    try:
        now = _parse_iso8601(current_time)
    except ValueError as exc:
        raise ExternalServiceError("Open-Meteo returned an invalid current weather timestamp.") from exc

    hourly_times = hourly.get("time", [])
    if not isinstance(hourly_times, list):
        raise ExternalServiceError("Open-Meteo returned an invalid hourly weather payload.")

    rows = []
    for index, raw_time in enumerate(hourly_times):
        if not isinstance(raw_time, str):
            raise ExternalServiceError("Open-Meteo returned an invalid hourly weather timestamp.")
        try:
            row_time = _parse_iso8601(raw_time)
        except ValueError as exc:
            raise ExternalServiceError("Open-Meteo returned an invalid hourly weather timestamp.") from exc
        rows.append(
            {
                "time": row_time,
                "precipitation": _safe_float(_series_value(hourly.get("precipitation"), index)),
                "wind_speed": _safe_float(_series_value(hourly.get("wind_speed_10m"), index)),
                "wind_gust": _safe_float(_series_value(hourly.get("wind_gusts_10m"), index)),
                "visibility": _safe_float(_series_value(hourly.get("visibility"), index)),
            }
        )

    past_rows = [row for row in rows if row["time"] < now]
    future_rows = [row for row in rows if row["time"] >= now]
    next_six_rows = future_rows[:6]

    recent_24h_precip = sum((row["precipitation"] or 0.0) for row in past_rows[-24:])
    next_6h_precip = sum((row["precipitation"] or 0.0) for row in next_six_rows)
    max_hourly_precip_next_6h = max((row["precipitation"] or 0.0) for row in next_six_rows) if next_six_rows else 0.0
    max_wind_gust_next_6h = max((row["wind_gust"] or 0.0) for row in next_six_rows) if next_six_rows else 0.0
    max_wind_speed_next_6h = max((row["wind_speed"] or 0.0) for row in next_six_rows) if next_six_rows else 0.0

    visibilities = [row["visibility"] for row in next_six_rows if row["visibility"] is not None]
    min_visibility_next_6h = min(visibilities) if visibilities else _safe_float(current.get("visibility"))

    snapshot = WeatherSnapshot(
        current_precip_in=_safe_float(current.get("precipitation")) or 0.0,
        recent_24h_precip_in=recent_24h_precip,
        next_6h_precip_in=next_6h_precip,
        max_hourly_precip_next_6h_in=max_hourly_precip_next_6h,
        max_wind_gust_next_6h_mph=max_wind_gust_next_6h,
        max_wind_speed_next_6h_mph=max_wind_speed_next_6h,
        min_visibility_next_6h_m=min_visibility_next_6h,
        current_humidity_percent=_safe_float(current.get("relative_humidity_2m")),
        current_temperature_f=_safe_float(current.get("temperature_2m")),
        current_dew_point_f=_safe_float(current.get("dew_point_2m")),
    )

    return _get_cache(settings).set(cache_key, snapshot)
