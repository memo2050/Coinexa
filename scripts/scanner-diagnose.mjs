// Read-only diagnosis of the Cyber Security Scan Agent on STAGING.
// The repository is public, so this prints NO personal data: no emails, names, host
// names or full addresses — only statuses, counts and times. Test accounts are skipped.
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY
import { createClient } from '@supabase/supabase-js';

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
const t = (v) => (v ? new Date(v).toISOString().slice(0, 19) + 'Z' : '—');

const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
const testUser = new Set((users?.users || []).filter((u) => /^e2e-|@test\.local$|^ui-/.test(u.email || '')).map((u) => u.id));
const { data: members } = await admin.from('organization_members').select('organization_id, user_id');
const realOrgs = new Set((members || []).filter((m) => !testUser.has(m.user_id)).map((m) => m.organization_id));
const orgLabel = new Map([...realOrgs].map((id, i) => [id, `workspace-${i + 1}`]));
const label = (id) => orgLabel.get(id) || null;

const { data: codes } = await admin.from('security_pairing_codes').select('organization_id, created_date, expires_at, used_at, device_id').gte('created_date', since).order('created_date');
console.log('\n== Linking codes (last 24 h, real workspaces) ==');
for (const c of (codes || []).filter((c) => label(c.organization_id))) {
  console.log(`${label(c.organization_id)} created ${t(c.created_date)} expires ${t(c.expires_at)} used ${t(c.used_at)} ${c.device_id ? 'linked a PC' : c.used_at ? 'USED but no PC saved' : new Date(c.expires_at) < new Date() ? 'EXPIRED unused' : 'still valid'}`);
}

const { data: devices } = await admin.from('security_devices').select('id, organization_id, status, app_version, paired_at, last_seen_at, revoked_at');
console.log('\n== Linked PCs (real workspaces) ==');
const realDevices = (devices || []).filter((d) => label(d.organization_id));
for (const d of realDevices) console.log(`${label(d.organization_id)} pc-${d.id.slice(0, 6)} ${d.status} scanner ${d.app_version || '?'} linked ${t(d.paired_at)} last seen ${t(d.last_seen_at)} ${d.revoked_at ? `unlinked ${t(d.revoked_at)}` : ''}`);
if (!realDevices.length) console.log('none');

const { data: scans } = await admin.from('security_scans').select('organization_id, device_id, created_date, host_count, open_port_count, network_summary, status');
console.log('\n== Scans received (real workspaces) ==');
const realScans = (scans || []).filter((s) => label(s.organization_id));
for (const s of realScans) console.log(`${label(s.organization_id)} pc-${s.device_id.slice(0, 6)} ${t(s.created_date)} ${s.host_count} devices ${s.open_port_count} open ports ${s.network_summary} ${s.status}`);
if (!realScans.length) console.log('none');
