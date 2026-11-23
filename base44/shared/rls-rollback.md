# Workspace isolation and RLS rollback runbook

Temporary operational note. Delete when the multi-tenant rollout is finished.

## What actually enforces isolation

Entities are called **directly from the browser**. There is no API server of our
own in that path, so the row-level security (`rls`) block inside
`base44/entities/<Name>.jsonc` is the only gate between one workspace and
another. Backend functions add a second layer (explicit owner checks), but they
are not the last line of defence.

The tenant key is `organization_ids` on the user record. It is written **only**
by the server, derived from `OrganizationMember` rows, so it cannot be forged
from the browser. Every protected rule tests against it.

Protected entities: `Agent`, `AgentTask`, `AgentUpload`, `ResearchReport`,
`UsageRecord`. Identity-bearing: `Organization`, `OrganizationMember`,
`AuditLog`.

## Canonical rule shape (current, correct)

- **read**: record workspace is in my list, OR I created it, OR I am platform admin.
- **create**: the target workspace is in my list, OR I am platform admin.
- **update / delete**: I created it, OR I am platform admin.

## Rollback procedure (per entity, one at a time)

1. Copy the current file's content somewhere safe before touching it.
2. Replace **only** the `rls` object of that single entity.
3. Sign in as the non-admin test account and run the isolation check.
4. Confirm two things together: the own-workspace control still **passes**
   (rules are not blanket-denying) and every foreign check still **blocks**.
5. Never roll back two entities in one step. If the check fails afterwards you
   cannot tell which file caused it.

## Invariants a restored rule must satisfy

A previous rule may only be restored if it still satisfies all five. If it does
not, do **not** restore it; narrow the current rule instead.

1. `read` is present and bounded. An absent `read` key means the entity is open
   to anonymous visitors, who are not a workspace at all.
2. `create` names the workspace (`organization_id` inside the user's list).
   Never restore "any signed-in user may create".
3. `update` and `delete` are bounded to creator or admin. Never open to any
   signed-in user.
4. No rule treats a missing workspace list as a wildcard. Do not use `$ne`,
   `$nin` or an empty-string default as the tenant test.
5. `Organization`, `OrganizationMember` and `AuditLog` stay self-or-admin only.
   These reveal other tenants' identity and activity.

## Failure modes and what they look like

- **Too tight**: empty lists, 403 on save, "Agent not found". Annoying, not a
  breach. Fix by re-adding the creator branch.
- **Too loose**: another workspace's records appear in a list. This is a breach.
  Revert to the canonical shape immediately and re-run the isolation check.
- **Empty `organization_ids` for a user**: their creates are refused. Not a
  breach. The list is re-synced from membership on their next provisioning call
  (creating an agent, running a task), so signing in and doing anything fixes it.

## Interpreting evidence safely

An empty list is not proof that records do not exist; it is proof they were
filtered. A 403 is proof of a block. When certainty matters, compare against a
service-role count taken **read-only** for the same query, exactly as the
isolation check does for its ground-truth probe.
