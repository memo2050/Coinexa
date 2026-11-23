// Executes an agent's workflow graph node by node, persisting every node
// transition to the AgentTask record so the visual diagram reflects real work.
// No node is ever marked complete without its operation actually succeeding.

import { RUN, initialSteps, MAX_LLM_STEPS } from './workflowGraph.ts';

// InvokeLLM runs are sent without an explicit model, so every metered call
// consumed the platform routing default. One label, used by both entry points.
export const MODEL_LABEL = 'automatic';

// The platform ends a request after five minutes. A single model call therefore
// gets a hard ceiling, and the whole run stops itself before that window closes,
// so an interrupted run always writes its own outcome instead of hanging as
// running and holding the workspace's execution slot.
const MODEL_CALL_TIMEOUT_MS = 60000;
const RUN_BUDGET_MS = 150000;

const withTimeout = (promise, ms, message) => {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

const text = (value, max = 4000) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const now = () => new Date().toISOString();

const asList = (value, max = 10, itemMax = 160) =>
  Array.isArray(value)
    ? value
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim().slice(0, itemMax))
        .filter(Boolean)
        .slice(0, max)
    : [];

const DECISION_SCHEMA = {
  type: 'object',
  properties: {
    go: { type: 'boolean', description: 'True only when the evidence fully supports continuing.' },
    reason: { type: 'string' },
    confidence: { type: 'number' },
  },
  required: ['go', 'reason', 'confidence'],
};

export function computeProgress(steps = []) {
  if (!steps.length) return 0;
  const done = steps.filter(
    (step) => step.status === RUN.COMPLETED || step.status === RUN.SKIPPED || step.status === RUN.FAILED
  ).length;
  return Math.round((done / steps.length) * 100);
}

/* ------------------------------------------------------- manual checkpoints ---- */
// A checkpoint is a node the run may not enter until the owner clicks approve.
// Human approval nodes always checkpoint. Working nodes do when the owner marked
// them critical, and the deliverable always does unless an approval already ran,
// so a run never asks the same person twice for the same confirmation.
const CHECKPOINTABLE = ['action', 'integration', 'output'];

export function isCheckpoint(node, approvedThisRun) {
  if (!node) return false;
  if (node.kind === 'approval') return true;
  if (node.requires_approval === false) return false;
  if (node.kind === 'output') return !approvedThisRun;
  return node.requires_approval === true && CHECKPOINTABLE.includes(node.kind);
}

function checkpointNote(node, context, decisionResult) {
  const last = [...context].reverse()[0];
  if (node.kind === 'approval') {
    const verdict = decisionResult
      ? `The agent's own check returned ${decisionResult.go ? 'YES' : 'NO'} at ${decisionResult.confidence}% confidence: ${decisionResult.reason}`
      : 'No decision was recorded for this run.';
    return `${verdict} Nothing after "${node.title}" runs until you approve.${last ? ` Last result on the table: ${text(last.output, 400)}` : ''}`;
  }
  return `Checkpoint before "${node.title}". This step does not run until you approve.${last ? ` It will act on: ${text(last.output, 400)}` : ''}`;
}

function identityBlock(agent) {
  return `You are ${agent.name || 'an AI agent'}, ${agent.specialization || agent.role || 'a business specialist'}.
Industry: ${agent.industry || 'not specified'}
Business: ${agent.business_name || 'not specified'} — ${text(agent.business_description || agent.summary, 400) || 'no description supplied'}
Communication style: ${agent.tone || 'professional and concise'}
Permissions granted (never act outside them): ${asList(agent.permissions).join(', ') || 'none'}
Safety rules: ${asList(agent.safety_rules).join('; ') || 'never invent facts, prices or policies; escalate anything sensitive to a human'}`;
}

async function callLLM(base44, prompt, schema, fileUrls = []) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await withTimeout(
        base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt,
          ...(schema ? { response_json_schema: schema } : {}),
          ...(fileUrls.length ? { file_urls: fileUrls } : {}),
        }),
        MODEL_CALL_TIMEOUT_MS,
        'The AI model took too long to answer, so this step was stopped.'
      );
      const parsed =
        typeof result === 'string' && schema
          ? (() => {
              try {
                return JSON.parse(result);
              } catch {
                return null;
              }
            })()
          : result;
      if (parsed === null || (typeof parsed === 'string' && !parsed.trim())) {
        throw new Error('The model returned an empty result.');
      }
      return parsed;
    } catch (error) {
      lastError = error;
      if (error?.status === 429) break;
    }
  }
  throw lastError || new Error('The model call failed.');
}

function stepPrompt({ agent, node, task, context, fileUrls }) {
  const prior = context.length
    ? context
        .slice(-4)
        .map((item) => `- ${item.title}: ${text(item.output, 700)}`)
        .join('\n')
    : 'None yet.';
  const isOutput = node.kind === 'output';
  return `${identityBlock(agent)}

TASK FROM THE OWNER
${text(task, 3000)}
${fileUrls.length ? `\n${fileUrls.length} file(s) are attached to this task. Base the work on their actual contents.` : ''}

WORKFLOW STEP — ${node.title}
${text(node.instructions || node.description, 1200)}

RESULTS OF THE PREVIOUS STEPS
${prior}

DO THIS
Produce only the result of this step. ${
    isOutput
      ? 'This is the final deliverable: structure it in short markdown sections so the owner can use it immediately.'
      : 'Keep it under 220 words and make it usable by the next step.'
  }
Never invent links, prices, names, dates or numbers that did not come from the owner or the previous steps: write "not verified — requires a live source" instead.
Never claim a file, email or calendar entry was created or sent.`;
}

async function runStep({ base44, agent, node, task, context, fileUrls }) {
  const result = await callLLM(base44, stepPrompt({ agent, node, task, context, fileUrls }), null, fileUrls);
  return text(typeof result === 'string' ? result : result?.text || '', 8000);
}

async function judge({ base44, agent, node, task, context }) {
  const prompt = `${identityBlock(agent)}

The workflow reached its decision point.

QUESTION
${text(node.instructions, 1200)}

TASK FROM THE OWNER
${text(task, 2000)}

EVIDENCE PRODUCED BY THE PREVIOUS STEPS
${context.map((item) => `- ${item.title}: ${text(item.output, 700)}`).join('\n') || 'No evidence was produced.'}

Answer honestly. If the evidence needed to answer YES is missing or assumes something nobody confirmed, answer false. Reason in one sentence.`;
  const result = await callLLM(base44, prompt, DECISION_SCHEMA);
  return {
    go: result?.go === true,
    reason: text(result?.reason, 400) || 'No reason was returned.',
    confidence:
      typeof result?.confidence === 'number' && Number.isFinite(result.confidence)
        ? Math.max(0, Math.min(100, Math.round(result.confidence)))
        : 0,
  };
}

function contextSummary(agent) {
  const parts = [
    agent.business_name ? `Business: ${agent.business_name}.` : '',
    text(agent.business_description || agent.summary, 400),
    agent.industry ? `Industry: ${agent.industry}.` : '',
    asList(agent.knowledge).length ? `Knowledge available: ${asList(agent.knowledge).join('; ')}.` : '',
    asList(agent.goals).length ? `Goals: ${asList(agent.goals).join('; ')}.` : '',
  ].filter(Boolean);
  return parts.join(' ') || 'No business context was supplied with this agent.';
}

export async function executeWorkflow({ base44, agent, task, taskRecord, graph, fileUrls = [], resume = null }) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const steps = Array.isArray(taskRecord.steps) && taskRecord.steps.length
    ? taskRecord.steps.map((step) => ({ ...step }))
    : initialSteps(graph);
  const approvals = Array.isArray(taskRecord.approvals) ? taskRecord.approvals.map((item) => ({ ...item })) : [];
  const warnings = [];
  const context = [];
  const startedAt = taskRecord.started_at ? Date.parse(taskRecord.started_at) : Date.now();
  const attachmentNames = Array.isArray(taskRecord.attachment_names) ? taskRecord.attachment_names : [];

  const stepFor = (id) => steps.find((step) => step.node_id === id);
  const nextId = (id, condition) => {
    if (condition === 'always') {
      return edges.find((edge) => edge.from === id && edge.condition === 'always')?.to || null;
    }
    return edges.find((edge) => edge.from === id && edge.condition === condition)?.to || null;
  };
  const complete = (step, output, note = '') => {
    step.status = RUN.COMPLETED;
    step.output = output;
    step.note = [step.approved_by ? `Approved by ${step.approved_by}.` : '', note]
      .filter(Boolean)
      .join(' ');
    step.error = '';
    step.finished_at = now();
  };
  const persist = (patch = {}) =>
    base44.entities.AgentTask.update(taskRecord.id, {
      steps,
      approvals,
      progress: computeProgress(steps),
      ...patch,
    });

  const failRun = async (step, message) => {
    step.status = RUN.FAILED;
    step.error = text(message, 800);
    step.finished_at = now();
    const handlerNode = nodes.find((node) => node.kind === 'error_handling');
    if (handlerNode) {
      const handler = stepFor(handlerNode.id);
      if (handler) {
        handler.status = RUN.COMPLETED;
        handler.output = step.error;
        handler.note = `Run stopped at "${node_title_for(step)}".`;
        handler.started_at = handler.started_at || now();
        handler.finished_at = now();
      }
    }
    await persist({
      status: 'failed',
      error: step.error,
      warnings: [...new Set(warnings)].slice(0, 8),
      finished_at: now(),
      duration_ms: Date.now() - startedAt,
      current_node: '',
      awaiting_approval: false,
      progress: computeProgress(steps),
    });
    await base44.entities.Agent.update(agent.id, {
      last_run_status: 'failed',
      last_run_at: now(),
    });
    return {
      status: 'failed',
      error: step.error,
      steps,
      progress: computeProgress(steps),
      warnings,
      llm_calls: llmCalls,
      duration_ms: Date.now() - startedAt,
    };
  };

  const node_title_for = (step) => step?.title || 'a step';

  let currentId = nodes[0]?.id || null;
  let llmCalls = 0;
  let decisionResult = null;
  let guard = 0;
  let approvedId = null;

  if (resume?.decision) {
    const approvalStep = steps.find((step) => step.status === RUN.AWAITING_APPROVAL);
    if (!approvalStep) {
      return {
        status: 'failed',
        error: 'No step is waiting for approval.',
        steps,
        progress: computeProgress(steps),
        llm_calls: llmCalls,
      };
    }
    if (resume.decision === 'reject') {
      approvalStep.status = RUN.FAILED;
      approvalStep.error = `Rejected by ${resume.by || 'the owner'}${resume.note ? `: ${text(resume.note, 300)}` : ''}`;
      approvalStep.finished_at = now();
      approvals.push({
        node_id: approvalStep.node_id,
        node_title: approvalStep.title,
        decision: 'rejected',
        by: resume.by || 'the owner',
        by_email: resume.by_email || '',
        note: text(resume.note, 300),
        at: now(),
      });
      const handlerNode = nodes.find((node) => node.kind === 'error_handling');
      if (handlerNode) {
        const handler = stepFor(handlerNode.id);
        if (handler) {
          handler.status = RUN.COMPLETED;
          handler.output = approvalStep.error;
          handler.note = 'Run stopped after a human rejection.';
          handler.finished_at = now();
        }
      }
      const progress = computeProgress(steps);
      await persist({
        status: 'cancelled',
        error: approvalStep.error,
        finished_at: now(),
        duration_ms: Date.now() - startedAt,
        current_node: '',
        awaiting_approval: false,
        progress,
      });
      // A human rejection is a decision, not an execution failure. The run is
      // recorded as cancelled and the agent keeps its previous outcome; only
      // the time of the run moves, so the agent is never labelled failed.
      await base44.entities.Agent.update(agent.id, { last_run_at: now() });
      return {
        status: 'cancelled',
        error: approvalStep.error,
        steps,
        progress,
        warnings,
        llm_calls: llmCalls,
        duration_ms: Date.now() - startedAt,
      };
    }
    const approvedBy = resume.by || 'the owner';
    const approvedNode = nodesById[approvalStep.node_id] || {};
    approvalStep.approved_by = approvedBy;
    approvalStep.note = `Approved by ${approvedBy}${resume.note ? `: ${text(resume.note, 300)}` : ''}`;
    approvals.push({
      node_id: approvalStep.node_id,
      node_title: approvalStep.title,
      decision: 'approved',
      by: approvedBy,
      by_email: resume.by_email || '',
      note: text(resume.note, 300),
      at: now(),
    });

    if (approvedNode.kind === 'approval') {
      approvalStep.status = RUN.COMPLETED;
      approvalStep.finished_at = now();
      currentId = nextId(approvalStep.node_id, 'always') || approvalStep.node_id;
    } else {
      // A working step was the checkpoint: approve it and let it run now.
      approvalStep.status = RUN.PENDING;
      approvedId = approvalStep.node_id;
      currentId = approvalStep.node_id;
    }
    await persist({ status: 'running', awaiting_approval: false, current_node: approvalStep.node_id });
  }

  while (currentId && guard < 45) {
    guard += 1;
    const node = nodesById[currentId];
    if (!node) break;
    const step = stepFor(node.id);
    if (!step) break;

    if (step.status === RUN.COMPLETED || step.status === RUN.SKIPPED) {
      currentId = nextId(node.id, 'always');
      continue;
    }
    if (step.status === RUN.AWAITING_APPROVAL) break;

    // Manual checkpoint: the run stops here until the owner clicks approve.
    if (node.id !== approvedId && isCheckpoint(node, steps.some((item) => item.approved_by))) {
      step.status = RUN.AWAITING_APPROVAL;
      step.started_at = step.started_at || now();
      step.note = checkpointNote(node, context, decisionResult);
      const waitingProgress = computeProgress(steps);
      await persist({
        status: 'awaiting_approval',
        awaiting_approval: true,
        current_node: node.id,
        progress: waitingProgress,
      });
      return {
        status: 'awaiting_approval',
        steps,
        progress: waitingProgress,
        warnings,
        current_node: node.id,
        llm_calls: llmCalls,
        duration_ms: Date.now() - startedAt,
      };
    }

    if (Date.now() - startedAt > RUN_BUDGET_MS) {
      return failRun(
        step,
        'This run reached the execution time limit before finishing, so the remaining steps did not run. Re-run the task to continue.'
      );
    }

    step.status = RUN.RUNNING;
    step.started_at = now();
    await persist({ status: 'running', current_node: node.id, awaiting_approval: false });

    try {
      if (node.kind === 'start') {
        complete(step, `Run started for ${agent.name || 'the agent'} using workflow v${graph.version || 1}.`);
      } else if (node.kind === 'trigger') {
        complete(step, text(task, 2000));
      } else if (node.kind === 'input') {
        complete(
          step,
          `${text(task, 2000)}${attachmentNames.length ? `\n\nAttachments read: ${attachmentNames.join(', ')}` : '\n\nNo attachments.'}`
        );
      } else if (node.kind === 'data_collection') {
        complete(step, contextSummary(agent));
      } else if (node.kind === 'integration') {
        step.output = '';
        step.note = `${node.tool || 'This integration'} is not connected to this agent, so this step was left for a human. Nothing was simulated.`;
        step.status = RUN.SKIPPED;
        step.finished_at = now();
        warnings.push(step.note);
      } else if (node.kind === 'decision') {
        const verdict = await judge({ base44, agent, node, task, context });
        const confident = verdict.confidence >= 60;
        const go = verdict.go && confident;
        complete(
          step,
          `${go ? 'YES' : 'NO'} — ${verdict.reason}`,
          `Model confidence ${verdict.confidence}%.${verdict.go && !confident ? ' The answer was positive but below the 60% bar, so a human decides.' : ''}`
        );
        decisionResult = { ...verdict, go };
        context.push({ title: node.title, output: step.output });
      } else if (node.kind === 'approval') {
        // Reached only after the owner approved this checkpoint.
        complete(step, 'Approved by the owner. The run continued.');
      } else if (node.kind === 'completion') {
        complete(step, 'Run complete. Result saved.');
      } else if (node.kind === 'error_handling') {
        step.status = RUN.SKIPPED;
        step.note = 'No failure occurred in this run.';
        step.finished_at = now();
      } else if (llmCalls >= MAX_LLM_STEPS) {
        step.status = RUN.SKIPPED;
        step.note = 'The per-run AI step budget was reached, so this step was not executed.';
        step.finished_at = now();
        warnings.push(`${node.title} was not executed (AI step budget).`);
      } else {
        llmCalls += 1;
        const output = await runStep({ base44, agent, node, task, context, fileUrls });
        if (!output) throw new Error('The model returned an empty result for this step.');
        complete(step, output);
        context.push({ title: node.title, output });
      }
    } catch (error) {
      const message =
        error?.status === 429
          ? 'The AI service is rate limited right now. This step did not run.'
          : error?.message || 'This step failed.';
      return failRun(step, message);
    }

    if (node.kind === 'decision') {
      currentId = nextId(node.id, decisionResult?.go ? 'yes' : 'no');
    } else {
      currentId = nextId(node.id, 'always');
    }
  }

  // Nodes the run never needed (approval bypassed by a confident YES, error
  // handling when nothing failed) are closed out honestly instead of staying pending.
  steps.forEach((step) => {
    if (step.status !== RUN.PENDING) return;
    step.status = RUN.SKIPPED;
    step.note =
      step.kind === 'approval'
        ? 'Not reached — the run was confirmed at its own checkpoint.'
        : step.kind === 'error_handling'
          ? 'No failure occurred in this run.'
          : 'Not required for this run.';
    step.finished_at = now();
  });

  const outputNode = nodes.find((node) => node.kind === 'output');
  const outputStep = outputNode ? stepFor(outputNode.id) : null;
  const fallback = [...steps].reverse().find((step) => step.status === RUN.COMPLETED && step.output);
  const output = text(outputStep?.output || fallback?.output || '', 12000);
  if (!output) return failRun(stepFor(nodes[nodes.length - 1].id), 'The run finished without producing a result.');

  await persist({
    status: 'succeeded',
    output,
    warnings: [...new Set(warnings)].slice(0, 8),
    finished_at: now(),
    duration_ms: Date.now() - startedAt,
    current_node: '',
    awaiting_approval: false,
    progress: 100,
  });
  await base44.entities.Agent.update(agent.id, { last_run_status: 'succeeded', last_run_at: now() });

  return {
    status: 'succeeded',
    output,
    steps,
    progress: 100,
    warnings,
    llm_calls: llmCalls,
    duration_ms: Date.now() - startedAt,
  };
}