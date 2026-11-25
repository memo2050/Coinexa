// Per-agent usage allowances and AI cost protection, shared by every billable action.
//
// Each billable action reserves one unit BEFORE it starts (atomic in the database, so
// parallel requests cannot overshoot), and gives it back if the action fails. While the
// action runs, the reserved usage period is put on the request context so the AI
// gateway can refuse calls past the period's cost cap and add every call's cost to it.
//
// Rules (database functions billing_reserve / billing_current):
//   - a hired agent uses its plan's monthly allowance for the current billing period;
//   - an unhired agent gets a one-off free trial allowance, then must be hired;
//   - the owner's internal workspace and workspaces on a legacy workspace plan are not metered;
//   - AGENT_BILLING=off switches metering off entirely (default: enforce).
import { requestContext } from './context.ts';

type Row = Record<string, any>;
type Service = { rpc: (fn: string, args: Row) => PromiseLike<{ data: any; error: any }> };

export const billingEnabled = () => (Deno.env.get('AGENT_BILLING') || 'enforce') !== 'off';

// Which plan an agent belongs to: its catalog key, or the custom-agent plan.
export const planOf = (agent: Row) => (typeof agent?.catalog_key === 'string' && agent.catalog_key) || 'custom';
export const featuredSubject = (plan: string) => `featured:${plan}`;

export type Lease = {
  ok: boolean;
  exempt?: boolean;
  status?: number;
  message?: string;
  info?: Row;
  release: () => Promise<void>;
};

const NOOP: Lease = { ok: true, exempt: true, release: async () => {} };

const dateText = (iso: string) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) && d.getUTCFullYear() < 9000 ? d.toISOString().slice(0, 10) : '';
};

// Customer-facing explanation for a refused reservation.
export function refusalMessage(r: Row, plan: Row | null, unitLabel = 'tasks') {
  const label = plan?.unit_label || unitLabel;
  const price = plan ? `$${(plan.price_cents / 100).toFixed(0)}/month` : '';
  if (r.reason === 'trial_over') {
    return { status: 402, message: `The free trial for this agent is used up. Hire it${price ? ` for ${price}` : ''} to keep using it.` };
  }
  if (r.reason === 'limit') {
    const when = dateText(r.period_end);
    return { status: 429, message: `This agent has used its ${r.allowance} ${label} for this billing period.${when ? ` It resets on ${when}.` : ''}` };
  }
  if (r.reason === 'cost_cap') {
    const when = dateText(r.period_end);
    return { status: 429, message: `This agent has reached its monthly processing limit.${when ? ` It resumes on ${when}.` : ''} Contact support if this keeps happening.` };
  }
  return { status: 403, message: 'This agent is not available on your workspace.' };
}

function attach(usageId: string | null) {
  const ctx = requestContext.getStore() as Row | undefined;
  if (ctx) ctx.billingUsageId = usageId;
}

// Reserve `units` of `meter` for a subject (an agent id, or featured:<plan>).
export async function reserve(service: Service, opts: { organizationId: string; subject: string; plan: string; meter?: string; units?: number; planRow?: Row | null }): Promise<Lease> {
  if (!billingEnabled() || !opts.organizationId) return NOOP;
  const meter = opts.meter || 'unit';
  const units = opts.units || 1;
  const { data, error } = await service.rpc('billing_reserve', {
    p_org: opts.organizationId, p_subject: opts.subject, p_plan: opts.plan, p_meter: meter, p_units: units,
  });
  if (error) {
    console.error('billing: reserve failed', error.message);
    return { ok: false, status: 503, message: 'Usage could not be checked, so nothing was run. Please try again.', release: async () => {} };
  }
  const r = (data || {}) as Row;
  if (r.exempt) {
    attach(null);
    return NOOP;
  }
  if (!r.ok) {
    const plan = opts.planRow ?? null;
    const { status, message } = refusalMessage(r, plan);
    return { ok: false, status, message, info: r, release: async () => {} };
  }
  attach(r.usage_id);
  let released = false;
  return {
    ok: true,
    info: r,
    release: async () => {
      if (released) return;
      released = true;
      const { error: e } = await service.rpc('billing_release', { p_usage: r.usage_id, p_meter: meter, p_units: units });
      if (e) console.error('billing: release failed', e.message);
    },
  };
}

// Attach follow-on AI cost to a subject's current period without taking a unit.
export async function attachCurrent(service: Service, opts: { organizationId: string; subject: string; plan: string }) {
  if (!billingEnabled() || !opts.organizationId) return;
  const { data, error } = await service.rpc('billing_current', { p_org: opts.organizationId, p_subject: opts.subject, p_plan: opts.plan });
  if (error) {
    console.error('billing: current period lookup failed', error.message);
    return;
  }
  attach(data?.exempt ? null : data?.usage_id || null);
}

// Plan row (price, unit label) for messages; failures only cost a nicer message.
export async function planRow(service: { from: (t: string) => any }, key: string): Promise<Row | null> {
  const { data } = await service.from('agent_plans').select('key, name, price_cents, unit_label, meters').eq('key', key).maybeSingle();
  return data || null;
}

// For the AI gateway: refuse a call once the attached period is over its cost cap, and
// add each call's cost to it afterwards.
export async function underCostCap(service: Service): Promise<boolean> {
  const id = (requestContext.getStore() as Row | undefined)?.billingUsageId;
  if (!id || !billingEnabled()) return true;
  const { data, error } = await service.rpc('billing_under_cap', { p_usage: id });
  if (error) {
    console.error('billing: cost cap check failed', error.message);
    return false; // fail closed: an unchecked call could exceed the cap
  }
  return data !== false;
}

export async function addCost(service: Service, usd: number) {
  const id = (requestContext.getStore() as Row | undefined)?.billingUsageId;
  if (!id || !billingEnabled() || !(usd > 0)) return;
  const { error } = await service.rpc('billing_add_cost', { p_usage: id, p_usd: usd });
  if (error) console.error('billing: cost write failed', error.message);
}
