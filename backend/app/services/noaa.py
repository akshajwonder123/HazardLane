from __future__ import annotations

from urllib.parse import urlparse

from app.core.config import Settings
from app.domain import AlertSummary, ResolvedLocation
from app.services.cache import TTLCache
from app.services.http import ExternalServiceError, get_json


FLOOD_KEYWORDS = ("flood", "flash flood")
WIND_KEYWORDS = ("wind", "thunderstorm", "tornado", "hurricane", "tropical storm")
SEVERE_KEYWORDS = ("warning", "watch", "advisory")

_cache: TTLCache[AlertSummary] | None = None


def _get_cache(settings: Settings) -> TTLCache[AlertSummary]:
    global _cache
    if (
        _cache is None
        or _cache.ttl_seconds != settings.cache_ttl_seconds
        or _cache.max_entries != settings.cache_max_entries
    ):
        _cache = TTLCache(settings.cache_ttl_seconds, max_entries=settings.cache_max_entries)
    return _cache


def _ugc_code_from_zone_url(zone_url: str | None) -> str | None:
    if not zone_url:
        return None
    path = urlparse(zone_url).path.rstrip("/")
    if not path:
        return None
    return path.split("/")[-1]


async def fetch_alert_summary(location: ResolvedLocation, settings: Settings) -> AlertSummary:
    cache_key = f"{location.latitude:.3f},{location.longitude:.3f}"
    cached = _get_cache(settings).get(cache_key)
    if cached is not None:
        return cached

    headers = {"User-Agent": settings.noaa_user_agent}
    point_data = await get_json(
        settings,
        f"{settings.noaa_base_url}/points/{location.latitude},{location.longitude}",
        headers=headers,
        timeout_seconds=min(settings.request_timeout_seconds, 3.5),
    )
    if point_data is None:
        raise ExternalServiceError("NWS point lookup returned an invalid payload.")

    properties = point_data.get("properties")
    if not isinstance(properties, dict):
        raise ExternalServiceError("NWS point lookup returned an invalid payload.")

    zone_url = properties.get("forecastZone")
    zone_code = _ugc_code_from_zone_url(zone_url)
    if zone_code is None:
        raise ExternalServiceError("NWS point lookup did not return a forecast zone.")

    alerts_data = await get_json(
        settings,
        f"{settings.noaa_base_url}/alerts/active",
        params={"zone": zone_code},
        headers=headers,
        timeout_seconds=min(settings.request_timeout_seconds, 3.5),
    )
    if alerts_data is None:
        raise ExternalServiceError("NWS alerts lookup returned an invalid payload.")

    features = alerts_data.get("features", [])
    if not isinstance(features, list):
        raise ExternalServiceError("NWS alerts lookup returned an invalid payload.")
    flood_count = 0
    wind_count = 0
    severe_count = 0
    relevant_count = 0
    headlines: list[str] = []

    for feature in features:
        if not isinstance(feature, dict):
            continue
        properties = feature.get("properties", {})
        if not isinstance(properties, dict):
            continue
        event = (properties.get("event") or "").lower()
        headline = properties.get("headline") or properties.get("event") or "Active NWS alert"

        is_flood = any(keyword in event for keyword in FLOOD_KEYWORDS)
        is_wind = any(keyword in event for keyword in WIND_KEYWORDS)
        is_severe = any(keyword in event for keyword in SEVERE_KEYWORDS)
        is_relevant = is_flood or is_wind

        if is_flood:
            flood_count += 1
        if is_wind:
            wind_count += 1
        if is_relevant and is_severe:
            severe_count += 1
        if is_relevant:
            relevant_count += 1
            if len(headlines) < 3:
                headlines.append(headline)

    summary = AlertSummary(
        relevant_alert_count=relevant_count,
        flood_alert_count=flood_count,
        wind_alert_count=wind_count,
        severe_alert_count=severe_count,
        headlines=headlines,
    )

    return _get_cache(settings).set(cache_key, summary)
