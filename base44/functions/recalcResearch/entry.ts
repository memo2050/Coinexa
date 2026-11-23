import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { computeProfit, computeScore } from '../../shared/researchEngine.ts';
import { consumeModelQuota } from '../../shared/rateLimits.ts';

const toNumber = (value) => {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
};

/**
 * Server-side profit and score recalculation. The UI calls this whenever the owner
 * edits an expense assumption, so the numbers on screen always come from the same
 * engine that writes the Excel export — never from the browser or the model.
 */
export default async function (req) {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth
    .me()
    .catch((error) => (error.status === 401 ? null : Promise.reject(error)));
  if (!user) return Response.json({ error: 'Please sign in.' }, { status: 401 });

  const quota = await consumeModelQuota({
    base44,
    user,
    kind: 'research_recalc',
    organizationId: '',
  });
  if (!quota.ok) return Response.json({ error: quota.message }, { status: 429 });

  const body = await req.json().catch(() => ({}));

  const rawAssumptions = body.assumptions && typeof body.assumptions === 'object' ? body.assumptions : {};
  const assumptions = { currency: 'EGP' };
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

  const sellingPrice = toNumber(body.selling_price);
  const supplierCost = toNumber(body.supplier_cost);

  const profit = computeProfit({
    selling_price: sellingPrice,
    supplier_cost: supplierCost,
    assumptions,
    cost_status: body.cost_status,
  });

  const product = body.product && typeof body.product === 'object' ? body.product : null;
  if (!product) return Response.json({ profit });

  const score = computeScore(product, profit);
  return Response.json({ profit, score });
}