// Unit tests for the Base44 → Supabase translation layer and the AI adapter.
// Run: cd supabase/functions && deno test --no-check -A _tests/
import { deepStrictEqual } from 'node:assert';
const assertEquals = (a: unknown, b: unknown) => deepStrictEqual(a, b);
async function assertRejects(fn: () => Promise<unknown>, _type: unknown, text: string) {
  try { await fn(); } catch (error) {
    if (!String((error as Error).message).includes(text)) throw new Error(`Rejected with "${(error as Error).message}", expected "${text}"`);
    return;
  }
  throw new Error('Expected a rejection');
}
import { toLogic, cleanRecord, makeEntity } from '../_shared/entityQuery.js';
import { costOf, makeInvokeLLM } from '../_shared/ai.ts';

Deno.test('equality, $in, $gte, $exists, booleans, null', () => {
  assertEquals(
    toLogic('agent_tasks', {
      organization_id: 'org-1',
      status: { $in: ['queued', 'running'] },
      created_date: { $gte: '2026-11-01T00:00:00.000Z' },
      error: { $exists: false },
      awaiting_approval: true,
      current_node: null,
    }),
    [
      'organization_id.eq."org-1"',
      'status.in.("queued","running")',
      'created_date.gte."2026-11-01T00:00:00.000Z"',
      'error.is.null',
      'awaiting_approval.is.true',
      'current_node.is.null',
    ]
  );
});

Deno.test('values with commas, quotes and parentheses are quoted safely', () => {
  assertEquals(toLogic('agent_tasks', { task: 'a, b (c) "d"' }), ['task.eq."a, b (c) \\"d\\""']);
});

Deno.test('$or with $regex (studio inbox search) becomes ilike', () => {
  assertEquals(
    toLogic('inquiries', { status: 'new', $or: [{ name: { $regex: 'maya', $options: 'i' } }, { email: { $regex: 'maya', $options: 'i' } }] }),
    ['status.eq."new"', 'or(name.ilike."*maya*",email.ilike."*maya*")']
  );
});

Deno.test('empty $in matches nothing; $nin and $ne', () => {
  assertEquals(toLogic('agents', { status: { $in: [] } }), ['id.eq."__no_match__"']);
  assertEquals(toLogic('agents', { status: { $nin: ['draft'] }, name: { $ne: 'x' } }), ['status.not.in.("draft")', 'name.neq."x"']);
});

Deno.test('scalar matched against an array column uses contains', () => {
  assertEquals(toLogic('profiles', { organization_ids: 'org-1' }), ['organization_ids.cs.{"org-1"}']);
});

Deno.test("'' on uuid / reference columns becomes NULL", () => {
  assertEquals(toLogic('usage_records', { user_id: '' }), ['user_id.is.null']);
  assertEquals(cleanRecord('agent_uploads', { organization_id: '', file_uri: 'x', missing: undefined }), { organization_id: null, file_uri: 'x' });
  assertEquals(cleanRecord('usage_records', { user_id: '', organization_id: '' }), { user_id: null, organization_id: '' });
});

Deno.test('unknown operators are rejected, not ignored', () => {
  let threw = false;
  try { toLogic('agents', { name: { $where: 'x' } }); } catch { threw = true; }
  assertEquals(threw, true);
});

// Minimal fake supabase-js builder, to check the entity API shapes.
function fakeClient(rows: Record<string, unknown>[]) {
  const calls: string[] = [];
  const builder: any = {
    _rows: rows,
    select() { return builder; },
    or(s: string) { calls.push(`or:${s}`); return builder; },
    order(c: string, o: { ascending: boolean }) { calls.push(`order:${c}:${o.ascending}`); return builder; },
    range(a: number, b: number) { calls.push(`range:${a}-${b}`); return builder; },
    then(resolve: any) { return resolve({ data: rows, error: null, count: rows.length }); },
  };
  return { client: { from: () => builder }, calls };
}

Deno.test('filter(query, { sort, limit }) returns a Base44 page', async () => {
  const { client, calls } = fakeClient([{ id: 'a' }, { id: 'b' }]);
  const page = await makeEntity(client, 'AgentTask').filter({ agent_id: 'x' }, { sort: '-created_date', limit: 2 });
  assertEquals(page.items.length, 2);
  assertEquals(page.has_more, false);
  assertEquals(calls, ['or:and(agent_id.eq."x")', 'order:created_date:false', 'range:0-1']);
});

Deno.test('aggregate groups and sums like Base44', async () => {
  const { client } = fakeClient([
    { kind: 'task_run', units: 2, created_date: '2026-11-03T00:00:00Z' },
    { kind: 'task_run', units: 3, created_date: '2026-11-20T00:00:00Z' },
    { kind: 'chat_reply', units: 1, created_date: '2026-10-02T00:00:00Z' },
  ]);
  const byKind = await makeEntity(client, 'UsageRecord').aggregate({ query: {}, groupBy: 'kind', sum: ['units'] });
  assertEquals(byKind.rows, [{ kind: 'task_run', count: 2, sum_units: 5 }, { kind: 'chat_reply', count: 1, sum_units: 1 }]);
  const byMonth = await makeEntity(client, 'UsageRecord').aggregate({ query: {}, sum: ['units'], dateBucket: { field: 'created_date', unit: 'month' } });
  assertEquals(byMonth.rows.length, 2);
});

Deno.test('aggregate avg (admin agents: average run time)', async () => {
  const { client } = fakeClient([
    { agent_id: 'a', duration_ms: 1000 },
    { agent_id: 'a', duration_ms: 3000 },
    { agent_id: 'a', duration_ms: null },
    { agent_id: 'b' },
  ]);
  const out = await makeEntity(client, 'AgentTask').aggregate({ query: {}, groupBy: 'agent_id', avg: ['duration_ms'] });
  assertEquals(out.rows, [{ agent_id: 'a', count: 3, avg_duration_ms: 2000 }, { agent_id: 'b', count: 1, avg_duration_ms: null }]);
});

Deno.test('bulkUpdate updates each row by id', async () => {
  const updates: unknown[] = [];
  const b: any = {
    update(d: unknown) { updates.push(d); return b; },
    eq() { return b; }, select() { return b; },
    maybeSingle() { return Promise.resolve({ data: { id: 'x' }, error: null }); },
  };
  const rows = await makeEntity({ from: () => b }, 'Agent').bulkUpdate([
    { id: 'a1', organization_id: 'o1' }, { id: 'a2', organization_id: 'o1' },
  ]);
  assertEquals(rows.length, 2);
  assertEquals(updates.length, 2);
});

Deno.test('workflow graph: an approval step inside the workflow keeps the deliverable reachable', async () => {
  const { buildWorkflowGraph, validateWorkflowGraph } = await import('../_shared/workflowGraph.ts');
  const graph = buildWorkflowGraph({
    name: 'Cita', specialization: 'E-commerce Manager Agent', industry: 'E-commerce & Retail', tools: ['Gmail', 'Notion'],
    permissions: ['Send emails on my behalf', 'Take payments or refunds'],
    workflow: ['Read the message.', 'Send a request to the user to confirm the booking or payment action.', 'Execute the action once approval is granted.'],
  });
  assertEquals(validateWorkflowGraph(graph).errors, []);
});

// ---------------- AI adapter ----------------

function fakeService(spent: number) {
  const inserted: any[] = [];
  return {
    inserted,
    from: (table: string) => ({
      select: () => ({ gte: () => ({ limit: async () => ({ data: [{ cost_usd: spent }], error: null }) }) }),
      insert: async (row: any) => { inserted.push({ table, ...row }); return { error: null }; },
    }),
  };
}

function withFetch(responses: any[], fn: () => Promise<void>) {
  const original = globalThis.fetch;
  const bodies: any[] = [];
  globalThis.fetch = (async (_url: string, init: any) => {
    bodies.push(JSON.parse(init.body));
    const next = responses.shift();
    return new Response(JSON.stringify(next), { status: 200 });
  }) as any;
  return fn().finally(() => { globalThis.fetch = original; }).then(() => bodies);
}

Deno.env.set('ANTHROPIC_API_KEY', 'test-key');
Deno.env.set('AI_MODEL', 'claude-sonnet-5-5');

Deno.test('cost: $2/$10 per MTok plus $0.01 per search', () => {
  assertEquals(Number(costOf('claude-sonnet-5-5', 1_000_000, 100_000, 3).toFixed(4)), 2 + 1 + 0.03);
});

Deno.test('plain prompt returns text and records spend', async () => {
  const svc = fakeService(0);
  let result: unknown;
  await withFetch([{ content: [{ type: 'text', text: 'Hello' }], stop_reason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 200 } }], async () => {
    result = await makeInvokeLLM(svc)({ prompt: 'hi' });
  });
  assertEquals(result, 'Hello');
  assertEquals(svc.inserted[0].input_tokens, 1000);
  assertEquals(svc.inserted[0].ok, true);
});

Deno.test('JSON schema is answered through the submit_result tool (tool_choice left on auto)', async () => {
  const svc = fakeService(0);
  let result: unknown;
  const bodies = await withFetch(
    [{ content: [{ type: 'tool_use', name: 'submit_result', input: { name: 'Nova' } }], stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 5 } }],
    async () => { result = await makeInvokeLLM(svc)({ prompt: 'x', response_json_schema: { type: 'object', properties: { name: { type: 'string' } } } }); }
  );
  assertEquals(result, { name: 'Nova' });
  assertEquals((bodies as any)[0].tool_choice, undefined);
  assertEquals((bodies as any)[0].tools[0].name, 'submit_result');
});

Deno.test('web search: pause_turn continues, then the structured answer is requested', async () => {
  const svc = fakeService(0);
  let result: unknown;
  const bodies = await withFetch(
    [
      { content: [{ type: 'server_tool_use', id: 's1', name: 'web_search', input: {} }], stop_reason: 'pause_turn', usage: { input_tokens: 100, output_tokens: 10, server_tool_use: { web_search_requests: 2 } } },
      { content: [{ type: 'text', text: 'found things' }], stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 10 } },
      { content: [{ type: 'tool_use', name: 'submit_result', input: { products: [] } }], stop_reason: 'tool_use', usage: { input_tokens: 100, output_tokens: 10 } },
    ],
    async () => { result = await makeInvokeLLM(svc)({ prompt: 'research', add_context_from_internet: true, response_json_schema: { type: 'object', properties: { products: { type: 'array' } } } }); }
  );
  assertEquals(result, { products: [] });
  assertEquals((bodies as any)[0].tools[0].name, 'web_search');
  assertEquals((bodies as any)[2].tool_choice, undefined);
  assertEquals((bodies as any)[2].messages.at(-1).content[0].text.includes('submit_result'), true);
  assertEquals(svc.inserted[0].web_searches, 2);
});

Deno.test('plain-text JSON answer is accepted when the model skips the tool', async () => {
  const svc = fakeService(0);
  let result: unknown;
  await withFetch(
    [{ content: [{ type: 'text', text: 'Here it is:\n```json\n{"name":"Orbit"}\n```' }], stop_reason: 'end_turn', usage: { input_tokens: 5, output_tokens: 5 } }],
    async () => { result = await makeInvokeLLM(svc)({ prompt: 'x', response_json_schema: { type: 'object', properties: { name: { type: 'string' } } } }); }
  );
  assertEquals(result, { name: 'Orbit' });
});

Deno.test('a model error is kept in the ledger', async () => {
  const svc = fakeService(0);
  const origFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.resolve(new Response(JSON.stringify({ error: { message: 'bad request detail' } }), { status: 400 }))) as typeof fetch;
  try {
    await makeInvokeLLM(svc)({ prompt: 'x' }).catch(() => {});
  } finally {
    globalThis.fetch = origFetch;
  }
  assertEquals(svc.inserted[0].ok, false);
  assertEquals(svc.inserted[0].error, 'bad request detail');
});

Deno.test('budget reached: the call is refused before reaching the provider', async () => {
  const svc = fakeService(18);
  const bodies = await withFetch([], async () => {
    await assertRejects(() => makeInvokeLLM(svc)({ prompt: 'x' }), Error, 'monthly AI budget');
  });
  assertEquals((bodies as any).length, 0);
});

Deno.test('missing key: clear configuration error', async () => {
  Deno.env.delete('ANTHROPIC_API_KEY');
  await assertRejects(() => makeInvokeLLM(fakeService(0))({ prompt: 'x' }), Error, 'not configured');
  Deno.env.set('ANTHROPIC_API_KEY', 'test-key');
});
