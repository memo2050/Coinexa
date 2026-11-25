// Adds the Coinexa agent catalogue (supabase/seed/agents.json, copied from the
// agents on coinexa.net) to the OWNER's workspace on the staging project.
//
// Run by .github/workflows/seed-agents.yml. Needs SUPABASE_URL, SUPABASE_SERVICE_KEY
// and OWNER_EMAIL. The owner must have signed up and confirmed their email first.
// Safe to re-run: an agent whose name already exists in the workspace is skipped,
// never overwritten. Only agents are added; no runs, users or other data.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { buildWorkflowGraph, validateWorkflowGraph } from '../functions/_shared/workflowGraph.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const key = Deno.env.get('SUPABASE_SERVICE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
const testMode = Deno.env.get('SEED_TEST') === '1';
if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
if (!url.includes('ycvhmzunagrpihtgisiu')) throw new Error('Refusing to run: staging project only');

const db = createClient(url, key, { auth: { persistSession: false } });

// Test mode: seed a throwaway account instead of the owner, check it, then delete it.
let ownerEmail = (Deno.env.get('OWNER_EMAIL') || '').trim().toLowerCase();
let testPassword = '';
let testUserId = '';
if (testMode) {
  ownerEmail = `e2e-seed-${Date.now().toString(36)}@example.com`;
  testPassword = `Seed-${crypto.randomUUID()}`;
  const { data, error } = await db.auth.admin.createUser({ email: ownerEmail, password: testPassword, email_confirm: true });
  if (error) throw error;
  testUserId = data.user.id;
  console.log(`TEST MODE: seeding throwaway account ${ownerEmail}`);
}
if (!ownerEmail) throw new Error('OWNER_EMAIL is required');
try {

// 1. The owner's confirmed account.
const { data: users, error: usersError } = await db.auth.admin.listUsers({ perPage: 1000 });
if (usersError) throw usersError;
const owner = users.users.find((u) => (u.email || '').toLowerCase() === ownerEmail);
if (!owner) throw new Error(`No account for ${ownerEmail} yet. Sign up on the staging site first.`);
if (!owner.email_confirmed_at) throw new Error(`${ownerEmail} has not confirmed the sign-up code yet.`);

// 2. The owner's workspace (created the same way the app does if it does not exist yet).
const { data: membership } = await db
  .from('organization_members')
  .select('organization_id')
  .eq('user_id', owner.id)
  .eq('status', 'active')
  .eq('member_role', 'owner')
  .order('created_date')
  .limit(1)
  .maybeSingle();

let orgId = membership?.organization_id as string | undefined;
if (!orgId) {
  const { data: profile } = await db.from('profiles').select('full_name').eq('id', owner.id).maybeSingle();
  const { data: org, error } = await db
    .from('organizations')
    .insert({
      name: `${profile?.full_name || ownerEmail.split('@')[0]}'s workspace`,
      slug: `owner-${crypto.randomUUID().slice(0, 6)}`,
      plan: 'starter', status: 'active', task_limit_month: 100, agent_limit: 3, seat_limit: 2, concurrent_limit: 1,
      created_by_id: owner.id, created_by: ownerEmail,
    })
    .select('id')
    .single();
  if (error) throw error;
  orgId = org.id;
  const { error: memberError } = await db.from('organization_members').insert({
    organization_id: orgId, user_id: owner.id, email: ownerEmail, member_role: 'owner', status: 'active',
    joined_at: new Date().toISOString(), created_by_id: owner.id, created_by: ownerEmail,
  });
  if (memberError) throw memberError;
  await db.from('profiles').update({ organization_ids: [orgId] }).eq('id', owner.id);
  console.log(`Created workspace ${orgId} for ${ownerEmail}`);
}

// 3. The agents.
const catalogue = JSON.parse(await Deno.readTextFile(new URL('./agents.json', import.meta.url)));
const { data: existing } = await db.from('agents').select('name').eq('organization_id', orgId);
const have = new Set((existing || []).map((a) => a.name));

let added = 0;
for (const spec of catalogue) {
  if (have.has(spec.name)) {
    console.log(`skip (already there): ${spec.name}`);
    continue;
  }
  const graph = buildWorkflowGraph(spec);
  const check = validateWorkflowGraph(graph);
  if (!check.ok) throw new Error(`${spec.name}: workflow invalid: ${check.errors.join('; ')}`);
  const row = {
    ...spec,
    organization_id: orgId,
    created_by_id: owner.id,
    created_by: ownerEmail,
    business_description: spec.summary,
    workflow_graph: graph,
    workflow_version: 1,
    workflow_enabled: true,
  };
  const { error } = await db.from('agents').insert(row);
  if (error) throw new Error(`${spec.name}: ${error.message}`);
  added += 1;
  console.log(`added: ${spec.name} (${spec.status})`);
}

await db.from('audit_logs').insert({
  organization_id: orgId, actor_id: owner.id, actor_email: ownerEmail, action: 'agents.seeded',
  target_type: 'Organization', target_id: orgId, detail: `Added ${added} agents from the coinexa.net catalogue`,
});

console.log(`\nDone: ${added} added, ${catalogue.length - added} already present. Workspace ${orgId}.`);

if (testMode) {
  // Sign in as the account and read through row-level security, as the website does.
  const user = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInError } = await user.auth.signInWithPassword({ email: ownerEmail, password: testPassword });
  if (signInError) throw signInError;
  const { data: seen, error: seenError } = await user.from('agents').select('name, status, workflow_graph');
  if (seenError) throw seenError;
  const names = new Set(seen.map((a) => a.name));
  const missing = catalogue.filter((a) => !names.has(a.name)).map((a) => a.name);
  const invalid = seen.filter((a) => !validateWorkflowGraph(a.workflow_graph).ok).map((a) => a.name);
  const rerun = await (async () => {
    const { data: again } = await db.from('agents').select('id').eq('organization_id', orgId);
    return again?.length;
  })();
  console.log(`TEST: account sees ${seen.length} agents; missing: [${missing.join(', ')}]; invalid workflows: [${invalid.join(', ')}]`);
  if (missing.length || invalid.length || seen.length !== catalogue.length || rerun !== catalogue.length) {
    throw new Error('TEST FAILED');
  }
  console.log('TEST PASSED');
}
} finally {
  if (testMode && testUserId) {
    const { data: orgs } = await db.from('organization_members').select('organization_id').eq('user_id', testUserId);
    const ids = (orgs || []).map((o) => o.organization_id);
    for (const t of ['agents', 'audit_logs', 'organization_members']) if (ids.length) await db.from(t).delete().in('organization_id', ids);
    if (ids.length) await db.from('organizations').delete().in('id', ids);
    await db.auth.admin.deleteUser(testUserId);
    console.log('TEST: throwaway account and its workspace removed');
  }
}
