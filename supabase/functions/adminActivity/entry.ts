import { adminContext, adminFailure } from '../_shared/adminGuard.ts';
import { daysAgoIso, settledList } from '../_shared/adminData.ts';

// Administrative activity log and the live alert feed, both built from records
// the platform already writes: audit entries and agent runs.
export default async function (req) {
  const ctx = await adminContext(req);
  if (ctx.response) return ctx.response;

  try {
    const { service } = ctx;
    const body = await req.json().catch(() => ({}));

    const days = Number(body.days) || 30;
    const limit = Math.min(Math.max(Number(body.limit) || 60, 1), 200);
    const query = { created_date: { $gte: daysAgoIso(days) } };
    if (body.action) query.action = String(body.action);
    if (body.organization_id) query.organization_id = String(body.organization_id);

    const settled = await Promise.allSettled([
      service.entities.AuditLog.filter(query, { sort: '-created_date', limit }),
      service.entities.Organization.list(),
      service.entities.AgentTask.count({ status: 'failed', created_date: { $gte: daysAgoIso(days) } }),
      service.entities.AgentTask.count({ status: 'awaiting_approval' }),
      service.entities.AgentTask.filter(
        { status: 'failed', created_date: { $gte: daysAgoIso(days) } },
        { sort: '-created_date', limit: 10 }
      ),
      service.entities.AuditLog.list({ sort: '-created_date', limit: 200 }),
    ]);

    const entries = settledList(settled[0]);
    const organizations = settledList(settled[1]);
    const orgNames = new Map(organizations.map((org) => [org.id, org.name || 'Untitled workspace']));

    const failedRuns = settledList(settled[4]);
    const awaiting = Number(settled[3].status === 'fulfilled' ? settled[3].value : 0) || 0;
    const failedCount =
      Number(settled[2].status === 'fulfilled' ? settled[2].value : 0) || 0;

    const alerts = [];
    if (failedCount > 0) {
      alerts.push({
        key: 'failed_runs',
        level: 'critical',
        title: `${failedCount} failed run${failedCount === 1 ? '' : 's'} in the last ${days} days`,
        detail: 'Open the execution monitor for the failure reasons.',
        href: '/admin/runs?status=failed',
        at: failedRuns[0]?.finished_at || failedRuns[0]?.created_date || null,
      });
    }
    if (awaiting > 0) {
      alerts.push({
        key: 'awaiting_approval',
        level: 'warning',
        title: `${awaiting} run${awaiting === 1 ? '' : 's'} paused on an approval step`,
        detail: 'A human decision is needed before these can continue.',
        href: '/admin/runs?status=awaiting_approval',
        at: null,
      });
    }

    const actionCounts = new Map();
    for (const entry of settledList(settled[5])) {
      const key = entry.action || 'unknown';
      actionCounts.set(key, (actionCounts.get(key) || 0) + 1);
    }

    return Response.json({
      generatedAt: new Date().toISOString(),
      windowDays: days,
      alerts,
      entries: entries.map((entry) => ({
        id: entry.id,
        action: entry.action || 'unknown',
        detail: entry.detail || '',
        actor_email: entry.actor_email || 'system',
        actor_id: entry.actor_id || '',
        organization: orgNames.get(entry.organization_id) || 'Unassigned',
        organization_id: entry.organization_id || '',
        target_type: entry.target_type || '',
        target_id: entry.target_id || '',
        at: entry.created_date || null,
      })),
      actions: [...actionCounts.entries()]
        .map(([action, count]) => ({ action, count }))
        .sort((a, b) => b.count - a.count),
      failedRuns: failedRuns.map((run) => ({
        id: run.id,
        agent_name: run.agent_name || 'Agent',
        error: run.error || '',
        at: run.finished_at || run.created_date || null,
      })),
    });
  } catch (error) {
    return adminFailure('adminActivity', error, 'Administrative activity could not be loaded.');
  }
}