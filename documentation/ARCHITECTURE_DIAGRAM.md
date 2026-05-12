# HireAI Architecture Diagram

This file contains the main architecture diagrams for the HireAI Hiring Intelligence Dashboard. The diagrams use Mermaid syntax, so they render directly in GitHub, many Markdown viewers, and documentation tools that support Mermaid.

## High-Level System Architecture

```mermaid
flowchart TD
    U["Recruiter / Admin / Analyst"] --> UI["React + TypeScript Dashboard"]
    UI --> API["Django REST API"]

    API --> AUTH["Authentication Module<br/>JWT + OTP MFA + Roles"]
    API --> DB["SQLite Database<br/>Django ORM Models"]
    API --> CACHE["Redis Cache / Broker"]
    API --> CELERY["Celery Workers"]

    CELERY --> SCRAPERS["Playwright Scraping Layer"]
    SCRAPERS --> SOURCES["Public Job Sources<br/>LinkedIn, Naukri, Indeed, exports"]
    SCRAPERS --> DB
    SCRAPERS --> CACHE

    API --> AI["AI Requirement Extraction<br/>OpenAI / Gemini / Heuristic fallback"]
    API --> ENRICH["Company + People Enrichment<br/>Apollo.io / CompanyEnrich"]
    API --> INDEED["Indeed Autocomplete Proxy"]

    DB --> API
    CACHE --> API
    API --> UI

    UI --> CHARTS["Charts and Analytics<br/>Recharts"]
    UI --> EXPORTS["Reports and Exports<br/>PDF, Excel, CSV"]
```

## Authentication and MFA Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend as React Frontend
    participant Backend as Django API
    participant Email as Email Service
    participant DB as SQLite DB

    User->>Frontend: Submit login/register form
    Frontend->>Backend: POST /api/token/ or /api/register/
    Backend->>DB: Create MFA challenge with hashed OTP
    Backend->>Email: Send OTP code
    Backend-->>Frontend: Return challenge_id
    User->>Frontend: Enter OTP
    Frontend->>Backend: POST /api/token/verify/ or /api/register/verify/
    Backend->>DB: Validate code, expiry, attempts, consumed state
    Backend-->>Frontend: Return JWT access and refresh tokens
    Frontend->>Backend: Call protected APIs with Bearer token
```

## Hiring Data Pipeline

```mermaid
flowchart LR
    A["Public Listings / Local JSON Exports"] --> B["Playwright Collection Scripts"]
    B --> C["Normalization Layer"]
    C --> D["ScrapedJob Records"]
    C --> E["Redis Dynamic Job Cache"]
    D --> F["Dashboard Aggregation API"]
    E --> F
    G["Internal JobOpening Records"] --> F
    H["HiringTrend / Recruiter / CompanyAnalytics"] --> F
    F --> I["React Dashboard"]
    I --> J["Search, Filters, KPIs, Charts, Reports"]
```

## Backend Module Map

```mermaid
flowchart TD
    CORE["backend/core<br/>settings, urls, celery, ASGI/WSGI"]
    AUTH["backend/authentication<br/>users, profiles, MFA, throttles, permissions"]
    TASKS["backend/tasks<br/>models, serializers, views, APIs"]
    AUTO["backend/tasks/automation<br/>source-specific scrapers"]
    AI["backend/tasks/ai_extractor.py<br/>OpenAI, Gemini, heuristic extraction"]
    PROVIDERS["backend/tasks/apollo.py + views<br/>Apollo and CompanyEnrich proxies"]

    CORE --> AUTH
    CORE --> TASKS
    TASKS --> AUTO
    TASKS --> AI
    TASKS --> PROVIDERS
```

## Frontend Module Map

```mermaid
flowchart TD
    MAIN["frontend/src/main.tsx<br/>React entry point"]
    APP["frontend/src/App.tsx<br/>screens, dashboard, auth, exports"]
    API["frontend/src/api.ts<br/>fetch helpers, token storage, typed responses"]
    CSS["frontend/src/index.css<br/>global styling"]

    MAIN --> APP
    APP --> API
    APP --> CSS
```
