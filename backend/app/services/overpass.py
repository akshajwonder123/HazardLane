from __future__ import annotations

from app.core.config import Settings
from app.domain import ResolvedLocation, TreeCoverSummary
from app.services.cache import TTLCache
from app.services.http import ExternalServiceError, post_form_json


_cache: TTLCache[TreeCoverSummary] | None = None


def _get_cache(settings: Settings) -> TTLCache[TreeCoverSummary]:
    global _cache
    if (
        _cache is None
        or _cache.ttl_seconds != settings.cache_ttl_seconds
        or _cache.max_entries != settings.cache_max_entries
    ):
        _cache = TTLCache(settings.cache_ttl_seconds, max_entries=settings.cache_max_entries)
    return _cache


def _build_query(latitude: float, longitude: float, radius: int, timeout_seconds: int) -> str:
    return f"""
[out:json][timeout:{timeout_seconds}];
(
  node["natural"="tree"](around:{radius},{latitude},{longitude});
  way["natural"="wood"](around:{radius},{latitude},{longitude});
  relation["natural"="wood"](around:{radius},{latitude},{longitude});
  way["landuse"="forest"](around:{radius},{latitude},{longitude});
  relation["landuse"="forest"](around:{radius},{latitude},{longitude});
  way["leisure"="park"](around:{radius},{latitude},{longitude});
  relation["leisure"="park"](around:{radius},{latitude},{longitude});
  way["natural"="tree_row"](around:{radius},{latitude},{longitude});
  relation["natural"="tree_row"](around:{radius},{latitude},{longitude});
);
out tags center;
""".strip()


def _coverage_index_from_elements(elements: list[dict]) -> TreeCoverSummary:
    tree_nodes = 0
    area_features = 0

    for element in elements:
        if not isinstance(element, dict):
            continue
        tags = element.get("tags", {})
        if not isinstance(tags, dict):
            continue
        if tags.get("natural") == "tree":
            tree_nodes += 1
        if tags.get("natural") in {"wood", "tree_row"} or tags.get("landuse") == "forest" or tags.get("leisure") == "park":
            area_features += 1

    density_signal = min(tree_nodes / 24.0, 1.0) * 45.0
    area_signal = min(area_features / 6.0, 1.0) * 55.0
    coverage_index = round(max(0.0, min(100.0, density_signal + area_signal)))

    return TreeCoverSummary(
        coverage_index=coverage_index,
        raw_feature_count=tree_nodes + area_features,
    )


async def fetch_tree_cover(location: ResolvedLocation, settings: Settings) -> TreeCoverSummary:
    cache_key = f"{location.latitude:.4f},{location.longitude:.4f},{settings.overpass_radius_meters}"
    cached = _get_cache(settings).get(cache_key)
    if cached is not None:
        return cached

    query_timeout_seconds = max(1, int(settings.request_timeout_seconds) - 1)

    payload = await post_form_json(
        settings,
        settings.overpass_url,
        data={
            "data": _build_query(
                location.latitude,
                location.longitude,
                settings.overpass_radius_meters,
                query_timeout_seconds,
            )
        },
        timeout_seconds=settings.overpass_timeout_seconds,
    )

    elements = payload.get("elements") if isinstance(payload, dict) else None
    if not isinstance(elements, list):
        raise ExternalServiceError("Overpass did not return tree coverage data.")

    return _get_cache(settings).set(cache_key, _coverage_index_from_elements(elements))
