// End-to-end test of the real Windows scanner (.exe) against STAGING.
// Runs on a GitHub-hosted Windows machine (scanner.yml). It creates a throwaway
// account and workspace, links the .exe with a real linking code, and runs real scans.
//
// Safety: every scan here targets ONLY this test machine's own private address (/32),
// with test listeners this script starts itself. Nothing else on the network is scanned.
// The negative tests check that public, oversized and foreign ranges are refused by the
// scanner before any connection is made.
//
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, SCANNER_EXE
import { createClient } from '@supabase/supabase-js';
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const EXE = path.resolve(process.env.SCANNER_EXE);
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_KEY, opts);
const runId = Date.now().toString(36);
const HOME = mkdtempSync(path.join(os.tmpdir(), 'coinexa-scanner-'));
const results = [];
let userId, orgId, token;

const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail: String(detail).slice(0, 400) });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${String(detail).slice(0, 400)}` : ''}`);
};
const check = async (name, fn) => {
  try {
    const out = await fn();
    if (out && typeof out === 'object' && 'fail' in out) record(name, false, out.fail);
    else record(name, out !== false && out !== undefined, typeof out === 'string' ? out : '');
  } catch (e) {
    record(name, false, e?.message || e);
  }
};

// Runs the .exe. Each run gets the isolated test profile folder (COINEXA_SCANNER_HOME).
function exe(args, input = '') {
  const r = spawnSync(EXE, args, { input, encoding: 'utf8', timeout: 240000, env: { ...process.env, COINEXA_SCANNER_HOME: HOME } });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}`, error: r.error };
}

async function fn(name, body) {
  const res = await fetch(`${URL_}/functions/v1/${name}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

function privateAddress() {
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) return { name, address: a.address };
    }
  }
  return null;
}

function listen(host, port, onConn) {
  return new Promise((resolve, reject) => {
    const s = net.createServer(onConn);
    s.once('error', reject);
    s.listen(port, host, () => resolve(s));
  });
}

async function main() {
  const me = privateAddress();
  console.log(`Test machine: ${os.hostname()}, private address ${me?.address} (${me?.name}). Only this address is scanned.`);
  if (!me) throw new Error('This test machine has no private IPv4 address.');

  // Throwaway account and workspace.
  const email = `e2e-scanner-${runId}@example.com`;
  const password = `E2e-${crypto.randomUUID()}`;
  const { data: u, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  userId = u.user.id;
  const client = createClient(URL_, ANON, opts);
  token = (await client.auth.signInWithPassword({ email, password })).data.session.access_token;
  const boot = await fn('manageOrganization', { action: 'bootstrap' });
  orgId = boot.data.organization?.id;
  if (!orgId) throw new Error(`workspace bootstrap failed: ${JSON.stringify(boot.data)}`);

  // Test services on this machine only: an HTTP server and an FTP-style greeting.
  const servers = [
    await listen(me.address, 8080, (c) => c.once('data', () => c.end('HTTP/1.0 200 OK\r\nServer: CoinexaTestServer/1.2.3\r\n\r\n'))),
    await listen(me.address, 21, (c) => c.end('220 (vsFTPd 3.0.3)\r\n')),
  ];

  await check('the .exe starts and reports its version and staging server', () => {
    const r = exe(['version']);
    return r.code === 0 && r.out.includes('staging') && r.out.includes(URL_) ? r.out.trim() : { fail: `${r.code} ${r.out} ${r.error || ''}` };
  });

  await check('scanning before linking is refused', () => {
    const r = exe(['scan', '--range', `${me.address}/32`, '--confirm-authorized', 'CI Test']);
    return r.code === 3 && r.out.includes('not linked') ? true : { fail: `${r.code} ${r.out}` };
  });

  await check('an invalid linking code is refused', () => {
    const r = exe(['link', 'ZZZZZ-ZZZZZ', '--name', 'CI-WIN']);
    return r.code === 4 && /invalid|expired/i.test(r.out) ? true : { fail: `${r.code} ${r.out}` };
  });

  await check('the .exe links with a real code; the key is protected with Windows DPAPI', async () => {
    const c = await fn('securityScan', { action: 'createPairingCode' });
    if (c.status !== 200) throw new Error(`code ${c.status} ${JSON.stringify(c.data)}`);
    const r = exe(['link', c.data.code, '--name', `CI-WIN-${runId}`]);
    if (r.code !== 0) throw new Error(`${r.code} ${r.out}`);
    const cfg = JSON.parse(readFileSync(path.join(HOME, 'config.json'), 'utf8'));
    const blob = Buffer.from(cfg.protected_private_key, 'base64');
    const { data: dev } = await admin.from('security_devices').select('organization_id, public_key, name').eq('id', cfg.device_id).single();
    const ok = cfg.key_protection === 'windows-dpapi' && blob.length > 100 && dev.organization_id === orgId && dev.public_key === cfg.public_key;
    return ok ? `device ${cfg.device_id}; protected key blob ${blob.length} bytes (raw key is 32)` : { fail: JSON.stringify({ cfg: { ...cfg, protected_private_key: '…' }, dev }) };
  });

  await check('link check (signed status request) works', () => {
    const r = exe(['status']);
    return r.code === 0 && r.out.includes('windows-dpapi') ? r.out.trim() : { fail: `${r.code} ${r.out}` };
  });

  const scansBefore = async () => (await admin.from('security_scans').select('id').eq('organization_id', orgId)).data.length;

  await check('public internet range is refused before any connection', async () => {
    const before = await scansBefore();
    const a = exe(['scan', '--range', '8.8.8.0/24', '--confirm-authorized', 'CI Test']);
    const b = exe(['scan', '--range', '1.1.1.1', '--confirm-authorized', 'CI Test']);
    const ok = a.code === 2 && b.code === 2 && a.out.includes('not a private') && (await scansBefore()) === before && !a.out.includes('Scanning');
    return ok ? 'refused: 8.8.8.0/24, 1.1.1.1' : { fail: `${a.code}/${b.code} ${a.out} ${b.out}` };
  });

  await check('oversized and not-connected private ranges are refused', () => {
    const big = exe(['scan', '--range', '10.0.0.0/8', '--confirm-authorized', 'CI Test']);
    const other = exe(['scan', '--range', me.address.startsWith('192.168.') ? '10.123.45.0/24' : '192.168.231.0/24', '--confirm-authorized', 'CI Test']);
    return big.code === 2 && big.out.includes('too large') && other.code === 2 && other.out.includes('not part of a network')
      ? true : { fail: `${big.code} ${big.out} | ${other.code} ${other.out}` };
  });

  await check('a scan without authorisation is cancelled (no name, no YES)', async () => {
    const before = await scansBefore();
    const none = exe(['scan', '--range', `${me.address}/32`], '\n');
    const noYes = exe(['scan', '--range', `${me.address}/32`], 'CI Tester\nno\n');
    const ok = none.code === 5 && noYes.code === 5 && !none.out.includes('Scanning') && !noYes.out.includes('Scanning') && (await scansBefore()) === before;
    return ok ? true : { fail: `${none.code}/${noYes.code} ${none.out.slice(-200)} ${noYes.out.slice(-200)}` };
  });

  let scanId;
  await check('interactive authorised scan of this machine finds the test services and uploads', async () => {
    const r = exe(['scan', '--range', `${me.address}/32`], 'CI Tester\nYES\n');
    if (r.code !== 0) throw new Error(`${r.code} ${r.out.slice(-600)}`);
    const { data: scan } = await admin.from('security_scans').select('id, authorized_by, host_count, open_port_count, network_summary').eq('organization_id', orgId)
      .order('created_date', { ascending: false }).limit(1).single();
    scanId = scan.id;
    const view = await fn('securityScan', { action: 'getScan', scan_id: scan.id });
    const host = view.data.hosts?.[0];
    const ports = Object.fromEntries((host?.ports || []).map((p) => [p.port, p]));
    const ok = scan.authorized_by === 'CI Tester' && host?.ip === me.address && ports[8080]?.product === 'CoinexaTestServer' && ports[8080]?.version === '1.2.3'
      && ports[21]?.product === 'vsFTPd' && ports[21]?.version === '3.0.3';
    return ok ? `${scan.host_count} device, ${scan.open_port_count} open ports: ${host.ports.map((p) => `${p.port}/${p.service || '?'} ${p.product || ''} ${p.version || ''}`.trim()).join('; ')}`
      : { fail: JSON.stringify({ scan, host, out: r.out.slice(-500) }) };
  });

  await check('unattended scan with --confirm-authorized works; a local copy is saved', async () => {
    const out = path.join(HOME, 'ci-scan.json');
    const r = exe(['scan', '--range', `${me.address}/32`, '--confirm-authorized', 'CI Unattended', '--output', out]);
    const saved = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null;
    const ok = r.code === 0 && saved?.authorization?.confirmed_by === 'CI Unattended' && saved.networks[0].cidr === `${me.address}/32`;
    return ok ? true : { fail: `${r.code} ${r.out.slice(-400)}` };
  });

  await check('dry run scans but uploads nothing', async () => {
    const before = await scansBefore();
    const r = exe(['scan', '--range', `${me.address}/32`, '--confirm-authorized', 'CI Test', '--dry-run']);
    return r.code === 0 && r.out.includes('nothing was uploaded') && (await scansBefore()) === before ? true : { fail: `${r.code} ${r.out.slice(-300)}` };
  });

  await check('a stolen link file is useless to another Windows user/PC (key only unlocks under DPAPI)', () => {
    const cfg = JSON.parse(readFileSync(path.join(HOME, 'config.json'), 'utf8'));
    const blob = Buffer.from(cfg.protected_private_key, 'base64');
    // The DPAPI blob starts with the DPAPI header (version 1 + provider GUID), not the raw key.
    const header = blob.subarray(0, 4).toString('hex');
    return header === '01000000' && !blob.includes(Buffer.from(cfg.public_key, 'base64')) ? `DPAPI blob header ${header}` : { fail: header };
  });

  await check('after unlinking in Coinexa, the .exe can no longer upload', async () => {
    const cfg = JSON.parse(readFileSync(path.join(HOME, 'config.json'), 'utf8'));
    const rev = await fn('securityScan', { action: 'revokeDevice', device_id: cfg.device_id });
    const r = exe(['scan', '--range', `${me.address}/32`, '--confirm-authorized', 'CI Test']);
    const st = exe(['status']);
    return rev.status === 200 && r.code === 4 && /unlinked/i.test(r.out) && st.code === 4 ? true : { fail: `${rev.status} ${r.code} ${r.out.slice(-300)} | ${st.code}` };
  });

  await check('unlinking on the PC removes the stored key', () => {
    const r = exe(['unlink', '--yes']);
    const st = exe(['status']);
    return r.code === 0 && !existsSync(path.join(HOME, 'config.json')) && st.code === 3 ? true : { fail: `${r.code} ${st.code} ${r.out}` };
  });

  await check('the uploaded scan opens in Coinexa (owner view)', async () => {
    const v = await fn('securityScan', { action: 'getScan', scan_id: scanId });
    return v.status === 200 && v.data.scan.authorized_by === 'CI Tester' ? `${v.data.scan.network_summary}` : { fail: `${v.status}` };
  });

  for (const s of servers) s.close();
}

async function cleanup() {
  try {
    if (orgId) {
      for (const t of ['audit_logs', 'organization_members']) await admin.from(t).delete().eq('organization_id', orgId);
      await admin.from('organizations').delete().eq('id', orgId); // cascades to linked PCs and scans
    }
    if (userId) await admin.auth.admin.deleteUser(userId);
    rmSync(HOME, { recursive: true, force: true });
    console.log('cleanup: removed the test account, workspace, linked PC and scans');
  } catch (e) {
    console.error('cleanup error', e?.message);
  }
}

try {
  await main();
} catch (e) {
  record('test run', false, e?.message || e);
} finally {
  await cleanup();
}
const failed = results.filter((r) => !r.ok);
const summary = [`## Windows scanner end-to-end: ${results.length - failed.length} passed, ${failed.length} failed`, '', '| Result | Check | Detail |', '|---|---|---|',
  ...results.map((r) => `| ${r.ok ? 'pass' : 'FAIL'} | ${r.name} | ${r.detail.replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`)].join('\n');
console.log(`\n${summary}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
process.exit(failed.length ? 1 : 0);
