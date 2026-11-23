import { createClientFromRequest } from '../_shared/base44shim.ts';
import { ensureOrganization, logAudit } from '../_shared/tenancy.ts';

// P0 preparation for the Coinexa owner workspace:
//   1. promotes the caller's workspace to an internal (uncapped) workspace
//   2. attaches development records that have no workspace yet
// It only ever FILLS an empty workspace field, so it can never move a record
// from one workspace to another. Idempotent: a second run changes nothing.
// Dry run by default — nothing is written unless the caller sends apply: true.

const MAX_BATCH = 500;

const unscoped = (records) => records.filter((record) => !record.organization_id);

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((error) => (error.status === 401 ? null : Promise.reject(error)));
    if (!user) return Response.json({ error: 'Please sign in.' }, { status: 401 });
    if (user.role !== 'admin') {
      return Response.json(
        { error: 'Only a Coinexa platform admin can prepare the owner workspace.' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const apply = body.apply === true;

    const { organization } = await ensureOrganization({ base44, user });
    if (!organization) return Response.json({ error: 'No workspace is available.' }, { status: 500 });

    const service = base44.asServiceRole;

    const [agentPage, taskPage] = await Promise.all([
      service.entities.Agent.filter({}, { sort: 'created_date', limit: MAX_BATCH }),
      service.entities.AgentTask.filter({}, { sort: 'created_date', limit: MAX_BATCH }),
    ]);

    const agents = unscoped(agentPage.items);
    const tasks = unscoped(taskPage.items);
    const promote = organization.internal !== true;

    const plan = {
      workspace: { id: organization.id, name: organization.name, internal_before: organization.internal === true },
      promote_workspace: promote,
      attach_agents: agents.length,
      attach_tasks: tasks.length,
      agent_ids: agents.map((agent) => agent.id),
      task_ids: tasks.map((task) => task.id),
    };

    if (!apply) {
      return Response.json({ applied: false, dry_run: true, plan });
    }

    if (promote) {
      await service.entities.Organization.update(organization.id, { internal: true });
    }
    if (agents.length) {
      await service.entities.Agent.bulkUpdate(
        agents.map((agent) => ({ id: agent.id, organization_id: organization.id }))
      );
    }
    if (tasks.length) {
      await service.entities.AgentTask.bulkUpdate(
        tasks.map((task) => ({ id: task.id, organization_id: organization.id }))
      );
    }

    const changed = promote || agents.length > 0 || tasks.length > 0;
    if (changed) {
      await logAudit(base44, {
        organization_id: organization.id,
        user,
        action: 'organization.internal_prepared',
        target_type: 'Organization',
        target_id: organization.id,
        detail: `Promoted the owner workspace to internal and attached ${agents.length} agents and ${tasks.length} task runs`,
      });
    }

    const [agentsInWorkspace, tasksInWorkspace, agentsTotal, tasksTotal] = await Promise.all([
      service.entities.Agent.count({ organization_id: organization.id }),
      service.entities.AgentTask.count({ organization_id: organization.id }),
      service.entities.Agent.count({}),
      service.entities.AgentTask.count({}),
    ]);

    return Response.json({
      applied: true,
      changed,
      plan,
      after: {
        agents_in_workspace: agentsInWorkspace,
        agents_total: agentsTotal,
        agents_unscoped: agentsTotal - agentsInWorkspace,
        tasks_in_workspace: tasksInWorkspace,
        tasks_total: tasksTotal,
        tasks_unscoped: tasksTotal - tasksInWorkspace,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}