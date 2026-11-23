// Server-owned price catalog. The browser may only name a tier key; the price,
// currency and the plan it unlocks are resolved here and nowhere else.
// Amount is in the currency's smallest unit (2500 = $25.00).

export const STRIPE_TIERS = {
  agent_sprint: {
    key: 'agent_sprint',
    name: 'Agent Sprint',
    priceId: Deno.env.get('STRIPE_PRICE_AGENT_SPRINT') || 'price_1UbQjJCk4hUJftLgdoZRF9TP',
    amount: 2500,
    currency: 'usd',
    plan: 'starter',
  },
  studio_retainer: {
    key: 'studio_retainer',
    name: 'Studio Retainer',
    priceId: Deno.env.get('STRIPE_PRICE_STUDIO_RETAINER') || 'price_1UbQjJCk4hUJftLg47pSERqq',
    amount: 5000,
    currency: 'usd',
    plan: 'growth',
  },
};

export const tierForPrice = (priceId) =>
  Object.values(STRIPE_TIERS).find((tier) => tier.priceId === priceId) || null;

export const tierForPlan = (plan) =>
  Object.values(STRIPE_TIERS).find((tier) => tier.plan === plan) || null;