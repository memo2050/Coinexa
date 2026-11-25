-- "Hired" status for agents, derived from backend payment confirmation.
--
-- A workspace counts as hired only while it has a Stripe subscription recorded by the
-- signature-verified stripeWebhook (set after Stripe reports the checkout as paid and
-- the subscription active with a catalog price; cleared when the subscription ends)
-- and the workspace is active. Every agent in a hired workspace shows "Hired", so the
-- status applies to existing and future agents without storing anything per agent.
--
-- `hired` is a generated column: nobody can write it, and only the server or a platform
-- admin can change the billing fields it is computed from (organizations RLS).
alter table public.organizations
  add column hired boolean generated always as (
    coalesce(stripe_subscription_id, '') <> '' and status = 'active'
  ) stored;
