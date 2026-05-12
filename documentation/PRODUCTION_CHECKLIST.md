# Production Checklist

Use this checklist before go-live.

## 1) Secrets and Environment

- [ ] `DEBUG=False`
- [ ] `DJANGO_SECRET_KEY` is long, random, and not default.
- [ ] No secrets are present in frontend files or build config.
- [ ] Backend `.env` contains only server-side keys:
  - [ ] `APOLLO_API_KEY`
  - [ ] `COMPANY_ENRICH_API_KEY`
  - [ ] `OPENAI_API_KEY` / `GEMINI_API_KEY` (if used)
  - [ ] `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`
  - [ ] `BOOTSTRAP_ADMIN_PASSWORD` (temporary; rotate/remove after setup)
- [ ] `.env` files are ignored by git and never committed.

## 2) Host and Origin Restrictions

- [ ] `ALLOWED_HOSTS` is set to real domains/IPs only (no wildcards for public deploy).
- [ ] CORS is restricted to trusted frontend origins only.
- [ ] API is not exposed to untrusted origins by default.

## 3) HTTPS and Cookies

- [ ] App is served over HTTPS.
- [ ] `SESSION_COOKIE_SECURE=1`
- [ ] `CSRF_COOKIE_SECURE=1`
- [ ] `SESSION_COOKIE_HTTPONLY=True`
- [ ] `CSRF_COOKIE_HTTPONLY=True`
- [ ] `SESSION_COOKIE_SAMESITE=Lax` (or `Strict` if your flow allows).

## 4) Authentication and MFA

- [ ] MFA OTP enabled and email delivery verified.
- [ ] `MFA_CODE_TTL_MINUTES` set to short expiry (recommended 5-10).
- [ ] `MFA_MAX_ATTEMPTS` configured (recommended <= 5).
- [ ] `MFA_RESEND_COOLDOWN_SECONDS` configured (recommended >= 30).
- [ ] OTP reuse blocked (single-use verification).

## 5) Throttling and Abuse Protection

- [ ] Auth throttle rates are configured:
  - [ ] `THROTTLE_AUTH_REGISTER_RATE`
  - [ ] `THROTTLE_AUTH_LOGIN_START_RATE`
  - [ ] `THROTTLE_AUTH_VERIFY_RATE`
  - [ ] `THROTTLE_AUTH_RESEND_RATE`
  - [ ] `THROTTLE_AUTH_BOOTSTRAP_RATE`
- [ ] Global throttle rates configured:
  - [ ] `THROTTLE_ANON_RATE`
  - [ ] `THROTTLE_USER_RATE`

## 6) JWT and Session Lifecycle

- [ ] Access token lifetime is short (`JWT_ACCESS_MINUTES`).
- [ ] Refresh token lifetime is bounded (`JWT_REFRESH_HOURS`).
- [ ] Refresh rotation enabled.
- [ ] Refresh blacklist after rotation enabled.
- [ ] Frontend session behavior tested (no unintended persistent login).

## 7) Database and Migrations

- [ ] Production DB configured (PostgreSQL/MySQL preferred over SQLite).
- [ ] `python manage.py migrate` executed in production environment.
- [ ] Backup schedule enabled and tested.
- [ ] Restore drill performed at least once.

## 8) Workers and Caching

- [ ] Redis is reachable and secured.
- [ ] Celery worker is running and monitored.
- [ ] Queue failures are alerted.

## 9) Logging, Monitoring, and Alerts

- [ ] Auth failures and OTP abuse attempts are logged.
- [ ] API error rates are monitored.
- [ ] Alerting configured for repeated 401/403/429/5xx spikes.
- [ ] Sensitive data is excluded from logs.

## 10) Key Rotation and Incident Readiness

- [ ] Documented key rotation process exists.
- [ ] Emergency revoke/rotate steps are tested.
- [ ] Contact owner list for incidents is up to date.

## Quick Validation Commands

```bash
python manage.py check
python manage.py migrate --plan
```

```bash
npm run build
```

## Final Sign-Off

- [ ] Security review completed
- [ ] Functional smoke test completed
- [ ] Rollback plan documented
