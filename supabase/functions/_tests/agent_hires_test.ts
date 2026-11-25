import { strict as assert } from 'node:assert';
import { hiresFromSubscription, planFromLookupKey, lookupKeyFor } from '../_shared/agentHires.ts';

const plans = new Map([
  ['crm', { key: 'crm', price_cents: 3900, currency: 'usd', featured: false }],
  ['recruitment', { key: 'recruitment', price_cents: 7900, currency: 'usd', featured: true }],
]);
const now = Date.parse('2026-11-25T00:00:00Z');
const period = { current_period_start: 1764000000, current_period_end: 1766592000 }; // ~2025-11-24 → 2025-12-24 (fixture)
const price = (plan: string, amount: number, extra = {}) => ({ id: `price_${plan}`, lookup_key: lookupKeyFor(plan), unit_amount: amount, currency: 'usd', recurring: { interval: 'month' }, ...extra });
const sub = (over: Record<string, unknown> = {}, items: unknown[] = []) => ({
  id: 'sub_1', status: 'active', customer: 'cus_1', metadata: { kind: 'agent_hires', organization_id: 'org-1', first_subject: 'agent-1', first_plan: 'crm' },
  items: { data: items }, ...over,
});

Deno.test('lookup keys round-trip', () => {
  assert.equal(planFromLookupKey(lookupKeyFor('cyber-scan')), 'cyber-scan');
  assert.equal(planFromLookupKey('coinexa_agent_sprint'), null);
});

Deno.test('a paid line at the catalog price becomes an active hire for that one agent', () => {
  const r = hiresFromSubscription(sub({}, [{ id: 'si_1', price: price('crm', 3900), metadata: {}, ...period }]), plans, now);
  assert.equal(r.hires.length, 1);
  assert.deepEqual([r.hires[0].subject, r.hires[0].agent_id, r.hires[0].plan_key, r.hires[0].status, r.hires[0].needs_metadata], ['agent-1', 'agent-1', 'crm', 'active', true]);
});

Deno.test('a second line uses its own metadata; a featured agent is hired at workspace level', () => {
  const r = hiresFromSubscription(sub({}, [
    { id: 'si_1', price: price('crm', 3900), metadata: { subject: 'agent-1', plan_key: 'crm' }, ...period },
    { id: 'si_2', price: price('recruitment', 7900), metadata: { subject: 'featured:recruitment', plan_key: 'recruitment' }, ...period },
  ]), plans, now);
  assert.deepEqual(r.hires.map((h) => [h.subject, h.agent_id]), [['agent-1', 'agent-1'], ['featured:recruitment', null]]);
});

Deno.test('unpaid, mispriced, unknown and foreign subscriptions hire nothing', () => {
  assert.equal(hiresFromSubscription(sub({ status: 'incomplete' }, [{ id: 'si_1', price: price('crm', 3900), metadata: {}, ...period }]), plans, now).hires.length, 0);
  assert.equal(hiresFromSubscription(sub({}, [{ id: 'si_1', price: price('crm', 100), metadata: {}, ...period }]), plans, now).hires.length, 0);
  assert.equal(hiresFromSubscription(sub({}, [{ id: 'si_1', price: { ...price('crm', 3900), recurring: { interval: 'year' } }, metadata: {}, ...period }]), plans, now).hires.length, 0);
  assert.equal(hiresFromSubscription(sub({}, [{ id: 'si_1', price: price('crm', 3900, { lookup_key: 'something_else' }), metadata: { plan_key: 'crm', subject: 'a' }, ...period }]), plans, now).hires.length, 0);
  assert.equal(hiresFromSubscription(sub({ metadata: { kind: 'other' } }, [{ id: 'si_1', price: price('crm', 3900), metadata: {}, ...period }]), plans, now).hires.length, 0);
  assert.equal(hiresFromSubscription(sub({}, [{ id: 'si_1', price: price('recruitment', 7900), metadata: { subject: 'featured:crm', plan_key: 'recruitment' }, ...period }]), plans, now).hires.length, 0);
});

Deno.test('cancel at period end keeps the hire until then; failed payment is past due', () => {
  const c = hiresFromSubscription(sub({ cancel_at_period_end: true }, [{ id: 'si_1', price: price('crm', 3900), metadata: {}, ...period }]), plans, now).hires[0];
  assert.equal(c.status, 'cancelled');
  assert.equal(c.ends_at, c.current_period_end);
  assert.equal(hiresFromSubscription(sub({ status: 'past_due' }, [{ id: 'si_1', price: price('crm', 3900), metadata: {}, ...period }]), plans, now).hires[0].status, 'past_due');
});
