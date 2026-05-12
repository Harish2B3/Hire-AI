# API Documentation

Base URL: `http://127.0.0.1:8000`

Most endpoints require `Authorization: Bearer <access_token>`.

Security behavior:

- Auth routes are rate-limited.
- OTP verification is one-time use and expires.
- OTP resend has cooldown enforcement.
- Refresh tokens are rotated and blacklisted.

## Auth

`POST /api/register/`

```json
{
  "username": "recruiter@example.com",
  "email": "recruiter@example.com",
  "password": "Password123!",
  "role": "recruiter"
}
```

Returns `202 Accepted` with MFA challenge payload.

`POST /api/token/` (login start)

```json
{
  "username": "recruiter@example.com",
  "password": "Password123!"
}
```

Returns `202 Accepted` with MFA challenge payload.

`POST /api/register/verify/`

```json
{
  "challenge_id": 123,
  "code": "123456"
}
```

`POST /api/token/verify/`

```json
{
  "challenge_id": 456,
  "code": "654321"
}
```

Returns JWT `access` and `refresh` after successful OTP verification.

`POST /api/mfa/resend/`

```json
{
  "challenge_id": 456
}
```

Returns new challenge details. Subject to throttle and resend cooldown.

`POST /api/token/refresh/`

## Dashboard

`GET /api/tasks/dashboard-data/?search=python&skills=django,react&dateRange=last-30-days`

Returns:

- authenticated user role
- KPIs
- hiring trends
- active openings
- recruiters
- company analytics
- technology demand
- source effectiveness
- hiring signals with trend and score

## Requirement Extraction

`POST /api/tasks/extract-requirements/`

```json
{
  "description": "Looking for Full Stack Python Developers with Django, React and AWS experience.",
  "provider": "heuristic"
}
```

Returns:

```json
{
  "role": "Full Stack Python Developers",
  "skills": ["Python", "Django", "React", "AWS"],
  "experience": "Not specified",
  "provider_used": "heuristic"
}
```

## Source Refresh

`POST /api/tasks/refresh-sources/`

Role-gated to admin/recruiter. Refreshes cached platform jobs and queues a Celery refresh.

## Dynamic Search

`POST /api/tasks/dynamic-search/`

```json
{ "query": "python django remote" }
```

`GET /api/tasks/dynamic-search/status/?task_id=<id>`

## Company Intelligence

`GET /api/tasks/apollo-organizations/?keyword=fintech&page=1&per_page=20`

Role-gated to admin/recruiter. Uses server-side Apollo API key.

`GET /api/tasks/company-enrich/?query=google&page=1&pageSize=25`

Role-gated and uses server-side CompanyEnrich key.

## Secret Handling

- Frontend must never call third-party providers directly with privileged keys.
- Sensitive provider credentials are loaded from backend environment variables only.

