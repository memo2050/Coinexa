import { createClientFromRequest } from '../_shared/base44shim.ts';
import { buildWorkflowGraph } from '../_shared/workflowGraph.ts';
import { ensureOrganization, checkAgentGate } from '../_shared/tenancy.ts';
import { consumeModelQuota } from '../_shared/rateLimits.ts';

const MAX = { industry: 80, businessName: 120, description: 3000, tasks: 3000, tone: 80 };

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

const list = (value, maxItems = 12, maxLength = 160) =>
  Array.isArray(value)
    ? value
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim().slice(0, maxLength))
        .filter(Boolean)
        .slice(0, maxItems)
    : [];

const strings = (value) =>
  Array.isArray(value)
    ? value
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    role: { type: 'string' },
    summary: { type: 'string' },
    system_instructions: { type: 'string' },
    goals: { type: 'array', items: { type: 'string' } },
    workflow: { type: 'array', items: { type: 'string' } },
    knowledge_requirements: { type: 'array', items: { type: 'string' } },
    safety_rules: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'name',
    'role',
    'summary',
    'system_instructions',
    'goals',
    'workflow',
    'knowledge_requirements',
    'safety_rules',
  ],
};

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) {
      return Response.json({ error: 'Please sign in to create an agent.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const industry = clean(body.industry).slice(0, MAX.industry);
    const businessName = clean(body.business_name).slice(0, MAX.businessName);
    const description = clean(body.business_description).slice(0, MAX.description);
    const tasks = clean(body.tasks).slice(0, MAX.tasks);
    const agentTitle = clean(body.agent_title).slice(0, 120);
    const tone = clean(body.tone).slice(0, MAX.tone);
    const responsibilities = list(body.responsibilities);
    const permissions = list(body.permissions);
    const tools = list(body.tools);

    // Preview mode draws the workflow the answers would produce, using the same
    // graph builder the real generator uses. No model call, no agent saved.
    if (body.preview === true) {
      if (!industry) return Response.json({ graph: null, preview: true });
      const stepSource = tasks
        .split(/\r?\n|\.\s+/)
        .map((step) => step.trim())
        .filter((step) => step.length > 8)
        .slice(0, 6)
        .map((step) => (/[.!?]$/.test(step) ? step : `${step}.`));

      const graph = buildWorkflowGraph({
        name: agentTitle || 'Your agent',
        specialization: agentTitle,
        industry,
        business_name: businessName,
        business_description: description,
        tone,
        permissions,
        tools,
        workflow: stepSource.length >= 3 ? stepSource : [],
      });
      return Response.json({ graph, preview: true });
    }

    if (!industry) return Response.json({ error: 'Choose an industry first.' }, { status: 400 });
    if (description.length < 20) {
      return Response.json({ error: 'Describe your business in a little more detail.' }, { status: 400 });
    }
    if (tasks.length < 10) {
      return Response.json({ error: 'Explain what you want to automate.' }, { status: 400 });
    }
    if (!responsibilities.length) {
      return Response.json({ error: 'Select at least one responsibility.' }, { status: 400 });
    }
    if (!permissions.length) {
      return Response.json({ error: 'Select at least one permission.' }, { status: 400 });
    }
    if (!tone) return Response.json({ error: 'Choose a communication style.' }, { status: 400 });

    // The workspace plan caps how many agents it may hold.
    const { organization } = await ensureOrganization({ base44, user });
    const agentGate = await checkAgentGate({ base44, organization });
    if (!agentGate.ok) return Response.json({ error: agentGate.message }, { status: 429 });

    // Per-user throttle, checked before the model call that designs the agent.
    const quota = await consumeModelQuota({
      base44,
      user,
      kind: 'agent_generation',
      organizationId: organization.id,
    });
    if (!quota.ok) return Response.json({ error: quota.message }, { status: 429 });

    const prompt = `You are a senior AI automation architect. Design a production-ready AI agent for a real business.

BUSINESS CONTEXT
- Industry: ${industry}
- Required specialization (build exactly this job function): ${agentTitle || 'choose the most useful specialist for this business'}
- Business name: ${businessName || 'not provided'}
- What the business does: ${description}
- Tasks the owner wants to automate: ${tasks}
- Responsibilities the owner selected: ${responsibilities.join('; ')}
- Permissions the owner granted (the agent may ONLY do these, nothing more): ${permissions.join('; ')}
- Communication style the agent must use: ${tone}
- Tools and integrations available: ${tools.length ? tools.join('; ') : 'none specified'}

WRITE THE SPECIFICATION
1. name — short, human, memorable, specific to this business.
2. role — one sentence job title.
3. summary — two sentences describing what the agent does day to day.
4. system_instructions — 180 to 320 words, written in the second person. Cover its identity, what it handles, how it decides, how it handles missing information, when it escalates to a human, and what it must never do. Be concrete and testable. Never use placeholders such as [Company] or [insert]. The chosen communication style must be obvious in the writing.
5. goals — 3 to 5 measurable outcomes.
6. workflow — 4 to 7 ordered steps for a typical request, starting by understanding the request and ending with confirmation or handoff.
7. knowledge_requirements — 3 to 6 documents, datasets or policies the agent needs to do its job.
8. safety_rules — 3 to 6 rules. Always include: never act beyond the granted permissions, ask before irreversible actions, never invent facts, prices or policies, and escalate sensitive or regulated topics to a human.

Rules: never grant a capability beyond the listed permissions. No markdown headings, no emoji. Each list item is one short sentence.`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: RESPONSE_SCHEMA,
    });

    const spec = typeof result === 'string' ? JSON.parse(result) : result || {};

    const agent = {
      name: clean(spec.name),
      role: clean(spec.role),
      specialization: agentTitle || clean(spec.role),
      industry,
      business_name: businessName,
      business_description: description,
      tone,
      tools,
      permissions,
      summary: clean(spec.summary),
      system_instructions: clean(spec.system_instructions),
      goals: strings(spec.goals),
      workflow: strings(spec.workflow),
      knowledge_requirements: strings(spec.knowledge_requirements),
      safety_rules: strings(spec.safety_rules),
    };

    const workflowGraph = buildWorkflowGraph(agent);

    return Response.json({
      agent: {
        ...agent,
        workflow_graph: workflowGraph,
        workflow_version: 1,
        workflow_enabled: true,
      },
    });
  } catch (error) {
    console.error('generateAgent failed', error);
    return Response.json(
      { error: 'The agent could not be generated. Please try again.' },
      { status: 500 }
    );
  }
}