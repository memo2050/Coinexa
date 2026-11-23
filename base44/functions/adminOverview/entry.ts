import { adminContext, adminFailure } from '../../shared/adminGuard.ts';
import {
  dataClassOf,
  round,
  settledCount,
  settledList,
  settledRows,
  startOfMonthIso,
  daysAgoIso,
  sumRows,
  percent,
} from '../../shared/adminData.ts';
import { pricedModels } from '../../shared/modelPricing.ts';

// One admin-only read that returns every headline number the command center
// shows. Aggregation happens here so the browser never pages through records to
// add numbers up, and every figure is tagged with the data class it came from.
export default async function (req) {
  const ctx = await adminContext(req);
  if (ctx.response) return ctx.response;

  try {
    const { service } = ctx;
    const monthStart = startOfMonthIso();
    const dayAgo = daysAgoIso(1);
    const weekAgo = daysAgoIso(7);

    const settled = await Promise.allSettled([
      service.entities.User.list(),
      service.entities.Organization.list(),
      service.entities.Agent.list({ limit: 500 }),
      service.entities.AgentTask.count({}),
      service.entities.AgentTask.count({ status: 'succeeded' }),
      service.entities.AgentTask.count({ status: 'failed' }),
      service.entities.AgentTask.count({ status: 'cancelled' }),
      service.entities.AgentTask.count({ status: 'awaiting_approval' }),
      service.entities.AgentTask.count({ status: { $in: ['queued', 'running'] } }),
      service.entities.AgentTask.count({ created_date: { $gte: weekAgo } }),
      service.entities.AgentTask.count({ status: 'failed', created_date: { $gte: dayAgo } }),
      service.entities.UsageRecord.aggregate({ query: {}, sum: ['units'] }),
      service.entities.UsageRecord.aggregate({
        query: { created_date: { $gte: monthStart } },
        sum: ['units'],
      }),
      service.entities.UsageRecord.aggregate({ query: {}, groupBy: 'kind', sum: ['units'] }),
      service.entities.UsageRecord.count({}),
      service.entities.UsageRecord.aggregate({ query: {}, groupBy: 'model', sum: ['units'] }),
      service.entities.AgentTask.aggregate({
        query: { created_date: { $gte: monthStart } },
        groupBy: 'organization_id',
      }),
      service.entities.UsageRecord.count({ input_tokens: { $exists: true } }),
    ]);

    const users = settledList(settled[0]);
    const organizations = settledList(settled[1]);
    const agents = settledList(settled[2]);

    const orgById = new Map(organizations.map((org) => [org.id, org]));

    const classification = {
      customer: { workspaces: 0, agents: 0, accounts: 0 },
      internal: { workspaces: 0, agents: 0, accounts: 0 },
      test: { workspaces: 0, agents: 0, accounts: 0 },
    };
    for (const org of organizations) classification[dataClassOf(org)].workspaces += 1;
    for (const agent of agents) {
      classification[dataClassOf(orgById.get(agent.organization_id))].agents += 1;
    }
    for (const account of users) {
      const classes = new Set(
        (account.organization_ids || []).map((id) => dataClassOf(orgById.get(id)))
      );
      if (classes.has('customer')) classification.customer.accounts += 1;
      else if (classes.has('internal')) classification.internal.accounts += 1;
      else classification.test.accounts += 1;
    }

    const agentStatus = { active: 0, paused: 0, draft: 0 };
    let withWorkflow = 0;
    let activeWithoutWorkflow = 0;
    for (const agent of agents) {
      const status = agentStatus[agent.status] === undefined ? 'draft' : agent.status;
      agentStatus[status] += 1;
      const hasGraph = Boolean(agent.workflow_graph);
      if (hasGraph) withWorkflow += 1;
      if (agent.status === 'active' && !hasGraph) activeWithoutWorkflow += 1;
    }

    const tasksTotal = settledCount(settled[3]);
    const succeeded = settledCount(settled[4]);
    const failed = settledCount(settled[5]);
    const cancelled = settledCount(settled[6]);
    const awaitingApproval = settledCount(settled[7]);
    const inFlight = settledCount(settled[8]);
    const failedLast24h = settledCount(settled[10]);

    const byKind = settledRows(settled[13])
      .map((row) => ({
        key: row.kind || 'unknown',
        label: String(row.kind || 'unknown').replace(/_/g, ' '),
        units: round(row.sum_units),
        events: row.count || 0,
      }))
      .sort((a, b) => b.units - a.units);

    const byModel = settledRows(settled[15])
      .map((row) => ({
        model: row.model || 'not recorded',
        units: round(row.sum_units),
        events: row.count || 0,
      }))
      .sort((a, b) => b.units - a.units);

    const rates = pricedModels();
    const tokensCaptured = settledCount(settled[17]);

    const alerts = [];
    if (failedLast24h > 0) {
      alerts.push({
        key: 'failed_runs',
        level: 'critical',
        title: `${failedLast24h} failed run${failedLast24h === 1 ? '' : 's'} in the last 24 hours`,
        detail: 'Open the execution monitor to read the failure reasons.',
        href: '/admin/runs?status=failed',
      });
    }
    if (awaitingApproval > 0) {
      alerts.push({
        key: 'awaiting_approval',
        level: 'warning',
        title: `${awaitingApproval} run${awaitingApproval === 1 ? '' : 's'} waiting for a human decision`,
        detail: 'These executions are paused on an approval step.',
        href: '/admin/runs?status=awaiting_approval',
      });
    }
    if (activeWithoutWorkflow > 0) {
      alerts.push({
        key: 'agents_without_workflow',
        level: 'warning',
        title: `${activeWithoutWorkflow} active agent${activeWithoutWorkflow === 1 ? '' : 's'} without an executable workflow`,
        detail: 'They cannot run until a workflow exists.',
        href: '/admin/agents?workflow=missing',
      });
    }

    for (const row of settledRows(settled[16])) {
      const org = orgById.get(row.organization_id);
      if (!org) continue;
      const limit = Number(org.task_limit_month) || 0;
      const used = Number(row.count) || 0;
      if (limit > 0 && used / limit >= 0.8) {
        alerts.push({
          key: `limit_${org.id}`,
          level: used >= limit ? 'critical' : 'warning',
          title: `${org.name || 'A workspace'} has used ${used} of ${limit} monthly runs`,
          detail: 'The workspace is at or near its plan limit.',
          href: '/admin/customers',
        });
      }
    }

    return Response.json({
      generatedAt: new Date().toISOString(),
      customers: {
        productionWorkspaces: classification.customer.workspaces,
        accounts: classification.customer.accounts,
        note:
          classification.customer.workspaces === 0
            ? 'No customer workspace is marked as production yet.'
            : null,
      },
      workspaces: {
        total: organizations.length,
        byClass: {
          customer: classification.customer.workspaces,
          internal: classification.internal.workspaces,
          test: classification.test.workspaces,
        },
        byPlan: ['starter', 'growth', 'scale'].map((plan) => ({
          plan,
          count: organizations.filter((org) => (org.plan || 'starter') === plan).length,
        })),
        suspended: organizations.filter((org) => org.status === 'suspended').length,
      },
      users: {
        total: users.length,
        admins: users.filter((account) => account.role === 'admin').length,
        members: users.filter((account) => account.role !== 'admin').length,
        verified: users.filter((account) => account.is_verified).length,
      },
      agents: {
        total: agents.length,
        ...agentStatus,
        withWorkflow,
        withoutWorkflow: agents.length - withWorkflow,
        activeWithoutWorkflow,
      },
      runs: {
        total: tasksTotal,
        succeeded,
        failed,
        cancelled,
        awaitingApproval,
        inFlight,
        last7Days: settledCount(settled[9]),
        failedLast24h,
        successRate: percent(succeeded, succeeded + failed),
      },
      usage: {
        totalUnits: round(sumRows(settledRows(settled[11]))),
        monthUnits: round(sumRows(settledRows(settled[12]))),
        totalEvents: settledCount(settled[14]),
        byKind,
        byModel,
        tokensCaptured,
      },
      cost: {
        rateConfigured: rates.length > 0,
        pricedModels: rates,
        currency: 'usd',
        estimatedMonthCost: null,
        note:
          rates.length > 0
            ? 'Cost is estimated from captured tokens at verified rates.'
            : 'No Rate Configured',
      },
      classification,
      alerts,
    });
  } catch (error) {
    return adminFailure('adminOverview', error, 'The platform overview could not be loaded.');
  }
}