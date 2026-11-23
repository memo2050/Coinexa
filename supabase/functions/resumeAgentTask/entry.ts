import { createClientFromRequest } from '../_shared/base44shim.ts';
import { executeWorkflow, MODEL_LABEL } from '../_shared/workflowRunner.ts';
import { logAudit, recordUsage } from '../_shared/tenancy.ts';
import { consumeActionQuota } from '../_shared/rateLimits.ts';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth
      .me()
      .catch((error) => (error.status === 401 ? null : Promise.reject(error)));
    if (!user) return Response.json({ error: 'Please sign in.' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const taskId = typeof body.taskId === 'string' ? body.taskId.slice(0, 80) : '';
    const decision = body.decision === 'reject' ? 'reject' : 'approve';
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 400) : '';
    if (!taskId) return Response.json({ error: 'taskId is required' }, { status: 400 });

    const task = await base44.entities.AgentTask.get(taskId).catch((error) =>
      error.status === 404 || error.status === 403 ? null : Promise.reject(error)
    );
    if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });
    if (task.created_by_id !== user.id && user.role !== 'admin') {
      return Response.json({ error: 'You do not have access to this task.' }, { status: 403 });
    }
    if (task.status !== 'awaiting_approval') {
      return Response.json({ error: 'This run is not waiting for approval.' }, { status: 400 });
    }

    // Each decision restarts model work, so repeated decisions are capped per
    // user. The cap is the loosest of the action limits on purpose: an owner
    // clearing a backlog of approvals must never be blocked.
    const quota = await consumeActionQuota({
      base44,
      user,
      kind: 'task_approval',
      organizationId: task.organization_id || '',
    });
    if (!quota.ok) return Response.json({ error: quota.message }, { status: 429 });

    const agent = await base44.entities.Agent.get(task.agent_id).catch((error) =>
      error.status === 404 || error.status === 403 ? null : Promise.reject(error)
    );
    if (!agent) return Response.json({ error: 'The agent for this run no longer exists.' }, { status: 404 });

    const graph = agent.workflow_graph;
    if (!graph || !Array.isArray(graph.nodes)) {
      return Response.json({ error: 'This agent has no saved workflow to resume.' }, { status: 400 });
    }

    // Attachments belong to the whole run, so they are signed again for the
    // steps that execute after the approval decision.
    const fileUrls = [];
    for (const uri of (Array.isArray(task.attachments) ? task.attachments.slice(0, 3) : [])) {
      try {
        const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
          file_uri: uri,
          expires_in: 900,
        });
        if (signed?.signed_url) fileUrls.push(signed.signed_url);
      } catch (error) {
        console.error('resumeAgentTask: could not sign attachment', uri, error?.message);
      }
    }

    const resumedAt = Date.now();
    const result = await executeWorkflow({
      base44,
      agent,
      task: task.task,
      taskRecord: task,
      graph,
      fileUrls,
      resume: {
        decision,
        by: user.full_name || user.email || 'the owner',
        by_email: user.email || '',
        note,
      },
    });

    const saved = await base44.entities.AgentTask.get(taskId).catch(() => null);

    // The work done after an approval is real model consumption too, so it is
    // metered against the same task and workspace instead of going unrecorded.
    await recordUsage(base44, {
      organization_id: task.organization_id || agent.organization_id || '',
      user_id: user.id,
      agent_id: agent.id,
      task_id: taskId,
      kind: 'task_run',
      units: Number.isFinite(result?.llm_calls) ? Math.max(0, Math.round(result.llm_calls)) : 0,
      model: MODEL_LABEL,
      duration_ms: Date.now() - resumedAt,
    });

    await logAudit(base44, {
      organization_id: task.organization_id || agent.organization_id || '',
      user,
      action: decision === 'approve' ? 'approval.granted' : 'approval.rejected',
      target_type: 'AgentTask',
      target_id: taskId,
      detail: `${decision === 'approve' ? 'Approved' : 'Rejected'} a checkpoint in ${agent.name}${
        note ? `: ${note}` : ''
      }`,
    });

    return Response.json({ task: saved, result });
  } catch (error) {
    console.error('resumeAgentTask failed', error);
    return Response.json(
      { error: error.message || 'The run could not be resumed.' },
      { status: 500 }
    );
  }
}