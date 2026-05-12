# Security Guide

## Security Principles

- Keep all privileged API credentials on the backend.
- Expose only backend endpoints to the frontend.
- Treat OTP and session flows as short-lived and abuse-resistant.
- Use rate limiting and token lifecycle controls by default.

## Backend-Only Secrets

Store sensitive values in `backend/.env`:

- `DJANGO_SECRET_KEY`
- `APOLLO_API_KEY`
- `COMPANY_ENRICH_API_KEY`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_ADMIN_PASSWORD`
- SMTP credentials (`EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`)

Do not hardcode these values in code, docs, or frontend files.

## Frontend Secret Policy

- `frontend/.env` must not contain privileged provider keys.
- Frontend build config must not inject secrets into the bundle.
- Client code should call backend APIs only, for example `/api/tasks/company-enrich/`.

## Authentication Controls

- MFA OTP challenge + verify flow.
- OTP codes are:
  - single-use
  - TTL-bound (`MFA_CODE_TTL_MINUTES`)
  - attempt-limited (`MFA_MAX_ATTEMPTS`)
  - resend-cooldown protected (`MFA_RESEND_COOLDOWN_SECONDS`)
- New OTP generation invalidates older active OTP challenges for same email and purpose.

## Rate Limiting

Auth endpoint throttles are configurable:

- `THROTTLE_AUTH_REGISTER_RATE`
- `THROTTLE_AUTH_LOGIN_START_RATE`
- `THROTTLE_AUTH_VERIFY_RATE`
- `THROTTLE_AUTH_RESEND_RATE`
- `THROTTLE_AUTH_BOOTSTRAP_RATE`

Global defaults:

- `THROTTLE_ANON_RATE`
- `THROTTLE_USER_RATE`

## JWT and Session Hardening

- Refresh token rotation enabled.
- Blacklist after rotation enabled.
- Configurable token lifetimes:
  - `JWT_ACCESS_MINUTES`
  - `JWT_REFRESH_HOURS`
- Session and CSRF cookie controls are configurable with secure flags.

## Recommended Operational Practices

- Rotate all API keys on any suspected leak.
- Keep `.env` files out of version control.
- Use HTTPS in non-local environments.
- Disable debug mode in production (`DEBUG=False`).
- Restrict allowed hosts and CORS origins for deployed environments.
