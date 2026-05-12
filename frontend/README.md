<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Frontend App

This contains everything you need to run your app locally.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Ensure backend is running at `http://127.0.0.1:8000` (or set `VITE_API_URL` in `.env`)
3. Run the app:
   `npm run dev`

## Security Rules

- Do not put provider secrets in frontend env files.
- Frontend should call backend endpoints only (`/api/...`).
- Third-party keys must be configured in backend `.env`.
- Any in-browser AI key usage should be user-provided at runtime and not committed.
