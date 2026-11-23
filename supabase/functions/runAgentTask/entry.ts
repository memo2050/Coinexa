import { createClientFromRequest } from '../_shared/base44shim.ts';
import { buildWorkflowGraph, validateWorkflowGraph, initialSteps } from '../_shared/workflowGraph.ts';
import { executeWorkflow, MODEL_LABEL } from '../_shared/workflowRunner.ts';
import {
  ensureOrganization,
  checkTaskGate,
  recordUsage,
  logAudit,
} from '../_shared/tenancy.ts';

const clean = (value, max = 4000) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

// The engine reports how many model calls it actually made. Any other value
// (older engine version, aborted call) is metered as 0 rather than assumed.
const modelCalls = (result) =>
  Number.isFinite(result?.llm_calls) ? Math.max(0, Math.round(result.llm_calls)) : 0;

export default async function (req) {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth
    .me()
    .catch((error) => (error.status === 401 ? null : Promise.reject(error)));
  if (!user) {
    return Response.json({ error: 'Please sign in to run a task.' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const agentId = clean(body.agentId, 80);
  const task = clean(body.task, 4000);
  const uploadIds = Array.isArray(body.upload_ids)
    ? body.upload_ids.filter((id) => typeof id === 'string' && id.length < 80).slice(0, 3)
    : [];

  if (!agentId) return Response.json({ error: 'agentId is required' }, { status: 400 });
  if (task.length < 5) {
    return Response.json({ error: 'Describe the task you want this agent to run.' }, { status: 400 });
  }

  const agent = await base44.entities.Agent.get(agentId).catch((error) =>
    error.status === 404 || error.status === 403 ? null : Promise.reject(error)
  );
  if (!agent) return Response.json({ error: 'Agent not found' }, { status: 404 });
  if (agent.created_by_id !== user.id && user.role !== 'admin') {
    return Response.json({ error: 'You do not have access to this agent.' }, { status: 403 });
  }
  if (agent.status === 'paused') {
    return Response.json({ error: 'This agent is paused. Activate it before running tasks.' }, { status: 400 });
  }
  if (agent.workflow_enabled === false) {
    return Response.json(
      { error: 'This agent’s workflow is switched off. Turn it back on before running tasks.' },
      { status: 400 }
    );
  }

  // Workspace gate: every run belongs to an organisation and is bounded by that
  // organisation's plan limits before any model call is made.
  const { organization } = await ensureOrganization({ base44, user });

  // Duplicate protection. A retried request or a double click must never start a
  // second run, because a second run is a second charge to the workspace. The
  // client sends one key per submission attempt; the same key returns the run it
  // already created.
  const idempotencyKey = clean(body.idempotencyKey, 80);
  if (idempotencyKey) {
    const existing = await base44.entities.AgentTask
      .filter({ idempotency_key: idempotencyKey, created_by_id: user.id }, { limit: 1 })
      .catch(() => ({ items: [] }));
    if (existing.items?.length) {
      return Response.json({ task: existing.items[0], duplicate: true });
    }
  }

  // Backstop for submissions that carry no key: the same instruction, from the
  // same person, for the same agent, while a run is still in flight is treated as
  // a repeat of that run rather than a new one.
  const inFlight = await base44.asServiceRole.entities.AgentTask
    .filter(
      {
        organization_id: organization.id,
        agent_id: agent.id,
        created_by_id: user.id,
        task,
        status: { $in: ['queued', 'running', 'awaiting_approval'] },
        created_date: { $gte: new Date(Date.now() - 90 * 1000).toISOString() },
      },
      { limit: 1 }
    )
    .catch(() => ({ items: [] }));
  if (inFlight.items?.length) {
    return Response.json({ task: inFlight.items[0], duplicate: true });
  }

  const gate = await checkTaskGate({ base44, organization });
  if (!gate.ok) return Response.json({ error: gate.message }, { status: 429 });

  if (!agent.organization_id) {
    await base44.entities.Agent
      .update(agent.id, { organization_id: organization.id })
      .catch(() => null);
  }

  // Every agent must execute a validated graph — build one if it never had it.
  let graph = agent.workflow_graph;
  if (!graph || !Array.isArray(graph.nodes) || !validateWorkflowGraph(graph).ok) {
    const version = (agent.workflow_version || 0) + 1;
    graph = { ...buildWorkflowGraph(agent), version };
    await base44.entities.Agent.update(agent.id, {
      workflow_graph: graph,
      workflow_version: version,
    });
  }

  const attachments = [];
  for (const uploadId of uploadIds) {
    const upload = await base44.entities.AgentUpload.get(uploadId).catch((error) =>
      error.status === 404 || error.status === 403 ? null : Promise.reject(error)
    );
    if (upload?.file_uri) {
      attachments.push({ uri: upload.file_uri, name: upload.file_name || 'attachment' });
    }
  }

  const startedAt = Date.now();
  const executionId = `EX-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  const record = await base44.entities.AgentTask.create({
    execution_id: executionId,
    idempotency_key: idempotencyKey,
    agent_id: agent.id,
    agent_name: agent.name,
    organization_id: organization.id,
    task,
    status: 'queued',
    approvals: [],
    steps: initialSteps(graph),
    progress: 0,
    current_node: graph.nodes[0]?.id || '',
    awaiting_approval: false,
    workflow_version: graph.version || 1,
    attachments: attachments.map((attachment) => attachment.uri),
    attachment_names: attachments.map((attachment) => attachment.name),
    started_at: new Date(startedAt).toISOString(),
  });

  const fileUrls = [];
  for (const attachment of attachments) {
    try {
      const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
        file_uri: attachment.uri,
        expires_in: 900,
      });
      if (signed?.signed_url) fileUrls.push(signed.signed_url);
    } catch (error) {
      console.error('runAgentTask: could not sign attachment', attachment.uri, error?.message);
    }
  }

  try {
    const result = await executeWorkflow({
      base44,
      agent,
      task,
      taskRecord: record,
      graph,
      fileUrls,
    });

    const saved = await base44.entities.AgentTask.get(record.id).catch(() => null);

    await recordUsage(base44, {
      organization_id: organization.id,
      user_id: user.id,
      agent_id: agent.id,
      task_id: record.id,
      kind: 'task_run',
      units: modelCalls(result),
      model: MODEL_LABEL,
      duration_ms: Date.now() - startedAt,
    });

    if (result.status === 'failed') {
      await logAudit(base44, {
        organization_id: organization.id,
        user,
        action: 'task.failed',
        target_type: 'AgentTask',
        target_id: record.id,
        detail: `${agent.name}: ${result.error || 'the run failed'}`,
      });
      return Response.json({ error: result.error, task: saved, result }, { status: 502 });
    }

    await logAudit(base44, {
      organization_id: organization.id,
      user,
      action: result.status === 'awaiting_approval' ? 'task.awaiting_approval' : 'task.completed',
      target_type: 'AgentTask',
      target_id: record.id,
      detail: `${agent.name} finished a run`,
    });

    return Response.json({ task: saved, result });
  } catch (error) {
    console.error('runAgentTask failed', error);
    const message =
      error?.status === 429
        ? 'The AI service is rate limited right now. Try again in a moment.'
        : error?.message || 'Execution failed before a result was produced.';

    // The run aborted before the engine could report its model calls, so it is
    // metered as one call instead of disappearing from usage entirely.
    await recordUsage(base44, {
      organization_id: organization.id,
      user_id: user.id,
      agent_id: agent.id,
      task_id: record.id,
      kind: 'task_run',
      units: 1,
      model: MODEL_LABEL,
      duration_ms: Date.now() - startedAt,
    });

    await logAudit(base44, {
      organization_id: organization.id,
      user,
      action: 'task.failed',
      target_type: 'AgentTask',
      target_id: record.id,
      detail: `${agent.name}: ${message}`,
    });

    const failed = await base44.entities.AgentTask
      .update(record.id, {
        status: 'failed',
        error: message.slice(0, 800),
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        current_node: '',
      })
      .catch(() => null);
    await base44.entities.Agent.update(agent.id, {
      last_run_status: 'failed',
      last_run_at: new Date().toISOString(),
    });

    return Response.json({ error: message, task: failed }, { status: 502 });
  }
}