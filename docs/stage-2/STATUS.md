# Coinexa Stage 2 — status and test report

Branch `stage-2/build`. Staging backend: Supabase project `coinexa-staging` (`ycvhmzunagrpihtgisiu`, free plan).
Base44, `main`, coinexa.net DNS and live payments are untouched.

Last updated: 24 Nov 2026.

## What runs on staging now

| Part | State |
|---|---|
| Database (11 tables, row-level security, 6 migrations) | Deployed, automatic on every push |
| 23 server functions (22 ported + `adminAiSpend`) | Deployed, automatic on every push |
| AI (Anthropic `claude-sonnet-5-5`, $18/month hard stop in code, $20 cap at Anthropic) | Working |
| Website | Live at https://forward-darkblue-rook-76.hostingersite.com, published automatically on every push |
| Email (Resend) | Waiting for `RESEND_API_KEY`; sign-up codes and password reset need it |
| Payments (Stripe test mode) | Waiting for `STRIPE_SECRET_KEY` (test key) |
| Google sign-in | Optional; the button stays hidden until Google is configured |

## Automated tests

| Suite | How to run | Result |
|---|---|---|
| Unit tests (entity layer, AI adapter) | every push (CI) | 19/19 pass |
| Database policy tests (local Postgres) | every push (CI) | 32/32 pass |
| Backend end-to-end against staging | change `ops/e2e.request` (`ai` = include AI, `research` = include web search) | 34 pass, 0 fail (no-AI run); AI run: generate agent, chat, run task, approve, research, Excel export all pass |
| Browser check, every page, visitor/user/admin, desktop/mobile | change `ops/ui.request` | 60 page views, 0 problems; screenshots on branch `ci/ui-shots` |

The end-to-end and browser suites create throwaway accounts and delete everything they created.
Typical AI test cost: about $0.05 per run, about $0.25 with web-search research.

## Bugs found and fixed during testing (24 Nov)

1. Agent Creator could not save agents: it sends form fields that are not columns (Base44 ignored them, Postgres rejected the insert). The entity layer now drops unknown fields, using a column map generated from the migrations.
2. `bulkUpdate` and `aggregate({ avg })` were missing from the entity layer (owner workspace preparation, admin average run time).
3. All AI features failed: `claude-sonnet-5-5` rejects a forced `tool_choice`. Structured answers are now requested in the prompt, with a JSON-text fallback.
4. Product research could not save its report (personal records were readable but not writable). Users can now create, edit and delete their own records that belong to no workspace; workspace records stay members-only.
5. Signed-in users could backdate `created_date` (used by monthly quotas). The database now stamps it.
6. "Continue with Google" showed although Google is not configured; it now appears only when enabled.
7. Email templates loaded the logo from Base44's media host; it now comes from the site itself.
8. Admin "Estimated AI cost: No Rate Configured" replaced by real spend against the monthly cap (new `adminAiSpend`; failed AI calls keep their error message for diagnosis).

## Agent catalogue (24 Nov)

The 17 agents shown on coinexa.net/agents were copied (definitions only: role, goals, workflow, knowledge, tools,
permissions, safety rules, instructions, status) into the owner's staging workspace by `seed-agents.yml`.
No runs, history or users were copied. The QA probe agent was left out. A graph-builder bug from the original
app (5 agents showed "The workflow could not be prepared") is fixed, with a regression test.

## Recruitment agent (25 Nov)

New AI Recruitment & Talent Sourcing Agent — see `docs/stage-2/RECRUITMENT-AGENT.md`.
Phase 1 (25 Nov): text-only written AI interviews in the candidate portal, PDF CV import read by the AI,
per-candidate reports emailed to the hiring manager; LinkedIn removed. E2E 77/0, browser 70/0.

## Remaining owner steps (need your accounts)

1. ~~Hostinger FTP~~ done 24 Nov (host and user in `deploy/staging.env`, password as a GitHub secret).
2. ~~Resend~~ done 24 Nov.
3. Stripe test secret key (`sk_test_…`) → `STRIPE_SECRET_KEY`. Then the Stripe test setup creates the test prices and webhook.
4. Optional: Google OAuth → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
5. Sign up on staging with `ramyusa2030@gmail.com`, then approve the owner setup (Platform Admin).

## Not done on purpose

Production deployment, DNS, live Stripe, Base44 shutdown, paid plans: all wait for your explicit approval.
