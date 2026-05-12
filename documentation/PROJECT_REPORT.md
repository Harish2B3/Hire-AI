# Project Report

## Objective

HireAI is a hiring intelligence dashboard that collects public hiring signals, stores normalized job/recruiter/company data, extracts job requirements with AI, and reports trends through charts and exports.

## Completed Modules

1. Authentication System
   - User registration and login with MFA OTP challenge flow.
   - JWT access/refresh tokens with rotation + blacklist support.
   - Role metadata through `UserProfile`.
   - Role-gated recruitment intelligence endpoints.
   - Auth throttling and OTP resend cooldown controls.

2. Dashboard Module
   - Hiring KPIs, active openings, hiring volume charts, source effectiveness, technology demand, recruiters, and company analytics.
   - Search/filter support for openings and skills.

3. Hiring Data Collection
   - Playwright automation hooks for LinkedIn, Naukri, and Indeed.
   - Cached JSON export fallback.
   - Dynamic search workflow backed by Celery and Redis.

4. AI Requirement Extraction
   - `/api/tasks/extract-requirements/`.
   - OpenAI and Gemini provider support.
   - Heuristic fallback for demos without keys.

5. Hiring Trend Analysis
   - Company trend signals with trend label and score.
   - Technology demand and source-effectiveness analytics.
   - Hiring volume history from database records.

6. Recruiter & HR Intelligence
   - Recruiter model stores company, designation, email, LinkedIn, phone, roles, hires, and performance.
   - Apollo and CompanyEnrich proxies keep API keys server-side.

7. Reporting & Analytics
   - Frontend report generator.
   - PDF, Excel, and CSV exports.

8. Optional Enhancements
   - AI chatbot assistant.
   - Resume matching prototype.
   - Settings area for user-provided client keys where backend proxy is not yet used.

## Known Operational Requirements

- Redis must be running for production Celery/cache behavior.
- External scraping depends on website availability and public access rules.
- Apollo/CompanyEnrich/OpenAI/Gemini features require valid backend API keys.
- Frontend should not store privileged integration keys in build-time config.

