// Individual agent hiring and usage, for signed-in workspace users.
//
//   overview : price catalog, this workspace's hires and current usage
//   hire     : owner/admin only. First hire → Stripe Checkout (customer pays there);
//              later hires → a line added to the workspace subscription after the
//              customer confirmed the price (card on file is charged, prorated).
//   cancel   : owner/admin only. The agent stays usable until its paid period ends.
//   portal   : Stripe's own billing page (card, invoices).
//
// The browser never sends a price: the plan comes from the server catalog and the
// Stripe price is looked up by its key and checked against the catalog amount. A hire
// is recorded only from a Stripe subscription fetched with the server's key.
import { serveBase44 } from '../_shared/http.ts';
import { createClientFromRequest, service } from '../_shared/base44shim.ts';
import { ensureOrganization, membershipFor, canManage } from '../_shared/tenancy.ts';
import { requestContext } from '../_shared/context.ts';
import { planOf, featuredSubject } from '../_shared/agentBilling.ts';
import { stripeClient, catalogPrice, syncSubscription, HIRE_KIND } from '../_shared/agentHires.ts';

type Row = Record<string, any>;
const db = () => service();
const fail = (message: string, status = 400) => Object.assign(new Error(message), { status });
const clean = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const appUrl = () => (Deno.env.get('APP_URL') || '').replace(/\/$/, '');
const FEATURED = ['recruitment', 'cyber-scan'];

async function must<T>(p: PromiseLike<{ data: T; error: any }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw fail(error.message, 500);
  return data;
}

async function audit(orgId: string, user: Row, action: string, target: string, detail: string) {
  const { error } = await db().from('audit_logs').insert({ organization_id: orgId, actor_id: user.id, actor_email: user.email, action, target_type: 'AgentHire', target_id: target, detail: detail.slice(0, 400) });
  if (error) console.error('agentBilling: audit failed', error.message);
}

async function context(req: Request) {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch(() => null) as Row | null;
  if (!user) throw fail('Please sign in.', 401);
  const { organization } = await ensureOrganization({ base44, user });
  if (!organization) throw fail('No workspace is available.', 500);
  const membership = await membershipFor({ base44, user, organizationId: organization.id });
  const ctx = requestContext.getStore();
  if (ctx) ctx.organizationId = organization.id;
  const org = await must(db().from('organizations').select('*').eq('id', organization.id).single()) as Row;
  return { user, org, manage: canManage(membership) };
}

const stripe = () => stripeClient(Deno.env.get('STRIPE_SECRET_KEY') || '');
const paymentsReady = () => /^(sk|rk)_test_/.test(Deno.env.get('STRIPE_SECRET_KEY') || '') || Deno.env.get('STRIPE_LIVE_ALLOWED') === 'true';

// Resolves what is being hired: an agent of this workspace, or a featured agent.
async function subjectFor(orgId: string, body: Row) {
  const featured = clean(body.featured, 40);
  if (featured) {
    if (!FEATURED.includes(featured)) throw fail('Unknown agent.', 404);
    return { subject: featuredSubject(featured), plan: featured, agentId: null, name: featured === 'recruitment' ? 'AI Recruitment & Talent Sourcing' : 'Cyber Security Scan' };
  }
  const agent = await must(db().from('agents').select('id, name, catalog_key, organization_id').eq('id', clean(body.agent_id, 80)).eq('organization_id', orgId).maybeSingle()) as Row | null;
  if (!agent) throw fail('Agent not found.', 404);
  return { subject: agent.id as string, plan: planOf(agent), agentId: agent.id as string, name: agent.name as string };
}

async function liveHire(orgId: string, subject: string) {
  const { data } = await db().rpc('billing_live_hire', { p_org: orgId, p_subject: subject });
  return data && data.id ? data as Row : null;
}

async function action(req: Request, body: Row) {
  const { user, org, manage } = await context(req);
  const orgId = org.id as string;
  const name = clean(body.action, 40);

  if (name === 'overview') {
    const plans = await must(db().from('agent_plans').select('key, name, price_cents, currency, meters, unit_label, trial, featured, sort').eq('active', true).order('sort')) as Row[];
    const hires = await must(db().from('agent_hires').select('subject, agent_id, plan_key, status, current_period_end, ends_at, past_due_since')
      .eq('organization_id', orgId).in('status', ['active', 'past_due', 'cancelled'])) as Row[];
    const live = hires.filter((h) => h.status !== 'cancelled' || Date.parse(h.ends_at || h.current_period_end) > Date.now());
    const usage = await must(db().from('agent_usage').select('subject, plan_key, kind, period_start, period_end, used')
      .eq('organization_id', orgId).gt('period_end', new Date().toISOString())) as Row[];
    const exempt = Boolean(org.internal || org.stripe_subscription_id);
    return {
      can_manage: manage, exempt, legacy_plan: Boolean(org.stripe_subscription_id) && !org.internal, internal: Boolean(org.internal),
      payments_ready: paymentsReady(), test_mode: !(Deno.env.get('STRIPE_SECRET_KEY') || '').includes('_live_'),
      plans, hires: live, usage,
    };
  }

  if (name === 'hire') {
    if (!manage) throw fail('Only a workspace owner or admin can hire agents.', 403);
    if (!paymentsReady()) throw fail('Payments are not set up yet.', 503);
    const target = await subjectFor(orgId, body);
    if (await liveHire(orgId, target.subject)) throw fail('This agent is already hired.', 409);
    const plan = await must(db().from('agent_plans').select('*').eq('key', target.plan).eq('active', true).maybeSingle()) as Row | null;
    if (!plan) throw fail('This agent is not for sale.', 404);
    const s = stripe();
    const price = await catalogPrice(s, plan);

    // Already paying for other agents: add a line to the same subscription.
    if (org.agent_subscription_id) {
      const sub = await s.get(`/subscriptions/${org.agent_subscription_id}`).catch(() => null);
      if (sub && ['active', 'trialing'].includes(sub.status) && sub.metadata?.kind === HIRE_KIND && sub.metadata?.organization_id === orgId) {
        if (body.confirm !== true || Number(body.confirm_price_cents) !== plan.price_cents) {
          return { needs_confirmation: true, plan: { key: plan.key, name: plan.name, price_cents: plan.price_cents }, agent: target.name };
        }
        await s.post('/subscription_items', {
          subscription: sub.id, price: price.id, quantity: 1, proration_behavior: 'always_invoice', payment_behavior: 'error_if_incomplete',
          metadata: { subject: target.subject, plan_key: plan.key, organization_id: orgId },
        }, `hire-${orgId}-${target.subject}-${new Date().toISOString().slice(0, 13)}`);
        const result = await syncSubscription(db(), s, sub.id);
        await audit(orgId, user, 'billing.agent_hired', target.subject, `${target.name} (${plan.key}) added to the subscription: ${result}`);
        return { hired: Boolean(await liveHire(orgId, target.subject)), result };
      }
    }

    // First hire: Stripe Checkout. The hire is recorded when Stripe confirms payment.
    const session = await s.post('/checkout/sessions', {
      mode: 'subscription',
      'line_items[0][price]': price.id, 'line_items[0][quantity]': 1,
      success_url: `${appUrl()}/billing/success?hire=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl()}/agents?hire=cancelled`,
      client_reference_id: orgId,
      ...(org.stripe_customer_id ? { customer: org.stripe_customer_id } : { customer_email: user.email }),
      metadata: { kind: HIRE_KIND, organization_id: orgId, first_subject: target.subject, first_plan: plan.key },
      subscription_data: { metadata: { kind: HIRE_KIND, organization_id: orgId, first_subject: target.subject, first_plan: plan.key } },
    });
    await audit(orgId, user, 'billing.checkout_started', target.subject, `${target.name} (${plan.key}) at $${plan.price_cents / 100}/month`);
    return { url: session.url };
  }

  if (name === 'cancel') {
    if (!manage) throw fail('Only a workspace owner or admin can cancel a hire.', 403);
    const target = await subjectFor(orgId, body);
    const hire = await liveHire(orgId, target.subject);
    if (!hire || hire.status === 'cancelled') throw fail('This agent is not currently hired.', 404);
    const s = stripe();
    const sub = await s.get(`/subscriptions/${hire.stripe_subscription_id}`);
    if ((sub.items?.data || []).length > 1) {
      await s.del(`/subscription_items/${hire.stripe_item_id}`, { proration_behavior: 'none' });
    } else {
      await s.post(`/subscriptions/${sub.id}`, { cancel_at_period_end: 'true' });
    }
    const result = await syncSubscription(db(), s, sub.id);
    await audit(orgId, user, 'billing.agent_cancelled', target.subject, `${target.name}: usable until ${String(hire.current_period_end).slice(0, 10)} (${result})`);
    return { cancelled: true, usable_until: hire.current_period_end };
  }

  if (name === 'portal') {
    if (!manage) throw fail('Only a workspace owner or admin can manage billing.', 403);
    if (!org.stripe_customer_id) throw fail('There is no billing account yet.', 404);
    const session = await stripe().post('/billing_portal/sessions', { customer: org.stripe_customer_id, return_url: `${appUrl()}/agents` });
    return { url: session.url };
  }

  if (name === 'confirmCheckout') {
    // Called by the success page: syncs right away instead of waiting for the webhook.
    // Only the server's Stripe key is trusted; the session must belong to this workspace.
    const id = clean(body.session_id, 120);
    if (!/^cs_(test|live)_/.test(id)) throw fail('Invalid checkout session.');
    const s = stripe();
    const session = await s.get(`/checkout/sessions/${id}`);
    if (session.metadata?.kind !== HIRE_KIND || session.metadata?.organization_id !== orgId) throw fail('Checkout not found.', 404);
    if (session.payment_status !== 'paid' || !session.subscription) return { hired: false, status: 'processing' };
    const result = await syncSubscription(db(), s, String(session.subscription));
    return { hired: Boolean(await liveHire(orgId, session.metadata.first_subject)), result };
  }

  throw fail('Unknown action.');
}

serveBase44('agentBilling', async (req: Request) => {
  try {
    const body = await req.json().catch(() => ({}));
    return Response.json(await action(req, body));
  } catch (error) {
    const status = Number((error as { status?: number }).status) || 500;
    if (status >= 500) console.error('agentBilling failed', (error as Error).message);
    else console.warn(`agentBilling refused ${status}`, (error as Error).message.slice(0, 200));
    return Response.json({ error: status >= 500 && status !== 502 && status !== 503 ? 'Something went wrong. Please try again.' : (error as Error).message }, { status });
  }
});
