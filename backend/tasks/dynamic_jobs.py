"""
Fetch job listings for searches that miss our cached platform exports.

1) Run Playwright automation (tasks/automation/*):
   - If Chrome CDP is reachable (PLAYWRIGHT_CDP_URL) connect to it.
   - Otherwise launch Playwright's own bundled Chromium using the persistent
     user-data dir at <project-root>/browser-userdata/ — no manual Chrome
     startup required.
2) Fill any gaps from JSON exports under tasks/automation/ (previously scraped data).
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
from typing import Any

from django.db import transaction
from django.db.models import Q

from .models import ScrapedJob
from .platform_jobs import (
    AUTOMATION_DIR,
    SOURCE_FILES,
    _normalize_record,
    _skills_from_text,
)

logger = logging.getLogger(__name__)

DYNAMIC_CACHE_PREFIX = "dynamic_jobs:v1:"
DYNAMIC_CACHE_TTL = 60 * 60


def dynamic_jobs_cache_key(query: str) -> str:
    q = query.strip().lower()[:200]
    h = hashlib.sha256(q.encode("utf-8")).hexdigest()[:24]
    return f"{DYNAMIC_CACHE_PREFIX}{h}"


def _search_tokens(query: str) -> list[str]:
    q = (query or "").strip().lower()
    toks = [t for t in re.findall(r"[a-z0-9]+", q) if len(t) >= 2]
    return toks[:12] if toks else ([q] if len(q) >= 2 else [])


def _raw_export_haystack(raw: dict[str, Any]) -> str:
    parts: list[str] = []
    for k in (
        "title",
        "jobTitle",
        "company",
        "companyName",
        "location",
        "description",
        "abstract",
        "salary",
        "experience",
        "job_type",
        "jobType",
    ):
        v = raw.get(k)
        if isinstance(v, str):
            parts.append(v)
    skills = raw.get("skills") or raw.get("tags")
    if isinstance(skills, list):
        parts.extend(str(s) for s in skills)
    elif isinstance(skills, str):
        parts.append(skills)
    return " ".join(parts).lower()


def _raw_matches_search(raw: dict[str, Any], tokens: list[str]) -> bool:
    if not tokens:
        return False
    h = _raw_export_haystack(raw)
    return all(t in h for t in tokens)


def _load_automation_export_jobs(query: str, limit: int) -> list[dict[str, Any]]:
    """Jobs from JSON files under tasks/automation/ (see platform_jobs.SOURCE_FILES)."""
    tokens = _search_tokens(query)
    if not tokens:
        return []

    collected: list[dict[str, Any]] = []
    for source, filename in SOURCE_FILES:
        path = AUTOMATION_DIR / filename
        if not path.is_file():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Could not read automation export %s: %s", path, exc)
            continue
        if not isinstance(data, list):
            continue
        for raw in data:
            if len(collected) >= limit:
                return collected
            if not isinstance(raw, dict):
                continue
            if not _raw_matches_search(raw, tokens):
                continue
            row = _normalize_record(raw, f"{source} (export)")
            if row:
                collected.append(row)
    return collected


def _job_dedupe_key(job: dict[str, Any]) -> str:
    jid = str(job.get("job_id") or "").strip()
    if jid:
        return f"id:{jid}"
    u = str(job.get("url") or "").strip()
    if u and u != "#":
        return f"url:{u}"
    return f"tc:{job.get('title', '')!s}|{job.get('company', '')!s}"


def _external_id_for_job(job: dict[str, Any]) -> str:
    explicit_id = str(job.get("job_id") or job.get("id") or "").strip()
    if explicit_id:
        return explicit_id[:255]
    stable_blob = "|".join(
        str(job.get(k) or "").strip()
        for k in ("source", "url", "title", "company", "location")
    )
    return hashlib.sha256(stable_blob.encode("utf-8")).hexdigest()


def _clean_url(value: Any) -> str:
    url = str(value or "").strip()
    if url.startswith(("http://", "https://")):
        return url[:1000]
    return ""


def persist_scraped_jobs(query: str, jobs: list[dict[str, Any]]) -> int:
    q = (query or "").strip()[:255]
    if not q or not jobs:
        return 0

    saved = 0
    with transaction.atomic():
        for job in jobs:
            if not isinstance(job, dict):
                continue
            source = str(job.get("source") or "Unknown").strip()[:40] or "Unknown"
            external_id = _external_id_for_job(job)
            title = str(job.get("title") or "Untitled role").strip()[:255]
            defaults = {
                "search_query": q,
                "title": title,
                "company": str(job.get("company") or "").strip()[:255],
                "location": str(job.get("location") or "").strip()[:255],
                "salary": str(job.get("salary") or "").strip()[:255],
                "experience": str(job.get("experience") or "").strip()[:255],
                "url": _clean_url(job.get("url")),
                "description": str(job.get("description") or "").strip(),
                "skills": job.get("skills") if isinstance(job.get("skills"), list) else [],
                "raw": job,
            }
            ScrapedJob.objects.update_or_create(
                source=source,
                external_id=external_id,
                defaults=defaults,
            )
            saved += 1
    return saved


def scraped_job_to_dict(job: ScrapedJob) -> dict[str, Any]:
    return {
        "job_id": job.external_id,
        "company": job.company or "N/A",
        "title": job.title,
        "salary": job.salary or "N/A",
        "location": job.location or "N/A",
        "experience": job.experience or "N/A",
        "url": job.url or "#",
        "source": job.source,
        "skills": job.skills or [],
        "description": job.description,
        "scraped_at": job.scraped_at.isoformat() if job.scraped_at else None,
    }


def get_stored_dynamic_jobs(query: str, limit: int = 100) -> list[dict[str, Any]]:
    tokens = _search_tokens(query)
    if not tokens:
        return []

    qs = ScrapedJob.objects.all()
    for token in tokens:
        qs = qs.filter(
            Q(title__icontains=token)
            | Q(company__icontains=token)
            | Q(location__icontains=token)
            | Q(search_query__icontains=token)
        )
    return [scraped_job_to_dict(job) for job in qs.distinct().order_by("-scraped_at")[:limit]]


def fetch_external_jobs_raw(
    query: str,
    limit: int = 25,
    on_job: Any | None = None,
) -> list[dict[str, Any]]:
    q = (query or "").strip()
    if len(q) < 2:
        return []

    by_key: dict[str, dict[str, Any]] = {}

    def add(job: dict[str, Any]) -> None:
        k = _job_dedupe_key(job)
        if k and k not in by_key:
            by_key[k] = job
            if on_job:
                on_job(job)

    disable_pw = os.environ.get("DISABLE_PLAYWRIGHT_AUTOMATION", "").lower() in (
        "1",
        "true",
        "yes",
    )
    if not disable_pw:
        try:
            from django.conf import settings

            cdp = getattr(settings, "PLAYWRIGHT_CDP_URL", None) or os.environ.get(
                "PLAYWRIGHT_CDP_URL", "http://127.0.0.1:9222"
            )
            from .automation.runner import run_all_scrapers_sync

            print(f"[*] DynamicSearch: Triggering Playwright automation for query: '{q}'")
            # runner.py now handles CDP-connect vs. self-launched Chromium automatically
            results = run_all_scrapers_sync(q, cdp_url=cdp, on_job=add)
            for job in results:
                add(job)
            print(f"[*] DynamicSearch: Playwright automation produced {len(results)} jobs for query '{q}'")
        except Exception as exc:
            print(f"[!] DynamicSearch: Playwright automation failed: {exc}")
            logger.warning("Playwright automation skipped: %s", exc)

    # Fill gaps from previously scraped JSON exports
    print(f"[*] DynamicSearch: Loading fallback jobs from automation exports for query: '{q}'")
    export_jobs = _load_automation_export_jobs(q, limit)
    for job in export_jobs:
        add(job)
    print(f"[*] DynamicSearch: Loaded {len(export_jobs)} jobs from exports.")

    return list(by_key.values())[:limit]


def get_cached_dynamic_jobs(query: str) -> list[dict[str, Any]] | None:
    from django.core.cache import cache

    data = cache.get(dynamic_jobs_cache_key(query))
    if data is None:
        return None
    if isinstance(data, list):
        return data
    return None
