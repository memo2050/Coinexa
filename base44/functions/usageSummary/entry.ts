import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// Consumption dashboard feed: one admin-only call returns every total the
// usage page needs, aggregated on the server so the browser never pages
// through UsageRecord to add numbers up.

const round = (value) => Math.round((Number(value) || 0) * 100) / 100;

const monthKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

const monthLabel = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
};

const rows = (settled) => (settled.status === 'fulfilled' ? settled.value?.rows || [] : []);

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth
      .me()
      .catch((error) => (error.status === 401 ? null : Promise.reject(error)));
    if (!user) return Response.json({ error: 'Please sign in to view usage.' }, { status: 401 });
    if (user.role !== 'admin') {
      return Response.json({ error: 'Only administrators can view workspace usage.' }, { status: 403 });
    }

    const service = base44.asServiceRole;

    const [byAgentResult, byOrgResult, byKindResult, byMonthResult] = await Promise.allSettled([
      service.entities.UsageRecord.aggregate({ query: {}, groupBy: 'agent_id', sum: ['units'] }),
      service.entities.UsageRecord.aggregate({ query: {}, groupBy: 'organization_id', sum: ['units'] }),
      service.entities.UsageRecord.aggregate({ query: {}, groupBy: 'kind', sum: ['units'] }),
      service.entities.UsageRecord.aggregate({
        query: {},
        dateBucket: { field: 'created_date', unit: 'month' },
        sum: ['units'],
      }),
    ]);

    const [agentsResult, organizationsResult] = await Promise.allSettled([
      service.entities.Agent.filter({}, { limit: 300 }),
      service.entities.Organization.filter({}, { limit: 200 }),
    ]);

    const agentNames = new Map(
      (agentsResult.status === 'fulfilled' ? agentsResult.value?.items || [] : []).map((agent) => [
        agent.id,
        agent.name || 'Untitled agent',
      ])
    );
    const orgNames = new Map(
      (organizationsResult.status === 'fulfilled'
        ? organizationsResult.value?.items || []
        : []
      ).map((org) => [org.id, org.name || 'Untitled workspace'])
    );

    const byKind = rows(byKindResult)
      .map((row) => ({
        key: row.kind || 'unknown',
        label: (row.kind || 'unknown').replace(/_/g, ' '),
        units: round(row.sum_units),
        events: row.count || 0,
      }))
      .sort((a, b) => b.units - a.units);

    const totalUnits = byKind.reduce((sum, row) => sum + row.units, 0);
    const totalEvents = byKind.reduce((sum, row) => sum + row.events, 0);

    const byAgent = rows(byAgentResult)
      .map((row) => ({
        key: row.agent_id || 'none',
        label: row.agent_id ? agentNames.get(row.agent_id) || 'Removed agent' : 'No agent (chat & generation)',
        units: round(row.sum_units),
        events: row.count || 0,
      }))
      .sort((a, b) => b.units - a.units);

    const byOrganization = rows(byOrgResult)
      .map((row) => ({
        key: row.organization_id || 'none',
        label: row.organization_id
          ? orgNames.get(row.organization_id) || 'Removed workspace'
          : 'No workspace',
        units: round(row.sum_units),
        events: row.count || 0,
      }))
      .sort((a, b) => b.units - a.units);

    const byMonth = rows(byMonthResult)
      .map((row) => ({
        key: monthKey(row.created_date),
        label: monthLabel(row.created_date),
        units: round(row.sum_units),
        events: row.count || 0,
      }))
      .sort((a, b) => (a.key < b.key ? -1 : 1));

    const currentMonthKey = monthKey(new Date().toISOString());
    const currentMonth = byMonth.find((month) => month.key === currentMonthKey) || {
      units: 0,
      events: 0,
    };

    return Response.json({
      totals: { units: round(totalUnits), events: totalEvents },
      currentMonth: { units: round(currentMonth.units), events: currentMonth.events },
      byKind,
      byAgent,
      byOrganization,
      byMonth,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('usageSummary failed', error?.message);
    return Response.json({ error: 'Usage could not be summarised right now.' }, { status: 500 });
  }
}