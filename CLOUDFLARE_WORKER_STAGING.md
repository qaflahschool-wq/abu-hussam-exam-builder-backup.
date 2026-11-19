# Cloudflare Worker staging entrypoint

This is an API-only staging foundation. It is deliberately not wired to the production hostname and does not replace the existing Express application.

## Current endpoints

- `GET /api/worker/health`: runtime health response; does not query D1.
- `POST /api/worker/auth/register`: validates a new teacher/school-admin request, verifies assigned subjects and grades, hashes the password with the existing bcryptjs format, and stores a `PENDING_APPROVAL` request in D1. It never creates an active account or returns the password hash.
- `POST /api/worker/auth/login`: verifies existing bcryptjs password hashes, checks account status and persisted lockout state, resets counters on success, and issues a Worker-compatible HMAC session token.
- `GET /api/worker/auth/me`: verifies a signed Bearer token, checks the current D1 auth version and account state, and returns the redacted public user record.
- `GET /api/worker/owner/registration-requests`: owner-only registration request listing, with password hashes removed.
- `POST /api/worker/owner/registration-requests/:id/approve`: owner-only approval; updates the request and creates its active user in one transactional D1 batch, reusing the bcrypt hash created at signup.
- `POST /api/worker/owner/registration-requests/:id/reject` and `/needs-edit`: owner-only review actions.

Unknown paths return 404. The entrypoint does not accept identity headers and does not expose a wildcard CORS policy. The intended deployment is same-origin; cross-origin browser calls remain unavailable until an explicit origin allowlist is implemented.

## Authentication behavior and limits

- Session signatures use Web Crypto HMAC-SHA256 and the `SESSION_SECRET` Worker secret (minimum 32 characters).
- Login checks the existing bcryptjs hash format; it does not migrate or reset passwords.
- Login attempts are throttled through the durable `auth_rate_limits` D1 table by source IP. Per-user failure counts and the temporary account lock are stored on the D1 user record.
- Registration requests are pending by default. Self-registration cannot create `PlatformOwner` or `Administrator` accounts.
- Migration 0003 adds a partial unique index for active pending registration names and seeds the canonical subject list used to validate teacher assignments.

**Not yet implemented:** full security/audit/notification side-effect parity, password reset/change routes, and all remaining Express application routes. Approval is required before a registration request becomes an active user.

## Staging bindings

`wrangler.jsonc` points only to the isolated D1 database `abu-hussam-exam-builder-staging`. It has `workers_dev: false`, no production route, no R2 binding, and no production resource identifiers.

Configure the session signing secret as a Cloudflare Worker secret in the staging environment before using authenticated routes. Never commit the value to Git.

## Local validation

Run the repository checks first:

```sh
npm ci
npm run lint
npm test
npm run build
npm run worker:dry-run
```

These checks have not yet been confirmed for the latest auth implementation. Do not claim the Worker is deployed or that these tests passed until CI reports success and a staging-only smoke test completes.

## Important limitations

This Worker is not yet the complete exam application. It does not implement owner approval, question/exam CRUD, image routes, PDF generation, or serve the Vite frontend. The current Express server and its synchronous JSON-file database remain the active application. No data import or production cutover is performed by this foundation.
