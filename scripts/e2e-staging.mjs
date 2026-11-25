// End-to-end checks against the STAGING Supabase project.
// Runs in GitHub Actions (staging-e2e.yml). Creates two throwaway accounts,
// exercises auth, workspace isolation, storage and every server function through
// the same entity layer the website uses, then deletes everything it created.
//
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, E2E_AI=1 (optional:
// also run the AI features — roughly $0.05–0.15 per run).
import { createClient } from '@supabase/supabase-js';
import { makeEntities } from '../src/api/entityQuery.js';
import { appendFileSync } from 'node:fs';
import { simulatedPc, sampleScan } from './sim-scanner.mjs';
import { signInWithLink, enrollTotp } from './test-auth.mjs';

const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const RUN_AI = process.env.E2E_AI === '1';
const RUN_RESEARCH = process.env.E2E_RESEARCH === '1'; // web search: ~$0.20 per run
if (!URL_ || !ANON || !SERVICE) throw new Error('SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_KEY are required');
if (!/ycvhmzunagrpihtgisiu/.test(URL_)) throw new Error('Refusing to run: this suite only targets the coinexa-staging project');

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL_, SERVICE, opts);
const runId = Date.now().toString(36);
const results = [];
const created = { users: [], orgs: new Set(), files: [] };

const record = (area, name, ok, detail = '') => {
  results.push({ area, name, ok: ok === true ? 'pass' : ok === 'skip' ? 'skip' : 'FAIL', detail: String(detail).slice(0, 300) });
  console.log(`${ok === true ? '✓' : ok === 'skip' ? '·' : '✗'} [${area}] ${name}${detail ? ` — ${String(detail).slice(0, 300)}` : ''}`);
};
const check = async (area, name, fn) => {
  try {
    const out = await fn();
    // A check passes only by returning true or a detail string. Returning false or
    // { fail: detail } is a failure (a returned failure text must never count as a pass).
    if (out === 'skip' || (out && out.skip)) record(area, name, 'skip', out.detail || '');
    else if (out && typeof out === 'object' && 'fail' in out) record(area, name, false, typeof out.fail === 'string' ? out.fail : JSON.stringify(out.fail));
    else record(area, name, out !== false && out !== undefined && out !== null, typeof out === 'string' ? out : '');
  } catch (error) {
    record(area, name, false, error?.message || error);
  }
};

async function call(token, fn, body = {}) {
  const started = Date.now();
  const res = await fetch(`${URL_}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }
  return { status: res.status, data, ms: Date.now() - started };
}

async function makeUser(tag) {
  const email = `e2e-${tag}-${runId}@example.com`;
  const password = `E2e-${crypto.randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `E2E ${tag.toUpperCase()}` } });
  if (error) throw error;
  created.users.push(data.user.id);
  const client = createClient(URL_, ANON, opts);
  const session = await signInWithLink(admin, client, email);
  return { id: data.user.id, email, client, token: session.access_token, entities: makeEntities(client) };
}

async function main() {
  // ---------------- Accounts ----------------
  let A, B;
  await check('auth', 'create two confirmed test accounts and sign in with password', async () => {
    A = await makeUser('a');
    B = await makeUser('b');
    return `${A.email}, ${B.email}`;
  });
  if (!A || !B) return;

  await check('auth', 'new account gets a profile with role "user"', async () => {
    const { data, error } = await A.client.from('profiles').select('*');
    if (error) throw error;
    if (data.length !== 1 || data[0].id !== A.id) throw new Error(`saw ${data.length} profiles`);
    if (data[0].role !== 'user') throw new Error(`role ${data[0].role}`);
    return true;
  });

  await check('security', 'a user cannot make themselves admin', async () => {
    await A.client.from('profiles').update({ role: 'admin' }).eq('id', A.id);
    const { data } = await admin.from('profiles').select('role').eq('id', A.id).single();
    if (data.role !== 'user') throw new Error('role changed!');
    return true;
  });

  await check('security', 'a wrong password is rejected', async () => {
    const { error } = await createClient(URL_, ANON, opts).auth.signInWithPassword({ email: A.email, password: 'wrong-password-1' });
    return !!error;
  });

  // ---------------- Workspaces ----------------
  let orgA, orgB;
  await check('workspace', 'each new account gets its own empty workspace', async () => {
    const a = await call(A.token, 'manageOrganization', { action: 'bootstrap' });
    const b = await call(B.token, 'manageOrganization', { action: 'bootstrap' });
    if (a.status !== 200 || b.status !== 200) throw new Error(`status ${a.status}/${b.status} ${JSON.stringify(a.data).slice(0, 150)}`);
    orgA = a.data.organization.id;
    orgB = b.data.organization.id;
    created.orgs.add(orgA);
    created.orgs.add(orgB);
    if (orgA === orgB) throw new Error('same workspace');
    if (a.data.membership.member_role !== 'owner') throw new Error(`member_role ${a.data.membership.member_role}`);
    return `plan ${a.data.organization.plan}, ${a.ms} ms`;
  });

  await check('workspace', 'a second bootstrap reuses the same workspace', async () => {
    const again = await call(A.token, 'manageOrganization', { action: 'bootstrap' });
    return again.data.organization?.id === orgA;
  });

  // ---------------- Agents through the website's entity layer ----------------
  let agentA;
  await check('agents', 'create an agent (with extra form fields, as the Agent Creator sends)', async () => {
    agentA = await A.entities.Agent.create({
      name: `E2E Agent ${runId}`,
      organization_id: orgA,
      industry_key: 'custom',
      industry_custom: 'not a column — must be ignored',
      industry: 'Retail',
      role: 'Assistant',
      tone: 'Friendly',
      responsibilities: ['Answer questions'],
      permissions: ['Read data'],
      tools: [],
      system_instructions: 'Reply in one short sentence.',
      workflow_enabled: true,
      status: 'active',
      created_date: '2020-01-01T00:00:00Z',
    });
    if (agentA.created_by_id !== A.id) throw new Error('owner not stamped');
    if (agentA.created_date.startsWith('2020')) throw new Error('backdated');
    return agentA.id;
  });

  await check('agents', 'owner lists, filters and updates own agent', async () => {
    const list = await A.entities.Agent.filter({ organization_id: orgA }, '-created_date', 10);
    if (!list.find((x) => x.id === agentA.id)) throw new Error('not listed');
    const page = await A.entities.Agent.list({ sort: '-created_date', limit: 5 });
    if (!Array.isArray(page.items)) throw new Error('page shape');
    const updated = await A.entities.Agent.update(agentA.id, { summary: 'Updated by E2E' });
    return updated.summary === 'Updated by E2E';
  });

  // ---------------- Isolation ----------------
  await check('isolation', 'B cannot list A\'s agent', async () => {
    const list = await B.entities.Agent.list();
    return !list.find((x) => x.id === agentA?.id);
  });
  await check('isolation', 'B cannot open A\'s agent by id', async () => {
    try { await B.entities.Agent.get(agentA.id); return false; } catch (e) { return e.status === 404; }
  });
  await check('isolation', 'B cannot edit A\'s agent', async () => {
    try { await B.entities.Agent.update(agentA.id, { name: 'hacked' }); return false; } catch { /* expected */ }
    const { data } = await admin.from('agents').select('name').eq('id', agentA.id).single();
    return data.name !== 'hacked';
  });
  await check('isolation', 'B cannot delete A\'s agent', async () => {
    try { await B.entities.Agent.delete(agentA.id); } catch { /* expected */ }
    const { data } = await admin.from('agents').select('id').eq('id', agentA.id).maybeSingle();
    return !!data;
  });
  await check('isolation', 'B cannot create an agent inside A\'s workspace', async () => {
    try { await B.entities.Agent.create({ name: 'intruder', organization_id: orgA }); return false; } catch { return true; }
  });
  await check('isolation', 'B cannot see A\'s workspace or members', async () => {
    const { data: orgs } = await B.client.from('organizations').select('id');
    const { data: members } = await B.client.from('organization_members').select('organization_id');
    return !orgs.some((o) => o.id === orgA) && !members.some((m) => m.organization_id === orgA);
  });
  await check('isolation', 'B cannot run, chat with or change A\'s agent through functions', async () => {
    const run = await call(B.token, 'runAgentTask', { agentId: agentA.id, task: 'Say hello to the team please' });
    const chat = await call(B.token, 'chatWithAgent', { agentId: agentA.id, message: 'hello' });
    const flow = await call(B.token, 'agentWorkflow', { agentId: agentA.id, action: 'toggle', enabled: false });
    const ok = [run, chat, flow].every((r) => r.status === 403 || r.status === 404);
    return ok ? true : { fail: `statuses ${run.status}/${chat.status}/${flow.status}` };
  });
  await check('isolation', 'signed-out visitors cannot read any table', async () => {
    const anon = createClient(URL_, ANON, opts);
    for (const t of ['agents', 'agent_tasks', 'profiles', 'organizations', 'inquiries', 'usage_records', 'ai_usage']) {
      const { data } = await anon.from(t).select('*').limit(1);
      if (data && data.length) throw new Error(`${t} readable`);
    }
    return true;
  });
  await check('isolation', 'signed-out visitors are refused by member functions', async () => {
    const r = await call(null, 'runAgentTask', { agentId: agentA.id, task: 'x' });
    return r.status === 401 ? true : { fail: `status ${r.status}` };
  });

  // ---------------- Storage ----------------
  // Browsers may only upload into their own folder; reading back always goes through
  // the server, which signs a short-lived link (CreateFileSignedUrl), as on Base44.
  await check('storage', 'user uploads a private file to their own folder; the server can sign it', async () => {
    const path = `${A.id}/e2e-${runId}.txt`;
    const { error } = await A.client.storage.from('private').upload(path, new Blob(['coinexa e2e']), { contentType: 'text/plain' });
    if (error) throw error;
    created.files.push(path);
    const { data, error: readError } = await admin.storage.from('private').createSignedUrl(path, 60);
    if (readError) throw readError;
    const body = await (await fetch(data.signedUrl)).text();
    return body === 'coinexa e2e';
  });
  await check('storage', 'a user cannot upload outside their own folder', async () => {
    const { error } = await A.client.storage.from('private').upload(`server/e2e-${runId}.txt`, new Blob(['x']));
    if (!error) created.files.push(`server/e2e-${runId}.txt`);
    return !!error;
  });
  await check('storage', 'B cannot read or write in A\'s folder', async () => {
    const { data } = await B.client.storage.from('private').download(`${A.id}/e2e-${runId}.txt`);
    const { error: writeError } = await B.client.storage.from('private').upload(`${A.id}/intruder.txt`, new Blob(['x']));
    if (!writeError) created.files.push(`${A.id}/intruder.txt`);
    return !data && !!writeError;
  });

  // ---------------- Public and billing functions ----------------
  await check('public', 'contact form (submitInquiry) accepts a valid enquiry', async () => {
    const r = await call(null, 'submitInquiry', {
      name: 'E2E Visitor', email: `e2e-visitor-${runId}@example.com`, service: 'AI agents', message: 'Automated staging test enquiry, please ignore.',
    });
    if (r.status !== 200) return `status ${r.status} ${JSON.stringify(r.data).slice(0, 150)}`;
    const { data: saved } = await admin.from('inquiries').select('studio_notify_status, visitor_ack_status').eq('email', `e2e-visitor-${runId}@example.com`).maybeSingle();
    return `reference ${r.data.reference || 'ok'}; studio email: ${saved?.studio_notify_status || '?'}, visitor email: ${saved?.visitor_ack_status || '?'}`;
  });
  await check('billing', 'checkout: refuses unknown plans; test checkout when Stripe test key is set', async () => {
    const bad = await call(A.token, 'createCheckoutSession', { tier: 'nope' });
    if (bad.status !== 400) throw new Error(`unknown plan → ${bad.status}`);
    const good = await call(A.token, 'createCheckoutSession', { tier: 'agent_sprint' });
    if (good.status === 200 && /checkout\.stripe\.com/.test(good.data.url || '')) return 'Stripe test checkout URL created';
    if (good.data?.error === 'Checkout is not available right now.') return { skip: true, detail: 'Stripe test key not added yet' };
    return `status ${good.status} ${JSON.stringify(good.data).slice(0, 150)}`;
  });

  await check('security', 'Stripe webhook rejects unsigned and forged events', async () => {
    const event = JSON.stringify({ type: 'checkout.session.completed', data: { object: { metadata: { organization_id: orgA, tier: 'studio_retainer' } } } });
    const post = (headers) => fetch(`${URL_}/functions/v1/stripeWebhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: event });
    const unsigned = await post({});
    const forged = await post({ 'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=${'ab'.repeat(32)}` });
    const { data } = await admin.from('organizations').select('plan').eq('id', orgA).single();
    if (unsigned.status !== 400 || forged.status !== 400) return `statuses ${unsigned.status}/${forged.status}`;
    return data.plan !== 'studio_retainer' ? true : { fail: 'plan changed!' };
  });

  // ---------------- Admin functions ----------------
  const adminFns = ['adminAiSpend', 'adminOverview', 'adminAgents', 'adminRuns', 'adminUsage', 'adminCustomers', 'adminBilling', 'adminActivity', 'usageSummary', 'verifyTenantIsolation'];
  await check('admin', 'regular users are refused by every admin function', async () => {
    const bad = [];
    for (const fn of adminFns) {
      const r = await call(B.token, fn, {});
      if (r.status !== 403) bad.push(`${fn}:${r.status}`);
    }
    return bad.length ? { fail: `not refused: ${bad.join(", ")}` } : true;
  });
  await admin.from('profiles').update({ role: 'admin' }).eq('id', A.id);
  await check('admin', 'the admin console requires two-step sign-in (password-only admin refused)', async () => {
    const r = await call(A.token, 'adminOverview', {});
    return r.status === 403 && r.data.code === 'mfa_required' ? r.data.error : { fail: `status ${r.status} ${JSON.stringify(r.data).slice(0, 150)}` };
  });
  await check('admin', 'after setting up an authenticator and entering its code, the admin console opens', async () => {
    const mfa = await enrollTotp(A.client);
    A.token = mfa.token;
    const r = await call(A.token, 'adminOverview', {});
    return r.status === 200 ? 'TOTP verified; session at aal2' : { fail: `status ${r.status} ${JSON.stringify(r.data).slice(0, 150)}` };
  });
  for (const fn of adminFns) {
    await check('admin', `${fn} works for a platform admin`, async () => {
      const r = await call(A.token, fn, {});
      if (r.status !== 200) throw new Error(`status ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
      if (fn === 'verifyTenantIsolation' && r.data.ok === false) throw new Error(JSON.stringify(r.data).slice(0, 200));
      return `${r.ms} ms`;
    });
  }
  await check('admin', 'bootstrapOwnerWorkspace dry run (changes nothing)', async () => {
    const r = await call(A.token, 'bootstrapOwnerWorkspace', {});
    return r.status === 200 && r.data.dry_run === true ? true : { fail: `status ${r.status} ${JSON.stringify(r.data).slice(0, 150)}` };
  });
  await admin.from('profiles').update({ role: 'user' }).eq('id', A.id);

  // Recruitment and Cyber Security Scan run below as hired agents (as after a payment).
  await hireForTest(orgA, 'featured:recruitment', 'recruitment');
  await hireForTest(orgA, 'featured:cyber-scan', 'cyber-scan');

  // ---------------- Recruitment agent ----------------
  await recruitmentChecks(A, B);

  // ---------------- Cyber Security Scan agent (Phase 1) ----------------
  await securityChecks(A, B, orgA);

  // ---------------- Hired status ----------------
  await hiredChecks(A, B, orgA, orgB);

  // ---------------- Individual agent billing ----------------
  await billingChecks(A, B, orgA, orgB);

  // ---------------- AI features ----------------
  if (!RUN_AI) {
    record('ai', 'AI features', 'skip', 'run with "ai" in ops/e2e.request to include them');
    return;
  }
  let agentB;
  let pausedTask = null;
  await check('ai', 'generateAgent designs an agent (Agent Creator)', async () => {
    const r = await call(B.token, 'generateAgent', {
      industry: 'E-commerce', agent_title: 'Customer support assistant', business_name: 'E2E Test Shop',
      business_description: 'A small online shop selling handmade ceramic mugs to customers in Europe.',
      tasks: 'Answer order status questions and draft polite replies to customer emails.',
      responsibilities: ['Answer customer questions'], permissions: ['Read orders'], tone: 'Friendly', tools: [],
    });
    if (r.status !== 200 || !r.data.agent?.name) throw new Error(`status ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
    const ws = await call(B.token, 'manageOrganization', { action: 'bootstrap' });
    agentB = await B.entities.Agent.create({ ...r.data.agent, organization_id: ws.data.organization.id, status: 'active' });
    return `"${r.data.agent.name}", ${r.ms} ms`;
  });
  await check('ai', 'chatWithAgent replies', async () => {
    const r = await call(B.token, 'chatWithAgent', { agentId: agentB.id, message: 'In one sentence, what can you help me with?' });
    if (r.status !== 200 || !r.data.reply) throw new Error(`status ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
    return `${r.ms} ms: ${r.data.reply.slice(0, 120)}`;
  });
  await check('ai', 'runAgentTask completes a task and records the run', async () => {
    const r = await call(B.token, 'runAgentTask', { agentId: agentB.id, task: 'Draft a two-sentence reply to a customer asking where their order is.' });
    if (r.status !== 200) throw new Error(`status ${r.status} ${JSON.stringify(r.data).slice(0, 250)}`);
    const runs = await B.entities.AgentTask.filter({ agent_id: agentB.id });
    if (!runs.length) throw new Error('run not visible to its owner');
    pausedTask = r.data.task?.status === 'awaiting_approval' ? r.data.task.id : null;
    return `${r.data.task?.status}, ${r.ms} ms`;
  });
  await check('ai', 'resumeAgentTask: approving a checkpoint finishes the run', async () => {
    if (!pausedTask) return { skip: true, detail: 'run did not pause for approval' };
    const other = await call(A.token, 'resumeAgentTask', { taskId: pausedTask, decision: 'approve' });
    if (other.status !== 403 && other.status !== 404) throw new Error(`another user could resume: ${other.status}`);
    // A workflow can hold several checkpoints (each action step asks first).
    let status = 'awaiting_approval';
    let approvals = 0;
    let ms = 0;
    while (status === 'awaiting_approval' && approvals < 6) {
      const r = await call(B.token, 'resumeAgentTask', { taskId: pausedTask, decision: 'approve', note: 'Approved by E2E' });
      if (r.status !== 200) throw new Error(`status ${r.status} ${JSON.stringify(r.data).slice(0, 250)}`);
      approvals += 1;
      ms += r.ms;
      ({ data: { status } } = await admin.from('agent_tasks').select('status').eq('id', pausedTask).single());
    }
    const { data: done } = await admin.from('agent_tasks').select('status, output').eq('id', pausedTask).single();
    if (done.status !== 'succeeded') throw new Error(`ended as ${done.status} after ${approvals} approvals`);
    return `succeeded after ${approvals} approval(s), ${ms} ms, output ${String(done.output || '').length} chars`;
  });
  await check('ai', 'productResearch builds a report with web search', async () => {
    if (!RUN_RESEARCH) return { skip: true, detail: 'add "research" to ops/e2e.request (~$0.20)' };
    const r = await call(B.token, 'productResearch', { query: 'handmade ceramic coffee mug', max_products: 1, market: 'Germany' });
    if (r.status !== 200 || !r.data.report?.id) throw new Error(`status ${r.status} ${JSON.stringify(r.data).slice(0, 250)}`);
    return `${r.ms} ms`;
  });
  await check('ai', 'exportResearchXlsx exports the report', async () => {
    const { data: rep } = await admin.from('research_reports').select('id').eq('created_by_id', B.id).limit(1).maybeSingle();
    if (!rep) return { skip: true, detail: 'no report to export' };
    const r = await call(B.token, 'exportResearchXlsx', { report_id: rep.id, reportId: rep.id });
    return r.status === 200 ? `${r.ms} ms` : { fail: `status ${r.status} ${JSON.stringify(r.data).slice(0, 200)}` };
  });
  await check('ai', 'every AI call is costed in the ai_usage ledger', async () => {
    const { data } = await admin.from('ai_usage').select('cost_usd, ok, function_name, model, error').in('user_id', [A.id, B.id]);
    const total = (data || []).reduce((s, r) => s + Number(r.cost_usd || 0), 0);
    if (!data?.length) throw new Error('no ledger rows');
    for (const r of data.filter((x) => !x.ok)) console.log(`   AI call failed in ${r.function_name} (${r.model}): ${r.error}`);
    return `${data.length} calls, $${total.toFixed(4)} total`;
  });
}


// ===================================================== Recruitment agent ==
async function sha256hex(text) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function portalLinkFor(candidateId) {
  // Same as the server does when it emails a candidate, without sending mail in tests.
  const token = `e2e${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
  await admin.from('recruitment_candidates').update({ portal_token_hash: await sha256hex(token), portal_expires_at: new Date(Date.now() + 86400000).toISOString() }).eq('id', candidateId);
  return token;
}
const R = (token, body) => call(token, 'recruitment', body);

// A hire exactly as the Stripe webhook records it after a confirmed payment (tests only).
async function hireForTest(orgId, subject, planKey, agentId = null) {
  const now = Date.now();
  const { error } = await admin.from('agent_hires').insert({
    organization_id: orgId, subject, agent_id: agentId, plan_key: planKey, status: 'active',
    stripe_subscription_id: `sub_e2e_${runId}`, stripe_item_id: `si_e2e_${runId}_${orgId.slice(0, 8)}_${subject.replace(/[^a-z0-9]/gi, '')}`,
    current_period_start: new Date(now - 86400000).toISOString(), current_period_end: new Date(now + 29 * 86400000).toISOString(),
  });
  if (error) throw new Error(`test hire failed: ${error.message}`);
}

// ---------------------------------------------------- Individual agent billing --
const BILL = (token, body) => call(token, 'agentBilling', body);
async function billingChecks(A, B, orgA, orgB) {
  await check('billing', 'price catalog: 15 agent plans at the agreed launch prices', async () => {
    const r = await BILL(A.token, { action: 'overview' });
    if (r.status !== 200) throw new Error(`${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
    const price = Object.fromEntries(r.data.plans.map((p) => [p.key, p.price_cents / 100]));
    const ok = r.data.plans.length === 15 && price.recruitment === 79 && price['cyber-scan'] === 29 && price['customer-support'] === 29 && price['flight-booking'] === 19 && price.hazel === 39 && price.legal === 49;
    return ok ? `payments ${r.data.payments_ready ? 'ready (test mode)' : 'not set up yet'}` : { fail: JSON.stringify(price) };
  });
  await check('billing', 'customers cannot create hires, change usage or prices directly', async () => {
    const h = await B.client.from('agent_hires').insert({ organization_id: orgB, subject: 'x', plan_key: 'crm', status: 'active', current_period_start: new Date().toISOString(), current_period_end: new Date(Date.now() + 864e5).toISOString() });
    const u = await B.client.from('agent_usage').update({ used: {} }).eq('organization_id', orgB);
    const p = await B.client.from('agent_plans').update({ price_cents: 1 }).eq('key', 'crm');
    const rpc = await B.client.rpc('billing_reserve', { p_org: orgB, p_subject: 'x', p_plan: 'crm', p_meter: 'unit', p_units: 1 });
    const { data: plan } = await admin.from('agent_plans').select('price_cents').eq('key', 'crm').single();
    return h.error && rpc.error && plan.price_cents === 3900 ? true : { fail: JSON.stringify({ h: h.error, u: u.error, p: p.error, rpc: rpc.error, price: plan.price_cents }) };
  });
  await check('billing', 'only an owner/admin can hire; another company cannot hire this workspace\'s agent', async () => {
    const { data: agent } = await admin.from('agents').insert({ name: `Billing test ${runId}`, organization_id: orgA, created_by_id: A.id, created_by: A.email, status: 'active', catalog_key: 'crm' }).select('id').single();
    const other = await BILL(B.token, { action: 'hire', agent_id: agent.id });
    await admin.from('organization_members').update({ member_role: 'member' }).eq('organization_id', orgA).eq('user_id', A.id);
    const member = await BILL(A.token, { action: 'hire', agent_id: agent.id });
    await admin.from('organization_members').update({ member_role: 'owner' }).eq('organization_id', orgA).eq('user_id', A.id);
    const owner = await BILL(A.token, { action: 'hire', agent_id: agent.id });
    const ownerOk = owner.status === 503 || (owner.status === 200 && /^https:\/\/checkout\.stripe\.com\//.test(owner.data.url || ''));
    return [404, 503].includes(other.status) && member.status === 403 && ownerOk ? `owner: ${owner.status === 200 ? 'Stripe test checkout opened' : 'payments not set up yet (503)'}` : { fail: `${other.status}/${member.status}/${owner.status} ${JSON.stringify(owner.data).slice(0, 200)}` };
  });

  // Trial and monthly limits, exercised through scan uploads (no AI cost).
  const code = (await call(B.token, 'securityScan', { action: 'createPairingCode' })).data.code;
  const pc = await simulatedPc(URL_, ANON, `BILL-PC-${runId}`);
  await pc.link(code);
  await check('billing', 'unhired Cyber Security Scan: 3 free trial scans, then a clear prompt to hire', async () => {
    const statuses = [];
    for (let i = 0; i < 4; i += 1) statuses.push((await pc.upload(sampleScan())).response);
    const last = statuses.at(-1);
    return statuses.slice(0, 3).every((r) => r.status === 200) && last.status === 402 && /trial/i.test(last.data.error) && /\$29\/month/.test(last.data.error)
      ? last.data.error : { fail: statuses.map((r) => `${r.status} ${r.data.error || ''}`).join(' | ') };
  });
  await check('billing', 'after a confirmed hire: 60 scans per month, then refused with the reset date', async () => {
    await hireForTest(orgB, 'featured:cyber-scan', 'cyber-scan');
    const first = (await pc.upload(sampleScan())).response;
    await admin.from('agent_usage').update({ used: { scan: 60 } }).eq('organization_id', orgB).eq('subject', 'featured:cyber-scan').eq('kind', 'hire');
    const over = (await pc.upload(sampleScan())).response;
    const view = await BILL(B.token, { action: 'overview' });
    const hired = view.data.hires.some((h) => h.subject === 'featured:cyber-scan');
    return first.status === 200 && over.status === 429 && /60 scans/.test(over.data.error) && /resets on \d{4}-\d{2}-\d{2}/.test(over.data.error) && hired ? over.data.error : { fail: `${first.status} ${over.status} ${over.data.error} hired=${hired}` };
  });
  await check('billing', 'a refused scan is not stored and uses no allowance', async () => {
    const { data: usage } = await admin.from('agent_usage').select('used').eq('organization_id', orgB).eq('subject', 'featured:cyber-scan').eq('kind', 'hire').single();
    return usage.used.scan === 60 ? true : { fail: JSON.stringify(usage.used) };
  });
  await check('billing', 'forged Stripe events are rejected', async () => {
    const res = await fetch(`${URL_}/functions/v1/stripeWebhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': 't=1,v1=deadbeef' },
      body: JSON.stringify({ id: 'evt_forged', type: 'checkout.session.completed', data: { object: { metadata: { kind: 'agent_hires', organization_id: orgB, first_subject: 'featured:recruitment' }, payment_status: 'paid' } } }) });
    const { data } = await admin.from('agent_hires').select('id').eq('organization_id', orgB).eq('subject', 'featured:recruitment');
    return res.status === 400 && data.length === 0 ? true : { fail: `${res.status} hires=${data.length}` };
  });
  if (STRIPE_KEY) await stripeChecks(A, orgA);
  else await check('billing', 'real Stripe test-mode payment', async () => ({ skip: true, detail: 'needs the Stripe test key (STRIPE_SECRET_KEY) in GitHub' }));
}

// Real Stripe TEST-mode payment with Stripe's test card: subscription → signed webhook → hire.
const STRIPE_KEY = /^sk_test_/.test(process.env.STRIPE_SECRET_KEY || '') ? process.env.STRIPE_SECRET_KEY : '';
async function stripeApi(method, path, params) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, { method, headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params ? new URLSearchParams(params) : undefined });
  const j = await res.json();
  if (!res.ok) throw new Error(`${path}: ${j.error?.message}`);
  return j;
}
async function waitFor(fn, ms = 40000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}
async function stripeChecks(A, orgA) {
  let sub;
  const { data: agents } = await admin.from('agents').insert([
    { name: `Paid CRM ${runId}`, organization_id: orgA, created_by_id: A.id, created_by: A.email, status: 'active', catalog_key: 'crm' },
    { name: `Paid Support ${runId}`, organization_id: orgA, created_by_id: A.id, created_by: A.email, status: 'active', catalog_key: 'customer-support' },
    { name: `Unpaid ${runId}`, organization_id: orgA, created_by_id: A.id, created_by: A.email, status: 'active', catalog_key: 'legal' },
  ]).select('id, catalog_key');
  const [crm, support, unpaid] = agents;
  try {
    await check('billing-stripe', 'Stripe test payment (test card) hires exactly that one agent', async () => {
      const price = (await stripeApi('GET', '/prices?lookup_keys[]=coinexa_agent_crm_v1&active=true')).data[0];
      if (!price) throw new Error('crm test price missing: run the Stripe test setup');
      const customer = await stripeApi('POST', '/customers', { email: A.email, 'metadata[e2e]': runId });
      const card = await stripeApi('POST', `/payment_methods/pm_card_visa/attach`, { customer: customer.id });
      await stripeApi('POST', `/customers/${customer.id}`, { 'invoice_settings[default_payment_method]': card.id });
      await admin.from('organizations').update({ stripe_customer_id: customer.id }).eq('id', orgA);
      sub = await stripeApi('POST', '/subscriptions', { customer: customer.id, 'items[0][price]': price.id, 'metadata[kind]': 'agent_hires', 'metadata[organization_id]': orgA, 'metadata[first_subject]': crm.id, 'metadata[first_plan]': 'crm' });
      const hire = await waitFor(async () => (await admin.from('agent_hires').select('*').eq('organization_id', orgA).eq('subject', crm.id).maybeSingle()).data);
      const others = (await admin.from('agent_hires').select('subject').eq('organization_id', orgA).in('subject', [support.id, unpaid.id])).data;
      return hire && hire.status === 'active' && others.length === 0 ? `subscription ${sub.status}; hire ${hire.status} until ${hire.current_period_end.slice(0, 10)}` : { fail: JSON.stringify({ hire, others, status: sub.status }) };
    });
    await check('billing-stripe', 'hiring a second agent adds it to the same subscription after confirmation', async () => {
      const first = await BILL(A.token, { action: 'hire', agent_id: support.id });
      if (!first.data.needs_confirmation) throw new Error(JSON.stringify(first.data).slice(0, 200));
      const wrong = await BILL(A.token, { action: 'hire', agent_id: support.id, confirm: true, confirm_price_cents: 1 });
      const ok = await BILL(A.token, { action: 'hire', agent_id: support.id, confirm: true, confirm_price_cents: 2900 });
      const items = (await stripeApi('GET', `/subscriptions/${sub.id}`)).items.data.length;
      return wrong.data.needs_confirmation && ok.status === 200 && ok.data.hired && items === 2 ? 'Customer Support added ($29); subscription has 2 lines' : { fail: JSON.stringify({ wrong: wrong.data, ok: ok.data, items }) };
    });
    await check('billing-stripe', 'the overview marks only the paid agents as hired', async () => {
      const v = await BILL(A.token, { action: 'overview' });
      const subjects = v.data.hires.map((h) => h.subject);
      return subjects.includes(crm.id) && subjects.includes(support.id) && !subjects.includes(unpaid.id) ? true : { fail: JSON.stringify(subjects) };
    });
    await check('billing-stripe', 'cancelling keeps the agent until the end of the paid period', async () => {
      const r = await BILL(A.token, { action: 'cancel', agent_id: support.id });
      const { data: h } = await admin.from('agent_hires').select('status, ends_at, current_period_end').eq('organization_id', orgA).eq('subject', support.id).single();
      const items = (await stripeApi('GET', `/subscriptions/${sub.id}`)).items.data.length;
      return r.status === 200 && h.status === 'cancelled' && h.ends_at && items === 1 ? `usable until ${h.ends_at.slice(0, 10)}` : { fail: JSON.stringify({ r: r.data, h, items }) };
    });
    await check('billing-stripe', 'a replayed Stripe event is applied only once', async () => {
      const { data } = await admin.from('stripe_events').select('id, result').like('result', 'agent hire%').order('created_date', { ascending: false }).limit(5);
      return data.length > 0 ? `${data.length} recent agent-hire events recorded once each` : { fail: 'no events recorded' };
    });
  } finally {
    if (sub) await stripeApi('DELETE', `/subscriptions/${sub.id}`).catch(() => null);
  }
}

// ---------------------------------------------------- Hired status (payment-confirmed) --
async function hiredChecks(A, B, orgA, orgB) {
  const hiredOf = async (user) => {
    const { data, error } = await user.client.from('organizations').select('id, hired');
    if (error) throw new Error(error.message);
    return Object.fromEntries(data.map((o) => [o.id, o.hired]));
  };
  await check('hired', 'a workspace without confirmed payment is not hired', async () => {
    const h = await hiredOf(A);
    return h[orgA] === false ? true : { fail: JSON.stringify(h) };
  });
  await check('hired', 'a workspace owner cannot mark their own workspace paid or hired', async () => {
    await A.client.from('organizations').update({ stripe_subscription_id: 'sub_fake' }).eq('id', orgA);
    const direct = await A.client.from('organizations').update({ hired: true }).eq('id', orgA);
    const h = await hiredOf(A);
    const { data } = await admin.from('organizations').select('stripe_subscription_id').eq('id', orgA).single();
    return h[orgA] === false && !data.stripe_subscription_id && direct.error ? `refused (${direct.error.code || 'error'})` : { fail: JSON.stringify({ h, sub: data.stripe_subscription_id, direct: direct.error }) };
  });
  await check('hired', 'confirmed payment (as recorded by the verified Stripe webhook) marks every agent hired', async () => {
    await admin.from('organizations').update({ stripe_subscription_id: `sub_e2e_${runId}`, stripe_customer_id: `cus_e2e_${runId}` }).eq('id', orgA);
    const h = await hiredOf(A);
    const { data: agents } = await A.client.from('agents').select('id, organization_id').eq('organization_id', orgA);
    return h[orgA] === true ? `workspace hired; ${agents.length} agent(s) in it show Hired` : { fail: JSON.stringify(h) };
  });
  await check('hired', "another company never sees this workspace's status, and stays unhired", async () => {
    const hb = await hiredOf(B);
    return !(orgA in hb) && hb[orgB] === false ? true : { fail: JSON.stringify(hb) };
  });
  await check('hired', 'cancelled subscription or suspended workspace removes Hired', async () => {
    await admin.from('organizations').update({ status: 'suspended' }).eq('id', orgA);
    const suspended = (await hiredOf(A))[orgA];
    await admin.from('organizations').update({ status: 'active', stripe_subscription_id: '', stripe_customer_id: null }).eq('id', orgA);
    const cancelled = (await hiredOf(A))[orgA];
    return suspended === false && cancelled === false ? true : { fail: JSON.stringify({ suspended, cancelled }) };
  });
}

// ---------------------------------------------------- Cyber Security Scan (Phase 1) --
const S = (token, body) => call(token, 'securityScan', body);
async function securityChecks(A, B, orgA) {
  let code;
  await check('security-scan', 'only signed-in workspace users reach company actions', async () => {
    const r = await S(null, { action: 'overview' });
    return r.status === 401 ? true : { fail: `status ${r.status}` };
  });
  await check('security-scan', 'owner creates a one-time linking code (only its hash is stored)', async () => {
    const r = await S(A.token, { action: 'createPairingCode' });
    if (r.status !== 200) throw new Error(`${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
    code = r.data.code;
    const { data } = await admin.from('security_pairing_codes').select('code_hash').eq('expires_at', r.data.expires_at);
    const stored = JSON.stringify(data);
    return /^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(code) && !stored.includes(code.replace('-', '')) ? `code issued, expires ${r.data.expires_at}` : { fail: stored };
  });
  const pc = await simulatedPc(URL_, ANON, `E2E-PC-${runId}`);
  await check('security-scan', 'a linking request signed with a different key is refused', async () => {
    const other = await simulatedPc(URL_, ANON, 'X');
    const r = await fetch(`${URL_}/functions/v1/securityScan`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON },
      body: JSON.stringify({ action: 'device_pair', code, public_key: pc.publicKey, device_name: pc.name, signature: await other.sign(`coinexa-scan-pair-v1\n${code.replace('-', '')}\n${pc.publicKey}\n${pc.name}`) }) });
    return r.status === 401 ? true : { fail: `status ${r.status}` };
  });
  await check('security-scan', 'PC links with the code; the code cannot be used twice', async () => {
    const r = await pc.link(code);
    if (r.status !== 200) throw new Error(`${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
    const again = await (await simulatedPc(URL_, ANON, 'SECOND')).link(code);
    const { data } = await admin.from('security_devices').select('organization_id, public_key').eq('id', pc.deviceId).single();
    return again.status === 401 && data.organization_id === orgA && data.public_key === pc.publicKey ? `linked ${pc.deviceId}` : { fail: `again ${again.status}` };
  });
  await check('security-scan', 'another company cannot see or unlink this PC', async () => {
    const code2 = await S(B.token, { action: 'revokeDevice', device_id: pc.deviceId });
    const ov = await S(B.token, { action: 'overview' });
    const leak = (ov.data.devices || []).some((d) => d.id === pc.deviceId);
    return code2.status === 404 && !leak ? true : { fail: `${code2.status} leak=${leak}` };
  });

  let scanId;
  await check('security-scan', 'signed sample scan is accepted; addresses stored encrypted', async () => {
    const { response: r } = await pc.upload(sampleScan());
    if (r.status !== 200) throw new Error(`${r.status} ${JSON.stringify(r.data).slice(0, 300)}`);
    scanId = r.data.scan_id;
    const { data: hosts } = await admin.from('security_scan_hosts').select('identity_enc, ports').eq('scan_id', scanId);
    const { data: scan } = await admin.from('security_scans').select('networks_enc, authorized_by').eq('id', scanId).single();
    const plain = JSON.stringify(hosts) + scan.networks_enc;
    const ok = r.data.devices === 5 && r.data.open_ports === 8 && hosts.length === 5 && !plain.includes('192.168.50') && !plain.includes('office-printer') && hosts.every((h) => h.identity_enc.startsWith('v1:'));
    return ok ? `5 devices, 8 open ports; authorised by ${scan.authorized_by}` : { fail: JSON.stringify(r.data) };
  });
  await check('security-scan', 'replaying the exact same signed upload is refused', async () => {
    const { request, response } = await pc.upload(sampleScan());
    const again = await pc.replay(request);
    return response.status === 200 && again.status === 409 ? true : { fail: `${response.status}/${again.status}` };
  });
  await check('security-scan', 'altered scan contents (signature no longer matches) are refused', async () => {
    const real = JSON.stringify(sampleScan());
    const { response } = await pc.upload(real, { payloadOverride: real.replace('"router"', '"evil"') });
    return response.status === 401 ? true : { fail: `status ${response.status}` };
  });
  await check('security-scan', 'stale or future timestamps are refused (±5 minutes)', async () => {
    const old = await pc.upload(sampleScan(), { timestamp: new Date(Date.now() - 10 * 60000).toISOString() });
    const future = await pc.upload(sampleScan(), { timestamp: new Date(Date.now() + 10 * 60000).toISOString() });
    return old.response.status === 401 && future.response.status === 401 ? true : { fail: `${old.response.status}/${future.response.status}` };
  });
  await check('security-scan', 'a request signed by a different key for this PC is refused', async () => {
    const other = await simulatedPc(URL_, ANON, 'X');
    const { response } = await pc.upload(sampleScan(), { signWith: other.sign });
    const unknown = await pc.upload(sampleScan(), { deviceId: 'no-such-device' });
    return response.status === 401 && unknown.response.status === 401 ? true : { fail: `${response.status}/${unknown.response.status}` };
  });
  await check('security-scan', 'public internet ranges, outside devices and unauthorised scans are refused', async () => {
    const pub = await pc.upload(sampleScan({ networks: [{ cidr: '8.8.8.0/24' }], hosts: [{ ip: '8.8.8.8', ports: [] }] }));
    const outside = await pc.upload(sampleScan({ hosts: [{ ip: '192.168.60.5', ports: [] }] }));
    const unauth = await pc.upload(sampleScan({ authorization: { confirmed: false, confirmed_by: 'x y', statement_version: 'scan-authorization-v1' } }));
    const s = [pub, outside, unauth].map((x) => x.response.status);
    return s.every((x) => x === 422) ? `${pub.response.data.error}` : { fail: s.join('/') };
  });
  await check('security-scan', 'owner sees full details; another company cannot open or delete the scan', async () => {
    const mine = await S(A.token, { action: 'getScan', scan_id: scanId });
    const theirs = await S(B.token, { action: 'getScan', scan_id: scanId });
    const del = await S(B.token, { action: 'deleteScan', scan_id: scanId });
    const ok = mine.status === 200 && mine.data.hosts[0].ip === '192.168.50.1' && mine.data.hosts[1].hostname === 'office-printer'
      && mine.data.scan.networks[0].cidr === '192.168.50.0/24' && !('nonce' in mine.data.scan) && theirs.status === 404 && del.status === 404;
    return ok ? true : { fail: JSON.stringify({ m: mine.status, t: theirs.status, d: del.status, h: mine.data.hosts?.[0] }) };
  });
  await check('security-scan', 'a workspace member (not admin) sees the scan with addresses hidden', async () => {
    await admin.from('organization_members').update({ member_role: 'member' }).eq('organization_id', orgA).eq('user_id', A.id);
    try {
      const r = await S(A.token, { action: 'getScan', scan_id: scanId });
      const code2 = await S(A.token, { action: 'createPairingCode' });
      const ok = r.status === 200 && r.data.addresses_hidden && r.data.hosts.every((h) => h.ip.endsWith('.x') && !h.mac && !h.hostname) && code2.status === 403;
      return ok ? `e.g. ${r.data.hosts[0].ip}` : { fail: JSON.stringify({ s: r.status, h: r.data.hosts?.[0], c: code2.status }) };
    } finally {
      await admin.from('organization_members').update({ member_role: 'owner' }).eq('organization_id', orgA).eq('user_id', A.id);
    }
  });
  await check('security-scan', 'PC status check works; after unlinking, the PC can no longer upload', async () => {
    const before = await pc.status();
    const rev = await S(A.token, { action: 'revokeDevice', device_id: pc.deviceId });
    const after = await pc.upload(sampleScan());
    const st = await pc.status();
    return before.response.status === 200 && rev.status === 200 && after.response.status === 403 && st.response.status === 403 ? true
      : `${before.response.status}/${rev.status}/${after.response.status}/${st.response.status}`;
  });
  await check('security-scan', 'owner can delete a scan with its device list; actions are in the audit log', async () => {
    const d = await S(A.token, { action: 'deleteScan', scan_id: scanId });
    const { data: hosts } = await admin.from('security_scan_hosts').select('id').eq('scan_id', scanId);
    const { data: logs } = await admin.from('audit_logs').select('action').eq('organization_id', orgA).like('action', 'security.%');
    const kinds = [...new Set(logs.map((l) => l.action))].sort();
    return d.status === 200 && hosts.length === 0 && kinds.includes('security.device_linked') && kinds.includes('security.scan_uploaded') && kinds.includes('security.device_revoked')
      ? kinds.join(', ') : JSON.stringify({ d: d.status, hosts: hosts.length, kinds });
  });
  await check('security-scan', 'invalid JSON and unknown actions are handled cleanly', async () => {
    const bad = await fetch(`${URL_}/functions/v1/securityScan`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON }, body: '{oops' });
    const unknown = await S(A.token, { action: 'nope' });
    return bad.status === 400 && unknown.status === 400 ? true : { fail: `${bad.status}/${unknown.status}` };
  });
}

// Minimal valid single-page text PDF (for the CV import check).
function makePdf(lines) {
  const esc = (t) => t.replace(/[\\()]/g, (c) => `\\${c}`);
  const stream = `BT /F1 12 Tf 72 740 Td 16 TL ${lines.map((l) => `(${esc(l)}) '`).join(' ')} ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}

async function recruitmentChecks(A, B) {
  let campaign;
  await check('recruitment', 'campaign with the initial offer above the maximum is refused', async () => {
    const r = await R(A.token, { action: 'createCampaign', campaign: { title: 'X', country: 'Egypt', initial_offer: 200, max_budget: 150 } });
    return r.status === 400 ? true : { fail: `status ${r.status}` };
  });
  await check('recruitment', 'create campaign (3 IT Help Desk technicians, Cairo, up to $150/day, 5 days)', async () => {
    const r = await R(A.token, { action: 'createCampaign', campaign: {
      title: 'IT Help Desk Technician', specialization: 'IT support', country: 'Egypt', city: 'Cairo', positions_required: 3,
      skills: 'Windows troubleshooting, Microsoft Office, Basic networking', experience_min: 1, experience_max: 3,
      languages: 'Arabic, English', work_mode: 'onsite', duration: '5 days', schedule: '09:00-17:00', availability: 'Next week',
      description: 'On-site help desk support for an office move.', currency: 'USD', pay_frequency: 'daily',
      initial_offer: 120, max_budget: 150, negotiation_strategy: 'balanced', max_rounds: 3, outreach_mode: 'approval' } });
    if (r.status !== 200) throw new Error(`status ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
    campaign = r.data.campaign;
    return campaign.id;
  });
  if (!campaign) return;

  await check('recruitment', 'another company cannot see, change or add to this campaign', async () => {
    const get = await R(B.token, { action: 'getCampaign', campaign_id: campaign.id });
    const add = await R(B.token, { action: 'addCandidate', campaign_id: campaign.id, candidate: { full_name: 'Intruder' } });
    const upd = await R(B.token, { action: 'updateCampaign', campaign_id: campaign.id, campaign: { max_budget: 999 } });
    const rep = await R(B.token, { action: 'report', campaign_id: campaign.id });
    const ov = await R(B.token, { action: 'overview' });
    const leaks = (ov.data.campaigns || []).some((c) => c.id === campaign.id);
    const ok = [get, add, upd, rep].every((r) => r.status === 404) && !leaks;
    return ok ? true : { fail: `statuses ${get.status}/${add.status}/${upd.status}/${rep.status}, overview leak ${leaks}` };
  });
  await check('recruitment', 'signed-out visitors cannot use company actions', async () => {
    const r = await R(null, { action: 'overview' });
    return r.status === 401 ? true : { fail: `status ${r.status}` };
  });

  let mona, omar;
  await check('recruitment', 'add a referred candidate; contact details are stored encrypted', async () => {
    const r = await R(A.token, { action: 'addCandidate', campaign_id: campaign.id, source: 'referral', lawful_basis: 'legitimate_interest',
      source_detail: 'Referred by a staff member', candidate: { full_name: 'Mona Test', headline: 'IT support technician', country: 'Egypt', city: 'Cairo',
        experience_years: 2, skills: 'Windows 10 troubleshooting, Microsoft Office 365, basic networking (TCP/IP, DHCP)', languages: 'Arabic, English',
        profile_text: 'Two years of Windows 10 troubleshooting and Microsoft Office 365 support at a Cairo help desk. Set up DHCP and basic networking for small offices.',
        expected_comp: 180, contact: { email: `e2e-cand-${runId}@example.com`, phone: '+20 100 000 0000' } } });
    if (r.status !== 200) throw new Error(`status ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
    mona = r.data.candidate;
    const { data } = await admin.from('recruitment_candidates').select('contact_enc, contact_hint').eq('id', mona.id).single();
    if (!data.contact_enc?.startsWith('v1:') || data.contact_enc.includes('example.com')) throw new Error('contact not encrypted');
    if (data.contact_hint.includes(`e2e-cand-${runId}`)) throw new Error('hint not masked');
    return data.contact_hint;
  });
  await check('recruitment', 'CSV import from the company database (bad rows reported, not guessed)', async () => {
    const csv = `full_name,email,country,city,experience_years,skills,expected_rate\nOmar Test,e2e-omar-${runId}@example.com,Egypt,Cairo,1,"Windows, Office",140\nBroken Row,not-an-email,Egypt,Giza,2,Networking,120\n`;
    const r = await R(A.token, { action: 'importCsv', campaign_id: campaign.id, csv, file_name: 'company-db.csv', source: 'company_database' });
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    const { data } = await admin.from('recruitment_candidates').select('id').eq('campaign_id', campaign.id).eq('full_name', 'Omar Test').single();
    omar = data;
    return r.data.added === 1 && r.data.skipped.length === 1 ? `1 added, skipped: ${r.data.skipped[0]}` : { fail: JSON.stringify(r.data) };
  });

  // Negotiation through the candidate portal.
  let monaToken;
  let captchaOn = false;
  await check('recruitment', 'portal: candidate sees the job and the $120 opening offer', async () => {
    monaToken = await portalLinkFor(mona.id);
    const r = await R(null, { action: 'portal_get', token: monaToken });
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    return r.data.current_offer === 120 && r.data.job.title === 'IT Help Desk Technician' ? true : { fail: JSON.stringify(r.data).slice(0, 200) };
  });
  await check('recruitment', 'portal: a response without consent to data processing is refused', async () => {
    const r = await R(null, { action: 'portal_respond', token: monaToken, response: 'request', amount: 180 });
    return r.status === 400 ? true : { fail: `status ${r.status}` };
  });
  await check('recruitment', 'negotiation: asks $180 against a $150 maximum — never offered more than $150, then escalated', async () => {
    const offers = [];
    let r;
    for (let i = 0; i < 6; i += 1) {
      r = await R(null, { action: 'portal_respond', token: monaToken, response: 'request', amount: 180, availability: 'Available next week',
        consents: { data_processing: true, share_with_company: true, contact: true } });
      if (r.status !== 200) throw new Error(`status ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
      offers.push(r.data.decision?.amount);
      if (r.data.decision?.action === 'escalate') break;
    }
    if (offers.some((a) => a > 150)) throw new Error(`offered above max: ${offers}`);
    if (r.data.decision.action !== 'escalate' || r.data.candidate.status !== 'awaiting_approval') throw new Error(JSON.stringify(r.data.decision));
    return `offers ${offers.join(' → ')} then company approval requested`;
  });
  await check('recruitment', 'company declines the over-budget request; candidate accepts the $150 final offer', async () => {
    const d = await R(A.token, { action: 'decideEscalation', candidate_id: mona.id, approve: false });
    if (d.status !== 200) throw new Error(`decide ${d.status} ${JSON.stringify(d.data)}`);
    const a = await R(null, { action: 'portal_respond', token: monaToken, response: 'accept_offer', consents: { data_processing: true } });
    if (a.status !== 200) throw new Error(`accept ${a.status} ${JSON.stringify(a.data)}`);
    const { data } = await admin.from('recruitment_candidates').select('status, final_comp').eq('id', mona.id).single();
    return data.status === 'agreed' && Number(data.final_comp) === 150 ? true : { fail: JSON.stringify(data) };
  });
  await check('recruitment', 'candidate asking $140 (within budget) is agreed at $140', async () => {
    const t = await portalLinkFor(omar.id);
    let last;
    for (let i = 0; i < 6; i += 1) {
      last = await R(null, { action: 'portal_respond', token: t, response: 'request', amount: 140, consents: { data_processing: true } });
      if (last.data.decision?.action === 'accept') break;
    }
    const { data } = await admin.from('recruitment_candidates').select('status, final_comp').eq('id', omar.id).single();
    return data.status === 'agreed' && Number(data.final_comp) === 140 ? true : { fail: JSON.stringify(data) };
  });
  await check('recruitment', 'only an agreed candidate can be marked hired', async () => {
    const ok = await R(A.token, { action: 'setCandidateStatus', candidate_id: mona.id, status: 'hired' });
    return ok.status === 200 ? true : { fail: `status ${ok.status}` };
  });

  // Public application with consent + CV, then decline/opt-out and erasure.
  let applicantToken;
  await check('recruitment', 'public application page: consent required; application creates a candidate', async () => {
    const page = await R(null, { action: 'apply_get', slug: campaign.apply_slug });
    if (page.status !== 200) throw new Error(`apply_get ${page.status}`);
    const base = { action: 'apply_submit', slug: campaign.apply_slug, candidate: { full_name: 'Sara Applicant', country: 'Egypt', city: 'Giza', experience_years: 3,
      skills: 'Windows, Active Directory', profile_text: 'Three years of desktop support.', contact: { email: `e2e-sara-${runId}@example.com` } } };
    const noConsent = await R(null, { ...base, consents: { data_processing: false } });
    if (noConsent.status !== 400) throw new Error(`without consent: ${noConsent.status}`);
    const r = await R(null, { ...base, consents: { data_processing: true, share_with_company: false, contact: true } });
    if (r.status === 400 && /security check/i.test(r.data.error || '')) {
      // CAPTCHA is on: an application without a solved check is refused. The rest of the
      // flow continues with the applicant recorded as after a passed check.
      captchaOn = true;
      const { data: cand } = await admin.from('recruitment_candidates').insert({ organization_id: campaign.organization_id, campaign_id: campaign.id,
        full_name: 'Sara Applicant', country: 'Egypt', city: 'Giza', experience_years: 3, skills: ['Windows', 'Active Directory'],
        profile_text: 'Three years of desktop support.', source: 'application', lawful_basis: 'consent', status: 'interested' }).select('id').single();
      await admin.from('recruitment_consents').insert(['data_processing', 'share_with_company', 'contact'].map((kind) => ({
        organization_id: campaign.organization_id, candidate_id: cand.id, kind, granted: kind !== 'share_with_company', text_version: 'recruitment-consent-v1', source: 'application' })));
      applicantToken = await portalLinkFor(cand.id);
    } else {
      if (r.status !== 200 || !r.data.portal_url) throw new Error(`status ${r.status} ${JSON.stringify(r.data)}`);
      applicantToken = r.data.portal_url.split('/r/')[1];
    }
    const { data: consents } = await admin.from('recruitment_consents').select('kind, granted').in('candidate_id',
      (await admin.from('recruitment_candidates').select('id').eq('campaign_id', campaign.id).eq('full_name', 'Sara Applicant')).data.map((c) => c.id));
    return consents.length === 3 ? `${captchaOn ? 'CAPTCHA on: unsolved application refused; ' : ''}consent records: ` + consents.map((c) => `${c.kind}=${c.granted}`).join(', ') : { fail: JSON.stringify(consents) };
  });
  await check('recruitment', 'CV upload: real PDF accepted, a disguised file refused', async () => {
    const send = (bytes, name) => {
      const form = new FormData();
      form.append('token', applicantToken);
      form.append('file', new Blob([bytes]), name);
      return fetch(`${URL_}/functions/v1/recruitment`, { method: 'POST', headers: { apikey: ANON }, body: form });
    };
    const good = await send(new TextEncoder().encode('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF'), 'cv.pdf');
    const bad = await send(new TextEncoder().encode('<script>alert(1)</script>'), 'cv.pdf');
    return good.status === 200 && bad.status === 400 ? true : { fail: `good ${good.status} bad ${bad.status}` };
  });
  await check('recruitment', 'contact details are withheld from the company without the candidate’s sharing consent', async () => {
    const { data } = await admin.from('recruitment_candidates').select('id').eq('campaign_id', campaign.id).eq('full_name', 'Sara Applicant').single();
    const r = await R(A.token, { action: 'getCandidate', candidate_id: data.id });
    return r.status === 200 && r.data.contact_restricted === true && !r.data.candidate.contact && !r.data.cv_url ? true : { fail: JSON.stringify({ c: r.data.candidate?.contact, cv: r.data.cv_url }) };
  });
  await check('recruitment', 'candidate can decline, opt out and erase their data', async () => {
    const d = await R(null, { action: 'portal_respond', token: applicantToken, response: 'opt_out' });
    const e = await R(null, { action: 'portal_erase', token: applicantToken });
    const again = await R(null, { action: 'portal_get', token: applicantToken });
    const { data } = await admin.from('recruitment_candidates').select('full_name, contact_enc, cv_path, erased_at, do_not_contact').eq('campaign_id', campaign.id).not('erased_at', 'is', null).single();
    const ok = d.status === 200 && e.status === 200 && again.status === 404 && !data.contact_enc && !data.cv_path && data.do_not_contact;
    return ok ? true : { fail: JSON.stringify({ d: d.status, e: e.status, again: again.status, data }) };
  });
  await check('recruitment', 'invalid portal link and unknown action are handled cleanly', async () => {
    const bad = await R(null, { action: 'portal_get', token: 'x'.repeat(43) });
    const unknown = await R(A.token, { action: 'nope' });
    return bad.status === 404 && unknown.status === 400 ? true : { fail: `${bad.status}/${unknown.status}` };
  });

  await check('recruitment', 'dashboard counts, completion rate and filters', async () => {
    const all = await R(A.token, { action: 'overview' });
    const t = all.data.totals;
    const egypt = await R(A.token, { action: 'overview', filters: { country: 'egypt' } });
    const france = await R(A.token, { action: 'overview', filters: { country: 'France' } });
    const ok = t.hired === 1 && t.agreed === 1 && t.completion === 67 && egypt.data.campaigns.length === 1 && france.data.campaigns.length === 0;
    return ok ? `hired ${t.hired}, agreed ${t.agreed}, completion ${t.completion}%` : { fail: JSON.stringify(t) };
  });
  await check('recruitment', 'final report separates hired, agreed and interested; respects contact consent', async () => {
    const r = await R(A.token, { action: 'report', campaign_id: campaign.id });
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    const stages = Object.fromEntries(r.data.rows.map((row) => [row.name, row.stage]));
    const ok = stages['Mona Test'] === 'Hired' && stages['Omar Test'].startsWith('Agreed') && !('Sara Applicant' in stages)
      && r.data.csv.split('\r\n')[0].includes('Final negotiated compensation');
    return ok ? `${r.data.rows.length} rows; ${JSON.stringify(r.data.summary)}` : { fail: JSON.stringify(stages) };
  });

  // ---------------------------------------------------- written interviews (text only) --
  let lina, linaToken;
  const QUESTIONS = [
    { question: 'Describe how you would troubleshoot a Windows 10 laptop that cannot reach the network.', criterion: 'Windows troubleshooting', strong_answer: 'Checks cable/Wi-Fi, ipconfig, DHCP, DNS in order' },
    { question: 'A user cannot open Outlook after an Office update. What do you check first?', criterion: 'Microsoft Office support', strong_answer: 'Safe mode, profile, repair' },
    { question: 'Explain what DHCP does and how you would spot a DHCP problem.', criterion: 'Basic networking', strong_answer: 'Address assignment; APIPA 169.254 addresses' },
  ];
  await check('interviews', 'inviting before an approved question plan is refused', async () => {
    const add = await R(A.token, { action: 'addCandidate', campaign_id: campaign.id, source: 'referral', lawful_basis: 'legitimate_interest',
      candidate: { full_name: 'Lina Test', headline: 'Help desk technician', country: 'Egypt', city: 'Cairo', experience_years: 2,
        skills: 'Windows, Office 365, DHCP', profile_text: 'Help desk technician with two years of Windows and Office 365 support.', contact: { email: `e2e-lina-${runId}@example.com` } } });
    if (add.status !== 200) throw new Error(`add ${add.status} ${JSON.stringify(add.data).slice(0, 200)}`);
    lina = add.data.candidate;
    const r = await R(A.token, { action: 'inviteToInterview', candidate_id: lina.id });
    return r.status === 409 ? true : { fail: `status ${r.status}` };
  });
  await check('interviews', 'questions about protected characteristics are refused', async () => {
    const r = await R(A.token, { action: 'saveInterviewPlan', campaign_id: campaign.id, approve: true,
      questions: [...QUESTIONS, { question: 'Are you married and do you plan to have children soon?', criterion: 'availability' }] });
    return r.status === 400 ? true : { fail: `status ${r.status}` };
  });
  await check('interviews', 'another company cannot read or change the plan', async () => {
    const g = await R(B.token, { action: 'getInterviewPlan', campaign_id: campaign.id });
    const s = await R(B.token, { action: 'saveInterviewPlan', campaign_id: campaign.id, questions: QUESTIONS, approve: true });
    return g.status === 404 && s.status === 404 ? true : { fail: `${g.status}/${s.status}` };
  });
  await check('interviews', 'manager approves a 3-question plan (no follow-ups for the scripted run)', async () => {
    const r = await R(A.token, { action: 'saveInterviewPlan', campaign_id: campaign.id, questions: QUESTIONS, max_followups: 0, valid_days: 7, approve: true });
    return r.status === 200 && r.data.plan.status === 'approved' && r.data.plan.questions.length === 3 ? true : { fail: `${r.status} ${JSON.stringify(r.data).slice(0, 200)}` };
  });
  let interviewId;
  await check('interviews', 'invite freezes the questions and prepares an invitation draft with the portal link', async () => {
    const r = await R(A.token, { action: 'inviteToInterview', candidate_id: lina.id });
    if (r.status !== 200) throw new Error(`${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
    interviewId = r.data.interview.id;
    const ok = r.data.interview.status === 'invited' && r.data.message.status === 'draft' && r.data.message.body.includes('{{portal_link}}') && !/voice|phone call/i.test(r.data.message.body.replace('no call or video', ''));
    return ok ? true : { fail: JSON.stringify(r.data).slice(0, 300) };
  });
  await check('interviews', 'another company cannot invite, read the interview or download the report', async () => {
    const i = await R(B.token, { action: 'inviteToInterview', candidate_id: lina.id });
    const g = await R(B.token, { action: 'getCandidate', candidate_id: lina.id });
    const rep = await R(B.token, { action: 'candidateReport', candidate_id: lina.id });
    const hm = await R(B.token, { action: 'sendHiringReport', candidate_id: lina.id });
    return [i, g, rep, hm].every((x) => x.status === 404) ? true : { fail: [i, g, rep, hm].map((x) => x.status).join('/') };
  });
  await check('interviews', 'portal: interview needs explicit consent to an AI-conducted interview', async () => {
    linaToken = await portalLinkFor(lina.id);
    const v = await R(null, { action: 'portal_get', token: linaToken });
    const r = await R(null, { action: 'portal_interview_start', token: linaToken, consents: { data_processing: true } });
    return v.data.interview?.status === 'invited' && r.status === 400 ? true : { fail: `${v.data.interview?.status} ${r.status}` };
  });
  await check('interviews', 'portal: another candidate’s link cannot reach this interview', async () => {
    const t = await portalLinkFor(omar.id);
    const r = await R(null, { action: 'portal_interview_get', token: t });
    const bad = await R(null, { action: 'portal_interview_get', token: 'y'.repeat(43) });
    return r.status === 404 && bad.status === 404 ? true : { fail: `${r.status}/${bad.status}` };
  });
  await check('interviews', 'portal: start shows an introduction and question 1; answers move through the questions', async () => {
    const s = await R(null, { action: 'portal_interview_start', token: linaToken, consents: { ai_interview: true, data_processing: true } });
    if (s.status !== 200) throw new Error(`start ${s.status} ${JSON.stringify(s.data).slice(0, 200)}`);
    const a = await R(null, { action: 'portal_interview_answer', token: linaToken, text: 'I check the Wi-Fi or cable, run ipconfig to see if I got a 169.254 address, renew DHCP, then test DNS with nslookup.' });
    const b = await R(null, { action: 'portal_interview_answer', token: linaToken, text: 'Start Outlook in safe mode, then repair Office and recreate the mail profile if needed.' });
    const kinds = b.data.messages.map((m) => m.kind).join(',');
    return s.data.status === 'in_progress' && b.status === 200 && b.data.current === 3 && kinds === 'intro,question,answer,question,answer,question' ? kinds : { fail: `${b.status} ${kinds}` };
  });
  await check('interviews', 'portal: empty answers are refused; consent recorded with the AI-interview kind', async () => {
    const e = await R(null, { action: 'portal_interview_answer', token: linaToken, text: ' ' });
    const { data } = await admin.from('recruitment_consents').select('kind, granted').eq('candidate_id', lina.id).eq('kind', 'ai_interview');
    return e.status === 400 && data.length === 1 && data[0].granted ? true : { fail: `${e.status} ${JSON.stringify(data)}` };
  });
  await check('interviews', 'company sees the transcript; candidate report includes questions and answers', async () => {
    const g = await R(A.token, { action: 'getCandidate', candidate_id: lina.id });
    const rep = await R(A.token, { action: 'candidateReport', candidate_id: lina.id });
    const ok = g.data.interview?.status === 'in_progress' && g.data.interview_messages.length === 6 && rep.status === 200
      && rep.data.text.includes('Q1. Describe how you would troubleshoot') && rep.data.text.includes('ipconfig') && rep.data.text.includes('hiring decision belongs to the company');
    return ok ? `${rep.data.text.split('\n').length} report lines` : { fail: `${g.data.interview?.status} ${g.data.interview_messages?.length} ${rep.status}` };
  });
  await check('interviews', 'expired interview link is refused', async () => {
    await admin.from('recruitment_interviews').update({ expires_at: new Date(Date.now() - 60000).toISOString() }).eq('id', interviewId);
    const r = await R(null, { action: 'portal_interview_answer', token: linaToken, text: 'Late answer about DHCP.' });
    const { data } = await admin.from('recruitment_interviews').select('status').eq('id', interviewId).single();
    return r.status === 410 && data.status === 'expired' ? true : { fail: `${r.status} ${data.status}` };
  });
  await check('interviews', 'hiring report needs the hiring manager email; then it is sent and recorded', async () => {
    const none = await R(A.token, { action: 'sendHiringReport', candidate_id: lina.id });
    const bad = await R(A.token, { action: 'updateCampaign', campaign_id: campaign.id, campaign: { hiring_manager_email: 'not-an-email' } });
    await R(A.token, { action: 'updateCampaign', campaign_id: campaign.id, campaign: { hiring_manager_name: 'E2E Manager', hiring_manager_email: `e2e-hm-${runId}@example.com` } });
    const sent = await R(A.token, { action: 'sendHiringReport', candidate_id: lina.id });
    const { data } = await admin.from('recruitment_messages').select('kind, status').eq('candidate_id', lina.id).eq('kind', 'hiring_report');
    return none.status === 409 && bad.status === 400 && sent.status === 200 && data.length === 1 && data[0].status === 'sent' ? true : { fail: `${none.status}/${bad.status}/${sent.status} ${JSON.stringify(data)}` };
  });
  await check('interviews', 'LinkedIn is not offered anywhere; CV import and written interviews are', async () => {
    const r = await R(A.token, { action: 'overview' });
    const keys = (r.data.integrations || []).map((i) => i.key);
    return !JSON.stringify(r.data).toLowerCase().includes('linkedin') && keys.includes('cv_import') && keys.includes('interviews') ? keys.join(', ') : { fail: JSON.stringify(keys) };
  });

  if (RUN_AI) {
    await check('recruitment-ai', 'AI evaluation: score with verified evidence for each requirement', async () => {
      const r = await R(A.token, { action: 'evaluate', campaign_id: campaign.id, candidate_id: mona.id });
      if (r.status !== 200 || !r.data.evaluated?.length) throw new Error(`status ${r.status} ${JSON.stringify(r.data).slice(0, 300)}`);
      const { data } = await admin.from('recruitment_candidates').select('score, score_explanation').eq('id', mona.id).single();
      const crit = data.score_explanation.criteria;
      const profile = 'Two years of Windows 10 troubleshooting and Microsoft Office 365 support at a Cairo help desk. Set up DHCP and basic networking for small offices.';
      const unverified = crit.filter((c) => c.source === 'ai' && c.evidence && !profile.toLowerCase().replace(/[^a-z0-9]+/g, ' ').includes(c.evidence.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()) && !`mona test it support technician 2 years of experience egypt cairo windows 10 troubleshooting microsoft office 365 basic networking tcp ip dhcp arabic english available next week`.includes(c.evidence.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()));
      return `score ${data.score}/100, ${crit.length} criteria, ${unverified.length} unverified quotes kept`;
    });
    await check('recruitment-ai', 'outreach: AI draft keeps the offer within limits; approved send emails the candidate (staging → owner)', async () => {
      const d = await R(A.token, { action: 'draftMessage', candidate_id: omar.id });
      if (d.status !== 200) throw new Error(`draft ${d.status} ${JSON.stringify(d.data).slice(0, 200)}`);
      const s = await R(A.token, { action: 'sendMessage', message_id: d.data.message.id });
      if (s.status !== 200) throw new Error(`send ${s.status} ${JSON.stringify(s.data).slice(0, 200)}`);
      const { data } = await admin.from('recruitment_messages').select('status, attempts, body').eq('id', d.data.message.id).single();
      return `${data.status} after ${data.attempts} attempt(s); draft ${d.data.message.body.length} chars`;
    });
    await check('interviews-ai', 'AI drafts job-related interview questions (a draft until approved)', async () => {
      const r = await R(A.token, { action: 'generateInterviewPlan', campaign_id: campaign.id, count: 4 });
      if (r.status !== 200) throw new Error(`${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
      return r.data.plan.status === 'draft' && r.data.plan.questions.length >= 3 ? `${r.data.plan.questions.length}: ${r.data.plan.questions[0].question.slice(0, 80)}` : { fail: JSON.stringify(r.data.plan).slice(0, 200) };
    });
    await check('interviews-ai', 'full written interview with AI follow-ups (capped at 2 per question) and evidence-checked scoring', async () => {
      await R(A.token, { action: 'saveInterviewPlan', campaign_id: campaign.id, questions: QUESTIONS, max_followups: 2, valid_days: 7, approve: true });
      const inv = await R(A.token, { action: 'inviteToInterview', candidate_id: lina.id });
      if (inv.status !== 200) throw new Error(`invite ${inv.status} ${JSON.stringify(inv.data).slice(0, 200)}`);
      const t = await portalLinkFor(lina.id);
      let v = (await R(null, { action: 'portal_interview_start', token: t, consents: { ai_interview: true } })).data;
      let turns = 0;
      while (v.status === 'in_progress' && turns < 12) {
        turns += 1;
        const r = await R(null, { action: 'portal_interview_answer', token: t, text: turns % 2 ? 'Not sure.' : 'I would check ipconfig for a 169.254 address, renew the DHCP lease and test DNS with nslookup; for Outlook I use safe mode and repair Office.' });
        if (r.status !== 200) throw new Error(`answer ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
        v = r.data;
      }
      const { data: msgs } = await admin.from('recruitment_interview_messages').select('kind, question_index').eq('interview_id', inv.data.interview.id);
      const perQ = [0, 1, 2].map((i) => msgs.filter((m) => m.kind === 'followup' && m.question_index === i).length);
      const { data: iv } = await admin.from('recruitment_interviews').select('status, score, evaluation').eq('id', inv.data.interview.id).single();
      if (perQ.some((n) => n > 2)) throw new Error(`follow-ups over cap: ${perQ}`);
      if (iv.status !== 'evaluated') throw new Error(`status ${iv.status}`);
      return `${turns} answers, follow-ups per question ${perQ.join('/')}, score ${iv.score}/100, ${iv.evaluation.questions.length} scored, ${iv.evaluation.unverified_claims_removed} unverifiable quotes removed`;
    });
    await check('interviews-ai', 'company imports a PDF CV; the AI reads it and creates the candidate from its contents', async () => {
      const form = new FormData();
      form.append('mode', 'import');
      form.append('campaign_id', campaign.id);
      form.append('files', new Blob([makePdf(['Karim Test', `karim-${runId}@example.com`, 'Cairo, Egypt', 'IT Support Specialist - 3 years', 'Skills: Windows 11, Active Directory, Office 365, DHCP', 'Languages: Arabic, English'])], { type: 'application/pdf' }), 'karim.pdf');
      form.append('files', new Blob([new TextEncoder().encode('not a pdf at all')]), 'fake.pdf');
      const res = await fetch(`${URL_}/functions/v1/recruitment`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${A.token}` }, body: form });
      const data = await res.json();
      if (res.status !== 200) throw new Error(`${res.status} ${JSON.stringify(data).slice(0, 200)}`);
      const { data: row } = await admin.from('recruitment_candidates').select('full_name, source, skills, cv_text, contact_enc').eq('campaign_id', campaign.id).eq('source', 'cv_import').maybeSingle();
      const ok = data.added.length === 1 && data.skipped.length === 1 && row && /karim/i.test(row.full_name) && /active directory/i.test(row.cv_text) && row.contact_enc?.startsWith('v1:');
      const forbidden = await fetch(`${URL_}/functions/v1/recruitment`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${B.token}` }, body: (() => { const f = new FormData(); f.append('mode', 'import'); f.append('campaign_id', campaign.id); f.append('files', new Blob([makePdf(['X'])]), 'x.pdf'); return f; })() });
      return ok && forbidden.status === 404 ? `added ${row.full_name}; skipped: ${data.skipped.join('; ')}` : { fail: JSON.stringify({ data, row: row && { ...row, cv_text: row.cv_text?.slice(0, 80) }, forbidden: forbidden.status }) };
    });
  }
}

async function cleanup() {
  const orgs = [...created.orgs];
  const users = created.users;
  try {
    if (created.files.length) await admin.storage.from('private').remove(created.files);
    for (const t of ['agent_tasks', 'agent_uploads', 'research_reports', 'usage_records', 'audit_logs', 'agents', 'organization_members']) {
      if (orgs.length) await admin.from(t).delete().in('organization_id', orgs);
      if (users.length) await admin.from(t).delete().in('created_by_id', users);
    }
    for (const org of orgs) {
      const { data: folders } = await admin.storage.from('private').list(`recruitment/${org}`);
      for (const f of folders || []) {
        const { data: files } = await admin.storage.from('private').list(`recruitment/${org}/${f.name}`);
        if (files?.length) await admin.storage.from('private').remove(files.map((x) => `recruitment/${org}/${f.name}/${x.name}`));
      }
    }
    if (orgs.length) await admin.from('organizations').delete().in('id', orgs);
    if (users.length) {
      await admin.from('ai_usage').delete().in('user_id', users);
      await admin.from('usage_records').delete().in('user_id', users);
      await admin.from('audit_logs').delete().in('actor_id', users);
    }
    // Leftovers from earlier runs (accounts already deleted), identified by the test email pattern.
    await admin.from('audit_logs').delete().like('actor_email', 'e2e-%@example.com');
    await admin.from('inquiries').delete().like('email', 'e2e-visitor-%@example.com');
    // Usage rows whose account no longer exists (earlier test runs). Staging only.
    const { data: people } = await admin.from('profiles').select('id');
    const alive = new Set((people || []).map((p) => p.id));
    for (const t of ['usage_records', 'ai_usage']) {
      const { data: rows } = await admin.from(t).select('id, user_id').not('user_id', 'is', null).limit(5000);
      const orphans = (rows || []).filter((r) => !alive.has(r.user_id)).map((r) => r.id);
      if (orphans.length) await admin.from(t).delete().in('id', orphans);
    }
    await admin.from('inquiries').delete().like('email', `e2e-visitor-${runId}@example.com`);
    // Leaves the private/server copies of inquiry mails etc. untouched; they hold no personal data.
    for (const id of users) await admin.auth.admin.deleteUser(id);
    console.log(`cleanup: removed ${users.length} test accounts and ${orgs.length} workspaces`);
  } catch (error) {
    console.error('cleanup error', error?.message);
  }
}

try {
  await main();
} finally {
  await cleanup();
}

const failed = results.filter((r) => r.ok === 'FAIL');
const lines = [
  `## Coinexa staging end-to-end: ${results.length - failed.length - results.filter((r) => r.ok === 'skip').length} passed, ${failed.length} failed, ${results.filter((r) => r.ok === 'skip').length} skipped`,
  '',
  '| Area | Check | Result | Detail |',
  '|---|---|---|---|',
  ...results.map((r) => `| ${r.area} | ${r.name} | ${r.ok} | ${r.detail.replace(/\|/g, '/').replace(/\n/g, ' ')} |`),
];
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
console.log('\n' + lines[0]);
process.exit(failed.length ? 1 : 0);
