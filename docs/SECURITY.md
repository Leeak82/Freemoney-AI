# FreeMoney-AI Security & Privacy Policy

## 1. Zero Secrets in Source Control
- All secrets, API keys, database connection strings, and administrative tokens must reside strictly in `.env`.
- `.env` is ignored in `.gitignore`. A comprehensive `.env.example` is maintained with documentation.
- At runtime, configuration is parsed and validated using Zod.

## 2. No Unauthorized Automatic Submissions
- Automatic submission of grant applications without human intervention is strictly prohibited in Phase 1.
- Applications transition to `READY_FOR_REVIEW` and require explicit user action (`userApproved = true`) before external portal redirection.
- FreeMoney-AI never impersonates government officials or uses unauthorized automated browser scripts against government portals.

## 3. Data Integrity & Provenance Retention
- Every record is tagged with `source_id`, `source_url`, `raw_source_identifier`, `last_verified_at`, and `retrieved_at`.
- If an upstream API returns malformed or expired data, it is logged to `sync_errors` and excluded from user-facing search results.

## 4. Input Sanitization & SQL Parameterization
- All database queries use parameterized placeholders (`$1`, `$2`, ...) preventing SQL injection attacks.
- Search keyword inputs are sanitized.
