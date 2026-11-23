# Coinexa

Coinexa.net — AI agentic automation platform. This branch runs Coinexa on an
independent stack: **Supabase** (database, sign-in, storage, server functions),
**Anthropic** (AI), **Resend** (email), **Stripe** (test mode) and **Hostinger** (website).

The original Base44 export is kept untouched in `base44/` and on `main`.

## Layout

| Path | What |
|---|---|
| `src/` | The website (React/Vite), unchanged pages and design |
| `src/api/base44Client.js` | Same `base44` API the pages use, implemented on Supabase |
| `supabase/migrations/` | Database tables and access rules |
| `supabase/functions/` | The 22 server functions (generated from `base44/` by `scripts/port-functions.mjs`) plus `_shared/` (Supabase stand-in for the Base44 SDK, AI adapter, email) |
| `supabase/owner-setup.sql` | One-time Platform Admin setup for the owner's new account |
| `supabase/tests/` | Database isolation tests (`run_local.sh`) |
| `.github/workflows/` | Staging deploy, owner setup, Stripe test setup, media copy |
| `docs/` | Stage plans and reports |

## Local development

```bash
cp .env.example .env.local   # fill in the staging Supabase URL and anon key
npm install
npm run dev
```

Tests: `node scripts/check-shared.mjs`, `cd supabase/functions && deno test --no-check -A _tests/`,
`sudo bash supabase/tests/run_local.sh` (needs a local PostgreSQL).

## Configuration

All keys live in GitHub → Settings → Secrets and variables → Actions (see the header of
`.github/workflows/staging-deploy.yml`). Nothing secret is stored in the repository.
