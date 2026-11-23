import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { buildWorkflowGraph, validateWorkflowGraph } from '../../shared/workflowGraph.ts';
import { consumeActionQuota } from '../../shared/rateLimits.ts';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth
      .me()
      .catch((error) => (error.status === 401 ? null : Promise.reject(error)));
    if (!user) return Response.json({ error: 'Please sign in.' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const agentId = typeof body.agentId === 'string' ? body.agentId.slice(0, 80) : '';
    const action = typeof body.action === 'string' ? body.action : 'build';
    if (!agentId) return Response.json({ error: 'agentId is required' }, { status: 400 });

    const agent = await base44.entities.Agent.get(agentId).catch((error) =>
      error.status === 404 || error.status === 403 ? null : Promise.reject(error)
    );
    if (!agent) return Response.json({ error: 'Agent not found' }, { status: 404 });
    if (agent.created_by_id !== user.id && user.role !== 'admin') {
      return Response.json({ error: 'You do not have access to this agent.' }, { status: 403 });
    }

    // Every action here rewrites the agent's workflow, so a scripted loop is
    // capped per user. Checked after ownership, before anything is written.
    const quota = await consumeActionQuota({
      base44,
      user,
      kind: 'workflow_edit',
      organizationId: agent.organization_id || '',
    });
    if (!quota.ok) return Response.json({ error: quota.message }, { status: 429 });

    if (action === 'build') {
      const version = (agent.workflow_version || 0) + 1;
      const graph = { ...buildWorkflowGraph(agent), version };
      const updated = await base44.entities.Agent.update(agent.id, {
        workflow_graph: graph,
        workflow_version: version,
        workflow_enabled: true,
      });
      return Response.json({ agent: updated, graph });
    }

    if (action === 'save') {
      const graph = body.graph;
      const check = validateWorkflowGraph(graph);
      if (!check.ok) {
        return Response.json(
          { error: 'This workflow cannot be saved yet.', errors: check.errors },
          { status: 400 }
        );
      }
      const version = (agent.workflow_version || 0) + 1;
      const saved = {
        version,
        source: 'custom',
        profile: graph.profile || agent.workflow_graph?.profile || 'operations',
        nodes: graph.nodes,
        edges: graph.edges,
        generated_at: agent.workflow_graph?.generated_at || new Date().toISOString(),
        saved_at: new Date().toISOString(),
      };
      const updated = await base44.entities.Agent.update(agent.id, {
        workflow_graph: saved,
        workflow_version: version,
      });
      return Response.json({ agent: updated, graph: saved });
    }

    if (action === 'toggle') {
      const enabled = body.enabled !== false;
      const updated = await base44.entities.Agent.update(agent.id, { workflow_enabled: enabled });
      return Response.json({ agent: updated });
    }

    return Response.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (error) {
    console.error('agentWorkflow failed', error);
    return Response.json({ error: error.message || 'The workflow could not be updated.' }, { status: 500 });
  }
}