// Cyber Security Scan Agent — server side (Phase 1: linked PCs and signed uploads).
//
// Two audiences:
//   • signed-in company users: link a Windows PC (one-time code), see and revoke linked
//     PCs, list and open scans. Owners/admins manage and see device addresses; members
//     see summaries with addresses hidden.
//   • a linked PC (no user session): pair with a one-time code and upload scans. Every
//     device request is authorised only by an Ed25519 signature made with the PC's own
//     private key, which never leaves the PC.
//
// Rules that hold everywhere:
//   • every read and write is scoped to the caller's workspace; the tables have no
//     browser access, so this function is the only door;
//   • uploads are accepted only if signed by an active linked PC, fresh (±5 min),
//     never seen before (device + nonce), within size limits, and only describe
//     private local networks the customer confirmed they are authorised to scan;
//   • nothing is invented: no sample devices or simulated scans are created here.
import { serveBase44 } from '../_shared/http.ts';
import { createClientFromRequest, service } from '../_shared/base44shim.ts';
import { ensureOrganization, membershipFor, canManage } from '../_shared/tenancy.ts';
import { requestContext } from '../_shared/context.ts';
import { encryptJson, decryptJson } from '../_shared/recruitmentLogic.ts';
import {
  validateScan, ScanRejected, verifyEd25519, uploadMessage, pairMessage, timestampFresh, newPairingCode, normaliseCode,
  sha256Hex, networkSummary, NONCE_RE, PUBLIC_KEY_RE, MAX_PAYLOAD_BYTES, AUTH_STATEMENT_VERSION,
} from '../_shared/securityScanLogic.ts';

type Row = Record<string, any>;
const db = () => service();
const fail = (message: string, status = 400) => Object.assign(new Error(message), { status });
const clean = (value: unknown, max = 200) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

const CODE_MINUTES = 10;
const CODES_PER_HOUR = 10;
const MAX_ACTIVE_DEVICES = 10;
const UPLOADS_PER_HOUR = 20;
const AUTH_STATEMENT = 'I confirm I own this network or have written permission to scan it, and I understand the scan only covers private local addresses.';

async function must<T>(promise: PromiseLike<{ data: T; error: any }>): Promise<T> {
  const { data, error } = await promise;
  if (error) throw Object.assign(fail(error.message, 500), { code: error.code });
  return data;
}

function dataKey() {
  const key = Deno.env.get('SECURITY_DATA_KEY');
  if (!key) throw fail('Secure storage for scan results is not configured yet.', 503);
  return key;
}

// actor_id is a user id (uuid); a linked PC has none, so it is recorded as null with
// the PC named in actor_email ("pc:<name>").
async function audit(orgId: string, actor: { id?: string; email?: string }, action: string, targetType: string, targetId: string, detail: string) {
  const { error } = await db().from('audit_logs').insert({
    organization_id: orgId, actor_id: actor.id || null, actor_email: actor.email || '',
    action, target_type: targetType, target_id: targetId, detail: detail.slice(0, 400),
  });
  if (error) console.error('securityScan: audit write failed', action, error.message);
}

async function companyContext(req: Request) {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch(() => null) as Row | null;
  if (!user) throw fail('Please sign in.', 401);
  const { organization } = await ensureOrganization({ base44, user });
  if (!organization) throw fail('No workspace is available.', 500);
  const membership = await membershipFor({ base44, user, organizationId: organization.id });
  const ctx = requestContext.getStore();
  if (ctx) ctx.organizationId = organization.id;
  return { user, org: organization as Row, manage: canManage(membership) };
}

const requireManage = (manage: boolean) => {
  if (!manage) throw fail('Only a workspace owner or admin can do that.', 403);
};

const deviceView = (d: Row) => ({
  id: d.id, name: d.name, platform: d.platform, app_version: d.app_version, status: d.status,
  paired_at: d.paired_at, last_seen_at: d.last_seen_at, revoked_at: d.revoked_at, revoked_by: d.revoked_by,
});

const maskIp = (ip: string) => ip.replace(/\.\d+$/, '.x');

// ================================================================ company ==

async function companyAction(req: Request, body: Row) {
  const { user, org, manage } = await companyContext(req);
  const orgId = org.id as string;
  const action = clean(body.action, 40);

  if (action === 'overview') {
    const devices = await must(db().from('security_devices').select('*').eq('organization_id', orgId).order('paired_at', { ascending: false })) as Row[];
    const scans = await must(db().from('security_scans')
      .select('id, device_id, started_at, finished_at, network_summary, host_count, open_port_count, status, authorized_by, scanner_version, created_date')
      .eq('organization_id', orgId).order('created_date', { ascending: false }).limit(100)) as Row[];
    const names = Object.fromEntries(devices.map((d) => [d.id, d.name]));
    return {
      can_manage: manage,
      authorization_statement: AUTH_STATEMENT,
      devices: devices.map(deviceView),
      scans: scans.map((s) => ({ ...s, device_name: names[s.device_id] || 'Removed PC' })),
      totals: {
        linked: devices.filter((d) => d.status === 'active').length,
        scans: scans.length,
        devices_found: scans[0]?.host_count ?? 0,
        open_ports: scans[0]?.open_port_count ?? 0,
      },
    };
  }

  if (action === 'createPairingCode') {
    requireManage(manage);
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await db().from('security_pairing_codes').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).gte('created_date', since);
    if ((count || 0) >= CODES_PER_HOUR) throw fail('Too many linking codes this hour. Try again later.', 429);
    const { count: active } = await db().from('security_devices').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'active');
    if ((active || 0) >= MAX_ACTIVE_DEVICES) throw fail(`A workspace can link up to ${MAX_ACTIVE_DEVICES} PCs. Revoke one first.`, 409);
    const code = newPairingCode();
    const expiresAt = new Date(Date.now() + CODE_MINUTES * 60_000).toISOString();
    await must(db().from('security_pairing_codes').insert({
      organization_id: orgId, code_hash: await sha256Hex(normaliseCode(code)), expires_at: expiresAt, created_by_id: user.id, created_by: user.email,
    }));
    await audit(orgId, user, 'security.pairing_code_created', 'SecurityDevice', '', `expires ${expiresAt}`);
    return { code, expires_at: expiresAt }; // shown once; only its hash is stored
  }

  if (action === 'revokeDevice') {
    requireManage(manage);
    const device = await must(db().from('security_devices').select('*').eq('id', clean(body.device_id, 80)).eq('organization_id', orgId).maybeSingle()) as Row | null;
    if (!device) throw fail('PC not found.', 404);
    if (device.status === 'revoked') return { device: deviceView(device) };
    const row = await must(db().from('security_devices').update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_by: user.email })
      .eq('id', device.id).select('*').single()) as Row;
    await audit(orgId, user, 'security.device_revoked', 'SecurityDevice', device.id, device.name);
    return { device: deviceView(row) };
  }

  if (action === 'getScan') {
    const scan = await must(db().from('security_scans').select('*').eq('id', clean(body.scan_id, 80)).eq('organization_id', orgId).maybeSingle()) as Row | null;
    if (!scan) throw fail('Scan not found.', 404);
    const device = await must(db().from('security_devices').select('name').eq('id', scan.device_id).maybeSingle()) as Row | null;
    const rows = await must(db().from('security_scan_hosts').select('*').eq('scan_id', scan.id).order('ip_sort')) as Row[];
    const key = dataKey();
    const hosts = [];
    for (const h of rows) {
      const id = (await decryptJson<{ ip: string; mac: string; hostname: string }>(h.identity_enc, key)) || { ip: '', mac: '', hostname: '' };
      hosts.push({
        id: h.id, ip: manage ? id.ip : maskIp(id.ip), mac: manage ? id.mac : '', hostname: manage ? id.hostname : '',
        vendor: h.vendor, device_type: h.device_type, os_guess: h.os_guess, ports: h.ports,
      });
    }
    const networks = (await decryptJson<{ cidr: string; interface: string }[]>(scan.networks_enc, key)) || [];
    const { networks_enc: _n, payload_sha256: _p, nonce: _o, ...rest } = scan;
    if (manage) await audit(orgId, user, 'security.scan_viewed', 'SecurityScan', scan.id, `${hosts.length} devices`);
    return {
      can_manage: manage,
      scan: { ...rest, device_name: device?.name || 'Removed PC', networks: manage ? networks : networks.map((n) => ({ cidr: maskIp(n.cidr.split('/')[0]) + '/' + n.cidr.split('/')[1], interface: '' })) },
      hosts,
      addresses_hidden: !manage,
    };
  }

  if (action === 'deleteScan') {
    requireManage(manage);
    const scan = await must(db().from('security_scans').select('id').eq('id', clean(body.scan_id, 80)).eq('organization_id', orgId).maybeSingle()) as Row | null;
    if (!scan) throw fail('Scan not found.', 404);
    await must(db().from('security_scans').delete().eq('id', scan.id));
    await audit(orgId, user, 'security.scan_deleted', 'SecurityScan', scan.id, 'deleted with its device list');
    return { ok: true };
  }

  throw fail('Unknown action.');
}

// ================================================================= device ==

async function devicePair(body: Row) {
  const code = normaliseCode(clean(body.code, 20));
  const publicKey = clean(body.public_key, 60);
  const name = clean(body.device_name, 80).replace(/[\u0000-\u001f\u007f]/g, '');
  if (code.length !== 10) throw fail('Enter the 10-character linking code shown in Coinexa.');
  if (!PUBLIC_KEY_RE.test(publicKey)) throw fail('Invalid device key.');
  if (!name) throw fail('The PC name is missing.');
  if (!(await verifyEd25519(publicKey, pairMessage(code, publicKey, name), clean(body.signature, 120)))) throw fail('The linking request signature is invalid.', 401);

  const pairing = await must(db().from('security_pairing_codes').select('*').eq('code_hash', await sha256Hex(code)).maybeSingle()) as Row | null;
  if (!pairing || pairing.used_at || new Date(pairing.expires_at).getTime() < Date.now()) throw fail('This linking code is invalid, used or expired. Create a new one in Coinexa.', 401);
  // Single use, even under concurrent requests: only the request that flips used_at wins.
  const claimed = await must(db().from('security_pairing_codes').update({ used_at: new Date().toISOString() })
    .eq('id', pairing.id).is('used_at', null).select('id')) as Row[];
  if (!claimed.length) throw fail('This linking code has already been used.', 401);

  const { count: active } = await db().from('security_devices').select('id', { count: 'exact', head: true }).eq('organization_id', pairing.organization_id).eq('status', 'active');
  if ((active || 0) >= MAX_ACTIVE_DEVICES) throw fail(`This workspace already has ${MAX_ACTIVE_DEVICES} linked PCs.`, 409);
  let device: Row;
  try {
    device = await must(db().from('security_devices').insert({
      organization_id: pairing.organization_id, name, public_key: publicKey, app_version: clean(body.app_version, 40) || null,
      created_by_id: pairing.created_by_id, created_by: pairing.created_by,
    }).select('*').single()) as Row;
  } catch (error) {
    if ((error as { code?: string }).code === '23505') throw fail('This device key is already linked. Generate a new key on the PC.', 409);
    throw error;
  }
  await must(db().from('security_pairing_codes').update({ device_id: device.id }).eq('id', pairing.id));
  await audit(pairing.organization_id, { email: `pc:${name}` }, 'security.device_linked', 'SecurityDevice', device.id, `${name} linked with a code created by ${pairing.created_by}`);
  return { device_id: device.id, device_name: device.name, authorization_statement: AUTH_STATEMENT, statement_version: AUTH_STATEMENT_VERSION };
}

// Checks an Ed25519-signed device request and returns the active device.
async function signedDevice(body: Row, payloadHash: string) {
  const deviceId = clean(body.device_id, 80);
  const timestamp = clean(body.timestamp, 40);
  const nonce = clean(body.nonce, 80);
  if (!deviceId || !NONCE_RE.test(nonce)) throw fail('The request is incomplete.', 401);
  if (!timestampFresh(timestamp)) throw fail('The request time is not current. Check the PC clock and try again.', 401);
  const device = await must(db().from('security_devices').select('*').eq('id', deviceId).maybeSingle()) as Row | null;
  // Same answer for unknown and wrong-signature requests, so device ids cannot be probed.
  if (!device || !(await verifyEd25519(device.public_key, uploadMessage(deviceId, timestamp, nonce, payloadHash), clean(body.signature, 120)))) {
    throw fail('The request signature is invalid.', 401);
  }
  if (device.status !== 'active') throw fail('This PC has been unlinked from Coinexa. Link it again to upload scans.', 403);
  const ctx = requestContext.getStore();
  if (ctx) ctx.organizationId = device.organization_id;
  return { device, timestamp, nonce };
}

async function deviceUpload(body: Row, rawLength: number) {
  if (rawLength > MAX_PAYLOAD_BYTES + 4096) throw fail('The scan is too large.', 413);
  const payload = typeof body.payload === 'string' ? body.payload : '';
  if (!payload) throw fail('The scan is missing.');
  const payloadHash = await sha256Hex(payload);
  const { device, timestamp, nonce } = await signedDevice(body, payloadHash);

  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db().from('security_scans').select('id', { count: 'exact', head: true }).eq('device_id', device.id).gte('created_date', since);
  if ((count || 0) >= UPLOADS_PER_HOUR) throw fail('Too many uploads from this PC in the last hour.', 429);

  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    throw fail('The scan is not valid JSON.');
  }
  let scan;
  try {
    scan = validateScan(raw);
  } catch (error) {
    if (error instanceof ScanRejected) throw fail(error.message, 422);
    throw error;
  }

  const key = dataKey();
  let row: Row;
  try {
    row = await must(db().from('security_scans').insert({
      organization_id: device.organization_id, device_id: device.id, nonce, signed_at: timestamp, payload_sha256: payloadHash,
      schema_version: 'v1', scanner_version: scan.scanner_version || null, started_at: scan.started_at, finished_at: scan.finished_at,
      networks_enc: await encryptJson(scan.networks, key), network_summary: networkSummary(scan.networks),
      authorized_by: scan.authorized_by, authorization_statement: `${AUTH_STATEMENT_VERSION}: ${AUTH_STATEMENT}`,
      host_count: scan.hosts.length, open_port_count: scan.open_port_count,
    }).select('id').single()) as Row;
  } catch (error) {
    if ((error as { code?: string }).code === '23505') throw fail('This upload was already received (replayed request).', 409);
    throw error;
  }
  try {
    for (let i = 0; i < scan.hosts.length; i += 200) {
      const batch = [];
      for (const h of scan.hosts.slice(i, i + 200)) {
        batch.push({
          organization_id: device.organization_id, scan_id: row.id, ip_sort: h.ip_int,
          identity_enc: await encryptJson({ ip: h.ip, mac: h.mac, hostname: h.hostname }, key),
          vendor: h.vendor || null, device_type: h.device_type || null, os_guess: h.os_guess || null, ports: h.ports,
        });
      }
      await must(db().from('security_scan_hosts').insert(batch));
    }
  } catch (error) {
    await db().from('security_scans').delete().eq('id', row.id); // no half-stored scans
    throw error;
  }
  await db().from('security_devices').update({ last_seen_at: new Date().toISOString(), app_version: scan.scanner_version || device.app_version }).eq('id', device.id);
  await audit(device.organization_id, { email: `pc:${device.name}` }, 'security.scan_uploaded', 'SecurityScan', row.id,
    `${scan.hosts.length} devices, ${scan.open_port_count} open ports; authorised by ${scan.authorized_by}`);
  return { scan_id: row.id, devices: scan.hosts.length, open_ports: scan.open_port_count };
}

// A linked PC can check it is still linked (signed, empty payload).
async function deviceStatus(body: Row) {
  const { device } = await signedDevice(body, await sha256Hex(''));
  await db().from('security_devices').update({ last_seen_at: new Date().toISOString() }).eq('id', device.id);
  return { linked: true, device_name: device.name, authorization_statement: AUTH_STATEMENT, statement_version: AUTH_STATEMENT_VERSION };
}

serveBase44('securityScan', async (req: Request) => {
  let action = '';
  try {
    const text = await req.text();
    if (text.length > MAX_PAYLOAD_BYTES * 2) throw fail('The request is too large.', 413);
    let body: Row = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      throw fail('The request is not valid JSON.');
    }
    action = clean(body.action, 40);
    const result = action === 'device_pair' ? await devicePair(body)
      : action === 'device_upload' ? await deviceUpload(body, text.length)
      : action === 'device_status' ? await deviceStatus(body)
      : await companyAction(req, body);
    return Response.json(result);
  } catch (error) {
    const status = Number((error as { status?: number }).status) || 500;
    if (status >= 500) console.error('securityScan failed', (error as Error).message);
    // Refusals are recorded for diagnosis with the last part of any address masked.
    else console.warn(`securityScan refused ${status} [${clean(action, 40) || 'company'}]`, (error as Error).message.replace(/\b(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}\b/g, '$1.x').slice(0, 300));
    return Response.json({ error: status >= 500 && status !== 503 ? 'Something went wrong. Please try again.' : (error as Error).message }, { status });
  }
});
