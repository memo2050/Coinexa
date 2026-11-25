import { strict as assert } from 'node:assert';
import {
  negotiate, validateTerms, wordingWithinLimit, amountsIn, verifyEvidence, weightedScore,
  encryptJson, decryptJson, parseCsv, toCsv, maskEmail, newPortalToken, sha256,
} from '../_shared/recruitmentLogic.ts';

const terms = { initialOffer: 120, maxBudget: 150, strategy: 'balanced' as const, maxRounds: 3 };

Deno.test('negotiation: request at or under the offer is accepted at the request', () => {
  assert.deepEqual(negotiate(terms, { round: 0, currentOffer: 120 }, 110).action, 'accept');
  assert.equal(negotiate(terms, { round: 0, currentOffer: 120 }, 110).amount, 110);
});

Deno.test('negotiation: spec example — max $150/day, candidate asks $180', () => {
  let state = { round: 0, currentOffer: 120 };
  const seen: number[] = [];
  for (let i = 0; i < 10; i += 1) {
    const d = negotiate(terms, state, 180);
    assert.ok(d.amount <= 150, `offered ${d.amount} above the maximum`);
    seen.push(d.amount);
    if (d.action === 'counter') { state = { round: state.round + 1, currentOffer: d.amount }; continue; }
    if (d.action === 'final_offer') { assert.equal(d.amount, 150); state = { round: state.round, currentOffer: d.amount }; continue; }
    assert.equal(d.action, 'escalate'); // never accepts 180
    assert.equal((d as { requested: number }).requested, 180);
    break;
  }
  assert.ok(seen.every((v, i) => i === 0 || v >= seen[i - 1]), 'offers only move up');
});

Deno.test('negotiation: within budget eventually accepts the request, never above it', () => {
  let state = { round: 0, currentOffer: 120 };
  for (let i = 0; i < 10; i += 1) {
    const d = negotiate(terms, state, 140);
    assert.ok(d.amount <= 140);
    if (d.action === 'accept') { assert.equal(d.amount, 140); return; }
    state = { round: state.round + 1, currentOffer: d.amount };
  }
  assert.fail('never settled');
});

Deno.test('negotiation: company-approved ceiling for one candidate is respected', () => {
  const d = negotiate(terms, { round: 3, currentOffer: 150, approvedCeiling: 170 }, 165);
  assert.deepEqual([d.action, d.amount], ['accept', 165]);
  const e = negotiate(terms, { round: 3, currentOffer: 170, approvedCeiling: 170 }, 180);
  assert.equal(e.action, 'escalate');
});

Deno.test('negotiation: strategies concede different amounts; invalid terms refused', () => {
  const c = negotiate({ ...terms, strategy: 'conservative' }, { round: 0, currentOffer: 120 }, 150).amount;
  const f = negotiate({ ...terms, strategy: 'flexible' }, { round: 0, currentOffer: 120 }, 150).amount;
  assert.ok(c < f);
  assert.ok(validateTerms({ ...terms, initialOffer: 200 }).length > 0);
  assert.throws(() => negotiate({ ...terms, initialOffer: 200 }, { round: 0, currentOffer: 200 }, 100));
  assert.throws(() => negotiate(terms, { round: 0, currentOffer: 120 }, 0));
});

Deno.test('wording guard: amounts above the authorised figure are caught', () => {
  assert.deepEqual(amountsIn('We can offer $1,250.50 for 5 days'), [1250.5, 5]);
  assert.equal(wordingWithinLimit('Our offer is 140 USD per day for 5 days.', 140), true);
  assert.equal(wordingWithinLimit('We could stretch to 160 USD per day.', 150), false);
  assert.equal(wordingWithinLimit('A 3-year project, 2 days a week.', 100), true);
});

Deno.test('evidence: quotes not found in the profile are removed and score drops', () => {
  const profile = 'Two years of Windows 10 troubleshooting at a help desk. CompTIA A+ certified.';
  const { criteria, removed } = verifyEvidence([
    { criterion: 'Windows', score: 90, evidence: 'Windows 10 troubleshooting' },
    { criterion: 'Certification', score: 80, evidence: 'CCNA certified' },
    { criterion: 'Networking', score: 70 },
  ], profile);
  assert.equal(removed, 1);
  assert.equal(criteria[0].status, 'met');
  assert.equal(criteria[1].status, 'unverified');
  assert.equal(criteria[1].score, 0);
  assert.equal(criteria[2].status, 'unknown');
  assert.equal(weightedScore(criteria), 30);
});

Deno.test('encryption round trip; tampering and wrong key fail', async () => {
  const key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  const other = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  const enc = await encryptJson({ email: 'a@b.co', phone: '+20 100' }, key);
  assert.ok(!enc.includes('a@b.co'));
  assert.deepEqual(await decryptJson(enc, key), { email: 'a@b.co', phone: '+20 100' });
  await assert.rejects(() => decryptJson(enc, other));
  await assert.rejects(() => decryptJson(enc.slice(0, -4) + 'AAAA', key));
});

Deno.test('CSV: quoted fields parse; export neutralises formulas', () => {
  const rows = parseCsv('Full Name,Email,Skills\n"Mona, A.",mona@x.co,"Windows; ""Office"""\r\nOmar,omar@x.co,Networking\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].full_name, 'Mona, A.');
  assert.equal(rows[0].skills, 'Windows; "Office"');
  const out = toCsv([{ n: '=HYPERLINK("x")' }], [{ key: 'n', label: 'Name' }]);
  assert.ok(out.includes(`"'=HYPERLINK(""x"")"`));
});

Deno.test('masking and tokens', async () => {
  assert.equal(maskEmail('ramy@gmail.com'), 'r***@gmail.com');
  const t = newPortalToken();
  assert.ok(t.length >= 40 && !/[+/=]/.test(t));
  assert.equal((await sha256(t)).length, 64);
});
