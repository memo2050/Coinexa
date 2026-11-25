# AI Recruitment & Talent Sourcing Agent — delivery notes

Staging: https://forward-darkblue-rook-76.hostingersite.com/recruitment (Agents page → featured card).
Branch `stage-2/build`. Built 24–25 Nov 2026.

## What works end to end
1. **Campaigns** — country, city, positions, title, specialization, skills, experience range, certifications,
   languages, on-site/remote/hybrid, schedule, availability, duration, description, currency, hourly/daily/monthly
   pay, opening offer, maximum budget, negotiation strategy and rounds, outreach approval mode, retention period.
   Pause, resume, close, edit.
2. **Sourcing (lawful sources only)** — referrals and manual entry with recorded lawful basis; CSV import from the
   company's own database/ATS export (bad rows reported, never guessed); public application page per campaign with
   consent and CV upload; bulk import of up to 5 PDF CVs at a time, which the AI reads (text copied verbatim,
   fields only where the CV states them; unreadable files reported). ATS connectors are listed as an integration
   slot, not simulated. LinkedIn is not used anywhere in the recruitment system.
3. **AI evaluation** — per-requirement scores with quoted evidence; every quote is checked against the candidate's
   own text and unverifiable claims score zero; location, experience and pay fit by fixed rules; protected
   attributes excluded; transparent explanation stored and shown.
4. **Outreach** — AI-drafted personalised email built only from campaign facts; amount guard rejects any wording above
   the authorised offer (falls back to a template); company approves and can edit each message, or switches the
   campaign to automatic contact of top matches above a score; 3 retries with backoff; 50 emails/day cap; follow-ups;
   every message has the candidate's personal link and opt-out.
5. **Negotiation** — deterministic engine: opens at the initial offer, concedes by strategy, never above the maximum;
   requests above it go to the company (approve a per-candidate exception or decline and keep the final offer).
   Every offer, counteroffer, acceptance, escalation and decision is recorded.
6. **Candidate portal** (/r/<link>) — job, current offer, offer history; accept, counter, interested, decline,
   do-not-contact; availability and contact details; CV upload (PDF/Word, content-checked, 5 MB); consent
   (processing, sharing with the company, contact) with version, time and hashed IP; erase my data. Accepting states
   clearly that it is not an employment contract.
6a. **Written AI interviews (text only, no voice)** — per campaign, the AI drafts job-related questions
   (protected topics and pay wording are filtered out); a manager edits and approves them (at least 3, up to 12;
   0–2 follow-ups per question; link valid 1–30 days). Inviting a candidate freezes the approved questions and
   prepares an invitation draft the company approves before it is sent. In the portal the candidate gives explicit
   consent to an AI-conducted interview, then answers in a chat; the AI asks a follow-up only when an answer is unclear,
   within the cap. Candidate text is treated as data, never instructions. On completion the interview is scored per
   question with quoted evidence (checked against the candidate's own answers; unverifiable quotes score zero),
   strengths, weaknesses and an overall assessment. Hiring stays with the company.
6b. **Candidate report & hiring manager** — per-candidate report (profile, skills, CV-based match, full interview
   Q&A with scores and evidence, strengths/weaknesses, salary history, consent) downloadable as text or emailed to
   the campaign's hiring manager (name and email in campaign settings).
7. **Dashboard** — active campaigns, required, discovered, contacted, interested, negotiating, awaiting approval,
   agreed, hired, declined, completion; filters by country, city, specialization, campaign, experience, pay; refreshes
   every 15 s (campaign page every 10 s).
8. **Final report** (CSV) — all requested columns; stage column separates *Hired*, *Agreed to compensation (not hired
   yet)* and *Expressed interest*; contact details only where the company supplied them or the candidate agreed.
9. **Execution history & audit** — timeline per campaign and candidate (errors and retries included); security-relevant
   actions in the platform audit log.

## Security & privacy
- Six new tables with RLS on and no browser grants: only the `recruitment` server function can read or write them,
  and it scopes every query to the caller's workspace. Owners/admins change things; members view with contacts hidden.
- Candidate email/phone encrypted with AES-256-GCM; the key was generated once by the deploy and exists only as a
  Supabase secret (the deploy never replaces it).
- Portal links are 256-bit random tokens stored only as SHA-256 hashes, expire after 30 days, rotate on each send.
- Data minimisation, retention purge for closed campaigns, candidate self-erasure, permanent deletion by the company.

## Files
- `supabase/migrations/20261125000007_recruitment.sql`, `20261125000008_recruitment_interviews.sql`
- `supabase/functions/recruitment/index.ts`, `supabase/functions/recruitment/interviews.ts`, `supabase/functions/_shared/recruitmentLogic.ts`
- `supabase/functions/_tests/recruitment_test.ts`, `supabase/tests/rls_test.sql` (checks 33–35)
- `src/api/recruitment.js`, `src/components/recruitment/*`, `src/pages/recruitment/*`
- modified: `src/App.jsx` (routes), `src/pages/Agents.jsx` (featured card), `supabase/config.toml`,
  `.github/workflows/staging-deploy.yml` (data key), `scripts/e2e-staging.mjs`, `scripts/ui-staging.mjs`

## Tests (actual results, 25 Nov)
- Unit: 30/30 (10 recruitment: negotiation bounds incl. $150 max vs $180 ask, strategies, approved exceptions, amount
  guard, evidence verification, encryption/tamper, CSV, masking/tokens).
- Database policies: 35/35.
- Staging end-to-end: 60 passed, 0 failed (21 recruitment checks incl. isolation between two companies, consent,
  negotiation, approval, hire rules, CV checks, erasure, dashboard, report, error handling; existing agents unchanged).
- Browser: 70 page views (visitor/user/admin, desktop/mobile) incl. recruitment pages, portal and application page: 0 problems.

## Needs credentials or approval
- **Email to real candidates**: Resend's test sender delivers only to the account owner. Verify a sending domain
  (DNS records on coinexa.net or a subdomain) and set `EMAIL_FROM`. Staging deliberately redirects all mail to the owner.
- **ATS connectors** (Greenhouse/Lever/Workable): company API keys + connector build; CSV import works meanwhile.
- **WhatsApp/SMS**: a WhatsApp Business or SMS provider account.

## Known limitations
- PDF CVs are read by the AI (portal uploads and bulk import); Word CVs are stored but not read. Scanned image-only
  PDFs may be reported as unreadable.
- Evaluation and automatic contact run in batches of 5 per click (free-plan function time limits).
- Progress updates by polling (10–15 s), not push.
- Hiring is a manual confirmation by the company; no contracts are generated.
