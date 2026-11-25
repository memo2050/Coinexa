import { useEffect, useState } from 'react';
import { BadgeCheck } from 'lucide-react';
import { base44 } from '@/api/base44Client';

// Individual agent hiring, as the server reports it (agentBilling overview).
//
// An agent is "Hired" only while it has its own hire record, which the server writes
// after Stripe confirms payment for that one agent. Nothing here decides it in the
// browser. Featured agents (Recruitment, Cyber Security Scan) are hired per workspace.

// Subtle red glow around a hired agent's card or icon.
export const HIRED_GLOW = 'ring-1 ring-red-500/35 shadow-[0_0_28px_-6px_rgba(239,68,68,0.55)]';

export function HiredBadge({ className = '' }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-0.5 text-[0.68rem] font-semibold text-emerald-300 ${className}`}
      title="Payment confirmed"
    >
      <BadgeCheck className="h-3 w-3" aria-hidden="true" />
      Hired
    </span>
  );
}

let cache = { at: 0, promise: null };
const listeners = new Set();

function load(force = false) {
  if (!force && cache.promise && Date.now() - cache.at < 30000) return cache.promise;
  cache = {
    at: Date.now(),
    promise: base44.functions
      .invoke('agentBilling', { action: 'overview' })
      .then((r) => r?.data || null)
      .catch(() => null),
  };
  cache.promise.then((data) => listeners.forEach((fn) => fn(data)));
  return cache.promise;
}

export const refreshBilling = () => load(true);

export const planKeyOf = (agent) => agent?.catalog_key || 'custom';
export const featuredSubject = (key) => `featured:${key}`;

// Billing state for the signed-in user's workspace, with helpers per agent.
export function useAgentBilling() {
  const [data, setData] = useState(cache.promise ? undefined : null);
  useEffect(() => {
    let alive = true;
    const set = (d) => alive && setData(d);
    listeners.add(set);
    load().then(set);
    const onFocus = () => load(true);
    window.addEventListener('focus', onFocus);
    return () => {
      alive = false;
      listeners.delete(set);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const plans = new Map((data?.plans || []).map((p) => [p.key, p]));
  const hireOf = (subject) => (data?.hires || []).find((h) => h.subject === subject) || null;
  const usageOf = (subject, kind) => (data?.usage || []).filter((u) => u.subject === subject && (!kind || u.kind === kind))
    .sort((a, b) => Date.parse(b.period_start) - Date.parse(a.period_start))[0] || null;

  const stateFor = (subject, planKey) => {
    const plan = plans.get(planKey) || null;
    const hire = hireOf(subject);
    const meter = plan ? Object.keys(plan.meters || {})[0] : 'unit';
    const usage = usageOf(subject, hire ? 'hire' : 'trial');
    const used = Number(usage?.used?.[meter] || 0);
    const allowance = hire ? Number(plan?.meters?.[meter] || 0) : Number(plan?.trial?.[meter] || 0);
    return { plan, hire, hired: Boolean(hire), meter, used, allowance, left: Math.max(0, allowance - used), unitLabel: plan?.unit_label || 'tasks' };
  };

  return {
    ready: data !== undefined,
    data,
    exempt: Boolean(data?.exempt),
    canManage: Boolean(data?.can_manage),
    paymentsReady: Boolean(data?.payments_ready),
    forAgent: (agent) => stateFor(agent?.id, planKeyOf(agent)),
    forFeatured: (key) => stateFor(featuredSubject(key), key),
    isHired: (agent) => Boolean(agent && hireOf(agent.id)),
    isFeaturedHired: (key) => Boolean(hireOf(featuredSubject(key))),
  };
}

// Kept for existing callers.
export function useHiredWorkspaces() {
  const b = useAgentBilling();
  return { isHired: b.isHired, anyHired: false, isFeaturedHired: b.isFeaturedHired };
}

// Starts hiring: Stripe Checkout for the first agent, or a confirmed line on the
// existing subscription. Returns a short message for the page.
export async function hireAgent({ agentId, featured, name }) {
  const body = agentId ? { action: 'hire', agent_id: agentId } : { action: 'hire', featured };
  let r = (await base44.functions.invoke('agentBilling', body))?.data || {};
  if (r.needs_confirmation) {
    const price = `$${(r.plan.price_cents / 100).toFixed(0)}`;
    const ok = window.confirm(`Hire ${r.agent || name} for ${price}/month?\n\nIt is added to your existing subscription and your card on file is charged now for the rest of this billing period.`);
    if (!ok) return 'Not hired.';
    r = (await base44.functions.invoke('agentBilling', { ...body, confirm: true, confirm_price_cents: r.plan.price_cents }))?.data || {};
  }
  if (r.url) {
    window.location.assign(r.url);
    return 'Opening secure checkout…';
  }
  await refreshBilling();
  return r.hired ? `${name} is hired.` : `Payment received; ${name} activates as soon as Stripe confirms it.`;
}

export async function cancelHire({ agentId, featured }) {
  const r = (await base44.functions.invoke('agentBilling', agentId ? { action: 'cancel', agent_id: agentId } : { action: 'cancel', featured }))?.data || {};
  await refreshBilling();
  return r.usable_until ? `Cancelled. It stays available until ${String(r.usable_until).slice(0, 10)}.` : 'Cancelled.';
}

export const errorMessage = (e) => e?.response?.data?.error || e?.data?.error || e?.message || 'Something went wrong.';
