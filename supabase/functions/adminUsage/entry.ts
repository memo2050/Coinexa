import { adminContext, adminFailure } from '../_shared/adminGuard.ts';
import {
  dataClassOf,
  daysAgoIso,
  monthKey,
  monthLabel,
  round,
  settledList,
  settledRows,
  settledValue,
  sumRows,
} from '../_shared/adminData.ts';
import { pricedModels, rateFor, estimateCost } from '../_shared/modelPricing.ts';

// Metered usage and cost. Only verified model rates produce a cost figure;
// anything else is returned as null so the interface shows "No Rate Configured"
// instead of an invented number.
export default async function (req) {
  const ctx = await adminContext(req);
  if (ctx.response) return ctx.response;

  try {
    const { service } = ctx;
    const body = await req.json().catch(() => ({}));

    const query = {};
    const days = Number(body.days) || 0;
    if (days > 0) query.created_date = { $gte: daysAgoIso(days) };
    if (body.organization_id) query.organization_id = String(body.organization_id);
    if (body.agent_id) query.agent_id = String(body.agent_id);

    const settled = await Promise.allSettled([
      service.entities.UsageRecord.aggregate({ query, sum: ['units'] }),
      service.entities.UsageRecord.count(query),
      service.entities.UsageRecord.aggregate({ query, groupBy: 'kind', sum: ['units'] }),
      service.entities.UsageRecord.aggregate({ query, groupBy: 'agent_id', sum: ['units'] }),
      service.entities.UsageRecord.aggregate({ query, groupBy: 'organization_id', sum: ['units'] }),
      service.entities.UsageRecord.aggregate({ query, groupBy: 'model', sum: ['units'] }),
      service.entities.UsageRecord.aggregate({
        query,
        dateBucket: { field: 'created_date', unit: 'month' },
        sum: ['units'],
      }),
      service.entities.UsageRecord.count({ ...query, input_tokens: { $exists: true } }),
      service.entities.Agent.list({ limit: 500 }),
      service.entities.Organization.list(),
    ]);

    const agentNames = new Map(
      settledList(settled[8]).map((agent) => [agent.id, agent.name || 'Untitled agent'])
    );
    const orgNames = new Map(
      settledList(settled[9]).map((org) => [org.id, org.name || 'Untitled workspace'])
    );

    const byKind = settledRows(settled[2])
      .map((row) => ({
        key: row.kind || 'unknown',
        label: String(row.kind || 'unknown').replace(/_/g, ' '),
        units: round(row.sum_units),
        events: row.count || 0,
      }))
      .sort((a, b) => b.units - a.units);

    const byAgent = settledRows(settled[3])
      .map((row) => ({
        key: row.agent_id || 'none',
        label: row.agent_id ? agentNames.get(row.agent_id) || 'Removed agent' : 'No agent',
        units: round(row.sum_units),
        events: row.count || 0,
      }))
      .sort((a, b) => b.units - a.units);

    const byOrganization = settledRows(settled[4])
      .map((row) => ({
        key: row.organization_id || 'none',
        label: row.organization_id
          ? orgNames.get(row.organization_id) || 'Removed workspace'
          : 'No workspace',
        units: round(row.sum_units),
        events: row.count || 0,
      }))
      .sort((a, b) => b.units - a.units);

    const orgById = new Map(settledList(settled[9]).map((org) => [org.id, org]));
    const usageByClass = { customer: 0, internal: 0, test: 0 };
    for (const row of byOrganization) {
      const dataClass = row.key === 'none' ? 'test' : dataClassOf(orgById.get(row.key));
      usageByClass[dataClass] += row.units;
    }

    const byModel = settledRows(settled[5])
      .map((row) => ({
        model: row.model || 'not recorded',
        units: round(row.sum_units),
        events: row.count || 0,
        priced: Boolean(rateFor(row.model)),
      }))
      .sort((a, b) => b.units - a.units);

    const byMonth = settledRows(settled[6])
      .map((row) => ({
        key: monthKey(row.created_date),
        label: monthLabel(row.created_date),
        units: round(row.sum_units),
        events: row.count || 0,
      }))
      .sort((a, b) => (a.key < b.key ? -1 : 1));

    const rates = pricedModels();
    const tokensCaptured = Number(settledValue(settled[7], 0)) || 0;

    // Cost can only be produced per record, so it is only calculated when at
    // least one model has a verified rate.
    let estimatedCost = null;
    if (rates.length > 0) {
      const records = await service.entities.UsageRecord.filter(query, { limit: 500 });
      let total = 0;
      for (const record of records.items || []) {
        const cost = estimateCost({
          model: record.model,
          inputTokens: record.input_tokens,
          outputTokens: record.output_tokens,
        });
        if (cost !== null) total += cost;
      }
      estimatedCost = round(total, 4);
    }

    return Response.json({
      generatedAt: new Date().toISOString(),
      filters: { days, organization_id: body.organization_id || null, agent_id: body.agent_id || null },
      totals: {
        units: round(sumRows(settledRows(settled[0]))),
        events: Number(settled[1].status === 'fulfilled' ? settled[1].value : 0) || 0,
      },
      classification: {
        units: usageByClass,
        productionIsZero: usageByClass.customer === 0,
        note:
          usageByClass.customer === 0
            ? 'All metered activity belongs to internal or test workspaces. No customer usage exists yet.'
            : null,
      },
      tokens: {
        capturedRecords: tokensCaptured,
        captured: tokensCaptured > 0,
        note:
          tokensCaptured > 0
            ? 'Token counts are captured for these records.'
            : 'The AI integration does not return token counts, so none are recorded.',
      },
      cost: {
        rateConfigured: rates.length > 0,
        pricedModels: rates,
        currency: 'usd',
        estimated: estimatedCost,
        note: rates.length > 0 ? 'Estimated from captured tokens.' : 'No Rate Configured',
      },
      byKind,
      byAgent,
      byOrganization,
      byModel,
      byMonth,
    });
  } catch (error) {
    return adminFailure('adminUsage', error, 'Usage and cost could not be loaded.');
  }
}