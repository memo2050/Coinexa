# Coinexa — Stage 1: Migration Plan (plan only, nothing implemented)

| | |
|---|---|
| Status | **Draft for owner review.** No implementation starts until the owner approves this plan in writing. |
| Prepared | 2026-11-23 |
| Revision 2 | 2026-11-23 — owner decision: **no legacy user import**; everyone signs up new with email or Google (§3.3 rewritten, §3.1/3.2, phases 2/3/11, R2, R14, Q2, Q10 updated) |
| Revision 3 | 2026-11-23 — owner decision: **no legacy data import at all, fresh start.** The new system starts empty; nothing is copied from Base44 (§0.2, §3, §4.2 #9, §4.4, §4.5, phases 2/3/11, risks R1–R3, questions updated) |
| Branch | `stage-1/migration-plan` (branched from `main` @ `9162c32`, tag `base44-original`). Not merged into `main`. |
| Inputs inspected | `main` (Base44 export), `stage-0/baseline-screenshots` (`docs/stage-0/README.md`), `stage0-reference` (another session's reference screenshots + capture tools) |
| Not needed | The 9 CSV exports — no data is imported (§0.2). |

Every statement below is either verified in the repository (file paths given) or marked
**UNVERIFIED** / **QUESTION**. Open questions are collected in §8.

---

## 0. What was inspected

### 0.1 Verified inventory

| Item | Expected | Found | Where |
|---|---|---|---|
| User page components | 17 | **17** — 15 routed, 2 present but **not routed** (`Mfa.jsx`, `OAuthConsent.jsx`) | `src/pages/*.jsx`, `src/App.jsx` |
| Admin pages | 8 | **8**, all routed under `AdminShell` | `src/pages/admin/*.jsx` |
| Server functions | 22 | **22** (Deno/TypeScript) | `base44/functions/*/entry.ts` |
| Table (entity) definitions | 10 | **10** — 9 data entities + the built-in `User` | `base44/entities/*.jsonc` |
| Shared server modules | — | 10 `.ts` + 2 runbooks (`rls-rollback.md`, `tenant-isolation-testing.md`) | `base44/shared/` |
| Email templates | — | 2 (`NewInquiry.html`, `InquiryReceived.html`) | `base44/emails/` |
| Connectors | — | 1 (`gmail`, scope `email`) — defined, **never called by any function** | `base44/connectors/gmail.jsonc`, `shared/emailPolicy.ts` |
| Backend code size | — | ~5,800 lines in functions + shared | `wc -l` |

### 0.2 Existing data — not migrated (fresh start)

Owner decision (Revision 3): **no data is imported from Base44.** The new system starts with
empty tables and new accounts. The 9 CSV exports are therefore not needed for the migration.

For the record, what exists in Base44 today and will **not** be carried over (Stage 0, admin
console, 2026-11-23): 18 agents (3 active, 2 paused, 13 draft), 14 executions, 9 metered events,
≥12 audit entries, 4 accounts, 2 workspaces, at least 3 (demo) inquiries, and any privately stored
task attachments / Excel exports. It all stays in Base44, untouched (see R1).

### 0.3 Stage 0 documents reviewed

`docs/stage-0/README.md` on `stage-0/baseline-screenshots` (public + signed-in screenshots,
observations 1–14). Carried into this plan in §4.5 — **not fixed**.

---

## 1. Proposed architecture

```
 Browser (unchanged React/Vite UI, built to static files)
   │  supabase-js  (auth session, direct table reads under RLS, storage uploads)
   │  fetch → /functions/v1/<name>  (same 22 function names)
   ▼
 Supabase project ── Postgres (10 tables + RLS) ── Auth (email/password, OTP, Google)
                 ── Storage (private bucket for uploads + research exports)
                 ── Edge Functions (Deno — the existing function code, ported)
                        │            │             │
                        ▼            ▼             ▼
                  AI provider    Email (SMTP    Stripe (test mode first;
                  (Anthropic or  or email API)  checkout + webhook +
                   OpenAI)                      read-only admin billing)
 Hostinger ── serves the static build (dist/) for coinexa.net; DNS stays where it is until Phase 11
```

### 1.1 Role of each service

| Service | Replaces in Base44 | Role | Alternatives |
|---|---|---|---|
| **Supabase Postgres** | Base44 entities (`base44.entities.*`) | The 10 tables, constraints, indexes | Neon + separate auth; self-hosted Postgres |
| **Supabase Auth** | `base44.auth.*` (register, OTP verify, password login, Google, reset, logout) | Accounts, sessions, email OTP, Google OAuth, password reset | Clerk, Auth0 (extra cost, extra integration) |
| **Postgres RLS** | The `rls` blocks in each `entities/*.jsonc` | Tenant isolation for tables the browser reads directly | — (must exist; see §3.4) |
| **Supabase Storage** | `Core.UploadPrivateFile`, `Core.CreateFileSignedUrl` | Private task attachments + generated Excel files, short-lived signed URLs | Cloudflare R2, S3 |
| **Supabase Edge Functions** | Base44 functions runtime (Deno) | Run the 22 functions. Same runtime language (Deno/TS), so code ports with the least change | Node server on Hostinger (Node app hosting), Cloudflare Workers |
| **Anthropic or OpenAI API** | `Core.InvokeLLM` (incl. `add_context_from_internet`, `response_json_schema`, `file_urls`) | Agent generation, chat, workflow steps, product research with web search | Either provider works; see §1.2 |
| **Email (SMTP or API)** | `Core.SendEmail` with templates `NewInquiry` / `InquiryReceived` | The two inquiry emails; also Supabase Auth emails (OTP, reset) need SMTP | Hostinger mailbox SMTP; Resend; Postmark |
| **Stripe** | Already Stripe (called directly via `fetch`) | Checkout, webhook, admin billing read | — (keep) |
| **Hostinger** | Base44 hosting (`autoadjust-net.base44.app`, mapped to coinexa.net) | Serve the static SPA with an SPA fallback to `index.html` | Cloudflare Pages, Netlify, Vercel |

Note: the app's frontend builds to static files (`vite build` → `dist/`, see `base44/config.jsonc`),
so Hostinger only needs ordinary web hosting with HTTPS and a rewrite rule; Node hosting is only
needed if a function is moved off Supabase (see risk R7).

### 1.2 AI provider — what the existing code needs

Verified calls to `Core.InvokeLLM`:

| Caller | Needs |
|---|---|
| `shared/workflowRunner.ts` (used by `runAgentTask`, `resumeAgentTask`) | prompt, optional JSON schema, optional file URLs (attachments), 60 s per call, 150 s run budget |
| `functions/generateAgent` | prompt + JSON schema (structured output) |
| `functions/chatWithAgent` | plain prompt |
| `functions/productResearch` | **live web search** (`add_context_from_internet: true`), JSON schema, model `gemini_3_8_flash` |

Both Anthropic and OpenAI support structured JSON output, file/image inputs and a web-search
tool, so either can replace all four. Recommendation: **one provider behind a single
`invokeLLM()` adapter** in `shared/` that keeps the current call signature, so the provider can
be swapped later without touching the functions. The adapter must also return token counts so
`UsageRecord.input_tokens/output_tokens` finally get filled (today they are "Not captured").
Owner decision needed: Q5.

### 1.3 Email

Two different email needs:

1. **App emails** — the two inquiry templates (`submitInquiry`). Note: `shared/emailPolicy.ts`
   documents a policy where only admins may send email and agents never send mail. Keep this policy.
2. **Auth emails** — sign-up OTP codes and password resets. Supabase's built-in mailer is for
   testing only; production needs custom SMTP.

Hostinger mailbox SMTP (`smtp.hostinger.com`) is adequate at today's volume, but it has daily
per-mailbox limits (100/day on the free/trial mailbox, 1,000/day on Business Starter). An email API
such as Resend (free 3,000/month, max 100/day) is the alternative if volume grows or deliverability
needs tracking. Either needs SPF/DKIM records on coinexa.net — **a DNS change, so only at the
approved phase** (Phase 7). Where coinexa.net mail is hosted today is unknown — Q6.

---

## 2. Base44 dependencies that must be replaced

### 2.1 Frontend

| Dependency | Where | Replacement |
|---|---|---|
| `@base44/sdk` client | `src/api/base44Client.js`, `src/lib/app-params.js` | **Compatibility client** with the same shape (`entities.X.list/filter/get/create/update/delete`, `functions.invoke`, `auth.*`, `integrations.Core.UploadPrivateFile`) implemented on supabase-js. Keeps all ~75 existing SDK call sites unchanged. |
| `@base44/vite-plugin` (HMR notifier, navigation notifier, analytics tracker, visual-edit agent) | `vite.config.js` | Remove the plugin; keep `@vitejs/plugin-react`. The `@/` import alias is declared in `jsconfig.json` but `vite.config.js` has no alias of its own, so the Base44 plugin probably supplies it — add an explicit Vite alias when the plugin is removed (confirm in Phase 5) |
| `base44.app.getPublicSettings()` + `auth_required` / `user_not_registered` handling | `src/lib/AuthContext.jsx` | Session check via Supabase; "not registered" maps to "signed in but no profile row" |
| `auth.register / verifyOtp / resendOtp / loginViaEmailPassword / loginWithProvider('google') / resetPasswordRequest / resetPassword / logout / me / setToken / redirectToLogin / isAuthenticated` | `Login.jsx`, `Register.jsx`, `ForgotPassword.jsx`, `ResetPassword.jsx`, `AuthContext.jsx`, `Pricing.jsx`, `PageNotFound.jsx`, `authMfa*.js`, `OAuthConsent.jsx` | Supabase Auth equivalents (email+password, email OTP, Google OAuth, reset) — wrapped in the compatibility client |
| MFA flow calling Base44 endpoints (`/api/apps/public/login-info/...`, `mfa/handoff`) | `src/lib/authMfa.js`, `authMfaFlow.js`, `src/pages/Mfa.jsx` (not routed) | Supabase MFA (TOTP) if wanted — Q9. Page is unrouted today, so no live behaviour depends on it. |
| Direct entity access from the browser | `Agents.jsx`, `AgentCreator.jsx`, `AgentDetail.jsx`, `TaskBoard.jsx`, `AgentHistory.jsx`, `WorkflowPanel.jsx`, `AgentTaskRunner.jsx` (AgentUpload), `AdminInbox.jsx` (Inquiry) | Same calls through the compatibility client → protected by RLS (§3.4) |
| `functions.invoke(<name>)` (14 direct names + 7 via `useAdminEndpoint`) | many | Compatibility `invoke` → `POST /functions/v1/<name>` with the user's JWT |
| Browser upload `integrations.Core.UploadPrivateFile` | `AgentTaskRunner.jsx` | Upload to a private Storage bucket under `<organization_id>/…` |
| Hosted media on `media.base44.com` (11 references to 4 distinct files in `src/` + `index.html`, incl. logo/favicon/OG image and videos; plus any URLs built at runtime in `ui/image*.js`) and `static.wixstatic.com` (1) | `index.html`, `Hero.jsx`, `HeroVideo`/`ShowcaseVideo.jsx`, `AgentDemoVideo.jsx`, `Nav.jsx`, `Footer.jsx`, `Home.jsx`, `ui/image*.js` | **Download and self-host before Base44 is ever switched off** (Q4). Until then URLs keep working. |
| Env vars `VITE_BASE44_APP_ID`, `VITE_BASE44_FUNCTIONS_VERSION`, `VITE_BASE44_APP_BASE_URL` | `app-params.js` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (public by design) |

### 2.2 Backend

| Dependency | Where | Replacement |
|---|---|---|
| `createClientFromRequest` / `base44.auth.me()` / `asServiceRole` | all 22 functions (`npm:@base44/sdk@0.8.54`) | A small server shim with the same interface over supabase-js: caller resolved from the `Authorization` JWT; `asServiceRole` = service-role client. (The `stage0-reference` branch already proved this pattern for 9 functions with a read-only stand-in.) |
| Entity query operators (`$in`, `$nin`, `$or`, `$and`, `$gte/$lt`, `$exists`, sort strings like `-created_date`, `count`, `aggregate`) | functions + shared | Translated in the shim to PostgREST filters; `aggregate`/counts used by admin endpoints may be better as SQL views/RPCs |
| `Core.InvokeLLM` | 4 call sites (§1.2) | `invokeLLM()` adapter |
| `Core.SendEmail` (Base44 templates) | `submitInquiry` | SMTP/API send using the two HTML templates in `base44/emails/` |
| `Core.UploadPrivateFile` / `CreateFileSignedUrl` | `exportResearchXlsx`, `runAgentTask`, `resumeAgentTask` | Supabase Storage upload + `createSignedUrl` (same expiry: 900 s attachments, 3600 s exports) |
| `secrets` from `base44:runtime` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BASE44_APP_ID` | Supabase function secrets; `BASE44_APP_ID` (Stripe metadata) → an app identifier of the owner's choosing |
| `X-Base44-App-Url` header (checkout return URLs) | `createCheckoutSession` | Fixed `APP_URL` secret per environment — preserves the rule "never derive return URLs from the request host" |
| `User` built-in entity + `role` + `organization_ids` | `shared/tenancy.ts`, all admin guards | `profiles` table + membership-based RLS (§3.4) |
| Base44 hosting + coinexa.net mapping | platform | Hostinger (Phase 10–11) |

---

## 3. Database (new, empty — no data migration)

### 3.1 Entity → table mapping

Conventions for every table:

- **IDs are `text` primary keys defaulting to `gen_random_uuid()::text`.** The code treats ids as
  opaque strings (Base44 used 24-hex strings), so text keys need no code change. No old ids exist
  in the new database; old Base44 links such as `/agents/<old id>` will show "not found".
- System columns: `created_at` (from `created_date`), `updated_at` (from `updated_date`),
  `created_by uuid null → auth.users`. The code's 62 uses of `created_date` / 19 of `created_by_id` are kept working by
  the shim's field mapping (or by naming the columns identically — decided in Phase 2).
- `string[]` → `text[]`; `object` / `object[]` → `jsonb`; enums → `text` + `CHECK`.

| Base44 entity (`base44/entities/`) | Table | Key columns and types | Foreign keys | Indexes |
|---|---|---|---|---|
| `User` (built-in) | `profiles` | `id uuid PK = auth.users.id`, `email`, `full_name`, `role CHECK (admin,user) default user` | `id → auth.users ON DELETE CASCADE` | `email` |
| `Organization` | `organizations` | `name NOT NULL`, `slug UNIQUE`, `industry`, `size`, `plan CHECK (starter,growth,scale)`, `status CHECK (active,suspended)`, `internal bool`, `data_class CHECK (customer,internal,test) default test`, `stripe_customer_id`, `stripe_subscription_id`, `task_limit_month int`, `agent_limit int`, `seat_limit int`, `concurrent_limit int` | — | `slug`, `stripe_customer_id`, `stripe_subscription_id` |
| `OrganizationMember` | `organization_members` | `organization_id NOT NULL`, `user_id uuid null`, `email NOT NULL`, `full_name`, `member_role CHECK (owner,admin,member)`, `status CHECK (invited,active,removed)`, `joined_at` | `organization_id → organizations`; `user_id → profiles` | `(user_id,status)`, `(email,status)`, `UNIQUE (organization_id, lower(email))` |
| `Agent` | `agents` | `name NOT NULL`, `organization_id`, `specialization`, `industry_key`, `industry`, `business_name`, `business_description`, `tasks`, `responsibilities text[]`, `permissions text[]`, `tone`, `tools text[]`, `role`, `summary`, `goals text[]`, `workflow text[]`, `workflow_graph jsonb`, `workflow_version int`, `workflow_enabled bool default true`, `knowledge_requirements text[]`, `safety_rules text[]`, `system_instructions`, `last_run_status CHECK (succeeded,failed)`, `last_run_at`, `status CHECK (draft,active,paused) default draft` | `organization_id → organizations` (nullable; see note) | `organization_id`, `created_by`, `status` |
| `AgentTask` | `agent_tasks` | `execution_id`, `idempotency_key`, `agent_id NOT NULL`, `agent_name`, `organization_id`, `task NOT NULL`, `output`, `status CHECK (queued,running,succeeded,failed,awaiting_approval,cancelled)`, `error`, `steps jsonb`, `approvals jsonb`, `progress numeric`, `current_node`, `awaiting_approval bool`, `workflow_version int`, `warnings text[]`, `attachments text[]`, `attachment_names text[]`, `duration_ms int`, `started_at`, `finished_at` | `agent_id → agents` **ON DELETE SET NULL or no FK** (history must survive agent deletion; `agent_name` is stored for that reason) — Q12 | `(organization_id,status)`, `(organization_id,created_at)`, `agent_id`, `UNIQUE (created_by, idempotency_key) WHERE idempotency_key IS NOT NULL` |
| `AgentUpload` | `agent_uploads` | `file_uri NOT NULL`, `file_name`, `organization_id` | `organization_id → organizations` | `organization_id` |
| `ResearchReport` | `research_reports` | `query NOT NULL`, `organization_id`, `market default 'Egypt'`, `suppliers text[]`, `assumptions jsonb`, `products jsonb`, `product_count int`, `overall_confidence CHECK (VERIFIED,PARTIALLY_VERIFIED,ESTIMATED,UNVERIFIED,UNAVAILABLE)`, `sources jsonb`, `limitations text[]`, `summary`, `researched_at`, `agent_id`, `xlsx_file_uri`, `xlsx_generated_at` | `organization_id → organizations`; `agent_id → agents ON DELETE SET NULL` | `organization_id`, `agent_id` |
| `UsageRecord` | `usage_records` | `organization_id NOT NULL`, `user_id uuid null`, `agent_id`, `task_id`, `kind CHECK (12 values)`, `units int`, `model`, `input_tokens int null`, `output_tokens int null`, `duration_ms int` | `organization_id → organizations`; `agent_id`, `task_id` **without FK** (meter rows must outlive deleted agents/tasks) | `(user_id,kind,created_at)` (rate limits), `(organization_id,created_at)` |
| `AuditLog` | `audit_logs` | `organization_id NOT NULL`, `actor_id uuid null`, `actor_email`, `action NOT NULL`, `target_type`, `target_id`, `detail` | none (append-only history) | `(organization_id,created_at)`, `action` |
| `Inquiry` | `inquiries` | `name NOT NULL`, `email NOT NULL`, `service`, `message NOT NULL`, `status CHECK (new,in_review,contacted,closed)`, `reference UNIQUE`, `submitted_at`, `studio_notified_at`, `studio_notify_status`, `visitor_ack_status`, `visitor_ack_at` | — | `status`, `submitted_at` |

Notes:
- `organization_id` must stay **nullable** on `agents`, `agent_tasks`, `agent_uploads`,
  `research_reports`: the Base44 rules explicitly allow "created by me and no workspace", and the
  RLS policies reproduce that rule (§3.4).
- `logAudit` writes `organization_id: ''` when no workspace is known (`shared/tenancy.ts`, e.g. the
  Stripe webhook). The port writes `NULL` instead, so `audit_logs.organization_id` and
  `usage_records.organization_id` are nullable.
- An "agent deleted" rule must be chosen before FKs are enforced (Q12).

### 3.2 No data import

- No CSV import, no file copy, no record ids carried over. Phase 2 creates the schema only.
- Nothing needs seeding: plan limits (`PLAN_LIMITS` in `shared/tenancy.ts`), the Stripe price
  catalog (`shared/stripeCatalog.ts`) and the agent wizard catalog (`src/data/`) live in code.
- **Recommended (owner's choice):** keep a private archive of the Base44 CSV exports and any files
  you want to keep, outside the repository, before Base44 is ever switched off. It is a record
  only; it is not loaded into the new system.
- Agents the owner wants to keep (e.g. Hazel, Nadia, Fadel) are re-created through the normal
  "Build a new AI Agent" flow after launch, using Base44 as the reference while it is still live.

### 3.3 Accounts: everyone signs up new

No Base44 account, password, user id or data is carried over. Everyone, including the owner, signs
up fresh with email (password + email code) or Google.

1. **Every new sign-up gets its own empty workspace**, exactly as today's `provisionWorkspace`
   does for a first-time user (starter plan limits, `data_class = test` by default).
2. **One owner setup step** (needs the owner's approval; done once in staging and once in
   production): after the owner signs up, a single SQL script
   - sets the owner's `profiles.role` to `admin` (Q10),
   - marks the owner's workspace `internal = true`, `data_class = internal` — what
     `bootstrapOwnerWorkspace` did in Base44 — so it is exempt from customer plan caps.
   No data is attached because there is none.
3. **Invitations** keep working as today: `manageOrganization` invites by email and the invitee is
   joined on first sign-up with that verified email.
4. The isolation test identity (`tenant-isolation-testing.md`) is created as a **new** account
   **only in staging**, for Phase 4.

### 3.4 Row Level Security and tenant isolation

Today (`shared/rls-rollback.md`): the browser calls entities directly, so RLS is the last line of
defence; the tenant key is `User.organization_ids`, written only by the server from membership rows.

Proposed: drop the denormalised `organization_ids` array and test membership directly.

```sql
-- SECURITY DEFINER helpers (owned by a non-login role, search_path fixed)
is_platform_admin()            -- profiles.role = 'admin' for auth.uid()
is_member(org text)            -- active organization_members row for (org, auth.uid())
```

| Table | SELECT | INSERT | UPDATE / DELETE | Same as Base44 rule? |
|---|---|---|---|---|
| agents, agent_tasks, agent_uploads, research_reports | `is_member(organization_id)` OR (`created_by = auth.uid()` AND `organization_id IS NULL`) OR admin | `is_member(organization_id)` OR admin | (`created_by = auth.uid()` AND `is_member(organization_id)`) OR admin | Yes, rule for rule |
| usage_records | `is_member(organization_id)` OR admin | **service role only** (admin-only in Base44) | service role / admin | Yes |
| audit_logs | `actor_id = auth.uid()` OR admin | service role / admin | admin | Yes |
| organizations | `is_member(id)` OR admin | admin (+ server provisioning via service role) | admin | Yes |
| organization_members | `user_id = auth.uid()` OR admin | admin / service role | admin / service role | Yes |
| inquiries | admin only (writes by `submitInquiry` via service role) | admin | admin | Yes |
| profiles | own row OR admin | trigger only | own `full_name` only; `role` changeable by admin only (column-level) | Equivalent to `User.organization_ids` update rule |

All five invariants in `rls-rollback.md` are kept (bounded read, workspace-named create,
creator/admin-only update/delete, no wildcard on empty membership, identity tables self-or-admin).
Storage bucket policies mirror the tables: object path starts with `organization_id`, readable only
by members; Edge Functions sign URLs with the service role after their own checks.

Verification (Phase 4) reproduces the 21-check baseline from `tenant-isolation-testing.md`
(2026-11-12: PASS 21/21) **in the staging project only**, as a non-admin user.

---

## 4. Preserving the existing application

### 4.1 Approach: replace the backend underneath, keep the UI

1. **No page, component, layout, style or copy changes** during migration. The UI talks to the
   compatibility client (§2.1), which presents the same methods the UI already calls.
2. **Backend functions keep their names, inputs and outputs.** The browser still calls
   `invoke('runAgentTask', …)` and gets the same JSON.
3. The only frontend files expected to change: `src/api/base44Client.js` (rewritten as the
   compatibility client), `src/lib/app-params.js`, `src/lib/AuthContext.jsx`, the auth pages'
   provider calls if the compat layer cannot hide them, `vite.config.js`, `index.html` + media
   components only for self-hosted media URLs (§2.1), `package.json` dependencies.
4. **Visual regression gate:** every phase that touches the frontend is compared against
   `docs/stage-0/` and `stage0-reference` screenshots (same pages, same viewports).

### 4.2 Server functions — independent equivalents

All become Supabase Edge Functions with identical names unless stated.

| # | Function | What it does (verified from source) | Port notes |
|---|---|---|---|
| 1 | adminActivity | Admin: alerts + audit trail | Admin guard → `is_platform_admin`; consider SQL view |
| 2 | adminAgents | Admin: cross-workspace agent inventory + metrics, read-only | as above |
| 3 | adminBilling | Admin: reads Stripe subscriptions/invoices, reports test vs live | Stripe secret in function secrets |
| 4 | adminCustomers | Admin: accounts + workspaces by data class | needs `profiles` + memberships |
| 5 | adminOverview | Admin: all headline numbers | heavy aggregation → SQL RPC recommended |
| 6 | adminRuns | Admin: execution list, one full run at a time | — |
| 7 | adminUsage | Admin: usage/cost with verified rates only | `MODEL_PRICING` gets real rates once provider chosen |
| 8 | agentWorkflow | Build/save/toggle an agent's workflow graph; owner check; rate-limited | — |
| 9 | bootstrapOwnerWorkspace | One-off: promote owner workspace to internal, attach orphan records (dry run by default) | **Not ported.** Its only remaining job (mark the owner workspace internal) is done by the owner setup script (§3.3); there are no orphan records in a fresh database |
| 10 | chatWithAgent | Agent chat preview (LLM), rate-limited | `invokeLLM` |
| 11 | createCheckoutSession | Stripe Checkout for own workspace; server-owned price catalog | `APP_URL` secret instead of `X-Base44-App-Url` |
| 12 | exportResearchXlsx | Builds Excel (exceljs) incl. remote images, stores privately, returns signed URL | **CPU-heavy** → risk R7 |
| 13 | generateAgent | Designs an agent via LLM with JSON schema; plan cap + rate limit | `invokeLLM` structured output |
| 14 | manageOrganization | Bootstrap/invite/remove member/activity; rate-limited | invitation emails? none sent today (verified: no SendEmail here) |
| 15 | productResearch | LLM research **with web search**, JSON schema | provider web-search tool; cost per search (§6) |
| 16 | recalcResearch | Pure computation (profit/score) | trivial |
| 17 | resumeAgentTask | Approve/reject a paused run, re-signs attachments, resumes runner | `invokeLLM`, Storage |
| 18 | runAgentTask | Runs workflow (≤150 s budget, 60 s/model call), quotas, idempotency, metering | Wall-clock risk R6 |
| 19 | stripeWebhook | Verifies Stripe signature, grants plan on paid subscription | must allow unauthenticated calls (`verify_jwt = false`) |
| 20 | submitInquiry | Public form; global + per-address caps; 2 fixed emails | email provider |
| 21 | usageSummary | Admin usage page feed | — |
| 22 | verifyTenantIsolation | Deliberately inert in production | Not ported to production; the real suite runs in staging (Phase 4). Doc says remove with `/security-check` before launch — Q11 |

### 4.3 Authentication and authorization changes

| Today (Base44) | After | Change visible to users? |
|---|---|---|
| Email+password with 6-digit OTP verification on sign-up | Supabase email+password with email OTP confirmation | Same flow; emails come from Coinexa's SMTP |
| Google sign-in (`loginWithProvider('google')`) | Supabase Google OAuth (needs a Google Cloud OAuth client — free) | Same button |
| Base44 hosted login wall (Microsoft, Facebook, Apple too) when app set to private | Not used; app's own pages (Stage 0 obs. 1) | Only if owner wants a private mode — Q8 |
| Password reset | Supabase reset email → existing `/reset-password` page | Same page |
| `User.role` admin/user | `profiles.role`, admin assigned only via SQL by the owner | — |
| `organization_ids` array synced by server | membership checked live in RLS | — (simpler, no sync race) |
| Existing accounts | Not carried over. Everyone signs up new with email or Google (owner decision) | **Yes — everyone creates a new account**; only the owner is attached to the existing workspace (§3.3) |

### 4.4 Risks to existing features and data (detail in §6.2)

Highest: existing agents, runs, reports and inquiries stay behind in Base44 by decision (R1);
media hosted on `media.base44.com` disappears if Base44 is removed before self-hosting (Q4);
run-time limits on Edge Functions (R6/R7); output changes when the AI model changes (R9).

### 4.5 Stage 0 findings — carried, not fixed

| # (Stage 0) | Finding | Migration impact |
|---|---|---|
| 1 | Private vs public: Base44 hosted login wall vs app's own pages | Decide target behaviour (Q8); migration reproduces the **published** behaviour by default |
| 2 | Protected routes redirect to `/login` | Kept as is (`ProtectedRoute`) |
| 3 | 404 page off-brand | Not changed |
| 4 | Mobile menu clipped | Not changed; screenshots will still show it |
| 5 | Scroll-reveal sections blank in full-page captures | Affects test screenshots only; use per-section captures |
| 6 | Footer "Download deck" points to an AutoAdjust `.pptx` | File is in `public/` and moves with the build; not changed |
| 7 | Legal pages show "REQUIRES LEGAL REVIEW" | Not changed |
| 8 | Header shows Sign In/Sign Up when signed in | Not changed |
| 9 | Three separate shells (site / inbox / admin) | Not changed |
| 10 | Two usage pages (`/usage`, `/admin/usage`) | Both ported (functions 7 and 21) |
| 11 | Temporary/QA artefacts in production (`/security-check`, "QA Probe (delete me)", pending approvals) | Not carried over (fresh start). `/security-check` and `verifyTenantIsolation` are kept only in staging (Q11) |
| 12 | Internal workspace holds 18 agents vs limit 3 | Correct today: `internal` workspaces skip caps (`isInternalWorkspace`). The owner setup script sets `internal = true` on the new owner workspace, otherwise the owner is capped at 3 agents |
| 13 | Inbox stat cards show "—" | Not changed |
| 14 | Agent status differs between `/agents` and `/admin/agents` | Not changed; compare both after migration to confirm the difference is the same, not new |

---

## 5. Migration phases, acceptance criteria and rollback

Ground rules for all phases: Base44 production app and its data are **read-only to us**; nothing in
Base44 is deleted, disabled or cancelled; DNS is untouched until Phase 11; every phase starts only
after the owner approves it; all work is on branches, never directly on `main`.

| Phase | Work | Acceptance criteria | Rollback |
|---|---|---|---|
| **1. Supabase project & DB prep** | Owner creates **staging** project (Free plan fine), region chosen (Q13); repo gets `supabase/` folder (config, migrations) on a branch | Project reachable; keys stored only in Supabase/hosting dashboards, never in git | Delete the staging project; nothing else affected |
| **2. Schema (staging)** | Migrations for the 10 tables, constraints, indexes, helper functions; no data import | Migrations apply cleanly from zero twice in a row; every table, CHECK and index from §3.1 present; tables empty | Drop schema and re-run migrations |
| **3. Auth & profiles** | Supabase Auth (email+OTP, Google, reset) via compat client; profile trigger; owner setup script (§3.3) | Sign-up by email and by Google both work; each new user gets one empty workspace; owner is admin with an internal workspace after the script; no user sees another workspace | Revert branch; reset staging auth users |
| **4. RLS & isolation verification** | Policies from §3.4; rebuild the 21-check suite against staging as a non-admin | 21/21 PASS from a non-admin account; admin sees all; anonymous sees nothing except what the published site needs | Policies are migrations — revert; never relax a policy to pass a check |
| **5. Replace backend functions** | Server shim + port the 22 functions; frontend compat client; remove Base44 SDK/plugin on the branch | Every page in Stage 0 list loads in staging with no console errors; screenshots match baseline; each function returns the same response shape (contract tests per function) | Revert branch; Base44 still runs production |
| **6. AI integration** | `invokeLLM` adapter with chosen provider (test key, spend cap set by owner) | Agent generation, chat, a 6-step run with approval pause/resume, and one research run all complete; tokens recorded in `usage_records` | Switch adapter to stub; revoke test key |
| **7. Email** | SMTP/API for inquiry emails + Supabase Auth SMTP; SPF/DKIM **only after explicit DNS approval** | Inquiry sends 2 emails with correct templates; OTP + reset emails arrive and are not spam-flagged | Disable custom SMTP; remove the DNS records added (old values recorded first) |
| **8. Stripe test mode** | Test keys, webhook endpoint for staging, checkout for both tiers | Test checkout upgrades the workspace plan via webhook only; admin billing shows "test"; no live keys anywhere | Remove webhook endpoint; delete test secrets |
| **9. Full functional & security testing** | Regression of all pages and flows; isolation suite; rate limits; webhook signature rejection; secret scan of repo | Test log with pass/fail per item, all pass; owner sign-off | Fix forward on branch; production untouched |
| **10. Hostinger staging deploy** | Build `dist/`, upload to a **staging subdomain or temporary Hostinger URL** with SPA rewrite | Staging site works end-to-end against the staging Supabase project | Remove the staging site |
| **11. Production launch & DNS switch** | Production Supabase (Pro); migrations applied to the empty production database; owner signs up, setup script run with his approval; smoke test on the Hostinger URL; then switch coinexa.net DNS to Hostinger (TTL lowered 24–48 h before) | All flows pass on coinexa.net; owner is admin; no secrets in the frontend bundle | Point DNS back to the recorded Base44 values (Base44 still live and untouched, so this is a full rollback); keep Base44 running for an agreed period (≥30 days suggested) |

No data freeze or final export is needed, because nothing is copied. Accounts and records
created on the new system after the switch do not exist in Base44, so a DNS rollback leaves them
behind on the new system (not lost, just not visible on Base44). The rollback window should be
short and agreed (Q14). Contact-form inquiries that arrive in Base44 before the switch stay in the
Base44 inbox — handle or note them before switching.

---

## 6. Costs and risks

### 6.1 Estimated monthly costs (no accounts created, nothing activated)

Prices as published on the providers' sites in November 2026; promotional prices change and
renewals are higher. **Verify on each pricing page at signup.**

| Service | Free tier | Paid tier | Usage-based | Likely for Coinexa |
|---|---|---|---|---|
| Supabase | Free: 500 MB DB, 1 GB storage, 5 GB egress, 50k MAU, 500k function invocations; **projects pause after 1 week inactive**; 150 s function wall clock | Pro **$25/mo** per org: 100k MAU, 8 GB disk, 250 GB bandwidth, daily backups (7 days), 400 s function wall clock | MAU over quota $0.00325; extra invocations $2/million; storage $0.021/GB | Staging: Free. Production: Pro $25 |
| AI — Anthropic (example) | none | none | Per million tokens e.g. Sonnet 5.5 $2 in / $10 out; Haiku 4.5 $1 / $5; **web search $10 per 1,000 searches** + tokens | See below |
| AI — OpenAI | — | — | per-token; **not priced in this draft** (Q5) | — |
| Email — Hostinger mailbox | Free/trial mailbox ~100 sends/day | Business email plans ~1,000–3,000/day per mailbox (low monthly price, promo) | none | $0–4 |
| Email — Resend (alternative) | 3,000/mo, max 100/day, 1 domain | Pro $20/mo (50k emails) | $0.90 per extra 1,000 | $0 at current volume |
| Stripe | no monthly fee | — | Cards 2.9% + $0.30 (US domestic); Stripe Billing 0.7% of billing volume; dispute $15 | Per $25 sale ≈ $1.20; per $50 ≈ $2.10 (arithmetic from listed rates) |
| Hostinger web hosting | — | Shared web hosting from ~$2.99/mo promo; Node web-app hosting from ~$3.99/mo promo | none | ~$3–8/mo (Q7: plan you already own?) |

**AI cost illustration** (my arithmetic, assumed token sizes — Base44 never recorded tokens, so
real figures will be measured in Phase 6): an agent step of ~3k input + 1.5k output tokens on a
$2/$10 model ≈ **$0.02**; a research run with 5 web searches + ~30k input + 4k output ≈ **$0.15**.
Current volume (12 model calls in Nov 2026) ≈ **under $2/month**; 1,000 calls/month ≈ $20;
10,000 ≈ $200. The existing per-user rate limits (`shared/rateLimits.ts`) cap worst-case spend.

**Totals:** staging/testing ≈ **$0** (+ AI test usage of a few dollars).
Production ≈ **$25 (Supabase Pro) + $3–8 (hosting) + $0–4 (email) + AI usage + Stripe per-sale fees**
→ roughly **$30–40/month plus usage** at today's volume.

### 6.2 Risks

| ID | Type | Risk | Mitigation |
|---|---|---|---|
| R1 | Data | Existing agents, runs, reports, usage history, audit log, inquiries and private files stay in Base44 and are not in the new system (owner decision) | Owner keeps a private archive of exports (§3.2); re-creates the agents he needs; Base44 stays live and untouched until the owner decides otherwise |
| R2 | Users | Old links (`/agents/<old id>`, bookmarks, links shared with others) stop working after the switch | Acceptable for a fresh start; only the owner used these links |
| R3 | Data | Inquiries submitted to Base44 just before the switch could be missed | Check the Base44 inbox right before and after the DNS switch |
| R4 | Deployment | Hosted media on `media.base44.com` breaks when Base44 is removed | Inventory every external media URL (static + runtime), download and self-host before any Base44 shutdown (Q4) |
| R5 | Security | An RLS mistake exposes other workspaces (browser reads tables directly) | §3.4 rule-for-rule mapping; 21-check suite as non-admin; secret scan; service-role key never in the browser |
| R6 | Technical | `runAgentTask` runs synchronously up to 150 s; Free plan wall clock is 150 s, Pro 400 s; other request timeouts may apply (**UNVERIFIED**) | Pro plan for production; test long runs in Phase 6; fallback: background task + polling (`WorkflowPanel.jsx` already polls) |
| R7 | Technical | Edge Functions allow ~2 s of **CPU** per request; building an Excel file with images (`exportResearchXlsx`) may exceed it | Measure in Phase 5; fallback: run this one function as a Node app on Hostinger, or generate the workbook in the browser |
| R8 | Technical | The Base44 query dialect (`$in`, `$exists`, sort strings, `aggregate`) differs from PostgREST | Shim with tests per operator; admin aggregations moved to SQL |
| R9 | Technical | Different AI model → different research/agent output quality; Base44 research used `gemini_3_8_flash` with internet context | Side-by-side comparison on saved tasks in Phase 6 before switching |
| R10 | Security | Webhook endpoint public; signature check must be preserved | Port `validSignature` unchanged; test with a wrong signature |
| R11 | Deployment | DNS switch breaks email (MX) if records are replaced carelessly | Record all current DNS values first; change only A/CNAME for the website; MX/SPF/DKIM changes as a separate approved step |
| R12 | Deployment | Supabase Free projects pause after a week idle | Use Free only for staging; production on Pro |
| R13 | Security | Base44 app identifier, Stripe price IDs and the test-account email are in source (not secrets, but identifying) | Fine to keep; no secret values found in the repo (only names) |
| R14 | Users | Everyone, including the owner, starts with a new account and an empty workspace | Owner decision; today only the owner has real data |

---

## 7. Deliverable status

- This file: `docs/stage-1/MIGRATION-PLAN.md` on branch `stage-1/migration-plan`.
- No application code, configuration, Base44 data, external accounts or DNS were changed.

## 8. Open questions for the owner

| # | Question |
|---|---|
| Q1 | ~~CSV exports~~ — no longer needed (no data import). Keeping them as a private archive is recommended (§3.2). |
| Q2 | ~~User export~~ — no longer needed (no legacy user import). |
| Q3 | ~~Exporting private files~~ — no longer needed for the migration; keep copies yourself if you want them. |
| Q4 | Do you have the original logo, favicon and video files, or may they be downloaded from `media.base44.com` (and the one `static.wixstatic.com` asset) for self-hosting? |
| Q5 | AI provider: Anthropic or OpenAI? (Both can do structured output, attachments and web search.) |
| Q6 | Where is coinexa.net email hosted today (who handles `hello@coinexa.net`)? Hostinger mailbox SMTP or an email API for sending? |
| Q7 | Which Hostinger plan do you already have (if any), and is coinexa.net's DNS managed at Hostinger or elsewhere? |
| Q8 | Should the migrated site be public (as now, published) or support a "private / login-only" mode? |
| Q9 | Keep Google sign-in? Add MFA (the `Mfa` page exists but is not routed)? |
| Q10 | Confirm the owner's new account will use `ramyusa2030@gmail.com` (email or Google) and is the only platform admin. |
| Q11 | Keep `/security-check` and `verifyTenantIsolation` in staging only and leave them out of production (as their own runbook says), or remove them entirely? |
| Q12 | When an agent is deleted, should its run history stay (recommended) or be deleted with it? |
| Q13 | Supabase region preference (users mainly in Egypt/Middle East → an EU region such as Frankfurt is likely closest; to confirm). |
| Q14 | How long should Base44 stay live as the rollback target after the switch (suggested ≥30 days)? |

## Sources (pricing and limits)

- Supabase pricing — https://supabase.com/pricing ; billing quotas — https://supabase.com/docs/guides/platform/billing-on-supabase
- Supabase Edge Function limits — https://supabase.com/docs/guides/functions/limits ; CPU/wall clock — https://supabase.com/docs/guides/troubleshooting/edge-function-wall-clock-time-limit-reached-Nk38bW
- Anthropic pricing (models, web search) — https://platform.claude.com/en/docs/about-claude/pricing
- Hostinger pricing — https://www.hostinger.com/pricing ; Node.js hosting — https://hostinger.com/nodejs-hosting
- Hostinger email limits — https://support.hostinger.com/en/articles/4625828-parameters-and-limits-of-hostinger-email
- Resend pricing — https://resend.com/pricing
- Stripe pricing — https://stripe.com/pricing ; Stripe Billing — https://stripe.com/en-us/billing/pricing
