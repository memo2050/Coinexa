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

## Cyber Security Scan Agent (25 Nov)

Phase 1 done on staging (linked PCs, signed uploads, server-only encrypted storage, pages) — see
`docs/stage-2/SECURITY-SCAN-AGENT.md`. E2E 93/0, browser 74/0.
Phase 2 done: Windows scanner tested on a real Windows machine (15/15) and published to staging `/downloads`.

## Hired status (25 Nov)

Every agent in a workspace with a webhook-confirmed, active paid subscription shows a subtle red glow around its
card/icon and a green "Hired" label (agent cards, board, agent page, featured agents; Platform Admin untouched).
Derived from `organizations.hired` (generated, read-only; migration 010), so existing and future agents need nothing
stored. Tests: RLS 48/48, E2E 88/0 (5 hired checks), browser 74/0 with a paid test workspace. A real Stripe test
payment needs the Stripe test key (owner step 3 below).

## Launch preparation (25 Nov)

| Step | Result on staging |
|---|---|
| 1. Stripe test payments per agent | 15 test prices; hire, add-a-second-agent with confirmation, cancel to period end, failed payment grace, once-only webhooks. All pass in real Stripe test mode |
| 2. Production plan, owner account | `PRODUCTION-PLAN.md`; owner is Platform Admin with an internal workspace |
| 3. Email domain | Waiting on the owner: add coinexa.net in Resend and the DNS records (DNS needs approval). Emails stay redirected to the owner until then |
| 4. Usage limits, AI cost protection | Per-agent monthly allowances, free trials, per-agent AI cost cap (1.5× expected), platform AI stop at $18 of the $20 limit |
| 5. Tools | Agents not connected to outside systems are labelled "Drafting assistant" |
| 6. Security | Two-step sign-in (TOTP) for everyone, required for admins; Cloudflare Turnstile CAPTCHA on sign-up, sign-in, reset, resend and job applications |
| 7. Legal, backups, tests | Privacy and Terms updated (lawyer review items marked); backup and restore test passes (28/28 tables); E2E 113/0, browser 76 views/0 problems, Windows scanner pass |

## Launch preparation, round 2 (25 Nov)

- Menu follows sign-in state: Sign In / Sign Up when signed out; Security and Sign Out
  when signed in; Admin Console only for platform admins (server still enforces role +
  two-step on every admin page and function). Fits from 1024 px up; mobile menu below.
- Stripe: refunds and disputes recorded in the audit log; customer billing portal (test);
  live setup prepared and gated (`stripe-live-setup.yml`, main branch, approval phrase).
- Email: `email-domain.yml` registers coinexa.net in Resend and adds DNS at Hostinger
  append-only after approval, then verifies and sends a test email. Needs two secrets
  from the owner: RESEND_ADMIN_API_KEY, HOSTINGER_API_TOKEN.
- Scanner: Azure Artifact Signing step ready; turns on when its secrets exist.
- Read-only `launch-audit.yml`: DNS, Supabase usage/backups/owner two-step, Stripe readiness.
- Legal readiness review for the attorney: https://claude.ai/artifact/PekqbtSJPFeeAx5SJNt6iW
- Tests: E2E 116/0, browser 79 views/0 problems, Windows scanner 16/0, backup 28/28
  tables (run the backup test on its own: concurrent test writes change row counts).

## Remaining owner steps (need your accounts)

1. ~~Hostinger FTP~~ done 24 Nov (host and user in `deploy/staging.env`, password as a GitHub secret).
2. ~~Resend~~ done 24 Nov.
3. Stripe test secret key (`sk_test_…`) → `STRIPE_SECRET_KEY`. Then the Stripe test setup creates the test prices and webhook.
4. Optional: Google OAuth → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
5. Sign up on staging with `ramyusa2030@gmail.com`, then approve the owner setup (Platform Admin).

## Not done on purpose

Production deployment, DNS, live Stripe, Base44 shutdown, paid plans: all wait for your explicit approval.
