"""
Legacy helpers kept for imports. Live listings come from automation JSON via platform_jobs.
"""
from __future__ import annotations

from typing import Any

from .platform_jobs import filter_jobs, get_cached_platform_jobs


class JobScraper:
    """Backward-compatible facade around cached automation exports."""

    @classmethod
    def fetch_real_time_jobs(cls, query: str = "full stack developer") -> list[dict[str, Any]]:
        jobs = get_cached_platform_jobs()
        skills: list[str] = []
        return filter_jobs(jobs, query, skills)
