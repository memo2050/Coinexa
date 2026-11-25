import { createClientFromRequest, service as serviceClient } from '../_shared/base44shim.ts';
import { stripeClient, syncSubscription, HIRE_KIND } from '../_shared/agentHires.ts';
import { secrets } from '../_shared/runtime.ts';
import { tierForPrice } from '../_shared/stripeCatalog.ts';
import { planLimits, logAudit } from '../_shared/tenancy.ts';

const STRIPE_API = 'https://api.stripe.com/v1';
const STRIPE_VERSION = '2025-10-29.clover';
const TOLERANCE_SECONDS = 300;

const toHex = (bytes) =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

// Stripe signs `${timestamp}.${rawBody}` with the endpoint secret. Anyone can
// reach this URL, so nothing is trusted until this check passes.
async function validSignature(rawBody, header, secret) {
  if (!rawBody || !header || !secret) return false;

  const parts = header.split(',').map((part) => {
    const index = part.indexOf('=');
    return [part.slice(0, index), part.slice(index + 1)];
  });
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value);
  if (!timestamp || !signatures.length) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  return signatures.includes(toHex(new Uint8Array(mac)));
}

async function stripeGet(path, secretKey) {
  const response = await fetch(`${STRIPE_API}${path}`, {
    headers: { Authorization: `Bearer ${secretKey}`, 'Stripe-Version': STRIPE_VERSION },
    signal: AbortSignal.timeout(15000),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json?.error?.message || `Stripe ${response.status}`);
  return json;
}

// Refunds and disputes are issued in the Stripe dashboard. They are recorded in the
// workspace audit log for the platform admin; access is unchanged (an agent ends only
// when its subscription line is cancelled). Returns null for workspaces without agent hires.
async function moneyBackEvent(event, secretKey, db) {
  const obj = event?.data?.object || {};
  const refund = event.type === 'charge.refunded';
  const charge = refund ? obj : await stripeGet(`/charges/${encodeURIComponent(String(obj.charge || ''))}`, secretKey);
  const customer = typeof charge.customer === 'string' ? charge.customer : charge.customer?.id;
  if (!customer) return null;
  const { data: org } = await db.from('organizations').select('id, agent_subscription_id').eq('stripe_customer_id', customer).maybeSingle();
  if (!org?.agent_subscription_id) return null;
  const amount = refund ? obj.amount_refunded : obj.amount;
  const kind = refund ? (charge.refunded ? 'full refund' : 'partial refund') : `dispute opened (${obj.reason || 'no reason given'})`;
  const detail = `${kind}: ${(Number(amount || 0) / 100).toFixed(2)} ${String(obj.currency || '').toUpperCase()}`;
  await db.from('audit_logs').insert({ organization_id: org.id, actor_id: null, actor_email: 'stripe', action: refund ? 'billing.refunded' : 'billing.dispute_opened', target_type: 'Payment', target_id: String(charge.id || obj.id), detail });
  return `money back: ${detail}`;
}

// Returns a result line for agent-hire events, or null for everything else (which the
// existing workspace-plan handling below processes unchanged).
async function agentHireEvent(event, secretKey, db) {
  const obj = event?.data?.object || {};
  let subscriptionId = null;
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    if (obj.metadata?.kind !== HIRE_KIND) return null;
    if (obj.payment_status !== 'paid') return 'agent hire: not paid yet';
    subscriptionId = typeof obj.subscription === 'string' ? obj.subscription : obj.subscription?.id;
  } else if (event.type?.startsWith('customer.subscription.')) {
    if (obj.metadata?.kind !== HIRE_KIND) return null;
    subscriptionId = obj.id;
  } else if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
    const meta = obj.parent?.subscription_details?.metadata || obj.subscription_details?.metadata || {};
    if (meta.kind !== HIRE_KIND) return null;
    subscriptionId = obj.parent?.subscription_details?.subscription || obj.subscription;
  } else if (event.type === 'charge.refunded' || event.type === 'charge.dispute.created') {
    return await moneyBackEvent(event, secretKey, db);
  } else {
    return null;
  }
  if (!subscriptionId) return 'agent hire: no subscription';
  const result = await syncSubscription(db, stripeClient(secretKey), String(subscriptionId));
  return `agent hire: ${result}`;
}

export default async function (req) {
  const base44 = createClientFromRequest(req);
  let recordedEventId = null;

  try {
    const rawBody = await req.text();
    const secret = secrets.get('STRIPE_WEBHOOK_SECRET');
    const secretKey = secrets.get('STRIPE_SECRET_KEY');

    if (!(await validSignature(rawBody, req.headers.get('stripe-signature'), secret))) {
      return Response.json({ error: 'Invalid signature' }, { status: 400 });
    }
    if (!secretKey) {
      console.error('stripeWebhook: STRIPE_SECRET_KEY is not configured');
      return Response.json({ error: 'Not configured' }, { status: 500 });
    }

    const event = JSON.parse(rawBody);
    const service = base44.asServiceRole;

    // Each Stripe event is applied once (Stripe may deliver the same event again).
    const db = serviceClient();
    if (event?.id) {
      const { error: seen } = await db.from('stripe_events').insert({ id: String(event.id), type: String(event.type || '') });
      if (seen?.code === '23505') return Response.json({ received: true, result: 'duplicate' });
      if (!seen) recordedEventId = String(event.id);
    }

    // Individual agent hires (one subscription per workspace, one line per agent).
    try {
      const hireResult = await agentHireEvent(event, secretKey, db);
      if (hireResult) {
        await db.from('stripe_events').update({ result: hireResult.slice(0, 500) }).eq('id', String(event.id));
        return Response.json({ received: true, result: hireResult });
      }
    } catch (error) {
      // Forget the event so Stripe's retry is processed again.
      if (event?.id) await db.from('stripe_events').delete().eq('id', String(event.id));
      throw error;
    }

    const applyPlan = async (organizationId, plan, extra = {}) => {
      const limits = planLimits(plan);
      await service.entities.Organization.update(organizationId, {
        plan,
        status: 'active',
        task_limit_month: limits.tasks,
        agent_limit: limits.agents,
        seat_limit: limits.seats,
        concurrent_limit: limits.concurrent,
        ...extra,
      });
      await logAudit(base44, {
        organization_id: organizationId,
        user: { id: '', email: 'stripe-webhook' },
        action: `billing.plan_${plan}`,
        target_type: 'Organization',
        target_id: organizationId,
        detail: `Stripe event ${event.type} set the plan to ${plan}`,
      });
    };

    // Grants a plan only on a signature-verified, actually-paid subscription
    // whose price matches our own catalog.
    const activate = async (session) => {
      if (session.metadata?.base44_test_checkout === 'true') return 'self-test skipped';
      if (session.payment_status !== 'paid') return 'not paid yet';

      const organizationId = session.metadata?.organization_id || session.client_reference_id;
      if (!organizationId) return 'no workspace on the session';

      const subscriptionId =
        typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
      if (!subscriptionId) return 'no subscription on the session';

      const subscription = await stripeGet(
        `/subscriptions/${subscriptionId}?expand[]=items.data.price`,
        secretKey
      );
      if (!['active', 'trialing'].includes(subscription.status)) {
        return `subscription ${subscription.status}`;
      }

      const price = subscription.items?.data?.[0]?.price;
      const tier = tierForPrice(price?.id);
      if (!tier) {
        console.error('stripeWebhook: price not in catalog', price?.id);
        return 'price not in catalog';
      }
      if (price.unit_amount !== tier.amount || price.currency !== tier.currency) {
        console.error('stripeWebhook: amount mismatch', price.id, price.unit_amount, price.currency);
        return 'amount mismatch';
      }

      await applyPlan(organizationId, tier.plan, {
        stripe_customer_id: String(subscription.customer || session.customer || ''),
        stripe_subscription_id: subscription.id,
      });
      return `activated ${tier.plan}`;
    };

    let result = 'ignored';

    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      result = await activate(event.data.object);
    } else if (
      event.type === 'customer.subscription.deleted' ||
      event.type === 'customer.subscription.updated'
    ) {
      const subscription = event.data.object;
      if (subscription.metadata?.base44_test_checkout === 'true') {
        result = 'self-test skipped';
      } else if (subscription.status === 'active' || subscription.status === 'trialing') {
        result = 'subscription healthy';
      } else {
        const organizationId = subscription.metadata?.organization_id;
        if (organizationId) {
          await applyPlan(organizationId, 'starter', {
            stripe_subscription_id: '',
          });
          result = 'downgraded to starter';
        }
      }
    }

    return Response.json({ received: true, result });
  } catch (error) {
    if (recordedEventId) await serviceClient().from('stripe_events').delete().eq('id', recordedEventId).then(() => null, () => null);
    console.error('stripeWebhook failed', error?.message);
    return Response.json({ error: 'Webhook could not be processed.' }, { status: 500 });
  }
}