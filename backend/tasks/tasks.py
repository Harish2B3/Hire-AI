"""Celery autodiscover imports `<app_label>.tasks` — re-export task modules here."""
from .celery_tasks import fetch_dynamic_jobs, refresh_platform_jobs  # noqa: F401
