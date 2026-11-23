import { secrets } from '../_shared/runtime.ts';
import { adminContext } from '../_shared/adminGuard.ts';
import { STRIPE_TIERS } from '../_shared/stripeCatalog.ts';
import { round } from '../_shared/adminData.ts';

const STRIPE_API = 'https://api.stripe.com/v1';
const STRIPE_VERSION = '2025-10-29.clover';

const stripeGet = async (secretKey, path) => {
  const response = await fetch(`${STRIPE_API}${path}`, {
    headers: { Authorization: `Bearer ${secretKey}`, 'Stripe-Version': STRIPE_VERSION },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error?.message || `Stripe request failed (${response.status})`);
  }
  return response.json();
};

const emptyTotals = { activeSubscriptions: 0, canceledSubscriptions: 0, monthlyRecurringRevenue: 0, revenueCollected: 0, invoices: 0, currency: 'USD' };

// Read-only billing view. Live payments stay off: this only reads what the
// connected Stripe account already holds and states plainly whether that data
// is test or live. No secret is ever returned.
export default async function (req) {
  const ctx = await adminContext(req);
  if (ctx.response) return ctx.response;

  const plans = Object.values(STRIPE_TIERS).map((tier) => ({
    key: tier.key,
    name: tier.name,
    amount: round(tier.amount / 100),
    currency: String(tier.currency || 'usd').toUpperCase(),
    plan: tier.plan,
  }));

  const secretKey = secrets.get('STRIPE_SECRET_KEY');
  if (!secretKey) {
    console.error('adminBilling: STRIPE_SECRET_KEY is not configured');
    return Response.json({
      configured: false,
      mode: 'unknown',
      readOnly: true,
      plans,
      subscriptions: [],
      invoices: [],
      totals: emptyTotals,
      note: 'Billing is not connected. No subscription or revenue data is available.',
    });
  }

  const mode = secretKey.startsWith('sk_live') ? 'live' : 'test';

  try {
    const [subscriptionPage, invoicePage] = await Promise.all([
      stripeGet(secretKey, '/subscriptions?limit=100'),
      stripeGet(secretKey, '/invoices?limit=100'),
    ]);

    const subscriptions = (subscriptionPage?.data || []).map((subscription) => {
      const item = subscription.items?.data?.[0];
      const price = item?.price;
      const interval = price?.recurring?.interval || 'month';
      const amount = Number(price?.unit_amount) || 0;
      return {
        id: subscription.id,
        status: subscription.status,
        customer: subscription.customer,
        amount: round(amount / 100),
        interval,
        monthly: interval === 'year' ? round(amount / 100 / 12) : round(amount / 100),
        currency: String(price?.currency || 'usd').toUpperCase(),
        current_period_end: subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null,
        created: subscription.created ? new Date(subscription.created * 1000).toISOString() : null,
        cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
      };
    });

    const invoices = (invoicePage?.data || []).map((invoice) => ({
      id: invoice.id,
      status: invoice.status,
      customer: invoice.customer,
      amount_paid: round((Number(invoice.amount_paid) || 0) / 100),
      amount_due: round((Number(invoice.amount_due) || 0) / 100),
      currency: String(invoice.currency || 'usd').toUpperCase(),
      created: invoice.created ? new Date(invoice.created * 1000).toISOString() : null,
      paid_at: invoice.status_transitions?.paid_at
        ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
        : null,
    }));

    const active = subscriptions.filter((sub) => ['active', 'trialing'].includes(sub.status));
    const canceled = subscriptions.filter((sub) => ['canceled', 'unpaid'].includes(sub.status));
    const paidInvoices = invoices.filter((invoice) => invoice.status === 'paid');

    return Response.json({
      configured: true,
      mode,
      readOnly: true,
      plans,
      subscriptions,
      invoices,
      totals: {
        activeSubscriptions: active.length,
        canceledSubscriptions: canceled.length,
        monthlyRecurringRevenue: round(active.reduce((sum, sub) => sum + sub.monthly, 0)),
        revenueCollected: round(paidInvoices.reduce((sum, invoice) => sum + invoice.amount_paid, 0)),
        invoices: invoices.length,
        currency: 'USD',
      },
      note:
        subscriptions.length === 0
          ? 'No subscription exists in this Stripe account yet.'
          : mode === 'test'
            ? 'These are Stripe test-mode records, not real revenue.'
            : null,
    });
  } catch (error) {
    console.error('adminBilling: Stripe read failed', error?.message);
    return Response.json({
      configured: true,
      mode,
      readOnly: true,
      plans,
      subscriptions: [],
      invoices: [],
      totals: emptyTotals,
      error: 'Stripe could not be read right now.',
    });
  }
}