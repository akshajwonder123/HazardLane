from __future__ import annotations

import re
from typing import Any
from urllib.parse import quote_plus

from app.core.config import Settings
from app.domain import ResolvedLocation
from app.services.cache import TTLCache
from app.services.http import ExternalServiceError, get_json


ZIP_PATTERN = re.compile(r"^\d{5}(?:-\d{4})?$")
STREET_NUMBER_PATTERN = re.compile(r"\b\d+[A-Za-z]?\b")
STREET_SUFFIX_PATTERN = re.compile(
    r"\b("
    r"aly|allee|alley|ave|avenue|blvd|boulevard|cir|circle|ct|court|dr|drive|"
    r"highway|hwy|lane|ln|loop|parkway|pkwy|place|pl|rd|road|sq|square|st|street|"
    r"ter|terrace|trl|trail|way"
    r")\b",
    re.IGNORECASE,
)
UPPERCASE_ADDRESS_TOKENS = {
    "AK", "AL", "AR", "AS", "AZ", "CA", "CO", "CT", "DC", "DE", "FL", "GA",
    "GU", "HI", "IA", "ID", "IL", "IN", "KS", "KY", "LA", "MA", "MD", "ME",
    "MI", "MN", "MO", "MP", "MS", "MT", "NC", "ND", "NE", "NH", "NJ", "NM",
    "NV", "NY", "OH", "OK", "OR", "PA", "PR", "RI", "SC", "SD", "TN", "TX",
    "UT", "VA", "VI", "VT", "WA", "WI", "WV", "WY", "N", "S", "E", "W",
    "NE", "NW", "SE", "SW",
}


_cache: TTLCache[ResolvedLocation] | None = None


class LocationNotFoundError(ExternalServiceError):
    """Raised when a location query is valid but no usable match was found."""


def _get_cache(settings: Settings) -> TTLCache[ResolvedLocation]:
    global _cache
    if (
        _cache is None
        or _cache.ttl_seconds != settings.cache_ttl_seconds
        or _cache.max_entries != settings.cache_max_entries
    ):
        _cache = TTLCache(settings.cache_ttl_seconds, max_entries=settings.cache_max_entries)
    return _cache


def normalize_query(raw_location: str) -> str:
    return " ".join(raw_location.strip().split())


def _state_from_matched_address(matched_address: str) -> str | None:
    parts = [part.strip() for part in matched_address.split(",")]
    if len(parts) < 3:
        return None
    maybe_state = parts[-2].split()
    if not maybe_state:
        return None
    return maybe_state[0]


def _display_name_from_census(matched_address: str) -> str:
    normalized = matched_address.lower().title()
    for token in sorted(UPPERCASE_ADDRESS_TOKENS, key=len, reverse=True):
        normalized = re.sub(rf"\b{token.title()}\b", token, normalized)
    return normalized


def _normalize_zip(query: str) -> str:
    return query[:5]


def _is_street_address_candidate(query: str) -> bool:
    normalized = normalize_query(query)
    return bool(
        STREET_NUMBER_PATTERN.search(normalized)
        and STREET_SUFFIX_PATTERN.search(normalized)
    )


def _parse_float(value: Any, service_name: str, field_name: str) -> float:
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise ExternalServiceError(f"{service_name} returned an invalid {field_name}.") from exc


def _parse_coordinates(coordinates: Any, service_name: str) -> tuple[float, float]:
    if not isinstance(coordinates, dict):
        raise ExternalServiceError(f"{service_name} returned invalid coordinates.")

    latitude = _parse_float(coordinates.get("y"), service_name, "latitude")
    longitude = _parse_float(coordinates.get("x"), service_name, "longitude")
    return latitude, longitude


def _is_census_street_level_match(match: dict[str, Any]) -> bool:
    address_components = match.get("addressComponents")
    if not isinstance(address_components, dict):
        return False

    street_name = str(address_components.get("streetName") or "").strip()
    zip_code = str(address_components.get("zip") or "").strip()
    from_address = str(address_components.get("fromAddress") or "").strip()
    to_address = str(address_components.get("toAddress") or "").strip()

    return bool(street_name and zip_code and (from_address or to_address))


def _raise_if_not_full_street_address(query: str) -> None:
    if _is_street_address_candidate(query):
        return
    raise ValueError(
        "Enter a full U.S. street address with a house number, street, city, and state."
    )


async def _geocode_with_census(query: str, settings: Settings) -> ResolvedLocation | None:
    payload = await get_json(
        settings,
        settings.census_geocode_url,
        params={
            "address": query,
            "benchmark": "Public_AR_Current",
            "format": "json",
        },
        timeout_seconds=min(settings.request_timeout_seconds, 4.5),
    )

    if payload is None:
        raise ExternalServiceError("U.S. Census geocoder returned an invalid payload.")

    result = payload.get("result")
    if not isinstance(result, dict):
        raise ExternalServiceError("U.S. Census geocoder returned an invalid payload.")

    matches = result.get("addressMatches")
    if not isinstance(matches, list):
        raise ExternalServiceError("U.S. Census geocoder returned an invalid payload.")

    street_level_matches = [
        match for match in matches
        if isinstance(match, dict) and _is_census_street_level_match(match)
    ]
    if not street_level_matches:
        return None

    best_match = street_level_matches[0]
    latitude, longitude = _parse_coordinates(best_match.get("coordinates"), "U.S. Census geocoder")
    address_components = best_match.get("addressComponents", {})
    if not isinstance(address_components, dict):
        raise ExternalServiceError("U.S. Census geocoder returned invalid address components.")

    matched_address = best_match.get("matchedAddress", query)
    if not isinstance(matched_address, str) or not matched_address.strip():
        matched_address = query
    state = address_components.get("state") or _state_from_matched_address(matched_address)

    return ResolvedLocation(
        query=query,
        normalized_query=query.lower(),
        input_type="address",
        display_name=_display_name_from_census(matched_address),
        latitude=latitude,
        longitude=longitude,
        state=state,
        postal_code=address_components.get("zip"),
        geocoder="U.S. Census Geocoder",
        geocoder_precision="street-address",
        source_notes=[
            "Resolved with the U.S. Census geocoder for U.S. address-level matching."
        ],
    )


async def _geocode_zip_with_zippopotam(query: str, settings: Settings) -> ResolvedLocation | None:
    payload = await get_json(
        settings,
        f"{settings.zippopotam_base_url}/us/{query}",
        timeout_seconds=min(settings.request_timeout_seconds, 3.0),
        return_none_on_404=True,
    )
    if payload is None:
        return None

    post_code = str(payload.get("post code") or "").strip()
    if post_code != query:
        return None

    places = payload.get("places")
    if not isinstance(places, list) or not places:
        raise ExternalServiceError("Zippopotam returned an invalid ZIP payload.")

    best_place = next((place for place in places if isinstance(place, dict)), None)
    if best_place is None:
        raise ExternalServiceError("Zippopotam returned an invalid ZIP payload.")

    latitude = _parse_float(best_place.get("latitude"), "Zippopotam", "latitude")
    longitude = _parse_float(best_place.get("longitude"), "Zippopotam", "longitude")

    location_name = str(best_place.get("place name") or query).strip()
    state_name = str(best_place.get("state") or "").strip() or None
    state_abbreviation = str(best_place.get("state abbreviation") or state_name or "").strip() or None
    country = str(payload.get("country") or "United States").strip()
    display_name = ", ".join(part for part in [location_name, state_name, country] if part)

    return ResolvedLocation(
        query=query,
        normalized_query=query.lower(),
        input_type="zip",
        display_name=display_name,
        latitude=latitude,
        longitude=longitude,
        state=state_abbreviation,
        postal_code=post_code,
        geocoder="Zippopotam",
        geocoder_precision="postal-area",
        source_notes=["Resolved with Zippopotam postal lookup."],
    )


async def _geocode_zip_with_open_meteo(query: str, settings: Settings) -> ResolvedLocation | None:
    payload = await get_json(
        settings,
        settings.open_meteo_geocode_url,
        params={
            "name": query,
            "count": 8,
            "language": "en",
            "format": "json",
            "countryCode": "US",
        },
        timeout_seconds=min(settings.request_timeout_seconds, 3.5),
    )

    if payload is None:
        raise ExternalServiceError("Open-Meteo geocoding returned an invalid payload.")

    results = payload.get("results", [])
    if results is None:
        raise ExternalServiceError("Open-Meteo geocoding returned an invalid payload.")
    if not isinstance(results, list):
        raise ExternalServiceError("Open-Meteo geocoding returned an invalid payload.")
    if not results:
        return None

    matching_results = []
    for item in results:
        if not isinstance(item, dict):
            continue
        postcodes = {
            str(postcode).strip()
            for postcode in (item.get("postcodes") or [])
            if str(postcode).strip()
        }
        if query in postcodes:
            matching_results.append(item)

    if not matching_results:
        return None

    ranked = sorted(
        matching_results,
        key=lambda item: (
            item.get("feature_code") not in {"PPL", "PPLA", "PPLC", "PPLA2", "PPLA3"},
            -(item.get("population") or 0),
        ),
    )

    best_match = ranked[0]
    latitude = _parse_float(best_match.get("latitude"), "Open-Meteo geocoding", "latitude")
    longitude = _parse_float(best_match.get("longitude"), "Open-Meteo geocoding", "longitude")
    admin1 = best_match.get("admin1")
    country = best_match.get("country", "United States")
    location_name = best_match.get("name", query)
    postcodes = [
        str(postcode).strip()
        for postcode in (best_match.get("postcodes") or [])
        if str(postcode).strip()
    ]

    display_name = ", ".join(part for part in [location_name, admin1, country] if part)
    return ResolvedLocation(
        query=query,
        normalized_query=query.lower(),
        input_type="zip",
        display_name=display_name,
        latitude=latitude,
        longitude=longitude,
        state=admin1,
        postal_code=postcodes[0] if postcodes else query,
        geocoder="Open-Meteo Geocoding",
        geocoder_precision="postal-area",
        elevation_m=float(best_match["elevation"]) if best_match.get("elevation") is not None else None,
        source_notes=["Resolved with Open-Meteo geocoding."],
    )


async def _resolve_zip(query: str, settings: Settings) -> ResolvedLocation | None:
    saw_not_found = False
    last_service_error: ExternalServiceError | None = None

    for resolver in (_geocode_zip_with_zippopotam, _geocode_zip_with_open_meteo):
        try:
            resolved = await resolver(query, settings)
        except ExternalServiceError as exc:
            last_service_error = exc
            continue

        if resolved is not None:
            return resolved
        saw_not_found = True

    if saw_not_found:
        return None
    if last_service_error is not None:
        raise last_service_error
    return None


async def resolve_location(location: str, requested_type: str, settings: Settings) -> ResolvedLocation:
    normalized_query = normalize_query(location)
    input_type = requested_type
    normalized_cache_query = _normalize_zip(normalized_query) if input_type == "zip" else normalized_query

    if requested_type == "zip" and not ZIP_PATTERN.fullmatch(normalized_query):
        raise ValueError("ZIP searches must use a 5-digit U.S. ZIP code or ZIP+4.")
    if requested_type == "address" and ZIP_PATTERN.fullmatch(normalized_query):
        raise ValueError("Address mode expects a street address, not only a ZIP code.")
    if input_type == "address":
        _raise_if_not_full_street_address(normalized_query)

    cache_key = f"{input_type}:{quote_plus(normalized_cache_query.lower())}"
    cached = _get_cache(settings).get(cache_key)
    if cached is not None:
        return cached

    if input_type == "address":
        resolved = await _geocode_with_census(normalized_query, settings)
    else:
        resolved = await _resolve_zip(_normalize_zip(normalized_query), settings)

    if resolved is None:
        if input_type == "address":
            raise LocationNotFoundError("No address-level geocoding result was found for that location.")
        raise LocationNotFoundError("No geocoding result was found for that location.")

    return _get_cache(settings).set(cache_key, resolved)
