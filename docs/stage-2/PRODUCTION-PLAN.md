# Coinexa production plan (Supabase)

Status: **plan only. Nothing here has been created, bought or switched on.** Every step
marked **[approval]** needs the owner's explicit yes first.

## 1. What production looks like

| Part | Staging today | Production |
|---|---|---|
| Database, sign-in, files, server functions | Supabase project `coinexa-staging` (Free) | A **new, separate** Supabase project `coinexa-production` on the Pro plan **[approval]** |
| Website | Hostinger test domain | Hostinger, served on coinexa.net **[approval: DNS]** |
| Payments | Stripe **test** mode | Stripe **live** mode, same 15 agent prices **[approval]** |
| Email | Resend, all mail redirected to the owner | Resend from `@coinexa.net` once the domain is verified |
| CAPTCHA | Cloudflare Turnstile (free) | Same, with coinexa.net added as an allowed hostname |
| AI | Anthropic, $18 hard stop under the $20/month limit | Same limit until the owner raises it **[approval]** |

Staging stays exactly as it is, for testing every change before it reaches production.
No Base44 data is migrated: production starts empty, as agreed.

## 2. Monthly cost (checked against supabase.com/pricing, November 2026)

| Item | Cost | Needed? |
|---|---|---|
| Supabase Pro plan | $25 (includes $10 compute credit, so a Micro project adds $0) | **Yes**: Free projects pause after a week idle and have no automatic backups |
| Daily backups (7 days kept) | Included in Pro | Yes |
| Point-in-time recovery (7 days) | $100 | Not at launch. Add when paying customers justify it |
| Custom domain for sign-in (auth.coinexa.net) | $10 | Optional. Sign-in works on the default Supabase address |
| Stripe | 2.9% + 30¢ per payment (US cards) | Only takes a cut of real payments |
| Resend, Turnstile, Hostinger | Free / already paid | — |

**Launch minimum: about $25/month for Supabase.** Nothing is bought until the owner approves.

## 3. Owner account setup (done on staging)

- Owner account `ramyusa2030@gmail.com` is Platform Admin with an internal workspace (not
  billed, no limits), set up by the owner-setup workflow.
- Platform Admin now **requires two-step sign-in**. Owner action: sign in, open
  **Account → Security**, scan the QR code with an authenticator app (Google
  Authenticator, Microsoft Authenticator, 1Password) and enter the 6-digit code.
- For production the same workflow runs once against the new project, after the owner
  signs up there and verifies their email.

## 4. Launch runbook (in order, each step only after approval)

1. **[approval]** Upgrade the Supabase organization to Pro and create `coinexa-production`
   in the region closest to customers. Turn on the spend cap.
2. Owner stores the new project's keys as GitHub Actions secrets
   (`PROD_SUPABASE_ACCESS_TOKEN`, `PROD_SUPABASE_DB_PASSWORD`, etc.) directly in GitHub.
   Never in chat.
3. Copy the staging deploy workflow to `production-deploy`, pointed at the new project,
   run only from `main` and only with a typed approval phrase.
4. Apply all migrations to the empty production database; run the access-rule (RLS)
   test suite against it.
5. Run the backup and restore test (`backup-restore-test.yml`) against production.
6. **[approval]** Stripe live mode: create the 15 live prices with the same setup
   workflow in live mode, register the live webhook, store the live keys.
   Run one real $1 test hire and refund it.
7. **[approval: DNS]** Verify coinexa.net in Resend (3 DNS records) and point coinexa.net
   at Hostinger. Base44 keeps running until the new site is confirmed working.
8. Owner setup on production (step 3 above), turn on two-step sign-in.
9. Final browser and end-to-end checks against production with a throwaway account,
   then remove it.
10. **[approval]** Public launch. Shut down Base44 only after a further, separate approval.

## 5. Backups and recovery

- **Automatic:** Pro keeps daily backups for 7 days (restore from the dashboard).
- **Tested:** `backup-restore-test.yml` takes a full backup with the Supabase CLI,
  restores it into a throwaway database and checks every table's row count, access rules
  and billing functions. Run it monthly and after big changes. Backups never leave the
  test machine (the repository is public).
- **Target:** restore within 1 hour, losing at most 24 hours of data (point-in-time
  recovery would cut that to minutes for $100/month).

## 6. Before live launch: still open

- Lawyer review of the Privacy Policy and Terms (all items marked "needs legal review").
- Company details on the legal pages (registered name, address).
- Email domain verification (needs DNS approval).
- Decide when to connect agents to real outside tools (currently drafting assistants).
- Code-signing certificate for the Windows scanner (paid, not approved; the scanner is
  unsigned, so Windows SmartScreen will warn).

## 7. Audit findings (25 Nov 2026, read-only launch audit)

**Supabase (staging, Free plan):** database 15 MB, 1 file (14 kB), 1 account, 17 agents,
region us-west-2. **Automatic backups kept: 0** (Free has none; the tested backup workflow
is the only backup today). Pro is needed for launch mainly for daily backups and no pausing;
size is far below the Pro allowance (8 GB database). Recommended: Pro + Micro compute
($25/month total), no point-in-time recovery yet. Owner approval required.

**Stripe account:** US, details submitted, charges enabled, **payouts not enabled** (add and
verify a bank account in Stripe → Settings → Payouts), business website and support email
**not set** (Settings → Public details), Stripe Tax **pending** (owner/accountant decision).
Test mode: 15 agent prices, webhook with 9 events (incl. refunds and disputes), customer
portal settings (card update, invoices, no cancel; agents are cancelled in Coinexa).
Live setup is prepared in `.github/workflows/stripe-live-setup.yml` (same code as the test
setup) and refuses to run without "APPROVE STRIPE LIVE", a live key and the production project.

**DNS (coinexa.net, Hostinger, nameservers ns1/ns2.dns-parking.com):** root A and
`www` point at Base44 on Render (do not touch until cut-over); MX and SPF are Hostinger
mail (keep); DMARC `p=none`. Resend needs only new names (`resend._domainkey`, `send`), so
nothing existing changes. `.github/workflows/email-domain.yml` adds them append-only after
"APPROVE DNS ADD", verifies all existing records are unchanged, then verifies the domain and
sends a real test email.

**Code signing:** recommended **Azure Artifact Signing, Basic, about $9.99/month**
(Microsoft-managed keys, signs in GitHub Actions, no USB token). Eligibility: organizations
in the USA, Canada, EU, UK; individuals in the USA and Canada only. Fallback: an OV
certificate from a CA (about $150–300/year, needs a hardware token or cloud HSM). EV is no
longer worth the premium: since 2024 it gives no instant SmartScreen trust; reputation builds
with downloads either way. The scanner workflow now signs and verifies automatically once
these secrets exist: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET,
ARTIFACT_SIGNING_ENDPOINT, ARTIFACT_SIGNING_ACCOUNT, ARTIFACT_SIGNING_PROFILE.
