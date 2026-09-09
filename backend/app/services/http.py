from __future__ import annotations

from typing import Any

import httpx

from app.core.config import Settings


class ExternalServiceError(RuntimeError):
    """Raised when a public upstream service cannot return usable data."""


def _build_timeout(timeout_seconds: float) -> httpx.Timeout:
    connect_timeout = min(timeout_seconds, 3.0)
    return httpx.Timeout(
        timeout_seconds,
        connect=connect_timeout,
        read=timeout_seconds,
        write=timeout_seconds,
        pool=connect_timeout,
    )


def _merge_headers(settings: Settings, headers: dict[str, str] | None = None) -> dict[str, str]:
    merged = {
        "Accept": "application/json",
        "User-Agent": settings.default_user_agent,
    }
    if headers:
        merged.update(headers)
    return merged


async def get_json(
    settings: Settings,
    url: str,
    *,
    params: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout_seconds: float | None = None,
    return_none_on_404: bool = False,
) -> dict[str, Any] | None:
    try:
        async with httpx.AsyncClient(
            timeout=_build_timeout(timeout_seconds or settings.request_timeout_seconds),
            follow_redirects=True,
            headers=_merge_headers(settings, headers),
        ) as client:
            response = await client.get(url, params=params)
            if return_none_on_404 and response.status_code == 404:
                return None
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict):
                raise ExternalServiceError(f"Unable to fetch JSON from {url}")
            return payload
    except (httpx.HTTPError, ValueError) as exc:
        raise ExternalServiceError(f"Unable to fetch JSON from {url}") from exc


async def post_form_json(
    settings: Settings,
    url: str,
    *,
    data: dict[str, Any],
    headers: dict[str, str] | None = None,
    timeout_seconds: float | None = None,
) -> dict[str, Any]:
    try:
        request_headers = _merge_headers(settings, headers)
        request_headers["Content-Type"] = "application/x-www-form-urlencoded"

        async with httpx.AsyncClient(
            timeout=_build_timeout(timeout_seconds or settings.request_timeout_seconds),
            follow_redirects=True,
            headers=request_headers,
        ) as client:
            response = await client.post(url, data=data)
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict):
                raise ExternalServiceError(f"Unable to submit form data to {url}")
            return payload
    except (httpx.HTTPError, ValueError) as exc:
        raise ExternalServiceError(f"Unable to submit form data to {url}") from exc
