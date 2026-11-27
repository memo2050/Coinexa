// Agent names and icons: platform admin only (admin role + two-step sign-in, checked
// by the shared admin guard on every request, before anything is read).
//
//   list    : every agent (all workspaces) and the featured agents, with current name,
//             default name, icon and the last suggestion
//   suggest : suggests ONE icon from the approved library for an agent's role and
//             industry (AI, constrained to the library; keyword rules if AI is
//             unavailable). Stored, nothing applied: the admin approves by saving.
//   save    : new name and/or icon (library key or uploaded PNG/WebP/SVG, validated)
//   reset   : back to the default name and no custom icon
// Every save and reset is written to the audit log.
import { serveBase44 } from '../_shared/http.ts';
import { service } from '../_shared/base44shim.ts';
import { adminContext } from '../_shared/adminGuard.ts';
import { ICONS, ICON_KEYS, suggestByRules } from '../_shared/agentIcons.ts';
import { validateIcon } from '../_shared/iconUpload.ts';
import { FEATURED, cleanName } from '../_shared/agentBrandingLogic.ts';

type Row = Record<string, any>;
const db = () => service();
const BUCKET = 'agent-icons';
const fail = (message: string, status = 400) => Object.assign(new Error(message), { status });

async function must<T>(p: PromiseLike<{ data: T; error: any }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw fail(error.message, 500);
  return data;
}

async function subjectInfo(subject: string) {
  if (FEATURED[subject]) {
    const f = FEATURED[subject];
    return { subject, agent: null as Row | null, defaultName: f.name, currentName: null as string | null, text: `${f.name}. ${f.text}`, plan: f.plan, org: null as string | null };
  }
  const agent = await must(db().from('agents').select('id, name, organization_id, specialization, industry, role, summary, catalog_key').eq('id', subject).maybeSingle()) as Row | null;
  if (!agent) throw fail('Agent not found.', 404);
  const text = [agent.name, agent.specialization, agent.industry, agent.role, agent.summary].filter(Boolean).join('. ').slice(0, 1500);
  return { subject, agent, defaultName: null, currentName: agent.name, text, plan: agent.catalog_key || null, org: agent.organization_id || null };
}

const hash = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))))
  .map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);

async function audit(user: Row, org: string | null, action: string, subject: string, detail: string) {
  const { error } = await db().from('audit_logs').insert({ organization_id: org, actor_id: user.id, actor_email: user.email, action, target_type: 'AgentBranding', target_id: subject, detail: detail.slice(0, 400) });
  if (error) throw fail(`The change was saved but the audit log entry failed: ${error.message}`, 500);
}

async function removeUpload(path: string | null | undefined) {
  if (path) await db().storage.from(BUCKET).remove([path]).catch(() => null);
}

async function list() {
  const [agents, rows, orgs] = await Promise.all([
    must(db().from('agents').select('id, name, status, organization_id, specialization, industry, catalog_key').order('created_date', { ascending: true }).limit(1000)),
    must(db().from('agent_branding').select('*')),
    must(db().from('organizations').select('id, name')),
  ]) as [Row[], Row[], Row[]];
  const byId = new Map(rows.map((r) => [r.subject, r]));
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  const view = (subject: string, base: Row) => {
    const b = byId.get(subject) || {};
    return { subject, ...base, icon: b.icon_kind ? { kind: b.icon_kind, key: b.icon_key, path: b.icon_path, version: b.icon_version } : null,
      suggestion: b.suggested_icon ? { icon: b.suggested_icon, reason: b.suggested_reason, source: b.suggested_source } : null,
      updatedAt: b.updated_at || null, updatedBy: b.updated_by_email || null };
  };
  return {
    icons: ICONS.map(({ key, label }) => ({ key, label })),
    featured: Object.entries(FEATURED).map(([subject, f]) => view(subject, {
      kind: 'featured', name: byId.get(subject)?.name || f.name, defaultName: f.name, defaultIcon: f.icon, organization: 'All workspaces' })),
    agents: agents.map((a) => view(a.id, {
      kind: 'agent', name: a.name, defaultName: byId.get(a.id)?.default_name || a.name, defaultIcon: null, status: a.status,
      specialization: a.specialization || a.industry || '', organization: orgName.get(a.organization_id) || 'Personal' })),
  };
}

async function suggest(ctx: Row, subject: string) {
  const info = await subjectInfo(subject);
  const input = `${info.plan || ''}|${info.text}`;
  const key = await hash(input);
  const existing = await must(db().from('agent_branding').select('*').eq('subject', subject).maybeSingle()) as Row | null;
  // Same agent description → same suggestion: no new AI call, so it never changes at random.
  if (existing?.suggested_for === key && existing.suggested_icon) {
    return { icon: existing.suggested_icon, reason: existing.suggested_reason, source: existing.suggested_source, cached: true };
  }
  let result: { icon: string; reason: string; source: 'ai' | 'rules' } | null = null;
  // A known catalog agent type decides the icon outright; AI is asked only for custom agents.
  const plan = info.plan && info.plan !== 'custom' ? info.plan : null;
  if (!plan) {
    try {
      const out = await ctx.service.integrations.Core.InvokeLLM({
        prompt: `Choose the single most fitting icon for an AI agent, based on its role and industry.\n\nAgent: ${info.text}\n${info.plan ? `Agent type: ${info.plan}\n` : ''}\nAllowed icons (key: meaning):\n${ICONS.map((i) => `${i.key}: ${i.label}`).join('\n')}\n\nAnswer with one key from the list exactly as written and a one-sentence reason. Prefer the agent's job (role) over its industry when they differ.`,
        response_json_schema: { type: 'object', properties: { icon: { type: 'string', enum: [...ICON_KEYS] }, reason: { type: 'string' } }, required: ['icon', 'reason'] },
        max_tokens: 300,
      });
      if (out && ICON_KEYS.has(out.icon)) result = { icon: out.icon, reason: String(out.reason || '').slice(0, 200), source: 'ai' };
    } catch (e) {
      console.warn('adminAgentBranding: AI suggestion unavailable, using rules', (e as Error).message);
    }
  }
  if (!result) result = { ...suggestByRules(info.text, plan), source: 'rules' };
  const row = { suggested_icon: result.icon, suggested_reason: result.reason, suggested_source: result.source, suggested_for: key };
  if (existing) await must(db().from('agent_branding').update(row).eq('subject', subject));
  else await must(db().from('agent_branding').insert({ subject, agent_id: info.agent ? subject : null, ...row }));
  return { ...result, cached: false };
}

async function save(user: Row, body: Row) {
  const subject = String(body.subject || '');
  const info = await subjectInfo(subject);
  const existing = await must(db().from('agent_branding').select('*').eq('subject', subject).maybeSingle()) as Row | null;
  const changes: string[] = [];
  const row: Row = { updated_by: user.id, updated_by_email: user.email, updated_at: new Date().toISOString() };

  const oldName = info.agent ? info.agent.name : (existing?.name || info.defaultName);
  let newName: string | null = null;
  if (body.name !== undefined && body.name !== null) {
    newName = cleanName(body.name);
    if (newName === oldName) newName = null;
  }

  const icon = body.icon || { kind: 'keep' };
  let uploaded: { path: string } | null = null;
  if (icon.kind === 'library') {
    if (!ICON_KEYS.has(String(icon.key))) throw fail('That icon is not in the approved library.');
    Object.assign(row, { icon_kind: 'library', icon_key: icon.key, icon_path: null });
    changes.push(`icon → library:${icon.key}`);
  } else if (icon.kind === 'upload') {
    const file = validateIcon(String(icon.data || ''));
    const version = (existing?.icon_version || 0) + 1;
    const path = `${subject.replace(/[^a-z0-9-]/gi, '_')}/v${version}.${file.ext}`;
    const { error } = await db().storage.from(BUCKET).upload(path, file.bytes, { contentType: file.contentType, upsert: true, cacheControl: '31536000' });
    if (error) throw fail(`The icon could not be stored: ${error.message}`, 500);
    uploaded = { path };
    Object.assign(row, { icon_kind: 'upload', icon_key: null, icon_path: path, icon_version: version });
    changes.push(`icon → upload ${file.ext}${file.width ? ` ${file.width}×${file.height}` : ''} (${file.bytes.length} bytes)`);
  } else if (icon.kind === 'none') {
    Object.assign(row, { icon_kind: null, icon_key: null, icon_path: null });
    if (existing?.icon_kind) changes.push('icon removed');
  } else if (icon.kind !== 'keep') {
    throw fail('Unknown icon choice.');
  }

  if (newName) changes.unshift(`name: "${oldName}" → "${newName}"`);
  if (!changes.length) return { saved: false, message: 'Nothing changed.' };

  try {
    if (newName && info.agent) {
      await must(db().from('agents').update({ name: newName }).eq('id', subject));
      if (!existing?.default_name) row.default_name = oldName;
    } else if (newName) {
      row.name = newName;
    }
    if (existing) await must(db().from('agent_branding').update(row).eq('subject', subject));
    else await must(db().from('agent_branding').insert({ subject, agent_id: info.agent ? subject : null, ...row }));
  } catch (e) {
    if (uploaded) await removeUpload(uploaded.path);
    throw e;
  }
  if (existing?.icon_path && existing.icon_path !== row.icon_path && 'icon_kind' in row) await removeUpload(existing.icon_path);
  await audit(user, info.org, 'agent.branding_updated', subject, changes.join('; '));
  return { saved: true, changes };
}

async function reset(user: Row, subject: string) {
  const info = await subjectInfo(subject);
  const existing = await must(db().from('agent_branding').select('*').eq('subject', subject).maybeSingle()) as Row | null;
  if (!existing || (!existing.icon_kind && !existing.name && !existing.default_name)) return { reset: false, message: 'Already using the default name and icon.' };
  const changes: string[] = [];
  if (info.agent && existing.default_name && existing.default_name !== info.agent.name) {
    await must(db().from('agents').update({ name: existing.default_name }).eq('id', subject));
    changes.push(`name: "${info.agent.name}" → "${existing.default_name}"`);
  }
  if (!info.agent && existing.name) changes.push(`name: "${existing.name}" → "${info.defaultName}"`);
  if (existing.icon_kind) changes.push('icon → default');
  // The suggestion is kept (it is not a setting); name and icon settings are cleared.
  await must(db().from('agent_branding').update({ name: null, default_name: null, icon_kind: null, icon_key: null, icon_path: null,
    updated_by: user.id, updated_by_email: user.email, updated_at: new Date().toISOString() }).eq('subject', subject));
  await removeUpload(existing.icon_path);
  await audit(user, info.org, 'agent.branding_reset', subject, changes.join('; ') || 'reset to defaults');
  return { reset: true, changes };
}

serveBase44('adminAgentBranding', async (req: Request) => {
  const ctx = await adminContext(req);
  if (ctx.response) return ctx.response;
  try {
    const body = await req.json().catch(() => ({})) as Row;
    const action = String(body.action || 'list');
    const user = ctx.user as Row;
    if (action === 'list') return Response.json(await list());
    if (action === 'suggest') return Response.json(await suggest(ctx, String(body.subject || '')));
    if (action === 'save') return Response.json(await save(user, body));
    if (action === 'reset') return Response.json(await reset(user, String(body.subject || '')));
    return Response.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (e) {
    const err = e as Error & { status?: number };
    if (!err.status || err.status >= 500) console.error('adminAgentBranding failed', err.message);
    return Response.json({ error: err.message || 'Something went wrong.' }, { status: err.status || 500 });
  }
});
