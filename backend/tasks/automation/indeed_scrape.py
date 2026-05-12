import asyncio
import json
from pathlib import Path
from typing import Awaitable, Callable, Any

from playwright.async_api import BrowserContext, async_playwright

AUTOMATION_DIR = Path(__file__).resolve().parent
DEFAULT_CDP = "http://127.0.0.1:9222"


async def scrape_indeed_jobs(
    search_query: str,
    location: str = "Remote",
    *,
    cdp_url: str = DEFAULT_CDP,
    context: BrowserContext | None = None,
    max_pages: int = 2,
    max_jobs: int = 25,
    on_job: Callable[[dict[str, Any]], Awaitable[None] | None] | None = None,
) -> list[dict]:
    """
    Scrape Indeed job cards via Playwright.

    Pass `context` (a BrowserContext) to reuse an already-open browser session.
    If `context` is None and `cdp_url` is reachable, connects over CDP.
    """
    q = (search_query or "").strip()
        while current_page <= max_pages and len(captured_jobs) < max_jobs:
            print(f"--- Indeed page {current_page} ---")
            job_cards_selector = ".job_seen_beacon"
            try:
                await page.wait_for_selector(job_cards_selector, timeout=10000)
            except Exception:
                print("Could not find job cards on this page. Stopping.")
                break

            job_cards = await page.query_selector_all(job_cards_selector)
            for card in job_cards:
                if len(captured_jobs) >= max_jobs:
                    break
                try:
                    link_el = await card.query_selector("a.jcs-JobTitle")
                    if not link_el:
                        continue

                    job_id = await link_el.get_attribute("data-jk")
                    if not job_id or job_id in seen_job_ids:
                        continue
                    seen_job_ids.add(job_id)

                    title_el = await card.query_selector("h2.jobTitle span[id^='jobTitle-']")
                    company_el = await card.query_selector("[data-testid='company-name']")
                    location_el = await card.query_selector("[data-testid='text-location']")

                    await link_el.click()

                    detail_pane_selector = ".jobsearch-JobComponent"
                    description_text = "N/A"
                    salary_text = "N/A"
                    job_type_text = "N/A"

                    try:
                        await page.wait_for_selector(detail_pane_selector, timeout=4000)

                        salary_el = await page.query_selector(
                            '[aria-label="Pay"] .js-match-insights-provider-18uwqyc'
                        )
                        if salary_el:
                            salary_text = (await salary_el.inner_text()).strip()

                        type_el = await page.query_selector(
                            '[aria-label="Job type"] .js-match-insights-provider-18uwqyc'
                        )
                        if type_el:
                            job_type_text = (await type_el.inner_text()).strip()

                        desc_el = await page.query_selector("#jobDescriptionText")
                        if desc_el:
                            description_text = (await desc_el.inner_text()).strip()
                    except Exception as e:
                        print(f"Detail pane extraction issue: {e}")

                    job_data = {
                        "job_id": job_id,
                        "title": (await title_el.inner_text()).strip() if title_el else "N/A",
                        "company": (await company_el.inner_text()).strip() if company_el else "N/A",
                        "location": (await location_el.inner_text()).strip() if location_el else "N/A",
                        "salary": salary_text,
                        "job_type": job_type_text,
                        "description": description_text,
                        "url": f"https://www.indeed.com/viewjob?jk={job_id}",
                    }
                    captured_jobs.append(job_data)
                    if on_job:
                        maybe_awaitable = on_job(job_data)
                        if maybe_awaitable:
                            await maybe_awaitable
                    print(f"[{len(captured_jobs)}] {job_data['title']} @ {job_data['company']}")
                    await asyncio.sleep(1.2)

                except Exception as e:
                    print(f"Error processing card: {e}")
                    continue

            if current_page < max_pages and len(captured_jobs) < max_jobs:
                next_button = await page.query_selector("a[data-testid='pagination-page-next']")
                if next_button:
                    print("Moving to next Indeed page...")
                    await next_button.click()
                    current_page += 1
                    await asyncio.sleep(4)
                else:
                    break
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
    jobs = await scrape_indeed_jobs("Python Engineer", "Remote", max_pages=5, max_jobs=80)
    if jobs:
        out = AUTOMATION_DIR / "indeed_jobs.json"
        out.write_text(json.dumps(jobs, indent=4), encoding="utf-8")
        print(f"\nSUCCESS: {len(jobs)} jobs -> {out}")
    else:
        print("\nFAILED: No data captured.")


if __name__ == "__main__":
    asyncio.run(run())
