import { createClientFromRequest } from '../_shared/base44shim.ts';
import { secrets } from '../_shared/runtime.ts';
import { STRIPE_TIERS } from '../_shared/stripeCatalog.ts';
import { ensureOrganization, membershipFor, canManage } from '../_shared/tenancy.ts';
import { consumeActionQuota } from '../_shared/rateLimits.ts';

const STRIPE_API = 'https://api.stripe.com/v1';
const STRIPE_VERSION = '2025-10-29.clover';

// Starts a subscription checkout for the caller's own workspace. The plan, the
// price and the return URLs are all decided here on the server: the browser
// only names which published tier it wants.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth
      .me()
      .catch((error) => (error.status === 401 ? null : Promise.reject(error)));
    if (!user) return Response.json({ error: 'Please sign in to choose a plan.' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const tier = STRIPE_TIERS[String(body.tier || '')];
    if (!tier) return Response.json({ error: 'Choose one of the published plans.' }, { status: 400 });

    // Never derive return URLs from the request host: the platform sets this.
    const appUrl = req.headers.get('X-Base44-App-Url');
    if (!appUrl) {
      console.error('createCheckoutSession: X-Base44-App-Url header missing');
      return Response.json({ error: 'Checkout is not available right now.' }, { status: 500 });
    }

    const { organization } = await ensureOrganization({ base44, user });
    if (!organization) return Response.json({ error: 'No workspace is available.' }, { status: 500 });

    const membership = await membershipFor({ base44, user, organizationId: organization.id });
    if (!canManage(membership)) {
      return Response.json(
        { error: 'Only a workspace owner or admin can change the plan.' },
        { status: 403 }
      );
    }
    if (organization.stripe_subscription_id) {
      return Response.json(
        { error: 'This workspace already has a paid plan. Contact us to change it.' },
        { status: 400 }
      );
    }

    // Opening a Stripe session is capped per user so a loop cannot be used to
    // create sessions. The cap allows a customer to retry a declined card.
    const quota = await consumeActionQuota({
      base44,
      user,
      kind: 'checkout_attempt',
      organizationId: organization.id,
    });
    if (!quota.ok) return Response.json({ error: quota.message }, { status: 429 });

    const secretKey = secrets.get('STRIPE_SECRET_KEY');
    if (!secretKey) {
      console.error('createCheckoutSession: STRIPE_SECRET_KEY is not configured');
      return Response.json({ error: 'Checkout is not available right now.' }, { status: 500 });
    }

    const params = new URLSearchParams({
      mode: 'subscription',
      'line_items[0][price]': tier.priceId,
      'line_items[0][quantity]': '1',
      customer_email: String(user.email || ''),
      client_reference_id: organization.id,
      success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/#pricing`,
      'metadata[base44_app_id]': String(secrets.get('BASE44_APP_ID') || ''),
      'metadata[organization_id]': organization.id,
      'metadata[tier_key]': tier.key,
      'subscription_data[metadata][base44_app_id]': String(secrets.get('BASE44_APP_ID') || ''),
      'subscription_data[metadata][organization_id]': organization.id,
      'subscription_data[metadata][tier_key]': tier.key,
    });

    const response = await fetch(`${STRIPE_API}/checkout/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Stripe-Version': STRIPE_VERSION,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: params,
      signal: AbortSignal.timeout(15000),
    });

    const session = await response.json();
    if (!response.ok || !session?.url) {
      console.error('createCheckoutSession: Stripe refused the session', session?.error?.message);
      return Response.json(
        { error: session?.error?.message || 'Checkout could not be started.' },
        { status: 502 }
      );
    }

    return Response.json({ url: session.url, session_id: session.id, tier: tier.key, plan: tier.plan });
  } catch (error) {
    console.error('createCheckoutSession failed', error?.message);
    return Response.json({ error: 'Checkout could not be started.' }, { status: 500 });
  }
}