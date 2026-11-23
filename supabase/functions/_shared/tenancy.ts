// Workspace (tenant) foundation: provisioning, membership, auditing, usage
// metering and execution quotas. Every function that runs or creates agent work
// goes through here so limits and the audit trail cannot be bypassed.

const PLAN_LIMITS = {
  starter: { tasks: 100, agents: 3, seats: 2, concurrent: 1 },
  growth: { tasks: 1000, agents: 20, seats: 10, concurrent: 3 },
  scale: { tasks: 10000, agents: 100, seats: 50, concurrent: 6 },
};

export const planLimits = (plan) => PLAN_LIMITS[plan] || PLAN_LIMITS.starter;

// The Coinexa owner workspace is flagged internal so the platform team can run
// the full development estate. Customer workspaces are always capped.
export const isInternalWorkspace = (organization) => organization?.internal === true;

const monthStartIso = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
};

const slugify = (value) =>
  String(value || 'workspace')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'workspace';

const text = (value, max = 400) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

export async function logAudit(base44, entry) {
  try {
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: entry.organization_id || '',
      actor_id: entry.user?.id || '',
      actor_email: entry.user?.email || '',
      action: text(entry.action, 80),
      target_type: text(entry.target_type, 60),
      target_id: text(entry.target_id, 80),
      detail: text(entry.detail, 400),
    });
  } catch (error) {
    console.error('tenancy: audit entry failed', entry?.action, error?.message);
  }
}

// One usage row per metered operation. `units` is the number of model calls the
// operation actually made (0 is a legitimate value when no model was called), so
// totals in reporting are real consumption rather than an assumed minimum.
// A failed write is logged with enough context to find the record, and never
// reported as recorded: callers get null back when persistence did not happen.
export async function recordUsage(base44, entry) {
  const units = Number(entry.units);
  try {
    return await base44.asServiceRole.entities.UsageRecord.create({
      organization_id: entry.organization_id || '',
      user_id: entry.user_id || '',
      agent_id: entry.agent_id || '',
      task_id: entry.task_id || '',
      kind: entry.kind || 'task_run',
      units: Number.isFinite(units) ? Math.max(0, Math.round(units)) : 0,
      model: text(entry.model, 60),
      // Token counts are only written when the provider reported them, so an
      // absent field means "not captured" rather than a real zero.
      ...(Number.isFinite(Number(entry.input_tokens)) && entry.input_tokens !== undefined
        ? { input_tokens: Math.max(0, Math.round(Number(entry.input_tokens))) }
        : {}),
      ...(Number.isFinite(Number(entry.output_tokens)) && entry.output_tokens !== undefined
        ? { output_tokens: Math.max(0, Math.round(Number(entry.output_tokens))) }
        : {}),
      duration_ms: Number(entry.duration_ms) > 0 ? Math.round(Number(entry.duration_ms)) : 0,
    });
  } catch (error) {
    console.error('tenancy: usage record failed', {
      kind: entry?.kind,
      organization_id: entry?.organization_id,
      task_id: entry?.task_id,
      status: error?.status,
      message: error?.message,
    });
    return null;
  }
}

// Returns the workspace the user works in, creating a personal one on first use
// and claiming any invitation addressed to their verified email.
async function provisionWorkspace({ base44, user }) {
  const service = base44.asServiceRole;
  const email = String(user?.email || '').toLowerCase();

  const mine = await service.entities.OrganizationMember.filter(
    { user_id: user.id, status: 'active' },
    { limit: 1 }
  );
  const existing = mine?.items?.[0];
  if (existing) {
    const organization = await service.entities.Organization
      .get(existing.organization_id)
      .catch(() => null);
    if (organization) return { organization, membership: existing };
  }

  if (email) {
    const invitations = await service.entities.OrganizationMember.filter(
      { email, status: 'invited' },
      { limit: 1 }
    );
    const invitation = invitations?.items?.[0];
    if (invitation) {
      const joined = await service.entities.OrganizationMember.update(invitation.id, {
        user_id: user.id,
        full_name: user.full_name || invitation.full_name || '',
        status: 'active',
        joined_at: new Date().toISOString(),
      });
      const organization = await service.entities.Organization.get(joined.organization_id);
      await logAudit(base44, {
        organization_id: organization.id,
        user,
        action: 'member.joined',
        target_type: 'OrganizationMember',
        target_id: joined.id,
        detail: 'Accepted the workspace invitation',
      });
      return { organization, membership: joined };
    }
  }

  const limits = planLimits('starter');
  const displayName = (user.full_name || email.split('@')[0] || 'Your workspace').trim().slice(0, 80);
  const organization = await service.entities.Organization.create({
    name: `${displayName}'s workspace`,
    slug: `${slugify(displayName)}-${Math.random().toString(36).slice(2, 6)}`,
    plan: 'starter',
    status: 'active',
    task_limit_month: limits.tasks,
    agent_limit: limits.agents,
    seat_limit: limits.seats,
    concurrent_limit: limits.concurrent,
  });

  const membership = await service.entities.OrganizationMember.create({
    organization_id: organization.id,
    user_id: user.id,
    email,
    full_name: user.full_name || '',
    member_role: 'owner',
    status: 'active',
    joined_at: new Date().toISOString(),
  });

  // Two first-time requests can arrive together (agent creation plus a task run).
  // Keep the oldest workspace for this user and drop the copy this call created.
  const settled = await service.entities.OrganizationMember.filter(
    { user_id: user.id, status: 'active' },
    { sort: 'created_date', limit: 5 }
  );
  const keeper = settled?.items?.[0];
  if (keeper && keeper.organization_id !== organization.id) {
    await service.entities.OrganizationMember.delete(membership.id).catch(() => null);
    await service.entities.Organization.delete(organization.id).catch(() => null);
    const existingWorkspace = await service.entities.Organization.get(keeper.organization_id);
    return { organization: existingWorkspace, membership: keeper };
  }

  await logAudit(base44, {
    organization_id: organization.id,
    user,
    action: 'organization.created',
    target_type: 'Organization',
    target_id: organization.id,
    detail: `Created the workspace ${organization.name}`,
  });

  return { organization, membership };
}

// The tenant boundary is membership. Access rules test the user's
// organization_ids list, which only the server writes, derived from the
// membership records themselves — never from anything the browser sends.
// A user therefore cannot grant themselves another workspace.
export async function syncUserMemberships({ base44, user, fallbackOrganizationId }) {
  try {
    const service = base44.asServiceRole;
    const { items } = await service.entities.OrganizationMember.filter(
      { user_id: user.id, status: 'active' },
      { sort: 'created_date', limit: 50 }
    );
    const ids = [...new Set(items.map((member) => member.organization_id).filter(Boolean))];
    if (!ids.length && fallbackOrganizationId) ids.push(fallbackOrganizationId);

    const current = Array.isArray(user?.organization_ids) ? user.organization_ids : [];
    const same = ids.length === current.length && ids.every((id) => current.includes(id));
    if (same) return ids;

    await service.entities.User.update(user.id, { organization_ids: ids });
    return ids;
  } catch (error) {
    console.error('tenancy: membership sync failed', error?.message);
    return null;
  }
}

export async function ensureOrganization({ base44, user }) {
  const result = await provisionWorkspace({ base44, user });
  await syncUserMemberships({ base44, user, fallbackOrganizationId: result?.organization?.id });
  return result;
}

export async function membershipFor({ base44, user, organizationId }) {
  if (!organizationId) return null;
  const { items } = await base44.asServiceRole.entities.OrganizationMember.filter(
    { user_id: user.id, organization_id: organizationId },
    { limit: 1 }
  );
  const membership = items?.[0];
  return membership && membership.status === 'active' ? membership : null;
}

export const canManage = (membership) =>
  Boolean(membership && (membership.member_role === 'owner' || membership.member_role === 'admin'));

// A worker is cut off after five minutes and the engine stops itself well before
// that, so a run still marked queued/running after ten minutes was interrupted
// before it could write its own outcome. Closing it here is what frees the slot.
export const STALE_RUN_MS = 10 * 60 * 1000;

const STALE_RUN_ERROR =
  'This run was interrupted before it could finish and has been closed automatically, so the workspace can run again. Re-run the task if you still need the result.';

export async function reclaimStaleRuns({ base44, organization }) {
  const service = base44.asServiceRole;
  const cutoff = new Date(Date.now() - STALE_RUN_MS).toISOString();

  const page = await service.entities.AgentTask
    .filter(
      {
        organization_id: organization.id,
        status: { $in: ['queued', 'running'] },
        started_at: { $lt: cutoff },
      },
      { limit: 20 }
    )
    .catch((error) => {
      console.error('tenancy: stale run lookup failed', error?.message);
      return { items: [] };
    });

  let reclaimed = 0;
  for (const task of page.items || []) {
    const updated = await service.entities.AgentTask
      .update(task.id, {
        status: 'failed',
        error: STALE_RUN_ERROR,
        finished_at: new Date().toISOString(),
        current_node: '',
        awaiting_approval: false,
      })
      .catch((error) => {
        console.error('tenancy: could not close stale run', task.id, error?.message);
        return null;
      });
    if (!updated) continue;
    reclaimed += 1;
    // The interrupted run keeps whatever usage it was already metered for; only
    // its outcome and its slot are settled here, and the closure is audited.
    await logAudit(base44, {
      organization_id: organization.id,
      user: null,
      action: 'task.timed_out',
      target_type: 'AgentTask',
      target_id: task.id,
      detail: `${task.agent_name || 'Agent'} run ${task.execution_id || task.id} stopped responding and was closed automatically.`,
    });
  }
  return reclaimed;
}

export async function checkTaskGate({ base44, organization }) {
  const service = base44.asServiceRole;

  if (organization.status !== 'active') {
    return {
      ok: false,
      message: 'This workspace is suspended, so agents cannot run. Ask the workspace owner to restore it.',
    };
  }

  // Recovery runs before the counts so an interrupted run cannot keep holding a slot.
  const reclaimed = await reclaimStaleRuns({ base44, organization });

  if (isInternalWorkspace(organization)) {
    return { ok: true, internal: true, reclaimed, limits: { tasks: null, concurrent: null } };
  }

  const limits = planLimits(organization.plan);
  const taskLimit = Number(organization.task_limit_month) > 0 ? Number(organization.task_limit_month) : limits.tasks;
  const concurrentLimit =
    Number(organization.concurrent_limit) > 0 ? Number(organization.concurrent_limit) : limits.concurrent;

  const [used, active] = await Promise.all([
    service.entities.AgentTask.count({
      organization_id: organization.id,
      created_date: { $gte: monthStartIso() },
    }),
    // Only work actually executing holds a slot. A run paused on a human
    // approval is waiting on the owner, not on the machine, so it does not count
    // here — otherwise one pending decision freezes the whole workspace.
    service.entities.AgentTask.count({
      organization_id: organization.id,
      status: { $in: ['queued', 'running'] },
    }),
  ]);

  if (used >= taskLimit) {
    return {
      ok: false,
      message: `This workspace has used all ${taskLimit} task runs included this month.`,
    };
  }
  if (active >= concurrentLimit) {
    return {
      ok: false,
      message: 'This workspace already has a run in progress. Wait for it to finish, then try again.',
    };
  }

  return {
    ok: true,
    used,
    remaining: Math.max(0, taskLimit - used),
    reclaimed,
    limits: { tasks: taskLimit, concurrent: concurrentLimit },
  };
}

export async function checkAgentGate({ base44, organization }) {
  const count = await base44.asServiceRole.entities.Agent.count({
    organization_id: organization.id,
  });
  if (isInternalWorkspace(organization)) {
    return { ok: true, internal: true, used: count };
  }

  const limits = planLimits(organization.plan);
  const agentLimit = Number(organization.agent_limit) > 0 ? Number(organization.agent_limit) : limits.agents;
  if (count >= agentLimit) {
    return {
      ok: false,
      message: `This workspace has reached its limit of ${agentLimit} agents.`,
    };
  }
  return { ok: true, used: count, limits: { agents: agentLimit } };
}

export async function usageSummary({ base44, organization }) {
  const service = base44.asServiceRole;
  const limits = planLimits(organization.plan);
  const taskLimit = Number(organization.task_limit_month) > 0 ? Number(organization.task_limit_month) : limits.tasks;
  const agentLimit = Number(organization.agent_limit) > 0 ? Number(organization.agent_limit) : limits.agents;
  const seatLimit = Number(organization.seat_limit) > 0 ? Number(organization.seat_limit) : limits.seats;

  const [tasksThisMonth, agents, members, running] = await Promise.all([
    service.entities.AgentTask.count({
      organization_id: organization.id,
      created_date: { $gte: monthStartIso() },
    }),
    service.entities.Agent.count({ organization_id: organization.id }),
    service.entities.OrganizationMember.count({
      organization_id: organization.id,
      status: { $in: ['active', 'invited'] },
    }),
    service.entities.AgentTask.count({
      organization_id: organization.id,
      status: { $in: ['queued', 'running', 'awaiting_approval'] },
    }),
  ]);

  const internal = isInternalWorkspace(organization);

  return {
    tasks_this_month: tasksThisMonth,
    agents,
    members,
    running,
    internal,
    limits: internal
      ? { tasks: null, agents: null, seats: null }
      : { tasks: taskLimit, agents: agentLimit, seats: seatLimit },
  };
}