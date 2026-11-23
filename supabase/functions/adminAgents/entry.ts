import { adminContext, adminFailure } from '../_shared/adminGuard.ts';
import { dataClassOf, round, settledList, settledRows, percent } from '../_shared/adminData.ts';

// Cross-workspace agent inventory with per-agent execution and usage metrics.
// Read-only: nothing here changes an agent's configuration or status.
export default async function (req) {
  const ctx = await adminContext(req);
  if (ctx.response) return ctx.response;

  try {
    const { service } = ctx;
    const body = await req.json().catch(() => ({}));
    const status = String(body.status || 'all');
    const workflow = String(body.workflow || 'all');
    const performance = String(body.performance || 'all');
    const organizationId = String(body.organization_id || 'all');

    const settled = await Promise.allSettled([
      service.entities.Agent.list({ limit: 500 }),
      service.entities.Organization.list(),
      service.entities.AgentTask.list({ sort: '-created_date', limit: 500 }),
      service.entities.AgentTask.aggregate({ query: {}, groupBy: 'agent_id' }),
      service.entities.AgentTask.aggregate({
        query: { status: 'succeeded' },
        groupBy: 'agent_id',
      }),
      service.entities.AgentTask.aggregate({ query: { status: 'failed' }, groupBy: 'agent_id' }),
      service.entities.AgentTask.aggregate({
        query: {},
        groupBy: 'agent_id',
        avg: ['duration_ms'],
      }),
      service.entities.UsageRecord.aggregate({ query: {}, groupBy: 'agent_id', sum: ['units'] }),
    ]);

    const agents = settledList(settled[0]);
    const organizations = settledList(settled[1]);
    const tasks = settledList(settled[2]);

    const orgById = new Map(organizations.map((org) => [org.id, org]));

    const rowMap = (settledIndex, key) => {
      const map = new Map();
      for (const row of settledRows(settled[settledIndex])) {
        if (row[key]) map.set(row[key], row);
      }
      return map;
    };

    const totalMap = rowMap(3, 'agent_id');
    const successMap = rowMap(4, 'agent_id');
    const failedMap = rowMap(5, 'agent_id');
    const durationMap = rowMap(6, 'agent_id');
    const usageMap = rowMap(7, 'agent_id');

    const lastRunByAgent = new Map();
    for (const task of tasks) {
      if (task.agent_id && !lastRunByAgent.has(task.agent_id)) lastRunByAgent.set(task.agent_id, task);
    }

    const items = agents.map((agent) => {
      const organization = orgById.get(agent.organization_id);
      const total = Number(totalMap.get(agent.id)?.count) || 0;
      const succeeded = Number(successMap.get(agent.id)?.count) || 0;
      const failed = Number(failedMap.get(agent.id)?.count) || 0;
      const lastRun = lastRunByAgent.get(agent.id);
      const hasWorkflow = Boolean(agent.workflow_graph);

      return {
        id: agent.id,
        name: agent.name || 'Untitled agent',
        specialization: agent.specialization || '',
        category: agent.industry || agent.industry_key || 'Uncategorised',
        status: agent.status || 'draft',
        organization: {
          id: organization?.id || '',
          name: organization?.name || 'Unassigned',
          dataClass: dataClassOf(organization),
        },
        hasWorkflow,
        workflowSteps: Array.isArray(agent.workflow) ? agent.workflow.length : 0,
        workflowVersion: agent.workflow_version || null,
        workflowEnabled: agent.workflow_enabled !== false,
        runs: {
          total,
          succeeded,
          failed,
          successRate: percent(succeeded, succeeded + failed),
          avgDurationMs: Math.round(Number(durationMap.get(agent.id)?.avg_duration_ms) || 0),
        },
        usage: {
          units: round(usageMap.get(agent.id)?.sum_units),
        },
        lastRunAt: lastRun?.finished_at || lastRun?.created_date || agent.last_run_at || null,
        lastRunStatus: lastRun?.status || agent.last_run_status || null,
      };
    });

    const filtered = items.filter((item) => {
      if (status !== 'all' && item.status !== status) return false;
      if (workflow === 'missing' && item.hasWorkflow) return false;
      if (workflow === 'present' && !item.hasWorkflow) return false;
      if (organizationId !== 'all' && item.organization.id !== organizationId) return false;
      if (performance === 'healthy' && !(item.runs.total > 0 && (item.runs.successRate ?? 0) >= 90)) {
        return false;
      }
      if (performance === 'attention' && !(item.runs.failed > 0 || (item.runs.successRate ?? 100) < 70)) {
        return false;
      }
      if (performance === 'idle' && item.runs.total > 0) return false;
      return true;
    });

    return Response.json({
      generatedAt: new Date().toISOString(),
      total: items.length,
      shown: filtered.length,
      categories: [...new Set(items.map((item) => item.category))].sort(),
      organizations: organizations.map((org) => ({
        id: org.id,
        name: org.name || 'Untitled workspace',
        dataClass: dataClassOf(org),
      })),
      items: filtered.sort((a, b) => b.runs.total - a.runs.total),
    });
  } catch (error) {
    return adminFailure('adminAgents', error, 'The agent inventory could not be loaded.');
  }
}