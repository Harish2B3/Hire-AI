# HireAI API Documentation

Base URL for local development:

```text
http://127.0.0.1:8000
```

Most application endpoints require:

```http
Authorization: Bearer <access_token>
Content-Type: application/json
```

## Security Model

- Registration and login use OTP-based MFA before issuing tokens.
- OTP codes are stored as hashes, expire automatically, and are single-use.
- MFA resend has cooldown enforcement.
- Authentication endpoints use scoped throttling.
- JWT refresh tokens are rotated by Simple JWT behavior.
- Third-party keys for OpenAI, Gemini, Apollo.io, and CompanyEnrich are used only server-side.

## Authentication APIs

### Start Registration

```http
POST /api/register/
```

Request:

```json
{
  "username": "recruiter@example.com",
  "email": "recruiter@example.com",
  "password": "Password123!",
  "first_name": "Hiring",
  "last_name": "Manager",
  "role": "recruiter"
}
```

Response:

```json
{
  "mfa_required": true,
  "challenge_id": 123,
  "email": "recruiter@example.com",
  "detail": "Verification code sent to your email."
}
```

### Verify Registration

```http
POST /api/register/verify/
```

Request:

```json
{
  "challenge_id": 123,
  "code": "123456"
}
```

Response:

```json
{
  "detail": "Account verified.",
  "access": "<jwt_access_token>",
  "refresh": "<jwt_refresh_token>"
}
```

### Start Login

```http
POST /api/token/
```

Request:

```json
{
  "username": "recruiter@example.com",
  "password": "Password123!"
}
```

Response:

```json
{
  "mfa_required": true,
  "challenge_id": 456,
  "email": "recruiter@example.com",
  "detail": "Verification code sent to your email."
}
```

### Verify Login

```http
POST /api/token/verify/
```

Request:

```json
{
  "challenge_id": 456,
  "code": "654321"
}
```

Response:

```json
{
  "detail": "Login verified.",
  "access": "<jwt_access_token>",
  "refresh": "<jwt_refresh_token>"
}
```

### Resend MFA Code

```http
POST /api/mfa/resend/
```

Request:

```json
{
  "challenge_id": 456
}
```

Response:

```json
{
  "mfa_required": true,
  "challenge_id": 457,
  "email": "recruiter@example.com",
  "detail": "A new OTP code was sent to your email."
}
```

### Start Password Reset

```http
POST /api/password/forgot/
```

Request:

```json
{
  "email": "recruiter@example.com"
}
```

Response:

```json
{
  "mfa_required": true,
  "challenge_id": 789,
  "email": "recruiter@example.com",
  "detail": "If this account exists, a verification code has been sent."
}
```

### Verify Password Reset

```http
POST /api/password/reset/verify/
```

Request:

```json
{
  "challenge_id": 789,
  "code": "987654",
  "new_password": "NewPassword123!",
  "confirm_password": "NewPassword123!"
}
```

Response:

```json
{
  "detail": "Password reset successful. Please sign in with your new password."
}
```

### Refresh Access Token

```http
POST /api/token/refresh/
```

Request:

```json
{
  "refresh": "<jwt_refresh_token>"
}
```

Response:

```json
{
  "access": "<new_jwt_access_token>"
}
```

### Bootstrap Admin Setup

```http
POST /api/bootstrap-admin/setup/
```

Requires an authenticated temporary bootstrap admin token.

Request:

```json
{
  "email": "admin@example.com",
  "password": "StrongPassword123!",
  "first_name": "Admin",
  "last_name": "User"
}
```

Response:

```json
{
  "detail": "Admin account created. Bootstrap account deleted.",
  "access": "<jwt_access_token>",
  "refresh": "<jwt_refresh_token>",
  "user": {
    "username": "admin@example.com",
    "email": "admin@example.com",
    "role": "admin"
  }
}
```

## Dashboard APIs

### Dashboard Data

```http
GET /api/tasks/dashboard-data/?search=python&skills=django,react&dateRange=last-30-days
```

Query parameters:

| Parameter | Required | Description |
|---|---:|---|
| `search` | No | Keyword search across role/company/location/source/skills |
| `skills` | No | Comma-separated skill filter |
| `status` | No | Opening status filter, such as `active`, `draft`, or `closed` |
| `dateRange` | No | `last-30-days`, `last-90-days`, or `year-to-date` |

Response includes:

- Authenticated user role
- KPI cards
- Hiring volume trends
- Active openings
- Recruiters
- Company analytics
- Source effectiveness
- Technology demand
- Hiring signals
- Quality-of-hire percentage when available

Example response shape:

```json
{
  "user": {
    "username": "recruiter@example.com",
    "role": "recruiter"
  },
  "kpis": [],
  "trends": [],
  "hiring_volume_history": [],
  "company_trends": [],
  "openings": [],
  "recruiters": [],
  "analytics": [],
  "source_effectiveness": [],
  "tech_demand": [],
  "hiring_signals": [],
  "quality_of_hire_percent": null
}
```

### Admin Dashboard

```http
GET /api/tasks/admin-dashboard/
```

Requires admin role.

Response includes:

- User management summary
- Data monitoring counts
- Scraping status
- Analytics dashboard data
- Available report categories

## AI and Extraction APIs

### Requirement Extraction

```http
POST /api/tasks/extract-requirements/
```

Request:

```json
{
  "description": "Looking for Full Stack Python Developers with Django, React and AWS experience.",
  "provider": "heuristic"
}
```

Supported providers:

- `openai`
- `gemini`
- `heuristic`

Response:

```json
{
  "role": "Full Stack Python Developers",
  "skills": ["Python", "Django", "React", "AWS"],
  "experience": "Not specified",
  "provider_used": "heuristic"
}
```

### Gemini Generate Proxy

```http
POST /api/tasks/gemini/generate/
```

Purpose: Allows the frontend to use Gemini through a secure backend proxy. The browser never receives the Gemini API key.

Request:

```json
{
  "contents": "Summarize hiring demand for Python and React roles.",
  "config": {
    "temperature": 0.2
  }
}
```

Response:

```json
{
  "text": "Generated model response...",
  "model": "gemini-2.0-flash-lite"
}
```

## Job Source and Scraping APIs

### Refresh Sources

```http
POST /api/tasks/refresh-sources/
```

Requires admin or recruiter role.

Behavior:

1. Loads available platform jobs.
2. Stores them in Redis cache.
3. Queues `tasks.refresh_platform_jobs` as a Celery task.

Response:

```json
{
  "status": "ok",
  "count": 250
}
```

### Start Dynamic Search

```http
POST /api/tasks/dynamic-search/
```

Requires admin or recruiter role.

Request:

```json
{
  "query": "python django remote"
}
```

Response:

```json
{
  "task_id": "celery-task-id",
  "query": "python django remote"
}
```

### Dynamic Search Status

```http
GET /api/tasks/dynamic-search/status/?task_id=<celery-task-id>
```

Response:

```json
{
  "task_id": "celery-task-id",
  "status": "SUCCESS",
  "ready": true,
  "count": 42
}
```

### Indeed Autocomplete

```http
GET /api/tasks/indeed-autocomplete/?query=software&where=Hyderabad,%20Telangana
```

Purpose: Returns job-title suggestions from Indeed autocomplete through the backend.

Response:

```json
{
  "suggestions": ["software engineer", "software developer"]
}
```

## Company and Recruiter Intelligence APIs

### Apollo Organizations

```http
GET /api/tasks/apollo-organizations/?keyword=fintech&page=1&per_page=20
```

Requires admin or recruiter role.

Purpose: Server-side proxy to Apollo company search.

Response:

```json
{
  "organizations": [
    {
      "id": "apollo-company-id",
      "name": "Example Company",
      "website_url": "https://example.com",
      "primary_domain": "example.com",
      "linkedin_url": "https://linkedin.com/company/example",
      "phone": null,
      "founded_year": 2015,
      "logo_url": null
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total_entries": 100,
    "total_pages": 5
  }
}
```

### CompanyEnrich Companies

```http
GET /api/tasks/company-enrich/?query=google&page=1&pageSize=25
```

Purpose: Server-side CompanyEnrich company search.

Response:

```json
{
  "companies": [
    {
      "id": "company-id",
      "name": "Google",
      "domain": "google.com",
      "website": "https://google.com",
      "industry": "Internet",
      "employees": "10000+",
      "description": "Company description",
      "technologies": [],
      "linkedin_url": "https://linkedin.com/company/google",
      "logo_url": null
    }
  ],
  "page": 1,
  "totalPages": 10,
  "totalItems": 250
}
```

### People Search

```http
GET /api/tasks/people-search/?query=recruiter%20google&pageSize=25
```

Requires admin or recruiter role.

Behavior:

1. Checks `CachedPerson` for the normalized query.
2. If no cache is found, tries CompanyEnrich people search.
3. If CompanyEnrich returns no useful data or fails, tries Apollo people search.
4. Caches successful provider results.

Response:

```json
{
  "people": [
    {
      "id": "person-id",
      "name": "Jane Recruiter",
      "first_name": "Jane",
      "last_name": "Recruiter",
      "position": "Talent Acquisition Manager",
      "seniority": "manager",
      "department": "HR",
      "company": "Example Company",
      "company_domain": "example.com",
      "location": "Bengaluru, India",
      "linkedin_url": "https://linkedin.com/in/example",
      "image_url": "",
      "source": "companyenrich"
    }
  ],
  "source": "companyenrich",
  "from_cache": false,
  "totalItems": 1,
  "nextCursor": null
}
```

## Task CRUD API

The default DRF router is mounted at:

```http
/api/tasks/
```

It exposes standard task CRUD operations for authenticated users:

| Operation | Method | Path |
|---|---|---|
| List tasks | `GET` | `/api/tasks/` |
| Create task | `POST` | `/api/tasks/` |
| Retrieve task | `GET` | `/api/tasks/<id>/` |
| Update task | `PUT/PATCH` | `/api/tasks/<id>/` |
| Delete task | `DELETE` | `/api/tasks/<id>/` |

Create request:

```json
{
  "title": "Review Python hiring signals",
  "description": "Check active openings and recruiter list.",
  "status": "todo"
}
```

## Common Error Responses

### Validation Error

```json
{
  "field_name": ["This field is required."]
}
```

### Authentication Error

```json
{
  "detail": "Authentication credentials were not provided."
}
```

### Expired or Invalid Token

```json
{
  "detail": "Given token not valid for any token type",
  "code": "token_not_valid"
}
```

### Missing Provider Key

```json
{
  "detail": "GEMINI_API_KEY is not configured on the server."
}
```

## Frontend Usage Notes

The React frontend centralizes API calls in `frontend/src/api.ts`.

Important frontend behaviors:

- Access and refresh tokens are stored in session storage by default.
- If "remember me" is selected, tokens are stored in local storage with a 30-day remember-until timestamp.
- The frontend clears stored tokens and emits an auth-expired event when the API reports token expiration.
- All privileged provider workflows go through Django endpoints rather than direct browser calls.
