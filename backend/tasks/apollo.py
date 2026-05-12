"""Apollo.io mixed companies search — API key stays on the server."""

from __future__ import annotations

import logging
from typing import Any

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

APOLLO_MIXED_COMPANIES_URL = "https://api.apollo.io/api/v1/mixed_companies/search"
APOLLO_MIXED_PEOPLE_URL = "https://api.apollo.io/api/v1/mixed_people/search"


def slim_organization(raw: dict[str, Any]) -> dict[str, Any]:
    """Keep fields useful for recruiting / org research UI."""
    primary_phone = raw.get("primary_phone")
    phone: str | None = None
    if isinstance(primary_phone, dict):
        phone = primary_phone.get("sanitized_number") or primary_phone.get("number")
    if not phone:
        phone = raw.get("sanitized_phone") or raw.get("phone")

    listed = None
    sym = raw.get("publicly_traded_symbol")
    ex = raw.get("publicly_traded_exchange")
    if sym and ex:
        listed = f"{sym}.{ex}"
    elif sym:
        listed = str(sym)

    return {
        "id": raw.get("id"),
        "name": raw.get("name"),
        "website_url": raw.get("website_url"),
        "primary_domain": raw.get("primary_domain"),
        "linkedin_url": raw.get("linkedin_url"),
        "twitter_url": raw.get("twitter_url"),
        "phone": phone,
        "founded_year": raw.get("founded_year"),
        "logo_url": raw.get("logo_url"),
        "listed": listed,
        "languages": raw.get("languages") or [],
    }


def search_mixed_companies(api_key: str, body: dict[str, Any]) -> tuple[dict[str, Any] | list, int]:
    headers = {
        "Cache-Control": "no-cache",
        "Content-Type": "application/json",
        "accept": "application/json",
        "X-Api-Key": api_key,
    }
    try:
        r = requests.post(
            APOLLO_MIXED_COMPANIES_URL,
            headers=headers,
            json=body,
            timeout=30,
        )
    except requests.RequestException as e:
        logger.exception("Apollo request failed: %s", e)
        return {"detail": str(e)}, 502

    try:
        data = r.json()
    except ValueError:
        return {"detail": r.text[:500] if r.text else "Invalid JSON from Apollo"}, r.status_code

    return data, r.status_code


def slim_person(raw: dict[str, Any]) -> dict[str, Any]:
    organization = raw.get("organization")
    if not isinstance(organization, dict):
        organization = {}
    return {
        "id": raw.get("id"),
        "name": raw.get("name"),
        "first_name": raw.get("first_name"),
        "last_name": raw.get("last_name"),
        "position": raw.get("title") or raw.get("headline"),
        "seniority": raw.get("seniority"),
        "department": raw.get("department"),
        "company": organization.get("name") or raw.get("organization_name"),
        "company_domain": organization.get("primary_domain") or raw.get("organization_domain"),
        "location": raw.get("city") or raw.get("state") or raw.get("country"),
        "linkedin_url": raw.get("linkedin_url"),
        "image_url": raw.get("photo_url"),
        "source": "apollo",
        "raw": raw,
    }


def search_mixed_people(api_key: str, body: dict[str, Any]) -> tuple[dict[str, Any] | list, int]:
    headers = {
        "Cache-Control": "no-cache",
        "Content-Type": "application/json",
        "accept": "application/json",
        "X-Api-Key": api_key,
    }
    try:
        r = requests.post(
            APOLLO_MIXED_PEOPLE_URL,
            headers=headers,
            json=body,
            timeout=30,
        )
    except requests.RequestException as e:
        logger.exception("Apollo people request failed: %s", e)
        return {"detail": str(e)}, 502

    try:
        data = r.json()
    except ValueError:
        return {"detail": r.text[:500] if r.text else "Invalid JSON from Apollo"}, r.status_code

    return data, r.status_code
