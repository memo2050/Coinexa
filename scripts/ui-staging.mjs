// Browser check of every Coinexa page against the STAGING backend.
// Serves the built site locally on the CI runner (vite preview), signs in through
// the real login form with a throwaway account, and visits every route as a
// visitor, a regular user and a platform admin, on desktop and mobile.
// Records screenshots, console errors, page errors and failed API calls, then
// removes the throwaway account and its data.
//
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, BASE_URL (preview server)
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';

const URL_ = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const BASE = process.env.BASE_URL || 'http://localhost:5173';
if (!/ycvhmzunagrpihtgisiu/.test(URL_ || '')) throw new Error('Refusing to run: staging project only');

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const OUT = 'ui-shots';
mkdirSync(OUT, { recursive: true });
const runId = Date.now().toString(36);
const email = `e2e-ui-${runId}@example.com`;
const password = `Ui-${crypto.randomUUID()}`;
let userId;
let orgId;

const PUBLIC = ['/', '/login', '/register', '/forgot-password', '/reset-password', '/privacy', '/terms', '/does-not-exist'];
const USER = ['/agents', '/agents/new', '/tasks', '/security-check', '/billing/success', '/agents/:id'];
const ADMIN = ['/admin', '/admin/agents', '/admin/runs', '/admin/usage', '/admin/customers', '/admin/billing', '/admin/reports', '/admin/activity', '/inbox', '/usage'];
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844, isMobile: true, hasTouch: true } };

const rows = [];

async function revealAll(page) {
  // Scroll through the page so scroll-triggered animations render, then go back up.
  const height = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < height; y += 500) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
}

async function visit(context, role, vp, path) {
  const page = await context.newPage();
  const consoleErrors = [];
  const failed = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e.message).slice(0, 200)}`));
  page.on('response', (r) => {
    const u = r.url();
    if (r.status() >= 400 && (u.includes('supabase.co') || u.startsWith(BASE))) failed.push(`${r.status()} ${u.replace(URL_, '').split('?')[0].slice(0, 90)}`);
  });
  page.on('requestfailed', (r) => {
    const reason = r.failure()?.errorText || '';
    // Browsers cancel partial video downloads when a page closes or scrolls away.
    if (/\.(mp4|webm)$/.test(r.url().split('?')[0]) && /ABORTED/i.test(reason)) return;
    failed.push(`failed ${r.url().split('?')[0].slice(0, 90)} ${reason}`);
  });
  const started = Date.now();
  let finalPath = '';
  let heading = '';
  try {
    await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(800);
    await revealAll(page);
    finalPath = new URL(page.url()).pathname;
    heading = (await page.locator('h1, h2').first().textContent({ timeout: 2000 }).catch(() => '')).trim().slice(0, 60);
  } catch (e) {
    consoleErrors.push(`navigation: ${e.message.slice(0, 150)}`);
  }
  const name = `${role}_${vp}_${path.replace(/\//g, '_').replace(/^_/, '') || 'home'}`.replace(/[^a-z0-9_-]/gi, '');
  await page.screenshot({ path: `${OUT}/${name}.jpg`, fullPage: true, type: 'jpeg', quality: 60 }).catch(() => {});
  const blank = await page.evaluate(() => (document.body.innerText || '').trim().length < 20).catch(() => true);
  rows.push({ role, vp, path, finalPath, heading, ms: Date.now() - started, blank, consoleErrors, failed });
  await page.close();
}

async function main() {
  for (const file of ['video4.mp4', 'coinexa-showreel.mp4', 'NewpersonalAgent.mp4', 'logo.png', 'coinexa-logo.png', 'hero-sphere.png', 'generated_image.png']) {
    const res = await fetch(`${BASE}/media/${file}`, { method: 'HEAD' });
    rows.push({ role: 'media', vp: '-', path: `/media/${file}`, finalPath: String(res.status), heading: res.headers.get('content-type') || '', ms: 0, blank: false, consoleErrors: res.ok ? [] : [`HTTP ${res.status}`], failed: [] });
  }
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'UI Tester' } });
  if (error) throw error;
  userId = data.user.id;

  const browser = await chromium.launch();
  try {
    for (const [vp, viewport] of Object.entries(VIEWPORTS)) {
      const anonCtx = await browser.newContext({ viewport, isMobile: !!viewport.isMobile, hasTouch: !!viewport.hasTouch });
      for (const p of PUBLIC) await visit(anonCtx, 'visitor', vp, p);
      // Protected pages must send visitors to the login page.
      await visit(anonCtx, 'visitor', vp, '/agents');
      await anonCtx.close();
    }

    // Sign in through the real form.
    const ctx = await browser.newContext({ viewport: VIEWPORTS.desktop });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }).catch(() => {});
    const afterLogin = new URL(page.url()).pathname;
    rows.push({ role: 'user', vp: 'desktop', path: 'LOGIN FORM', finalPath: afterLogin, heading: '', ms: 0, blank: false, consoleErrors: afterLogin.startsWith('/login') ? ['login did not leave /login'] : [], failed: [] });
    const state = await ctx.storageState();
    await ctx.close();

    // Give the account a workspace and one agent so pages have content.
    const { data: ws } = await admin.from('organizations').insert({ name: 'UI Test Workspace', plan: 'starter', status: 'active' }).select('id').single();
    orgId = ws.id;
    await admin.from('organization_members').insert({ organization_id: orgId, user_id: userId, email, member_role: 'owner', status: 'active' });
    await admin.from('profiles').update({ organization_ids: [orgId] }).eq('id', userId);
    const { data: agent } = await admin.from('agents').insert({
      name: 'Nova (UI test)', organization_id: orgId, created_by_id: userId, created_by: email, role: 'Support assistant',
      specialization: 'Customer support', industry: 'E-commerce', status: 'active', tone: 'Friendly', summary: 'Answers customer questions.',
      goals: ['Reply fast'], workflow: ['Read the question', 'Draft a reply'], workflow_enabled: true,
    }).select('id').single();
    await admin.from('agent_tasks').insert({ agent_id: agent.id, agent_name: 'Nova (UI test)', organization_id: orgId, created_by_id: userId, created_by: email, task: 'Draft a reply to a customer', status: 'succeeded', output: 'Hello! Your order ships tomorrow.' });

    for (const [vp, viewport] of Object.entries(VIEWPORTS)) {
      const userCtx = await browser.newContext({ viewport, isMobile: !!viewport.isMobile, hasTouch: !!viewport.hasTouch, storageState: state });
      for (const p of USER) await visit(userCtx, 'user', vp, p.replace(':id', agent.id));
      await visit(userCtx, 'user', vp, '/admin'); // must be refused for a regular user
      await userCtx.close();
    }

    await admin.from('profiles').update({ role: 'admin' }).eq('id', userId);
    for (const [vp, viewport] of Object.entries(VIEWPORTS)) {
      const adminCtx = await browser.newContext({ viewport, isMobile: !!viewport.isMobile, hasTouch: !!viewport.hasTouch, storageState: state });
      for (const p of ADMIN) await visit(adminCtx, 'admin', vp, p);
      await adminCtx.close();
    }
  } finally {
    await browser.close();
  }
}

async function cleanup() {
  try {
    if (orgId) {
      for (const t of ['agent_tasks', 'usage_records', 'audit_logs', 'agents', 'organization_members']) await admin.from(t).delete().eq('organization_id', orgId);
      await admin.from('organizations').delete().eq('id', orgId);
    }
    if (userId) {
      await admin.from('ai_usage').delete().eq('user_id', userId);
      await admin.auth.admin.deleteUser(userId);
    }
    console.log('cleanup done');
  } catch (e) {
    console.error('cleanup error', e.message);
  }
}

try { await main(); } finally { await cleanup(); }

writeFileSync(`${OUT}/results.json`, JSON.stringify(rows, null, 2));
const problems = rows.filter((r) => r.consoleErrors.length || r.failed.length || r.blank);
const lines = [
  `## Coinexa staging browser check: ${rows.length} page views, ${problems.length} with problems`,
  '',
  '| Role | View | Page | Landed on | Heading | ms | Problems |',
  '|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.role} | ${r.vp} | ${r.path} | ${r.finalPath} | ${r.heading.replace(/\|/g, '/')} | ${r.ms} | ${[r.blank ? 'BLANK' : '', ...r.consoleErrors, ...r.failed].filter(Boolean).join('; ').replace(/\|/g, '/').slice(0, 300)} |`),
];
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
console.log(lines.join('\n'));
