// Browser check of every Coinexa page against the STAGING backend.
// Serves the built site locally on the CI runner (vite preview), signs in through
// the real login form with a throwaway account, and visits every route as a
// visitor, a regular user and a platform admin, on desktop and mobile.
// Records screenshots, console errors, page errors and failed API calls, then
// removes the throwaway account and its data.
//
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, BASE_URL (preview server)
import { simulatedPc, sampleScan } from './sim-scanner.mjs';
import { signInWithLink, enrollTotp } from './test-auth.mjs';
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
const USER = ['/agents', '/agents/new', '/tasks', '/security-check', '/billing/success', '/account/security', '/agents/:id'];
const ADMIN = ['/admin', '/admin/agents', '/admin/runs', '/admin/usage', '/admin/customers', '/admin/billing', '/admin/reports', '/admin/activity', '/inbox', '/usage'];
const PUBLIC_AFTER = [];
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

// Top menu by sign-in state (desktop header). Expected: visitor → Sign In; user →
// Security + Sign Out, no Admin Console; admin → Admin Console too. Recorded as a row.
async function navCheck(context, role, expect) {
  const page = await context.newPage();
  const problems = [];
  try {
    await page.goto(`${BASE}/privacy`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(1500);
    const header = page.locator('header').first();
    const has = async (name) => (await header.getByText(name, { exact: true }).count()) > 0;
    const seen = { signIn: await has('Sign In'), security: await has('Security'), signOut: await has('Sign Out'), admin: await has('Admin Console') };
    for (const [k, v] of Object.entries(expect)) if (seen[k] !== v) problems.push(`${k} ${v ? 'missing' : 'shown'}`);
    // The menu must fit: nothing wider than the header, no wrapped buttons, logo fully visible.
    const fits = () => header.evaluate((h) => {
      const row = h.firstElementChild;
      const logo = h.querySelector('img');
      const lb = logo?.getBoundingClientRect();
      const wrapped = [...h.querySelectorAll('a,button')].some((el) => el.offsetParent && el.getBoundingClientRect().height > 60);
      return !(row.scrollWidth > row.clientWidth + 1 || wrapped || !lb || lb.left < 0 || lb.width < 40);
    });
    if (!(await fits())) problems.push('menu does not fit at 1440 px');
    await page.screenshot({ path: `${OUT}/nav_${role}.jpg`, type: 'jpeg', quality: 75, clip: { x: 0, y: 0, width: 1440, height: 90 } }).catch(() => {});
    await page.setViewportSize({ width: 1024, height: 700 });
    await page.waitForTimeout(400);
    if (!(await fits())) problems.push('menu does not fit at 1024 px');
    await page.screenshot({ path: `${OUT}/nav_${role}_1024.jpg`, type: 'jpeg', quality: 75, clip: { x: 0, y: 0, width: 1024, height: 90 } }).catch(() => {});
    await page.setViewportSize({ width: 1440, height: 900 });
    // A plain user opening the admin console directly is refused (the server refuses too).
    if (role === 'user') {
      await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle', timeout: 45000 });
      if (!(await page.getByText('Super admin access only').count())) problems.push('/admin not refused for a user');
    }
    if (expect.signOut && role === 'admin') {
      await header.locator('button:visible', { hasText: 'Sign Out' }).first().click();
      await page.waitForURL((u) => u.pathname === '/', { timeout: 20000 }).catch(() => problems.push('sign out did not go home'));
      await page.goto(`${BASE}/privacy`, { waitUntil: 'networkidle' });
      if (!(await page.locator('header').first().getByText('Sign In', { exact: true }).count())) problems.push('Sign In not shown after sign out');
      await page.goto(`${BASE}/agents`, { waitUntil: 'networkidle' });
      if (!new URL(page.url()).pathname.startsWith('/login')) problems.push('protected page still open after sign out');
    }
  } catch (e) {
    problems.push(String(e.message).slice(0, 150));
  }
  await page.close();
  rows.push({ role, vp: 'desktop', path: `MENU (${Object.entries(expect).map(([k, v]) => `${k}=${v ? 'yes' : 'no'}`).join(' ')})`, finalPath: '', heading: '', ms: 0, blank: false, consoleErrors: problems, failed: [] });
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
    if (path === '/') {
      // Homepage videos in page order (top first), with whether each one is actually playing.
      const videos = await page.evaluate(() =>
        [...document.querySelectorAll('main video')].map((v) => `${v.getAttribute('src')} (${v.readyState >= 2 ? 'loaded' : 'not loaded'})`)
      );
      heading = `videos top→bottom: ${videos.join(' → ')}`;
    }
  } catch (e) {
    consoleErrors.push(`navigation: ${e.message.slice(0, 150)}`);
  }
  const name = `${role}_${vp}_${path.replace(/\/r\/.+/, '/portal').replace(/\/apply\/.+/, '/apply').replace(/\//g, '_').replace(/^_/, '') || 'home'}`.replace(/[^a-z0-9_-]/gi, '').slice(0, 90);
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

    {
      const v = await browser.newContext({ viewport: VIEWPORTS.desktop });
      await navCheck(v, 'visitor', { signIn: true, security: false, signOut: false, admin: false });
      await v.close();
    }
    // Sign in through the real form, unless CAPTCHA is on (a test cannot solve it): then
    // sign in with a server-issued one-time link and give the browser that session.
    const storageKey = `sb-${new URL(URL_).hostname.split('.')[0]}-auth-token`;
    const sessionState = (session) => ({ cookies: [], origins: [{ origin: BASE, localStorage: [{ name: storageKey, value: JSON.stringify(session) }] }] });
    const probe = await createClient(URL_, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } }).auth.signInWithPassword({ email, password });
    const captchaOn = Boolean(probe.error && /captcha/i.test(probe.error.message));
    let state;
    if (!captchaOn) {
      const ctx = await browser.newContext({ viewport: VIEWPORTS.desktop });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
      await page.fill('input[type="email"]', email);
      await page.fill('input[type="password"]', password);
      await page.click('button[type="submit"]');
      await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }).catch(() => {});
      const afterLogin = new URL(page.url()).pathname;
      rows.push({ role: 'user', vp: 'desktop', path: 'LOGIN FORM', finalPath: afterLogin, heading: '', ms: 0, blank: false, consoleErrors: afterLogin.startsWith('/login') ? ['login did not leave /login'] : [], failed: [] });
      state = await ctx.storageState();
      await ctx.close();
    } else {
      const c = createClient(URL_, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
      state = sessionState(await signInWithLink(admin, c, email));
      rows.push({ role: 'user', vp: 'desktop', path: 'LOGIN FORM (CAPTCHA on: password sign-in refused without a solved check)', finalPath: '/login', heading: '', ms: 0, blank: false, consoleErrors: [], failed: [] });
    }

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
    // Hires exactly as the signature-verified Stripe webhook records them after payment,
    // so pages show Hired (red glow + green label) and usage for the paid agents only.
    const period = { current_period_start: new Date(Date.now() - 864e5).toISOString(), current_period_end: new Date(Date.now() + 29 * 864e5).toISOString() };
    await admin.from('agent_hires').insert([
      { organization_id: orgId, subject: agent.id, agent_id: agent.id, plan_key: 'custom', status: 'active', stripe_subscription_id: 'sub_ui_test', stripe_item_id: `si_ui_${runId}_1`, ...period },
      { organization_id: orgId, subject: 'featured:recruitment', plan_key: 'recruitment', status: 'active', stripe_subscription_id: 'sub_ui_test', stripe_item_id: `si_ui_${runId}_2`, ...period },
    ]);
    await admin.from('agents').insert({ name: 'Iris (UI test, not hired)', organization_id: orgId, created_by_id: userId, created_by: email, role: 'Research assistant', status: 'active', catalog_key: 'hazel', summary: 'Researches products.' });
    await admin.from('agent_tasks').insert({ agent_id: agent.id, agent_name: 'Nova (UI test)', organization_id: orgId, created_by_id: userId, created_by: email, task: 'Draft a reply to a customer', status: 'succeeded', output: 'Hello! Your order ships tomorrow.' });

    // A recruitment campaign with one candidate and a portal link, so those pages have content.
    const { data: camp } = await admin.from('recruitment_campaigns').insert({
      organization_id: orgId, title: 'IT Help Desk Technician', specialization: 'IT support', country: 'Egypt', city: 'Cairo',
      positions_required: 3, skills: ['Windows troubleshooting', 'Microsoft Office', 'Basic networking'], experience_min: 1, experience_max: 3,
      duration: '5 days', currency: 'USD', pay_frequency: 'daily', initial_offer: 120, max_budget: 150, description: 'UI test campaign.',
      created_by_id: userId, created_by: email,
    }).select('id, apply_slug').single();
    const portalToken = `ui${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(portalToken)))].map((b) => b.toString(16).padStart(2, '0')).join('');
    await admin.from('recruitment_candidates').insert({
      organization_id: orgId, campaign_id: camp.id, full_name: 'Mona (UI test)', country: 'Egypt', city: 'Cairo', experience_years: 2,
      skills: ['Windows'], source: 'referral', status: 'contacted', portal_token_hash: digest, portal_expires_at: new Date(Date.now() + 86400000).toISOString(),
    });
    USER.push('/recruitment', '/recruitment/new', `/recruitment/${camp.id}`);
    PUBLIC_AFTER.push(`/apply/${camp.apply_slug}`, `/r/${portalToken}`);

    // Cyber Security Scan: a simulated linked PC uploads one signed sample scan, so the
    // overview and scan pages have real content (same path the Windows scanner will use).
    const linkCode = 'UITST' + crypto.randomUUID().replace(/[^A-Z2-9]/gi, '').toUpperCase().replace(/[01IO]/g, '').slice(0, 5).padEnd(5, 'Z');
    const codeHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(linkCode)))].map((b) => b.toString(16).padStart(2, '0')).join('');
    await admin.from('security_pairing_codes').insert({ organization_id: orgId, code_hash: codeHash, expires_at: new Date(Date.now() + 600000).toISOString(), created_by_id: userId, created_by: email });
    const pc = await simulatedPc(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, 'UI-TEST-PC');
    const linked = await pc.link(linkCode);
    const { response: up } = await pc.upload(sampleScan());
    if (linked.status !== 200 || up.status !== 200) throw new Error(`security scan seed failed: ${linked.status}/${up.status} ${JSON.stringify(up.data)}`);
    USER.push('/network-security', `/network-security/scans/${up.data.scan_id}`);

    for (const [vp, viewport] of Object.entries(VIEWPORTS)) {
      const userCtx = await browser.newContext({ viewport, isMobile: !!viewport.isMobile, hasTouch: !!viewport.hasTouch, storageState: state });
      for (const p of USER) await visit(userCtx, 'user', vp, p.replace(':id', agent.id));
      await visit(userCtx, 'user', vp, '/admin'); // must be refused for a regular user
      await userCtx.close();
    }

    for (const [vp, viewport] of Object.entries(VIEWPORTS)) {
      const anon = await browser.newContext({ viewport, isMobile: !!viewport.isMobile, hasTouch: !!viewport.hasTouch });
      for (const p of PUBLIC_AFTER) await visit(anon, 'visitor', vp, p);
      await anon.close();
    }

    {
      const u = await browser.newContext({ viewport: VIEWPORTS.desktop, storageState: state });
      await navCheck(u, 'user', { signIn: false, security: true, signOut: true, admin: false });
      await u.close();
    }
    await admin.from('profiles').update({ role: 'admin' }).eq('id', userId);
    // The admin console requires two-step sign-in: enroll an authenticator and use the
    // resulting aal2 session for the admin pages.
    const adminClient = createClient(URL_, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    await signInWithLink(admin, adminClient, email);
    const adminState = sessionState((await enrollTotp(adminClient)).session);
    for (const [vp, viewport] of Object.entries(VIEWPORTS)) {
      const adminCtx = await browser.newContext({ viewport, isMobile: !!viewport.isMobile, hasTouch: !!viewport.hasTouch, storageState: adminState });
      for (const p of ADMIN) await visit(adminCtx, 'admin', vp, p);
      await adminCtx.close();
    }
    {
      // Last, because it signs the admin session out.
      const a = await browser.newContext({ viewport: VIEWPORTS.desktop, storageState: adminState });
      await navCheck(a, 'admin', { signIn: false, security: true, signOut: true, admin: true });
      await a.close();
    }
  } finally {
    await browser.close();
  }
}

async function cleanup() {
  try {
    if (orgId) {
      for (const t of ['recruitment_campaigns', 'agent_tasks', 'usage_records', 'audit_logs', 'agents', 'organization_members']) await admin.from(t).delete().eq('organization_id', orgId);
      await admin.from('organizations').delete().eq('id', orgId);
    }
    if (userId) {
      await admin.from('ai_usage').delete().eq('user_id', userId);
      await admin.from('usage_records').delete().eq('user_id', userId);
      await admin.from('audit_logs').delete().eq('actor_id', userId);
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
