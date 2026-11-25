// Individual agent hiring through Stripe (one subscription per workspace, one line per
// hired agent). Hires are written ONLY from a Stripe subscription fetched with the
// server's own key, after a signature-verified webhook or right after the server itself
// added a line, never from anything the browser sends.

type Row = Record<string, any>;

export const STRIPE_API = 'https://api.stripe.com/v1';
export const STRIPE_VERSION = '2025-10-29.clover';
export const HIRE_KIND = 'agent_hires';
export const lookupKeyFor = (plan: string) => `coinexa_agent_${plan}_v1`;
export const planFromLookupKey = (key: unknown) => {
  const m = /^coinexa_agent_([a-z0-9-]{2,40})_v1$/.exec(String(key || ''));
  return m ? m[1] : null;
};

function form(params: Row, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object' && !Array.isArray(v)) form(v, key, out);
    else if (Array.isArray(v)) v.forEach((item, i) => (typeof item === 'object' ? form(item, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(item))));
    else out.append(key, String(v));
  }
  return out;
}

export function stripeClient(secretKey: string) {
  if (!/^(sk|rk)_(test|live)_/.test(secretKey || '')) throw Object.assign(new Error('Payments are not set up yet.'), { status: 503 });
  const call = async (method: string, path: string, params?: Row, idempotencyKey?: string) => {
    const headers: Record<string, string> = { Authorization: `Bearer ${secretKey}`, 'Stripe-Version': STRIPE_VERSION };
    let url = `${STRIPE_API}${path}`;
    let body: string | undefined;
    if (params && method === 'GET') url += (url.includes('?') ? '&' : '?') + form(params).toString();
    else if (params) {
      body = form(params).toString();
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(20000) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(json?.error?.message || `Stripe ${res.status}`), { status: res.status >= 500 ? 502 : 409, stripe: json?.error });
    return json;
  };
  return {
    live: secretKey.includes('_live_'),
    get: (path: string, params?: Row) => call('GET', path, params),
    post: (path: string, params: Row, idem?: string) => call('POST', path, params, idem),
    del: (path: string, params?: Row) => call('DELETE', path + (params ? `?${form(params).toString()}` : '')),
  };
}
export type Stripe = ReturnType<typeof stripeClient>;

export async function catalogPrice(stripe: Stripe, plan: Row) {
  const found = await stripe.get('/prices', { 'lookup_keys[]': lookupKeyFor(plan.key), active: 'true', limit: 1 });
  const price = found?.data?.[0];
  if (!price) throw Object.assign(new Error('This agent cannot be hired yet: its price is not set up.'), { status: 503 });
  if (price.unit_amount !== plan.price_cents || price.currency !== (plan.currency || 'usd') || price.recurring?.interval !== 'month') {
    throw Object.assign(new Error('The payment price does not match the published price, so nothing was charged.'), { status: 409 });
  }
  return price;
}

const ts = (secs: unknown) => (Number.isFinite(Number(secs)) && Number(secs) > 0 ? new Date(Number(secs) * 1000).toISOString() : null);

// PURE: turns a Stripe subscription (with items + prices) into the hire rows it implies.
// Lines that are unpaid, unknown, mispriced or for another workspace produce nothing.
export function hiresFromSubscription(sub: Row, plans: Map<string, Row>, now = Date.now()) {
  const meta = sub?.metadata || {};
  if (meta.kind !== HIRE_KIND || !meta.organization_id) return { organizationId: null, hires: [] as Row[], skipped: ['not an agent-hire subscription'] };
  const orgId = String(meta.organization_id);
  const status = String(sub.status || '');
  const hires: Row[] = [];
  const skipped: string[] = [];
  if (status === 'incomplete') return { organizationId: orgId, hires, skipped: ['first payment not completed'] };
  const items: Row[] = sub.items?.data || [];
  items.forEach((item, i) => {
    const price = item.price || {};
    const planKey = item.metadata?.plan_key || planFromLookupKey(price.lookup_key);
    const plan = planKey ? plans.get(planKey) : null;
    const subject = item.metadata?.subject || (i === 0 ? meta.first_subject : null);
    if (!plan || !subject) return skipped.push(`${item.id}: unknown plan or agent`);
    if (planFromLookupKey(price.lookup_key) !== plan.key || price.unit_amount !== plan.price_cents || price.currency !== (plan.currency || 'usd') || price.recurring?.interval !== 'month') {
      return skipped.push(`${item.id}: price does not match the catalog`);
    }
    if (String(subject).startsWith('featured:') && (subject !== `featured:${plan.key}` || !plan.featured)) return skipped.push(`${item.id}: featured plan mismatch`);
    const start = ts(item.current_period_start ?? sub.current_period_start);
    const end = ts(item.current_period_end ?? sub.current_period_end);
    if (!start || !end) return skipped.push(`${item.id}: no billing period`);
    let hireStatus: string;
    let endsAt: string | null = null;
    if (status === 'active' || status === 'trialing') {
      hireStatus = sub.cancel_at_period_end || sub.cancel_at ? 'cancelled' : 'active';
      if (hireStatus === 'cancelled') endsAt = ts(sub.cancel_at) || end;
    } else if (status === 'past_due' || status === 'unpaid') hireStatus = 'past_due';
    else if (status === 'canceled' || status === 'incomplete_expired') {
      hireStatus = 'cancelled';
      endsAt = now < Date.parse(end) && status === 'canceled' ? end : new Date(now).toISOString();
    } else return skipped.push(`${item.id}: subscription ${status}`);
    hires.push({
      organization_id: orgId, subject: String(subject), agent_id: String(subject).startsWith('featured:') ? null : String(subject),
      plan_key: plan.key, status: hireStatus, stripe_subscription_id: sub.id, stripe_item_id: item.id,
      current_period_start: start, current_period_end: end, ends_at: endsAt,
      needs_metadata: !item.metadata?.subject,
    });
  });
  return { organizationId: orgId, hires, skipped };
}

// Applies a subscription to the database (service role). Returns a short result line.
export async function syncSubscription(db: any, stripe: Stripe, subscriptionId: string) {
  const sub = await stripe.get(`/subscriptions/${subscriptionId}`, { 'expand[]': 'items.data.price' });
  const { data: planRows } = await db.from('agent_plans').select('*');
  const plans = new Map<string, Row>((planRows || []).map((p: Row) => [p.key, p]));
  const { organizationId, hires, skipped } = hiresFromSubscription(sub, plans);
  if (!organizationId) return skipped.join('; ');
  const { data: org } = await db.from('organizations').select('id, stripe_customer_id').eq('id', organizationId).maybeSingle();
  if (!org) return 'workspace not found';

  // Agent subjects must belong to this workspace.
  const agentIds = hires.filter((h) => h.agent_id).map((h) => h.agent_id);
  const { data: agents } = agentIds.length ? await db.from('agents').select('id').eq('organization_id', organizationId).in('id', agentIds) : { data: [] };
  const owned = new Set((agents || []).map((a: Row) => a.id));
  const valid = hires.filter((h) => !h.agent_id || owned.has(h.agent_id));
  for (const h of hires) if (!valid.includes(h)) skipped.push(`${h.stripe_item_id}: agent not in this workspace`);

  for (const h of valid) {
    const { needs_metadata, ...row } = h;
    if (needs_metadata) await stripe.post(`/subscription_items/${row.stripe_item_id}`, { metadata: { subject: row.subject, plan_key: row.plan_key, organization_id: organizationId } }).catch(() => null);
    const { data: existing } = await db.from('agent_hires').select('id, status, past_due_since').eq('stripe_item_id', row.stripe_item_id).maybeSingle();
    const pastDueSince = row.status === 'past_due' ? existing?.past_due_since || new Date().toISOString() : null;
    if (existing) {
      const { error } = await db.from('agent_hires').update({ ...row, past_due_since: pastDueSince }).eq('id', existing.id);
      if (error) throw new Error(error.message);
    } else {
      // A new paid line replaces an earlier ended or cancelled hire of the same agent.
      await db.from('agent_hires').update({ status: 'ended' }).eq('organization_id', organizationId).eq('subject', row.subject).neq('stripe_item_id', row.stripe_item_id).in('status', ['cancelled']);
      const { error } = await db.from('agent_hires').insert({ ...row, past_due_since: pastDueSince });
      if (error) throw new Error(error.message);
    }
  }
  // Lines removed from the subscription stay usable until their paid period ends.
  const keep = valid.map((h) => h.stripe_item_id);
  const { data: live } = await db.from('agent_hires').select('id, stripe_item_id, current_period_end').eq('stripe_subscription_id', sub.id).in('status', ['active', 'past_due']);
  for (const h of live || []) {
    if (!keep.includes(h.stripe_item_id)) await db.from('agent_hires').update({ status: 'cancelled', ends_at: h.current_period_end }).eq('id', h.id);
  }
  const subscriptionLive = ['active', 'trialing', 'past_due', 'unpaid'].includes(sub.status);
  await db.from('organizations').update({
    agent_subscription_id: subscriptionLive ? sub.id : null,
    ...(org.stripe_customer_id ? {} : { stripe_customer_id: String(sub.customer || '') }),
  }).eq('id', organizationId);
  return `synced ${valid.length} hire(s)${skipped.length ? `; skipped: ${skipped.join('; ')}` : ''}`;
}
