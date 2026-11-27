// End-to-end checks for admin-only agent names and icons (adminAgentBranding).
// Everything this creates is removed, and the featured agents' settings are put back
// exactly as they were.
import { deflateSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); out.write(type, 4, 'ascii'); data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}
// A real, viewable PNG (a sky-blue square with a darker border).
export function makePng(size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      const edge = x < 4 || y < 4 || x >= size - 4 || y >= size - 4;
      row.set(edge ? [2, 132, 199, 255] : [56, 189, 248, 255], 1 + x * 4);
    }
    rows.push(row);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
const dataUrl = (type, buf) => `data:${type};base64,${Buffer.from(buf).toString('base64')}`;
const GOOD_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#0ea5e9"/><path d="M7 12h10" stroke="#fff" stroke-width="2"/></svg>';

export async function brandingChecks({ check, call, admin, URL_, ANON, A, B, orgB, signInWithLink, createClient, opts }) {
  const FN = 'adminAgentBranding';
  const icons = new Set();
  const { data: agent } = await admin.from('agents').insert({ name: 'E2E Dental Reminder Agent', organization_id: orgB, created_by_id: B.id,
    specialization: 'Dental clinic appointment reminders', industry: 'Healthcare', status: 'active' }).select('id, name').single();
  const featured = 'featured:cyber-scan';
  const { data: featuredBefore } = await admin.from('agent_branding').select('*').eq('subject', featured).maybeSingle();
  const publicUrl = (path) => `${URL_}/storage/v1/object/public/agent-icons/${path}`;
  // Whether a file still exists in storage (the public URL can be served from the CDN cache).
  const stored = async (path) => { const [dir, name] = path.split('/'); const { data } = await admin.storage.from('agent-icons').list(dir); return (data || []).some((f) => f.name === name); };
  const row = async (subject) => (await admin.from('agent_branding').select('*').eq('subject', subject).maybeSingle()).data;

  try {
    // ---- Who is refused ----
    await check('branding', 'no sign-in: refused before the function runs', async () => {
      const r = await call(null, FN, { action: 'list' });
      return r.status === 401 ? 'HTTP 401' : { fail: `status ${r.status}` };
    });
    await check('branding', 'the public anon key as a token: refused', async () => {
      const r = await call(ANON, FN, { action: 'list' });
      return r.status === 401 ? 'HTTP 401' : { fail: `status ${r.status} ${JSON.stringify(r.data).slice(0, 120)}` };
    });
    await check('branding', 'a regular user (the agent\'s own owner) is refused for every action', async () => {
      const bad = [];
      for (const body of [{ action: 'list' }, { action: 'suggest', subject: agent.id }, { action: 'save', subject: agent.id, name: 'Hijack', icon: { kind: 'library', key: 'bot' } }, { action: 'reset', subject: agent.id }]) {
        const r = await call(B.token, FN, body);
        if (r.status !== 403) bad.push(`${body.action}:${r.status}`);
      }
      const after = (await admin.from('agents').select('name').eq('id', agent.id).single()).data.name;
      return !bad.length && after === agent.name && !(await row(agent.id)) ? 'list, suggest, save, reset all HTTP 403; nothing changed' : { fail: `${bad.join(', ')} name=${after}` };
    });
    await check('branding', 'an admin signed in without two-step verification is refused', async () => {
      const c = createClient(URL_, ANON, opts);
      const s = await signInWithLink(admin, c, A.email);
      const r = await call(s.access_token, FN, { action: 'save', subject: agent.id, name: 'No MFA rename' });
      return r.status === 403 && r.data.code === 'mfa_required' ? 'HTTP 403 mfa_required' : { fail: `status ${r.status} ${JSON.stringify(r.data).slice(0, 120)}` };
    });
    await check('branding', 'direct database and storage writes by a user are refused', async () => {
      const rename = await B.client.from('agents').update({ name: 'Renamed via REST' }).eq('id', agent.id);
      const insert = await B.client.from('agent_branding').insert({ subject: agent.id, agent_id: agent.id, icon_kind: 'library', icon_key: 'bot' });
      const upload = await B.client.storage.from('agent-icons').upload(`${agent.id}/evil.svg`, new Blob([GOOD_SVG], { type: 'image/svg+xml' }));
      const name = (await admin.from('agents').select('name').eq('id', agent.id).single()).data.name;
      const ok = rename.error && insert.error && upload.error && name === agent.name;
      return ok ? `rename: ${rename.error.code}; icon row: ${insert.error.code}; storage: refused` : { fail: JSON.stringify({ rename: rename.error, insert: insert.error, upload: upload.error, name }) };
    });

    // ---- Admin (two-step verified) ----
    await check('branding', 'admin lists all agents and the two featured agents with the approved icon library', async () => {
      const r = await call(A.token, FN, { action: 'list' });
      if (r.status !== 200) return { fail: `status ${r.status} ${JSON.stringify(r.data).slice(0, 150)}` };
      r.data.icons.forEach((i) => icons.add(i.key));
      const found = r.data.agents.some((a) => a.subject === agent.id);
      return r.data.featured.length === 2 && found && icons.size >= 30 ? `${r.data.agents.length} agents, 2 featured, ${icons.size} approved icons` : { fail: JSON.stringify(r.data).slice(0, 200) };
    });
    let suggested;
    await check('branding', 'suggestion: one approved icon, the same every time, applied to nothing', async () => {
      const s1 = await call(A.token, FN, { action: 'suggest', subject: agent.id });
      const s2 = await call(A.token, FN, { action: 'suggest', subject: agent.id });
      suggested = s1.data.icon;
      const r = await row(agent.id);
      const ok = s1.status === 200 && icons.has(s1.data.icon) && s2.data.icon === s1.data.icon && s2.data.cached === true && !r.icon_kind;
      return ok ? `${s1.data.icon} (${s1.data.source}): "${s1.data.reason}"; repeat identical; not applied until saved` : { fail: JSON.stringify({ s1: s1.data, s2: s2.data, r }) };
    });
    await check('branding', 'admin saves a new name and the suggested icon; audit log records it', async () => {
      const r = await call(A.token, FN, { action: 'save', subject: agent.id, name: '  Smile   Scheduler  ', icon: { kind: 'library', key: suggested } });
      const a = (await admin.from('agents').select('name').eq('id', agent.id).single()).data;
      const b = await row(agent.id);
      const { data: logs } = await admin.from('audit_logs').select('action, detail, actor_email').eq('target_id', agent.id).eq('action', 'agent.branding_updated');
      const ok = r.status === 200 && a.name === 'Smile Scheduler' && b.icon_kind === 'library' && b.icon_key === suggested && b.default_name === agent.name && logs.length === 1 && logs[0].actor_email === A.email;
      return ok ? `name "Smile Scheduler", icon ${suggested}; audit: ${logs[0].detail}` : { fail: JSON.stringify({ r: r.data, a, b, logs }) };
    });
    await check('branding', 'the agent\'s workspace sees the new name and icon (read-only)', async () => {
      const { data: seen } = await B.client.from('agent_branding').select('icon_kind, icon_key').eq('subject', agent.id).maybeSingle();
      const { data: a } = await B.client.from('agents').select('name, status').eq('id', agent.id).single();
      return seen?.icon_key === suggested && a.name === 'Smile Scheduler' && a.status === 'active' ? 'visible to the workspace; agent still active' : { fail: JSON.stringify({ seen, a }) };
    });
    await check('branding', 'invalid names and icons outside the library are refused', async () => {
      const n = await call(A.token, FN, { action: 'save', subject: agent.id, name: '<img src=x onerror=alert(1)>' });
      const k = await call(A.token, FN, { action: 'save', subject: agent.id, icon: { kind: 'library', key: 'skull' } });
      const s = await call(A.token, FN, { action: 'save', subject: agent.id, name: 'x' });
      const b = await row(agent.id);
      return n.status === 400 && k.status === 400 && s.status === 400 && b.icon_key === suggested ? `${n.data.error} | ${k.data.error} | ${s.data.error}` : { fail: JSON.stringify({ n: n.data, k: k.data, s: s.data }) };
    });
    let pngPath;
    await check('branding', 'admin uploads a PNG icon: validated, stored, served as image/png', async () => {
      const r = await call(A.token, FN, { action: 'save', subject: agent.id, icon: { kind: 'upload', data: dataUrl('image/png', makePng(128)) } });
      const b = await row(agent.id);
      pngPath = b?.icon_path;
      const got = pngPath ? await fetch(publicUrl(pngPath)) : null;
      const ok = r.status === 200 && b.icon_kind === 'upload' && /\.png$/.test(pngPath) && got?.status === 200 && got.headers.get('content-type') === 'image/png';
      return ok ? `${r.data.changes.join('; ')} → ${pngPath} (HTTP 200 image/png)` : { fail: JSON.stringify({ r: r.data, b, status: got?.status }) };
    });
    await check('branding', 'unsafe or invalid uploads are refused and the current icon is kept', async () => {
      const tries = {
        script: dataUrl('image/svg+xml', Buffer.from('<svg viewBox="0 0 1 1"><script>alert(document.cookie)</script></svg>')),
        handler: dataUrl('image/svg+xml', Buffer.from('<svg viewBox="0 0 1 1" onload="alert(1)"/>')),
        external: dataUrl('image/svg+xml', Buffer.from('<svg viewBox="0 0 1 1"><use href="https://evil.example/x.svg#a"/></svg>')),
        fakePng: dataUrl('image/png', Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(200)])),
        tooSmall: dataUrl('image/png', makePng(16)),
        tooBig: dataUrl('image/png', Buffer.concat([makePng(64), Buffer.alloc(300 * 1024)])),
      };
      const out = [];
      for (const [label, data] of Object.entries(tries)) {
        const r = await call(A.token, FN, { action: 'save', subject: agent.id, icon: { kind: 'upload', data } });
        out.push(`${label}:${r.status}`);
        if (r.status !== 400) return { fail: `${label} status ${r.status} ${JSON.stringify(r.data).slice(0, 120)}` };
      }
      const b = await row(agent.id);
      return b.icon_path === pngPath ? `all refused (${out.join(', ')}); PNG icon kept` : { fail: JSON.stringify(b) };
    });
    await check('branding', 'a clean SVG upload replaces the PNG; the old file is deleted', async () => {
      const r = await call(A.token, FN, { action: 'save', subject: agent.id, icon: { kind: 'upload', data: dataUrl('image/svg+xml', Buffer.from(GOOD_SVG)) } });
      const b = await row(agent.id);
      const svg = await fetch(publicUrl(b.icon_path));
      const oldStored = await stored(pngPath);
      const ok = r.status === 200 && /\.svg$/.test(b.icon_path) && svg.status === 200 && svg.headers.get('content-type') === 'image/svg+xml' && !oldStored;
      return ok ? `${b.icon_path} served as image/svg+xml; previous PNG deleted from storage` : { fail: JSON.stringify({ svg: svg.status, type: svg.headers.get('content-type'), oldStored, path: b.icon_path }) };
    });
    await check('branding', 'reset restores the default name and icon, deletes the file, and is audited', async () => {
      const before = await row(agent.id);
      const r = await call(A.token, FN, { action: 'reset', subject: agent.id });
      const a = (await admin.from('agents').select('name').eq('id', agent.id).single()).data;
      const b = await row(agent.id);
      const fileStored = await stored(before.icon_path);
      const { data: logs } = await admin.from('audit_logs').select('detail').eq('target_id', agent.id).eq('action', 'agent.branding_reset');
      const ok = r.status === 200 && a.name === agent.name && !b.icon_kind && !b.default_name && !fileStored && logs.length === 1;
      return ok ? `name back to "${a.name}", no custom icon, file deleted from storage; audit: ${logs[0].detail}` : { fail: JSON.stringify({ fileStored, icon: b.icon_kind, logs: logs.length, name: a.name }) };
    });
    await check('branding', 'featured agent: admin renames and sets an icon, the catalog reads it, reset restores', async () => {
      const s = await call(A.token, FN, { action: 'save', subject: featured, name: 'Network Guard Agent', icon: { kind: 'library', key: 'lock' } });
      const { data: seen } = await B.client.from('agent_branding').select('name, icon_key').eq('subject', featured).single();
      const r = await call(A.token, FN, { action: 'reset', subject: featured });
      const after = await row(featured);
      const ok = s.status === 200 && seen.name === 'Network Guard Agent' && seen.icon_key === 'lock' && r.status === 200 && !after.name && !after.icon_kind;
      return ok ? 'customers saw "Network Guard Agent" + lock; reset back to default' : { fail: JSON.stringify({ s: s.data, seen, r: r.data, after }) };
    });
  } finally {
    // Put the featured agent back exactly as it was before the test, remove the test agent.
    if (featuredBefore) await admin.from('agent_branding').upsert(featuredBefore);
    else await admin.from('agent_branding').delete().eq('subject', featured);
    const { data: left } = await admin.storage.from('agent-icons').list(agent.id.replace(/[^a-z0-9-]/gi, '_'));
    if (left?.length) await admin.storage.from('agent-icons').remove(left.map((f) => `${agent.id.replace(/[^a-z0-9-]/gi, '_')}/${f.name}`));
    await admin.from('agents').delete().eq('id', agent.id);
  }
}
