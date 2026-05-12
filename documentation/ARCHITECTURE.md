# Architecture

```mermaid
flowchart TD
    A["Public hiring sources: LinkedIn, Naukri, Indeed, exports"] --> B["Playwright / JSON collection layer"]
    B --> C["Django REST backend"]
    C --> D["SQLite local DB / relational production DB"]
    C --> E["AI extraction: OpenAI/Gemini/heuristic (backend-managed keys)"]
    C --> F["Trend and skill analytics"]
    C --> G["Company intelligence proxies: Apollo + CompanyEnrich"]
    C --> H["Celery + Redis background jobs"]
    C --> I["React dashboard"]
    I --> J["Charts, recruiter directory, reports, exports"]
```

## Backend Modules

- `authentication`: registration, JWT-compatible users, role profile.
- `tasks.models`: tasks, openings, scraped jobs, recruiters, company analytics, hiring trends.
- `tasks.views`: dashboard data, requirement extraction, Apollo/CompanyEnrich proxy, source refresh, dynamic search.
- `tasks.automation`: Playwright scraping scripts.

## Data Flow

1. Scrapers collect public listings.
2. Normalizers convert listings into a common dashboard shape.
3. Dynamic search stores listings in `ScrapedJob`.
4. Dashboard API combines stored data, platform exports, and analytics.
5. Frontend renders charts and exports reports.

## Security Layers

1. Authentication is MFA-based (OTP challenge + verify flow).
2. OTPs are single-use, expire automatically, and old active OTPs are invalidated when new ones are issued.
3. Auth endpoints are scope-throttled to reduce brute-force and abuse.
4. JWT refresh tokens are rotated and blacklisted after rotation.
5. Frontend does not include provider API keys in build config.

