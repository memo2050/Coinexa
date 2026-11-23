import { adminContext, adminFailure } from '../_shared/adminGuard.ts';
import { dataClassOf, daysAgoIso, settledList } from '../_shared/adminData.ts';

const LIST_FIELDS = [
  'id',
  'execution_id',
  'agent_id',
  'agent_name',
  'organization_id',
  'status',
  'progress',
  'current_node',
  'duration_ms',
  'started_at',
  'finished_at',
  'created_date',
  'error',
  'awaiting_approval',
  'workflow_version',
];

// Execution monitoring feed. The list returns metadata only; the full record
// (step state, output, approval trail) is returned for one run at a time so
// customer content is not streamed in bulk to the admin console.
export default async function (req) {
  const ctx = await adminContext(req);
  if (ctx.response) return ctx.response;

  try {
    const { service } = ctx;
    const body = await req.json().catch(() => ({}));

    if (body.task_id) {
      const task = await service.entities.AgentTask
        .get(String(body.task_id))
        .catch((error) => (error?.status === 404 ? null : Promise.reject(error)));
      if (!task) return Response.json({ error: 'That run was not found.' }, { status: 404 });

      const agent = task.agent_id
        ? await service.entities.Agent.get(task.agent_id).catch(() => null)
        : null;
      const organization = task.organization_id
        ? await service.entities.Organization.get(task.organization_id).catch(() => null)
        : null;

      return Response.json({
        run: {
          id: task.id,
          execution_id: task.execution_id || '',
          status: task.status,
          progress: task.progress || 0,
          current_node: task.current_node || '',
          agent: { id: task.agent_id || '', name: task.agent_name || agent?.name || 'Agent' },
          organization: {
            id: organization?.id || '',
            name: organization?.name || 'Unassigned',
            dataClass: dataClassOf(organization),
          },
          task: task.task || '',
          output: task.output || '',
          error: task.error || '',
          warnings: Array.isArray(task.warnings) ? task.warnings : [],
          steps: Array.isArray(task.steps) ? task.steps : [],
          approvals: Array.isArray(task.approvals) ? task.approvals : [],
          attachments: Array.isArray(task.attachment_names) ? task.attachment_names : [],
          duration_ms: task.duration_ms || 0,
          workflow_version: task.workflow_version || null,
          started_at: task.started_at || null,
          finished_at: task.finished_at || null,
          created_date: task.created_date || null,
        },
      });
    }

    const query = {};
    const status = String(body.status || 'all');
    if (status === 'in_flight') query.status = { $in: ['queued', 'running'] };
    else if (status !== 'all') query.status = status;
    if (body.agent_id) query.agent_id = String(body.agent_id);
    if (body.organization_id) query.organization_id = String(body.organization_id);

    const days = Number(body.days) || 0;
    if (days > 0) query.created_date = { $gte: daysAgoIso(days) };

    const limit = Math.min(Math.max(Number(body.limit) || 40, 1), 100);
    const page = await service.entities.AgentTask.filter(query, {
      sort: '-created_date',
      limit,
      ...(body.cursor ? { cursor: String(body.cursor) } : {}),
    });

    const [organizationsResult] = await Promise.allSettled([
      service.entities.Organization.list(),
    ]);
    const organizations = settledList(organizationsResult);
    const orgById = new Map(organizations.map((org) => [org.id, org]));

    return Response.json({
      generatedAt: new Date().toISOString(),
      hasMore: Boolean(page.has_more),
      nextCursor: page.next_cursor || null,
      items: (page.items || []).map((task) => {
        const record = {};
        for (const field of LIST_FIELDS) record[field] = task[field] ?? null;
        record.organization_name = orgById.get(task.organization_id)?.name || 'Unassigned';
        record.data_class = dataClassOf(orgById.get(task.organization_id));
        record.step_count = Array.isArray(task.steps) ? task.steps.length : 0;
        return record;
      }),
    });
  } catch (error) {
    return adminFailure('adminRuns', error, 'The execution monitor could not be loaded.');
  }
}