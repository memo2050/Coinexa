// Copies the original Base44 backend (base44/functions, base44/shared) into the
// Supabase Edge Functions layout, rewriting ONLY import specifiers:
//   npm:@base44/sdk@x      → _shared/base44shim.ts
//   base44:runtime         → _shared/runtime.ts
//   ../../shared/<file>    → ../_shared/<file>
// Each function gets an index.ts that serves the unchanged default export.
// Run: node scripts/port-functions.mjs   (idempotent; base44/ is never modified)
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const src = join(root, 'base44');
const out = join(root, 'supabase', 'functions');

// Small, reviewed behaviour patches applied on top of the original code.
// Each entry: [file, find, replace, reason]. The port fails if a find string
// is missing, so an upstream change can never be silently skipped.
const PATCHES = [
  [
    'shared/stripeCatalog.ts',
    "priceId: 'price_1UbQjJCk4hUJftLgdoZRF9TP',",
    "priceId: Deno.env.get('STRIPE_PRICE_AGENT_SPRINT') || 'price_1UbQjJCk4hUJftLgdoZRF9TP',",
    'Price ids differ per Stripe account and mode; the test-mode ids are set as function secrets.',
  ],
  [
    'shared/stripeCatalog.ts',
    "priceId: 'price_1UbQjJCk4hUJftLg47pSERqq',",
    "priceId: Deno.env.get('STRIPE_PRICE_STUDIO_RETAINER') || 'price_1UbQjJCk4hUJftLg47pSERqq',",
    'Same as above.',
  ],
  [
    'shared/workflowGraph.ts',
    "  const approval = nodes.find((node) => node.kind === 'approval');\n  const output = nodes.find((node) => node.kind === 'output');",
    "  // Fix (staging testing): an agent's own steps can classify as 'approval'. The decision must lead to the\n  // checkpoint pushed AFTER it, or the deliverable and completion become unreachable and validation fails.\n  const afterDecision = decision ? nodes.slice(nodes.indexOf(decision) + 1) : nodes;\n  const approval = afterDecision.find((node) => node.kind === 'approval');\n  const output = afterDecision.find((node) => node.kind === 'output');",
    'Original bug: agents whose workflow contains a confirmation step got an unreachable deliverable ("The workflow could not be prepared").',
  ],
  [
    "functions/runAgentTask/entry.ts",
    "import { createClientFromRequest } from '../_shared/base44shim.ts';\nimport { buildWorkflowGraph, validateWorkflowGraph, initialSteps } from '../_shared/workflowGraph.ts';\n",
    "import { createClientFromRequest, service as serviceClient } from '../_shared/base44shim.ts';\nimport { reserve as reserveUsage, planOf, planRow } from '../_shared/agentBilling.ts';\nimport { buildWorkflowGraph, validateWorkflowGraph, initialSteps } from '../_shared/workflowGraph.ts';\n",
    "Per-agent usage allowance: reserve one unit before a run, give it back if the run fails.",
  ],
  [
    "functions/runAgentTask/entry.ts",
    "\n  if (!agent.organization_id) {\n",
    "\n  // Per-agent allowance: one unit per run, reserved before any model call and given\n  // back if the run fails. Refused runs cost nothing and create no task record.\n  const lease = await reserveUsage(serviceClient(), {\n    organizationId: organization.id, subject: agent.id, plan: planOf(agent),\n    planRow: await planRow(serviceClient(), planOf(agent)),\n  });\n  if (!lease.ok) return Response.json({ error: lease.message, billing: lease.info || null }, { status: lease.status || 429 });\n\n  if (!agent.organization_id) {\n",
    "Per-agent usage allowance: reserve one unit before a run, give it back if the run fails.",
  ],
  [
    "functions/runAgentTask/entry.ts",
    "    if (result.status === 'failed') {\n      await logAudit(base44, {\n",
    "    if (result.status === 'failed') {\n      await lease.release();\n      await logAudit(base44, {\n",
    "Per-agent usage allowance: reserve one unit before a run, give it back if the run fails.",
  ],
  [
    "functions/runAgentTask/entry.ts",
    "    console.error('runAgentTask failed', error);\n    const message =\n",
    "    console.error('runAgentTask failed', error);\n    await lease.release();\n    const message =\n",
    "Per-agent usage allowance: reserve one unit before a run, give it back if the run fails.",
  ],
  [
    "functions/chatWithAgent/entry.ts",
    "import { ensureOrganization } from '../_shared/tenancy.ts';\nimport { consumeModelQuota } from '../_shared/rateLimits.ts';\n",
    "import { ensureOrganization } from '../_shared/tenancy.ts';\nimport { service as serviceClient } from '../_shared/base44shim.ts';\nimport { reserve as reserveUsage, planOf, planRow } from '../_shared/agentBilling.ts';\nimport { consumeModelQuota } from '../_shared/rateLimits.ts';\n",
    "Per-agent usage allowance: each reply uses one unit, given back if the reply fails.",
  ],
  [
    "functions/chatWithAgent/entry.ts",
    "\n    const name = agent.name || 'the agent';\n",
    "\n    // Each reply uses one unit of this agent's allowance (given back if it fails).\n    const lease = await reserveUsage(serviceClient(), {\n      organizationId: organization?.id, subject: agent.id, plan: planOf(agent),\n      planRow: await planRow(serviceClient(), planOf(agent)),\n    });\n    if (!lease.ok) return Response.json({ error: lease.message, billing: lease.info || null }, { status: lease.status || 429 });\n\n    const name = agent.name || 'the agent';\n",
    "Per-agent usage allowance: each reply uses one unit, given back if the reply fails.",
  ],
  [
    "functions/chatWithAgent/entry.ts",
    "\n    const reply = await base44.asServiceRole.integrations.Core.InvokeLLM({ prompt });\n\n",
    "\n    let reply;\n    try {\n      reply = await base44.asServiceRole.integrations.Core.InvokeLLM({ prompt });\n    } catch (error) {\n      await lease.release();\n      throw error;\n    }\n\n",
    "Per-agent usage allowance: each reply uses one unit, given back if the reply fails.",
  ],
  [
    "functions/productResearch/entry.ts",
    "import { consumeModelQuota } from '../_shared/rateLimits.ts';\n\n",
    "import { consumeModelQuota } from '../_shared/rateLimits.ts';\nimport { ensureOrganization } from '../_shared/tenancy.ts';\nimport { service as serviceClient } from '../_shared/base44shim.ts';\nimport { reserve as reserveUsage, planOf, planRow, featuredSubject } from '../_shared/agentBilling.ts';\n\n",
    "Per-agent usage allowance: one research report = one unit (Hazel plan for research outside an agent).",
  ],
  [
    "functions/productResearch/entry.ts",
    "  if (!quota.ok) return Response.json({ error: quota.message }, { status: 429 });\n\n",
    "  if (!quota.ok) return Response.json({ error: quota.message }, { status: 429 });\n\n  // One research report = one unit of the agent's allowance (Hazel: 60 a month).\n  // Research run outside an agent counts against the workspace's research plan.\n  const { organization: researchOrg } = await ensureOrganization({ base44, user });\n  const researchPlan = agent ? planOf(agent) : 'hazel';\n  const lease = await reserveUsage(serviceClient(), {\n    organizationId: agent?.organization_id || researchOrg?.id, subject: agent?.id || featuredSubject('hazel'),\n    plan: researchPlan, planRow: await planRow(serviceClient(), researchPlan),\n  });\n  if (!lease.ok) return Response.json({ error: lease.message, billing: lease.info || null }, { status: lease.status || 429 });\n\n",
    "Per-agent usage allowance: one research report = one unit (Hazel plan for research outside an agent).",
  ],
  [
    "functions/productResearch/entry.ts",
    "    console.error('productResearch failed', error);\n    const message =\n",
    "    console.error('productResearch failed', error);\n    await lease.release();\n    const message =\n",
    "Per-agent usage allowance: one research report = one unit (Hazel plan for research outside an agent).",
  ],
  [
    "functions/resumeAgentTask/entry.ts",
    "import { consumeActionQuota } from '../_shared/rateLimits.ts';\n\n",
    "import { consumeActionQuota } from '../_shared/rateLimits.ts';\nimport { service as serviceClient } from '../_shared/base44shim.ts';\nimport { attachCurrent, planOf } from '../_shared/agentBilling.ts';\n\n",
    "AI cost of steps after an approval counts toward the agent's monthly cost cap.",
  ],
  [
    "functions/resumeAgentTask/entry.ts",
    "      return Response.json({ error: 'This agent has no saved workflow to resume.' }, { status: 400 });\n    }\n\n    // Attachments belong to the whole run, so they are signed again for the\n",
    "      return Response.json({ error: 'This agent has no saved workflow to resume.' }, { status: 400 });\n    }\n\n    // The run's unit was taken when it started; the steps after approval only add\n    // their AI cost to the agent's current period (and stop at its cost cap).\n    await attachCurrent(serviceClient(), { organizationId: task.organization_id || agent.organization_id || '', subject: agent.id, plan: planOf(agent) });\n\n    // Attachments belong to the whole run, so they are signed again for the\n",
    "AI cost of steps after an approval counts toward the agent's monthly cost cap.",
  ],
  [
    "functions/stripeWebhook/entry.ts",
    "import { createClientFromRequest } from '../_shared/base44shim.ts';\nimport { secrets } from '../_shared/runtime.ts';\n",
    "import { createClientFromRequest, service as serviceClient } from '../_shared/base44shim.ts';\nimport { stripeClient, syncSubscription, HIRE_KIND } from '../_shared/agentHires.ts';\nimport { secrets } from '../_shared/runtime.ts';\n",
    "Individual agent hires: once-only events, agent-hire sync; legacy workspace plans unchanged.",
  ],
  [
    "functions/stripeWebhook/entry.ts",
    "\nexport default async function (req) {\n  const base44 = createClientFromRequest(req);\n\n",
    "\n// Returns a result line for agent-hire events, or null for everything else (which the\n// existing workspace-plan handling below processes unchanged).\nasync function agentHireEvent(event, secretKey, db) {\n  const obj = event?.data?.object || {};\n  let subscriptionId = null;\n  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {\n    if (obj.metadata?.kind !== HIRE_KIND) return null;\n    if (obj.payment_status !== 'paid') return 'agent hire: not paid yet';\n    subscriptionId = typeof obj.subscription === 'string' ? obj.subscription : obj.subscription?.id;\n  } else if (event.type?.startsWith('customer.subscription.')) {\n    if (obj.metadata?.kind !== HIRE_KIND) return null;\n    subscriptionId = obj.id;\n  } else if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {\n    const meta = obj.parent?.subscription_details?.metadata || obj.subscription_details?.metadata || {};\n    if (meta.kind !== HIRE_KIND) return null;\n    subscriptionId = obj.parent?.subscription_details?.subscription || obj.subscription;\n  } else {\n    return null;\n  }\n  if (!subscriptionId) return 'agent hire: no subscription';\n  const result = await syncSubscription(db, stripeClient(secretKey), String(subscriptionId));\n  return `agent hire: ${result}`;\n}\n\nexport default async function (req) {\n  const base44 = createClientFromRequest(req);\n  let recordedEventId = null;\n\n",
    "Individual agent hires: once-only events, agent-hire sync; legacy workspace plans unchanged.",
  ],
  [
    "functions/stripeWebhook/entry.ts",
    "    const service = base44.asServiceRole;\n\n",
    "    const service = base44.asServiceRole;\n\n    // Each Stripe event is applied once (Stripe may deliver the same event again).\n    const db = serviceClient();\n    if (event?.id) {\n      const { error: seen } = await db.from('stripe_events').insert({ id: String(event.id), type: String(event.type || '') });\n      if (seen?.code === '23505') return Response.json({ received: true, result: 'duplicate' });\n      if (!seen) recordedEventId = String(event.id);\n    }\n\n    // Individual agent hires (one subscription per workspace, one line per agent).\n    try {\n      const hireResult = await agentHireEvent(event, secretKey, db);\n      if (hireResult) {\n        await db.from('stripe_events').update({ result: hireResult.slice(0, 500) }).eq('id', String(event.id));\n        return Response.json({ received: true, result: hireResult });\n      }\n    } catch (error) {\n      // Forget the event so Stripe's retry is processed again.\n      if (event?.id) await db.from('stripe_events').delete().eq('id', String(event.id));\n      throw error;\n    }\n\n",
    "Individual agent hires: once-only events, agent-hire sync; legacy workspace plans unchanged.",
  ],
  [
    "functions/stripeWebhook/entry.ts",
    "  } catch (error) {\n    console.error('stripeWebhook failed', error?.message);\n",
    "  } catch (error) {\n    if (recordedEventId) await serviceClient().from('stripe_events').delete().eq('id', recordedEventId).then(() => null, () => null);\n    console.error('stripeWebhook failed', error?.message);\n",
    "Individual agent hires: once-only events, agent-hire sync; legacy workspace plans unchanged.",
  ],
];

function rewrite(code, fromShared) {
  const shim = fromShared ? './base44shim.ts' : '../_shared/base44shim.ts';
  const runtime = fromShared ? './runtime.ts' : '../_shared/runtime.ts';
  return code
    .replace(/(['"])npm:@base44\/sdk@[^'"]+\1/g, `'${shim}'`)
    .replace(/(['"])base44:runtime\1/g, `'${runtime}'`)
    .replace(/(['"])\.\.\/\.\.\/shared\//g, "$1../_shared/");
}

function applyPatches(relative, code) {
  for (const [file, find, replace] of PATCHES) {
    if (file !== relative) continue;
    if (!code.includes(find)) throw new Error(`Patch target not found in ${file}: ${find.slice(0, 60)}`);
    code = code.replace(find, replace);
  }
  return code;
}

mkdirSync(join(out, '_shared'), { recursive: true });
for (const file of readdirSync(join(src, 'shared'))) {
  if (!file.endsWith('.ts')) continue;
  const code = applyPatches(`shared/${file}`, rewrite(readFileSync(join(src, 'shared', file), 'utf8'), true));
  writeFileSync(join(out, '_shared', file), code);
}

const names = readdirSync(join(src, 'functions')).filter((name) => existsSync(join(src, 'functions', name, 'entry.ts')));
for (const name of names) {
  mkdirSync(join(out, name), { recursive: true });
  const code = applyPatches(`functions/${name}/entry.ts`, rewrite(readFileSync(join(src, 'functions', name, 'entry.ts'), 'utf8'), false));
  writeFileSync(join(out, name, 'entry.ts'), code);
  writeFileSync(
    join(out, name, 'index.ts'),
    `// Generated by scripts/port-functions.mjs — serves the original handler in entry.ts.\nimport handler from './entry.ts';\nimport { serveBase44 } from '../_shared/http.ts';\n\nserveBase44('${name}', handler);\n`
  );
}
console.log(`Ported ${names.length} functions:`, names.join(', '));
export { PATCHES };
