# Cloudflare Worker staging entrypoint

This is an API-only staging foundation. It is deliberately not wired to the production hostname and does not replace the existing Express application.

## Current endpoints

- `GET /api/worker/health`: runtime health response; does not query D1.
- `GET /api/worker/auth/me`: verifies a signed Bearer token, checks the current D1 auth version and account state, and returns the redacted public user record.

Unknown paths return 404. The entrypoint does not accept identity headers and does not expose a wildcard CORS policy.

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
```

The repository currently does not pin Wrangler or include a Worker-runtime test pool. Before deploying this entrypoint, add a reviewed Wrangler toolchain and Workers runtime tests, verify binding type compatibility, and run a staging-only smoke test. Do not use `wrangler deploy` against production.

## Important limitations

This Worker is not yet the complete exam application. It does not implement login, registration, approval, question/exam CRUD, image routes, PDF generation, or serve the Vite frontend. The current Express server and its synchronous JSON-file database remain the active application. No data import or production cutover is performed by this foundation.
