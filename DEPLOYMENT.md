# Production deployment guide

## Runtime requirements

This application is an Express + React Node.js application. It is not a static-only site or a Cloudflare Worker. The production container includes Chromium because server-side PDF export requires a Chromium executable.

The current database engine is atomic local JSON storage under `/app/data`. Production hosting MUST provide a persistent writable disk/volume mounted at `/app/data`. Do not deploy to an ephemeral filesystem or a serverless runtime that discards local files between restarts. The Docker Compose configuration creates a named persistent volume for this purpose.

## Prepare secrets

1. Copy `.env.example` to `.env`.
2. Set a unique random `SESSION_SECRET` with at least 32 characters.
3. Set `CORS_ALLOWED_ORIGINS` to the exact public website origin, without a trailing slash.
4. Set unique bootstrap passwords (at least 12 characters) if first-run account initialization requires them.
5. Add `GEMINI_API_KEY` only if AI features will be enabled.
6. Never commit `.env` or paste secrets into source files.

## Build and start

```sh
docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=100 abu-hussam-exam-builder
```

Health check: `GET /api/health`.

## Backups and recovery

- Back up the persistent `exam_builder_data` volume regularly.
- Keep an encrypted off-host copy of backups.
- Test restoration on a separate staging instance before relying on backups.
- Do not delete the data volume when replacing or upgrading the container.

## Reverse proxy

Terminate HTTPS at a trusted reverse proxy. Set `TRUST_PROXY_HOPS` only to the exact number of trusted proxy hops. Configure the proxy to forward HTTPS correctly. Keep the application port private to the proxy/firewall where possible.

## Release gate

Before public launch, complete staging tests for login, password changes, session invalidation, role changes, teacher academic-scope isolation, exam creation/editing, image upload, student-paper PDF export, teacher answer-key export, backup, and restore. Verify the real domain, CORS origin, TLS, persistent volume, and Gemini secret handling.

The repository validation workflow checks TypeScript and the production build. It does not replace these live staging acceptance tests.
