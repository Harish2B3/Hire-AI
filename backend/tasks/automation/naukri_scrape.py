import asyncio
import json
import re
from pathlib import Path
from typing import Awaitable, Callable, Any

from playwright.async_api import BrowserContext, async_playwright

AUTOMATION_DIR = Path(__file__).resolve().parent
DEFAULT_CDP = "http://127.0.0.1:9222"


def _naukri_slug(keywords: str) -> str:
    s = (keywords or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return (s or "jobs")[:80]


async def scrape_naukri_jobs(
    search_query: str,
    *,
    cdp_url: str = DEFAULT_CDP,
    context: BrowserContext | None = None,
    pages_to_scrape: int = 2,
    max_jobs: int = 40,
    on_job: Callable[[dict[str, Any]], Awaitable[None] | None] | None = None,
) -> list[dict]:
    """
    Scrape Naukri job listings via Playwright.

    Pass `context` (a BrowserContext) to reuse an already-open browser session.
    If `context` is None and `cdp_url` is reachable, connects over CDP.
    """
    q = (search_query or "").strip()
    if not q:
        return []

    slug = _naukri_slug(q)
    start_url = f"https://www.naukri.com/{slug}-jobs"

    captured_jobs: list[dict] = []
    seen_job_ids: set[str] = set()

    async def _scrape(ctx: BrowserContext) -> None:
        page = await ctx.new_page()

        async def handle_response(response):
            url = response.url.lower()
            api_markers = ["search-api", "job-search", "job-tuple", "w3api", "search6"]
            if any(marker in url for marker in api_markers) and response.status == 200:
                try:
                    data = await response.json()
                    job_list = (
                        data.get("jobDetails")
                        or data.get("jobs")
                        or data.get("jobTuples")
                        or []
                    )
                    if not job_list:
                        return
                    for item in job_list:
                        if len(captured_jobs) >= max_jobs:
                            return
                        job = item.get("job") if "job" in item else item
                        job_id = str(job.get("jobId") or job.get("job_id", ""))
                        if job_id and job_id not in seen_job_ids:
                            seen_job_ids.add(job_id)
                            placeholders = job.get("placeholders", [])
                            exp = next(
                                (p["label"] for p in placeholders if p.get("type") == "experience"),
                                "N/A",
                            )
                            sal = next(
                                (p["label"] for p in placeholders if p.get("type") == "salary"),
                                "Not Disclosed",
                            )
                            loc = next(
                                (p["label"] for p in placeholders if p.get("type") == "location"),
                                "N/A",
                            )
                            jd = job.get("jdURL") or ""
                            url_full = (
                                f"https://www.naukri.com{jd}"
                                if jd and not str(jd).startswith("http")
                                else jd
                            )
                            job_data = {
                                "job_id": job_id,
                                "company": job.get("companyName") or job.get("company_name"),
                                "title": job.get("title") or job.get("jobTitle"),
                                "salary": sal,
                                "location": loc,
                                "experience": exp,
                                "tags": job.get("tagsAndSkills") or job.get("skills", ""),
                                "description": job.get("jobDescription")
                                or job.get("abstract", "N/A"),
                                "url": url_full,
                            }
                            captured_jobs.append(job_data)
                            if on_job:
                                maybe_awaitable = on_job(job_data)
                                if maybe_awaitable:
                                    await maybe_awaitable
                except Exception:
                    pass

        page.on("response", handle_response)

        print(f"[*] Naukri: Navigating to {start_url}")
        await page.goto(start_url, wait_until="domcontentloaded")
        await asyncio.sleep(2)

        for current_page in range(1, pages_to_scrape + 1):
            if len(captured_jobs) >= max_jobs:
                break
            print(f"--- Naukri page {current_page} ---")
            try:
                await page.wait_for_selector(".srp-jobtuple-wrapper", timeout=10000)
            except Exception:
                print("Notice: Job cards not immediately visible. Scrolling...")

            for _ in range(10):
                await page.evaluate("window.scrollBy(0, 800)")
                await asyncio.sleep(0.5)
            await asyncio.sleep(2)

            job_cards = await page.query_selector_all(
                ".srp-jobtuple-wrapper, .styles_job-header-container___0wLZ"
            )
            for card in job_cards:
                if len(captured_jobs) >= max_jobs:
                    break
                try:
                    title_el = await card.query_selector("a.title, .styles_jd-header-title__rZwM1")
                    href = await title_el.get_attribute("href") if title_el else ""
                    job_id = await card.get_attribute("data-jobid") or str(hash(href or ""))

                    if job_id and job_id not in seen_job_ids:
                        seen_job_ids.add(job_id)
                        company_el = await card.query_selector(
                            ".comp-name, .styles_jd-header-comp-name__MvqAI"
                        )
                        exp_el = await card.query_selector(
                            ".exp-wrap, .styles_jhc__exp__k_giM span"
                        )
                        sal_el = await card.query_selector(
                            ".sal-wrap, .styles_jhc__salary__jdfEC span"
                        )
                        loc_el = await card.query_selector(
                            ".loc-wrap, .styles_jhc__location__W_pVs"
                        )
                        job_data = {
                            "job_id": job_id,
                            "company": (await company_el.inner_text()).strip()
                            if company_el
                            else "N/A",
                            "title": (await title_el.inner_text()).strip()
                            if title_el
                            else "N/A",
                            "salary": (await sal_el.inner_text()).strip()
                            if sal_el
                            else "Not Disclosed",
                            "location": (await loc_el.inner_text()).strip()
                            if loc_el
                            else "N/A",
                            "experience": (await exp_el.inner_text()).strip()
                            if exp_el
                            else "N/A",
                            "url": href or None,
                        }
                        captured_jobs.append(job_data)
                        if on_job:
                            maybe_awaitable = on_job(job_data)
                            if maybe_awaitable:
                                await maybe_awaitable
                except Exception:
                    continue

            if current_page < pages_to_scrape and len(captured_jobs) < max_jobs:
                next_btn = page.locator("a.styles_btn-secondary__2YSTC, a:has-text('Next')").first
                if await next_btn.is_visible():
                    await next_btn.click()
                    await page.wait_for_load_state("networkidle")
                    await asyncio.sleep(3)
                else:
                    break

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
    jobs = await scrape_naukri_jobs("python developer", pages_to_scrape=3, max_jobs=120)
    if jobs:
        out = AUTOMATION_DIR / "structured_jobs_final.json"
        out.write_text(json.dumps(jobs, indent=4), encoding="utf-8")
        print(f"\nSUCCESS: {len(jobs)} jobs -> {out}")
    else:
        print("\nFAILED: No data captured.")


if __name__ == "__main__":
    asyncio.run(run())
