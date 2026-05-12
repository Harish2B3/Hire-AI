import asyncio
import json
from pathlib import Path
from typing import Awaitable, Callable, Any

from playwright.async_api import BrowserContext, async_playwright

AUTOMATION_DIR = Path(__file__).resolve().parent
DEFAULT_CDP = "http://127.0.0.1:9222"


async def scrape_linkedin_jobs(
    search_query: str,
    location: str = "Remote",
    *,
    cdp_url: str = DEFAULT_CDP,
    context: BrowserContext | None = None,
    max_jobs: int = 35,
    on_job: Callable[[dict[str, Any]], Awaitable[None] | None] | None = None,
) -> list[dict]:
    """
    Scrape LinkedIn public job listings via Playwright.

    Pass `context` (a BrowserContext) to reuse an already-open browser session.
    If `context` is None and `cdp_url` is reachable, connects over CDP.
    """
    q = (search_query or "").strip()
    if not q:
        return []

    captured_jobs: list[dict] = []
    seen_job_ids: set[str] = set()

    async def _scrape(ctx: BrowserContext) -> None:
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()

        card_selector = ".base-card, .job-search-card"
        title_selector = ".base-search-card__title"
        company_selector = ".base-search-card__subtitle a, .base-search-card__subtitle"
        location_selector = ".job-search-card__location"
        link_selector = ".base-card__full-link"

        start_offset = 0
        while len(captured_jobs) < max_jobs:
            url = (
                "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords="
                + q.replace(" ", "%20")
                + "&location="
                + location.replace(" ", "%20")
                + f"&start={start_offset}"
            )
            print(f"[*] LinkedIn: Navigating to {url}")
            await page.goto(url, wait_until="domcontentloaded")
            await asyncio.sleep(1)

            cards = await page.query_selector_all(card_selector)
            if not cards:
                break

            for card in cards:
                if len(captured_jobs) >= max_jobs:
                    break
                try:
                    job_id = await card.get_attribute("data-entity-urn")
                    if not job_id or job_id in seen_job_ids:
                        continue
                    seen_job_ids.add(job_id)

                    title_el = await card.query_selector(title_selector)
                    company_el = await card.query_selector(company_selector)
                    loc_el = await card.query_selector(location_selector)
                    link_el = await card.query_selector(link_selector)

                    title = (await title_el.inner_text()).strip() if title_el else "N/A"
                    company = (await company_el.inner_text()).strip() if company_el else "N/A"
                    location_text = (await loc_el.inner_text()).strip() if loc_el else "N/A"
                    job_url = await link_el.get_attribute("href") if link_el else "N/A"

                    job_data = {
                        "job_id": job_id,
                        "title": title,
                        "company": company,
                        "location": location_text,
                        "url": job_url,
                        "description": "Click to view full text",
                    }
                    captured_jobs.append(job_data)
                    if on_job:
                        maybe_awaitable = on_job(job_data)
                        if maybe_awaitable:
                            await maybe_awaitable
                    print(f"[{len(captured_jobs)}] {title} at {company}")
                except Exception:
                    continue

            if len(cards) < 10:
                break
            start_offset += 10
            
        await page.close()

    if context is not None:
        await _scrape(context)
    else:
        async with async_playwright() as p:
            try:
                browser = await p.chromium.connect_over_cdp(cdp_url)
            except Exception as e:
                print(f"Error: Could not connect to Chrome CDP at {cdp_url}. {e}")
                return []
            await _scrape(browser.contexts[0])

    return captured_jobs


async def run():
    jobs = await scrape_linkedin_jobs("Python Engineer", "Remote", max_jobs=50)
    if jobs:
        out = AUTOMATION_DIR / "linkedin_public_results.json"
        out.write_text(json.dumps(jobs, indent=4), encoding="utf-8")
        print(f"\nSaved {len(jobs)} jobs to {out}")
    else:
        print("No jobs were captured.")


if __name__ == "__main__":
    asyncio.run(run())
