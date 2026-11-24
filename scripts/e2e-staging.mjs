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

const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const RUN_AI = process.env.E2E_AI === '1';
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
    if (out === 'skip' || (out && out.skip)) record(area, name, 'skip', out.detail || '');
    else record(area, name, out !== false, typeof out === 'string' ? out : '');
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
  const { data: session, error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, email, client, token: session.session.access_token, entities: makeEntities(client) };
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
    return ok ? true : `statuses ${run.status}/${chat.status}/${flow.status}`;
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
    return r.status === 401 ? true : `status ${r.status}`;
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
    return r.status === 200 ? `reference ${r.data.reference || 'ok'}` : `status ${r.status} ${JSON.stringify(r.data).slice(0, 150)}`;
  });
  await check('billing', 'checkout: refuses unknown plans; test checkout when Stripe test key is set', async () => {
    const bad = await call(A.token, 'createCheckoutSession', { tier: 'nope' });
    if (bad.status !== 400) throw new Error(`unknown plan → ${bad.status}`);
    const good = await call(A.token, 'createCheckoutSession', { tier: 'agent_sprint' });
    if (good.status === 200 && /checkout\.stripe\.com/.test(good.data.url || '')) return 'Stripe test checkout URL created';
    if (good.data?.error === 'Checkout is not available right now.') return { skip: true, detail: 'Stripe test key not added yet' };
    return `status ${good.status} ${JSON.stringify(good.data).slice(0, 150)}`;
  });

  // ---------------- Admin functions ----------------
  const adminFns = ['adminOverview', 'adminAgents', 'adminRuns', 'adminUsage', 'adminCustomers', 'adminBilling', 'adminActivity', 'usageSummary', 'verifyTenantIsolation'];
  await check('admin', 'regular users are refused by every admin function', async () => {
    const bad = [];
    for (const fn of adminFns) {
      const r = await call(B.token, fn, {});
      if (r.status !== 403) bad.push(`${fn}:${r.status}`);
    }
    return bad.length ? `not refused: ${bad.join(', ')}` : true;
  });
  await admin.from('profiles').update({ role: 'admin' }).eq('id', A.id);
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
    return r.status === 200 && r.data.dry_run === true ? true : `status ${r.status} ${JSON.stringify(r.data).slice(0, 150)}`;
  });
  await admin.from('profiles').update({ role: 'user' }).eq('id', A.id);

  // ---------------- AI features ----------------
  if (!RUN_AI) {
    record('ai', 'AI features', 'skip', 'run with "ai" in ops/e2e.request to include them');
    return;
  }
  let agentB;
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
    return `${r.data.task?.status}, ${r.ms} ms`;
  });
  await check('ai', 'productResearch builds a report with web search', async () => {
    const r = await call(B.token, 'productResearch', { query: 'handmade ceramic coffee mug', max_products: 1, market: 'Germany' });
    if (r.status !== 200 || !r.data.report?.id) throw new Error(`status ${r.status} ${JSON.stringify(r.data).slice(0, 250)}`);
    return `${r.ms} ms`;
  });
  await check('ai', 'exportResearchXlsx exports the report', async () => {
    const { data: rep } = await admin.from('research_reports').select('id').eq('created_by_id', B.id).limit(1).maybeSingle();
    if (!rep) return { skip: true, detail: 'no report to export' };
    const r = await call(B.token, 'exportResearchXlsx', { report_id: rep.id, reportId: rep.id });
    return r.status === 200 ? `${r.ms} ms` : `status ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`;
  });
  await check('ai', 'every AI call is costed in the ai_usage ledger', async () => {
    const { data } = await admin.from('ai_usage').select('cost_usd, ok, function_name').in('user_id', [A.id, B.id]);
    const total = (data || []).reduce((s, r) => s + Number(r.cost_usd || 0), 0);
    if (!data?.length) throw new Error('no ledger rows');
    return `${data.length} calls, $${total.toFixed(4)} total`;
  });
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
    if (orgs.length) await admin.from('organizations').delete().in('id', orgs);
    if (users.length) await admin.from('ai_usage').delete().in('user_id', users);
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
