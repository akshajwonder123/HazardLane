from __future__ import annotations

import asyncio
from urllib.parse import quote_plus

from fastapi import APIRouter, HTTPException

from app.core.config import get_settings
from app.domain import AlertSummary, TreeCoverSummary, WeatherSnapshot
from app.schemas import AnalyzeRequest, AnalyzeResponse, ConfidenceLevel
from app.services.cache import TTLCache
from app.services.geocoding import (
    LocationNotFoundError,
    normalize_query,
    resolve_location,
)
from app.services.http import ExternalServiceError
from app.services.noaa import fetch_alert_summary
from app.services.overpass import fetch_tree_cover
from app.services.scoring import calculate_risk_analysis
from app.services.weather import fetch_weather_snapshot


ANALYSIS_CACHE_MIN_TTL_SECONDS = 3600

router = APIRouter()
_analysis_cache: TTLCache[AnalyzeResponse] | None = None


def _get_analysis_cache() -> TTLCache[AnalyzeResponse]:
    global _analysis_cache
    settings = get_settings()
    ttl_seconds = max(settings.cache_ttl_seconds, ANALYSIS_CACHE_MIN_TTL_SECONDS)
    if (
        _analysis_cache is None
        or _analysis_cache.ttl_seconds != ttl_seconds
        or _analysis_cache.max_entries != settings.cache_max_entries
    ):
        _analysis_cache = TTLCache(ttl_seconds, max_entries=settings.cache_max_entries)
    return _analysis_cache


def _analysis_cache_key(location: str, input_type: str) -> str:
    normalized_query = normalize_query(location)
    normalized_cache_query = normalized_query[:5] if input_type == "zip" else normalized_query
    return f"{input_type}:{quote_plus(normalized_cache_query.lower())}"


def _confidence_level(confidence: int) -> ConfidenceLevel:
    if confidence >= 80:
        return "high"
    if confidence >= 60:
        return "medium"
    return "low"


def _dedupe_preserving_order(values: list[str]) -> list[str]:
    deduped: list[str] = []
    for value in values:
        if value not in deduped:
            deduped.append(value)
    return deduped


def _should_fetch_tree_cover(weather: WeatherSnapshot) -> bool:
    accumulation = weather.recent_24h_precip_in + weather.next_6h_precip_in
    return (
        weather.max_wind_gust_next_6h_mph >= 28.0
        or weather.max_wind_speed_next_6h_mph >= 22.0
        or accumulation >= 0.75
        or weather.current_precip_in >= 0.15
    )


@router.get("/health")
async def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(payload: AnalyzeRequest) -> AnalyzeResponse:
    settings = get_settings()
    requested_input_type = payload.type
    cache_key = _analysis_cache_key(payload.location, requested_input_type)
    cached_response = _get_analysis_cache().get(cache_key)
    if cached_response is not None:
        return cached_response

    try:
        location = await resolve_location(payload.location, payload.type, settings)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LocationNotFoundError:
        if requested_input_type == "address":
            detail = (
                "We could not resolve that U.S. street address. "
                "Try a fuller U.S. street address or switch to a 5-digit ZIP code."
            )
        else:
            detail = "We could not resolve that ZIP code. Try a valid 5-digit U.S. ZIP code or ZIP+4."
        raise HTTPException(status_code=404, detail=detail)
    except ExternalServiceError as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "StormRoute could not resolve that location right now because an upstream geocoding service "
                "is unavailable."
            ),
        ) from exc

    source_notes = list(location.source_notes)
    unavailable_data_sources: list[str] = []

    try:
        weather = await fetch_weather_snapshot(location, settings)
    except ExternalServiceError as exc:
        raise HTTPException(
            status_code=503,
            detail="StormRoute could not load weather data for this location right now.",
        ) from exc

    alerts: AlertSummary | None = None
    alerts_available = True
    tree_cover: TreeCoverSummary | None = None
    tree_cover_status = "not_applicable" if location.input_type == "zip" else "skipped"

    background_tasks: list[tuple[str, asyncio.Future[object]]] = []

    if settings.enable_noaa_alerts:
        background_tasks.append(("alerts", asyncio.create_task(fetch_alert_summary(location, settings))))

    if location.input_type == "zip":
        source_notes.append("ZIP analysis uses broader area weather signals and does not rely on precise tree mapping.")
    elif settings.enable_overpass and _should_fetch_tree_cover(weather):
        tree_cover_status = "unavailable"
        background_tasks.append(("tree_cover", asyncio.create_task(fetch_tree_cover(location, settings))))
    elif settings.enable_overpass:
        source_notes.append(
            "Tree coverage lookup was skipped because current wind and rainfall signals stayed limited."
        )
    else:
        source_notes.append(
            "Address-level tree coverage lookup is disabled, so tree risk leaned on wind and rainfall only."
        )

    if background_tasks:
        task_results = await asyncio.gather(
            *(task for _, task in background_tasks),
            return_exceptions=True,
        )

        for (task_name, _), task_result in zip(background_tasks, task_results):
            if task_name == "alerts":
                if isinstance(task_result, Exception):
                    alerts_available = False
                    unavailable_data_sources.append("NOAA/NWS")
                    source_notes.append(
                        "NOAA/NWS alert enrichment was unavailable, so the score used weather data only."
                    )
                    continue
                alerts = task_result if isinstance(task_result, AlertSummary) else None
                if alerts is None:
                    alerts_available = False
                    unavailable_data_sources.append("NOAA/NWS")
                    source_notes.append(
                        "NOAA/NWS alert enrichment was unavailable, so the score used weather data only."
                    )
                elif alerts.relevant_alert_count:
                    source_notes.append(
                        "NOAA/NWS active alerts were used to reinforce flood and wind context."
                    )
            elif task_name == "tree_cover":
                if isinstance(task_result, Exception):
                    tree_cover_status = "unavailable"
                    unavailable_data_sources.append("OpenStreetMap Overpass")
                    source_notes.append(
                        "Tree coverage lookup timed out, so address-level tree risk leaned on wind and rainfall only."
                    )
                    continue
                tree_cover = task_result if isinstance(task_result, TreeCoverSummary) else None
                if tree_cover is None:
                    tree_cover_status = "unavailable"
                    unavailable_data_sources.append("OpenStreetMap Overpass")
                    source_notes.append(
                        "Tree coverage lookup timed out, so address-level tree risk leaned on wind and rainfall only."
                    )
                else:
                    tree_cover_status = "available"
                    source_notes.append(
                        "Address-level tree context was estimated from nearby OpenStreetMap green features."
                    )

    result = calculate_risk_analysis(
        location,
        weather,
        alerts,
        tree_cover,
        alerts_available=alerts_available,
        tree_cover_status=tree_cover_status,
    )

    response = AnalyzeResponse(
        inputType=location.input_type,
        resolvedLocation=location.display_name,
        latitude=round(location.latitude, 5),
        longitude=round(location.longitude, 5),
        overallRisk=result.overall_risk,
        category=result.category,
        floodRisk=result.flood_risk.score,
        treeRisk=result.tree_risk.score,
        windRisk=result.wind_risk.score,
        visibilityRisk=result.visibility_risk.score,
        confidence=result.confidence,
        confidenceLevel=_confidence_level(result.confidence),
        summary=result.summary,
        factors=result.factors,
        unavailableDataSources=_dedupe_preserving_order(unavailable_data_sources),
        sourceNotes=_dedupe_preserving_order(source_notes),
    )

    return _get_analysis_cache().set(cache_key, response)
