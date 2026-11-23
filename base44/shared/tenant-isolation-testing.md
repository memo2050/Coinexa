# Tenant isolation regression testing

The multi-tenant boundary is the property most likely to be broken by an ordinary
feature change: one relaxed access rule on an entity is enough to expose every
workspace's agents, runs and reports. This suite is the gate.

## The test identity

A permanent, disposable non-admin account exists so the suite can run from a real
second user instead of an administrator (admin access deliberately bypasses
workspace rules, so an admin run proves nothing).

| | |
|---|---|
| Email | `ramyusa2030+tenant-test2@gmail.com` |
| Password | held in the app secret `ISOLATION_TEST_PASSWORD` — never in source |
| App role | `user` — **never promote this account to admin** |
| Workspace | its own empty workspace |
| Data | none. It must never hold real customer records. |

The address is a `+` alias of the owner's inbox, so any platform mail for it
arrives with the owner's mail. It is verified, so password login works and no
verification code is needed.

Kept until Coinexa.net finishes development, security verification and
pre-launch testing. Remove it before public launch (see below).

## Running the suite

1. Sign in as the test identity and capture its token:
   `base44.auth.loginViaEmailPassword(EMAIL, process.env.ISOLATION_TEST_PASSWORD)`
   returns `{ access_token, user }`. Read the password from the secret; never paste it here.
2. Call the verifier with **that** token, never the admin session:
   `POST https://autoadjust-net.base44.app/functions/verifyTenantIsolation`
   with header `Authorization: Bearer <access_token>` and body `{}`.
3. Read the verdict. `PASS` requires `failed === 0` across every check.

The suite runs with the caller's token, so each entity call is subjected to
row-level security exactly as a browser would be. Service role is used only to
read ground truth and to build throwaway probe records — never to answer a check.
Probe records live in a disposable workspace and are deleted at the end of the run.

In the browser the same suite is at `/security-check`, but it must be opened
while signed in as the test account.

## When it must be re-run

Mandatory after any change to:

- any entity's `rls` block, or a new entity being added
- `shared/tenancy.ts` — provisioning, membership sync, `organization_ids`
- `runAgentTask`, `chatWithAgent`, `resumeAgentTask`, `manageOrganization`
- agent creation, workflow graphs, approvals, uploads or usage metering
- the User schema, roles, or how a workspace is assigned to a user

A green run is required before publishing changes that touch any of the above.

## Baseline

2026-11-12 — **PASS**, 21 of 21 checks, 0 failures. Caller `role: user`,
checked against the busiest other workspace (17 agent records). Lists returned
0 records, open-by-id returned 404, modify/delete/create returned 403 and the
probe record was verified unchanged, the three AI endpoints refused foreign
record ids, and the workspace API returned only the caller's own workspace.

## Invariants that must hold

- A user sees only records whose `organization_id` is in their
  `organization_ids`, or that they created. Admin is the only bypass.
- `organization_ids` is written only by the server, from membership records —
  never from anything the browser sends.
- No entity is readable by a workspace the caller does not belong to.
- The AI endpoints refuse records from another workspace even when the id is
  known.

Never weaken a rule to make a check pass. A red result means a real breach: read
`rls-rollback.md` and fix the rule, do not relax the test.

## Removing the account before launch

1. Capture a final green run and save it with the launch evidence.
2. Delete the test workspace: its `Organization`, its `Agent`/`AgentTask`/`UsageRecord`
   records and its `OrganizationMember` record.
3. Delete the user in the dashboard (App Users) and clear its
   `organization_ids` entry.
4. Re-run the suite's own cleanup check — no probe workspaces or probe agents
   should remain.

`verifyTenantIsolation` is a temporary development capability. Remove that
function and the `/security-check` page before public launch, once the final
verification is recorded.
