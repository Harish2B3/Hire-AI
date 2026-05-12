"""
Run Playwright-based scrapers from the Celery worker.

By default each platform gets its own persistent browser profile under
backend/browser-userdata/<platform> so LinkedIn, Naukri, and Indeed can run
concurrently without sharing a locked user-data directory.

Set PLAYWRIGHT_USE_CDP=1 to connect to PLAYWRIGHT_CDP_URL instead. CDP mode is
mainly useful for manual debugging or an already logged-in headed session.

Set DISABLE_PLAYWRIGHT_AUTOMATION=1 to skip entirely.
"""
from __future__ import annotations

import asyncio
import logging
import os
import socket
from pathlib import Path
from typing import Any, Awaitable, Callable
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# Persistent user-data dirs live inside backend/ so they are owned by the
# backend service and keep cookies/login state across scrape runs.
_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
BROWSER_USERDATA_DIR = _BACKEND_DIR / "browser-userdata"
PLATFORM_PROFILES = {
    "Indeed": "indeed",
    "LinkedIn": "linkedin",
    "Naukri": "naukri",
}

ScraperFn = Callable[..., Awaitable[list[dict[str, Any]]]]
JobCallback = Callable[[dict[str, Any]], None]


def cdp_tcp_reachable(cdp_url: str, timeout: float = 1.5) -> bool:
    try:
        parsed = urlparse(cdp_url)
        host = parsed.hostname or "127.0.0.1"
        port = parsed.port or 9222
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


async def _safe(name: str, coro):
    try:
        result = await coro
        return result if isinstance(result, list) else []
    except Exception:
        logger.exception("%s automation failed", name)
        return []


def _platform_profile_dir(label: str) -> Path:
    return BROWSER_USERDATA_DIR / PLATFORM_PROFILES.get(label, label.lower())


def run_all_scrapers_sync(
    query: str,
    cdp_url: str,
    on_job: JobCallback | None = None,
) -> list[dict[str, Any]]:
    """Blocking entry for Celery; returns platform-shaped normalized job dicts."""
    from ..platform_jobs import _normalize_record

    from .indeed_scrape import scrape_indeed_jobs
    from .linkedin_scrape import scrape_linkedin_jobs
    from .naukri_scrape import scrape_naukri_jobs

    use_cdp = os.environ.get("PLAYWRIGHT_USE_CDP", "").lower() in ("1", "true", "yes")
    use_cdp = use_cdp and cdp_tcp_reachable(cdp_url)

    if use_cdp:
        print(f"[*] Automation: Connecting to running Chrome at {cdp_url}")
    else:
        print(f"[*] Automation: Launching platform browser profiles from {BROWSER_USERDATA_DIR}")

    async def _run() -> list[dict[str, Any]]:
        from playwright.async_api import async_playwright

        normalized: list[dict[str, Any]] = []
        scraper_specs: list[tuple[str, ScraperFn]] = [
            ("Indeed", scrape_indeed_jobs),
            ("LinkedIn", scrape_linkedin_jobs),
            ("Naukri", scrape_naukri_jobs),
        ]
        scraper_by_label = dict(scraper_specs)

        async with async_playwright() as p:
            browser = None
            contexts = []
            close_browser = False

            if use_cdp:
                try:
                    browser = await p.chromium.connect_over_cdp(cdp_url)
                except Exception as e:
                    print(f"[!] Automation: Failed to connect to CDP: {e}")
                    return []
                contexts = [(label, await browser.new_context()) for label, _ in scraper_specs]
                close_browser = True
            else:
                BROWSER_USERDATA_DIR.mkdir(parents=True, exist_ok=True)
                for label, _scraper in scraper_specs:
                    profile_dir = _platform_profile_dir(label)
                    profile_dir.mkdir(parents=True, exist_ok=True)
                    print(f"[*] Automation: {label} profile: {profile_dir}")
                    context = await p.chromium.launch_persistent_context(
                        str(profile_dir),
                        headless=False,
                        args=[
                            "--disable-blink-features=AutomationControlled",
                            "--no-sandbox",
                        ],
                    )
                    contexts.append((label, context))

            async def run_one(label: str, context) -> tuple[str, list[dict[str, Any]]]:
                print(f"[*] Automation: Starting {label} scraper for query: '{query}'")
                async def emit_job(raw_job: dict[str, Any]) -> None:
                    row = _normalize_record(raw_job, label)
                    if row and on_job:
                        on_job(row)

                raw_list = await _safe(
                    label,
                    scraper_by_label[label](
                        query,
                        context=context,
                        on_job=emit_job,
                    ),
                )
                return label, raw_list

            try:
                scrape_results = await asyncio.gather(
                    *(run_one(label, context) for label, context in contexts)
                )
            finally:
                await asyncio.gather(
                    *(context.close() for _, context in contexts),
                    return_exceptions=True,
                )
                if close_browser and browser:
                    await browser.close()

            for label, raw_list in scrape_results:
                print(f"[*] Automation: {label} scraper returned {len(raw_list)} raw jobs")
                for raw in raw_list:
                    if not isinstance(raw, dict):
                        continue
                    row = _normalize_record(raw, label)
                    if row:
                        normalized.append(row)

        print(f"[*] Automation: Finished all scrapers. Total normalized jobs: {len(normalized)}")
        return normalized

    return asyncio.run(_run())
