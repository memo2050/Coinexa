import { createClientFromRequest } from '../_shared/base44shim.ts';
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

export default async function (req) {
  const base44 = createClientFromRequest(req);

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
    console.error('stripeWebhook failed', error?.message);
    return Response.json({ error: 'Webhook could not be processed.' }, { status: 500 });
  }
}