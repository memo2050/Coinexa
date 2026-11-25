import { createClientFromRequest } from '../_shared/base44shim.ts';
import {
  STATUS,
  SUPPLIERS,
  buildResearchPrompt,
  normalizeProduct,
  reportToMarkdown,
  RESEARCH_SCHEMA,
  isHttpUrl,
} from '../_shared/researchEngine.ts';
import { consumeModelQuota } from '../_shared/rateLimits.ts';
import { ensureOrganization } from '../_shared/tenancy.ts';
import { service as serviceClient } from '../_shared/base44shim.ts';
import { reserve as reserveUsage, planOf, planRow, featuredSubject } from '../_shared/agentBilling.ts';

const clean = (value, max = 400) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const toNumber = (value) => {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
};

const CONFIDENCE_ORDER = [
  STATUS.VERIFIED,
  STATUS.PARTIALLY_VERIFIED,
  STATUS.ESTIMATED,
  STATUS.UNVERIFIED,
  STATUS.UNAVAILABLE,
];

export default async function (req) {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth
    .me()
    .catch((error) => (error.status === 401 ? null : Promise.reject(error)));
  if (!user) return Response.json({ error: 'Please sign in to run research.' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const query = clean(body.query, 300);
  if (query.length < 3) {
    return Response.json({ error: 'Describe the product or category to research.' }, { status: 400 });
  }

  const requestedSuppliers = Array.isArray(body.suppliers)
    ? body.suppliers
        .map((item) => clean(item, 30).toLowerCase())
        .filter((item) => SUPPLIERS.some((supplier) => supplier.key === item))
    : [];
  const supplierKeys = requestedSuppliers.length
    ? requestedSuppliers
    : SUPPLIERS.map((supplier) => supplier.key);
  const supplierNames = supplierKeys.map(
    (key) => SUPPLIERS.find((supplier) => supplier.key === key)?.name
  );

  const maxProducts = Math.min(5, Math.max(1, Math.round(toNumber(body.max_products) ?? 3)));
  const sellingPrice = toNumber(body.selling_price);
  const market = clean(body.market, 60) || 'Egypt';

  const rawAssumptions = body.assumptions && typeof body.assumptions === 'object' ? body.assumptions : {};
  const assumptions = {};
  for (const key of [
    'shipping_cost',
    'advertising_cost',
    'payment_fee_percent',
    'packaging_cost',
    'return_rate_percent',
    'other_cost',
  ]) {
    const value = toNumber(rawAssumptions[key]);
    if (value !== null) assumptions[key] = Math.max(0, Math.min(100000, value));
  }
  assumptions.currency = 'EGP';

  const agentId = clean(body.agent_id, 80);
  let agent = null;
  if (agentId) {
    agent = await base44.entities.Agent.get(agentId).catch((error) =>
      error.status === 404 || error.status === 403 ? null : Promise.reject(error)
    );
    if (agent && agent.created_by_id !== user.id && user.role !== 'admin') {
      return Response.json({ error: 'You do not have access to this agent.' }, { status: 403 });
    }
  }

  const quota = await consumeModelQuota({
    base44,
    user,
    kind: 'research_run',
    organizationId: agent?.organization_id || '',
  });
  if (!quota.ok) return Response.json({ error: quota.message }, { status: 429 });

  // One research report = one unit of the agent's allowance (Hazel: 60 a month).
  // Research run outside an agent counts against the workspace's research plan.
  const { organization: researchOrg } = await ensureOrganization({ base44, user });
  const researchPlan = agent ? planOf(agent) : 'hazel';
  const lease = await reserveUsage(serviceClient(), {
    organizationId: agent?.organization_id || researchOrg?.id, subject: agent?.id || featuredSubject('hazel'),
    plan: researchPlan, planRow: await planRow(serviceClient(), researchPlan),
  });
  if (!lease.ok) return Response.json({ error: lease.message, billing: lease.info || null }, { status: lease.status || 429 });

  const startedAt = Date.now();

  try {
    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: buildResearchPrompt({
        query,
        suppliers: supplierNames,
        market,
        maxProducts,
        assumptions,
      }),
      model: 'gemini_3_8_flash',
      add_context_from_internet: true,
      response_json_schema: RESEARCH_SCHEMA,
    });

    const data =
      typeof result === 'string'
        ? (() => {
            try {
              return JSON.parse(result);
            } catch {
              return {};
            }
          })()
        : result || {};

    const sources = (Array.isArray(data.sources) ? data.sources : [])
      .filter((source) => isHttpUrl(source?.url))
      .map((source) => ({
        label: clean(source.label, 200) || clean(source.url, 300),
        url: source.url.trim(),
        kind: clean(source.kind, 40) || 'source',
      }))
      .slice(0, 40);

    const rawProducts = Array.isArray(data.products) ? data.products.slice(0, maxProducts * 3) : [];
    const products = rawProducts
      .map((raw) =>
        normalizeProduct(raw, { sources, assumptions, selling_price: sellingPrice, currency: 'EGP' })
      )
      .filter((product) => product.name !== 'Untitled product')
      .sort((a, b) => b.score.total - a.score.total)
      .slice(0, maxProducts);

    const limitations = (Array.isArray(data.limitations) ? data.limitations : [])
      .map((item) => clean(item, 600))
      .filter(Boolean)
      .slice(0, 8);

    const unverifiedLinks = products.filter((product) => product.supplier_url_status !== STATUS.VERIFIED);
    if (unverifiedLinks.length) {
      limitations.push(
        `${unverifiedLinks.length} product(s) were returned without a supplier link that checks out against the cited sources — those links are marked UNVERIFIED and are not used as evidence.`
      );
    }
    if (!products.length) {
      limitations.push(
        'No product could be verified against a supplier page for this request, so nothing was returned rather than padding the report.'
      );
    }

    const confidenceOfProducts = products.map((product) => product.confidence);
    const overall =
      confidenceOfProducts.length === 0
        ? STATUS.UNAVAILABLE
        : CONFIDENCE_ORDER[Math.max(...confidenceOfProducts.map((value) => CONFIDENCE_ORDER.indexOf(value)))];

    const report = await base44.entities.ResearchReport.create({
      query,
      market,
      suppliers: supplierNames,
      assumptions,
      products,
      product_count: products.length,
      overall_confidence: overall,
      sources,
      limitations,
      summary: clean(data.summary, 1200),
      researched_at: new Date().toISOString(),
      agent_id: agent?.id || '',
    });

    if (agent) {
      try {
        await base44.entities.AgentTask.create({
          agent_id: agent.id,
          agent_name: agent.name,
          task: `Structured product research: ${query}`,
          output: reportToMarkdown(report),
          status: 'succeeded',
          started_at: new Date(startedAt).toISOString(),
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - startedAt,
        });
        await base44.entities.Agent.update(agent.id, {
          last_run_status: 'succeeded',
          last_run_at: new Date().toISOString(),
        });
      } catch (logError) {
        console.error('productResearch: could not log the run', logError?.message);
      }
    }

    return Response.json({ report });
  } catch (error) {
    console.error('productResearch failed', error);
    await lease.release();
    const message =
      error?.status === 429
        ? 'The research service is rate limited right now. Try again in a moment.'
        : error?.message || 'Research failed before a report was produced.';
    return Response.json({ error: message }, { status: 502 });
  }
}