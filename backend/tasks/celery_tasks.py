from celery import shared_task
from django.core.cache import cache

from .dynamic_jobs import (
    DYNAMIC_CACHE_TTL,
    dynamic_jobs_cache_key,
    fetch_external_jobs_raw,
    persist_scraped_jobs,
)
from .platform_jobs import CACHE_KEY, CACHE_TTL, load_all_platform_jobs


@shared_task(name="tasks.refresh_platform_jobs")
def refresh_platform_jobs() -> int:
    jobs = load_all_platform_jobs()
    cache.set(CACHE_KEY, jobs, CACHE_TTL)
    return len(jobs)


@shared_task(name="tasks.fetch_dynamic_jobs")
def fetch_dynamic_jobs(query: str) -> int:
    """
    Populate the scraped job table and Redis cache with external listings for
    `query` using Playwright automation + local JSON exports.
    Returns number of jobs stored.
    """
    q = (query or "").strip()
    if not q:
        return 0
    collected: list[dict] = []

    def save_partial(job: dict) -> None:
        collected.append(job)
        persist_scraped_jobs(q, [job])
        cache.set(dynamic_jobs_cache_key(q), collected, DYNAMIC_CACHE_TTL)

    jobs = fetch_external_jobs_raw(q, on_job=save_partial)
    persist_scraped_jobs(q, jobs)
    cache.set(dynamic_jobs_cache_key(q), jobs, DYNAMIC_CACHE_TTL)
    return len(jobs)
