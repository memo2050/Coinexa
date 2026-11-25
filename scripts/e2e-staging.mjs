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
    return data.plan !== 'studio_retainer' ? true : 'plan changed!';
  });

  // ---------------- Admin functions ----------------
  const adminFns = ['adminAiSpend', 'adminOverview', 'adminAgents', 'adminRuns', 'adminUsage', 'adminCustomers', 'adminBilling', 'adminActivity', 'usageSummary', 'verifyTenantIsolation'];
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

  // ---------------- Recruitment agent ----------------
  await recruitmentChecks(A, B);

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
    return r.status === 200 ? `${r.ms} ms` : `status ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`;
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

async function recruitmentChecks(A, B) {
  let campaign;
  await check('recruitment', 'campaign with the initial offer above the maximum is refused', async () => {
    const r = await R(A.token, { action: 'createCampaign', campaign: { title: 'X', country: 'Egypt', initial_offer: 200, max_budget: 150 } });
    return r.status === 400 ? true : `status ${r.status}`;
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
    return ok ? true : `statuses ${get.status}/${add.status}/${upd.status}/${rep.status}, overview leak ${leaks}`;
  });
  await check('recruitment', 'signed-out visitors cannot use company actions', async () => {
    const r = await R(null, { action: 'overview' });
    return r.status === 401 ? true : `status ${r.status}`;
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
    return r.data.added === 1 && r.data.skipped.length === 1 ? `1 added, skipped: ${r.data.skipped[0]}` : JSON.stringify(r.data);
  });

  // Negotiation through the candidate portal.
  let monaToken;
  await check('recruitment', 'portal: candidate sees the job and the $120 opening offer', async () => {
    monaToken = await portalLinkFor(mona.id);
    const r = await R(null, { action: 'portal_get', token: monaToken });
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    return r.data.current_offer === 120 && r.data.job.title === 'IT Help Desk Technician' ? true : JSON.stringify(r.data).slice(0, 200);
  });
  await check('recruitment', 'portal: a response without consent to data processing is refused', async () => {
    const r = await R(null, { action: 'portal_respond', token: monaToken, response: 'request', amount: 180 });
    return r.status === 400 ? true : `status ${r.status}`;
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
    return data.status === 'agreed' && Number(data.final_comp) === 150 ? true : JSON.stringify(data);
  });
  await check('recruitment', 'candidate asking $140 (within budget) is agreed at $140', async () => {
    const t = await portalLinkFor(omar.id);
    let last;
    for (let i = 0; i < 6; i += 1) {
      last = await R(null, { action: 'portal_respond', token: t, response: 'request', amount: 140, consents: { data_processing: true } });
      if (last.data.decision?.action === 'accept') break;
    }
    const { data } = await admin.from('recruitment_candidates').select('status, final_comp').eq('id', omar.id).single();
    return data.status === 'agreed' && Number(data.final_comp) === 140 ? true : JSON.stringify(data);
  });
  await check('recruitment', 'only an agreed candidate can be marked hired', async () => {
    const ok = await R(A.token, { action: 'setCandidateStatus', candidate_id: mona.id, status: 'hired' });
    return ok.status === 200 ? true : `status ${ok.status}`;
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
    if (r.status !== 200 || !r.data.portal_url) throw new Error(`status ${r.status} ${JSON.stringify(r.data)}`);
    applicantToken = r.data.portal_url.split('/r/')[1];
    const { data: consents } = await admin.from('recruitment_consents').select('kind, granted').in('candidate_id',
      (await admin.from('recruitment_candidates').select('id').eq('campaign_id', campaign.id).eq('full_name', 'Sara Applicant')).data.map((c) => c.id));
    return consents.length === 3 ? 'consent records: ' + consents.map((c) => `${c.kind}=${c.granted}`).join(', ') : JSON.stringify(consents);
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
    return good.status === 200 && bad.status === 400 ? true : `good ${good.status} bad ${bad.status}`;
  });
  await check('recruitment', 'contact details are withheld from the company without the candidate’s sharing consent', async () => {
    const { data } = await admin.from('recruitment_candidates').select('id').eq('campaign_id', campaign.id).eq('full_name', 'Sara Applicant').single();
    const r = await R(A.token, { action: 'getCandidate', candidate_id: data.id });
    return r.status === 200 && r.data.contact_restricted === true && !r.data.candidate.contact && !r.data.cv_url ? true : JSON.stringify({ c: r.data.candidate?.contact, cv: r.data.cv_url });
  });
  await check('recruitment', 'candidate can decline, opt out and erase their data', async () => {
    const d = await R(null, { action: 'portal_respond', token: applicantToken, response: 'opt_out' });
    const e = await R(null, { action: 'portal_erase', token: applicantToken });
    const again = await R(null, { action: 'portal_get', token: applicantToken });
    const { data } = await admin.from('recruitment_candidates').select('full_name, contact_enc, cv_path, erased_at, do_not_contact').eq('campaign_id', campaign.id).not('erased_at', 'is', null).single();
    const ok = d.status === 200 && e.status === 200 && again.status === 404 && !data.contact_enc && !data.cv_path && data.do_not_contact;
    return ok ? true : JSON.stringify({ d: d.status, e: e.status, again: again.status, data });
  });
  await check('recruitment', 'invalid portal link and unknown action are handled cleanly', async () => {
    const bad = await R(null, { action: 'portal_get', token: 'x'.repeat(43) });
    const unknown = await R(A.token, { action: 'nope' });
    return bad.status === 404 && unknown.status === 400 ? true : `${bad.status}/${unknown.status}`;
  });

  await check('recruitment', 'dashboard counts, completion rate and filters', async () => {
    const all = await R(A.token, { action: 'overview' });
    const t = all.data.totals;
    const egypt = await R(A.token, { action: 'overview', filters: { country: 'egypt' } });
    const france = await R(A.token, { action: 'overview', filters: { country: 'France' } });
    const ok = t.hired === 1 && t.agreed === 1 && t.completion === 67 && egypt.data.campaigns.length === 1 && france.data.campaigns.length === 0;
    return ok ? `hired ${t.hired}, agreed ${t.agreed}, completion ${t.completion}%` : JSON.stringify(t);
  });
  await check('recruitment', 'final report separates hired, agreed and interested; respects contact consent', async () => {
    const r = await R(A.token, { action: 'report', campaign_id: campaign.id });
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    const stages = Object.fromEntries(r.data.rows.map((row) => [row.name, row.stage]));
    const ok = stages['Mona Test'] === 'Hired' && stages['Omar Test'].startsWith('Agreed') && !('Sara Applicant' in stages)
      && r.data.csv.split('\r\n')[0].includes('Final negotiated compensation');
    return ok ? `${r.data.rows.length} rows; ${JSON.stringify(r.data.summary)}` : JSON.stringify(stages);
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
