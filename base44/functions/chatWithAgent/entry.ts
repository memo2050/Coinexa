import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { ensureOrganization } from '../../shared/tenancy.ts';
import { consumeModelQuota } from '../../shared/rateLimits.ts';

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

const asList = (value, max = 12) =>
  Array.isArray(value)
    ? value
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim().slice(0, 400))
        .filter(Boolean)
        .slice(0, max)
    : [];

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) {
      return Response.json({ error: 'Please sign in to test an agent.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const agentId = clean(body.agentId);
    const message = clean(body.message);

    if (!agentId) return Response.json({ error: 'agentId is required' }, { status: 400 });
    if (!message || message.length > 2000) {
      return Response.json({ error: 'Write a short message (under 2000 characters).' }, { status: 400 });
    }

    const history = Array.isArray(body.history)
      ? body.history
          .filter((entry) => entry && typeof entry.content === 'string')
          .slice(-10)
          .map((entry) => ({
            role: entry.role === 'assistant' ? 'assistant' : 'user',
            content: entry.content.trim().slice(0, 2000),
          }))
          .filter((entry) => entry.content)
      : [];

    const agent = await base44.entities.Agent.get(agentId).catch((e) =>
      e.status === 404 || e.status === 403 ? null : Promise.reject(e)
    );
    if (!agent) return Response.json({ error: 'Agent not found' }, { status: 404 });

    // Per-user throttle, checked before any model call is made.
    const { organization } = await ensureOrganization({ base44, user });
    const quota = await consumeModelQuota({
      base44,
      user,
      kind: 'chat_reply',
      organizationId: organization?.id,
    });
    if (!quota.ok) return Response.json({ error: quota.message }, { status: 429 });

    const name = agent.name || 'the agent';
    const transcript = history
      .map((entry) => `${entry.role === 'assistant' ? name : 'Customer'}: ${entry.content}`)
      .join('\n');

    const prompt = `You are ${name}, an AI agent working inside a real business.

ROLE: ${agent.role || 'General business assistant'}
WHAT THE BUSINESS DOES: ${agent.business_description || agent.summary || 'not specified'}
RESPONSIBILITIES: ${asList(agent.responsibilities).join('; ') || 'not specified'}
PERMISSIONS GRANTED: ${asList(agent.permissions).join('; ') || 'none'}
COMMUNICATION STYLE: ${agent.tone || 'professional and concise'}
TOOLS AVAILABLE: ${asList(agent.tools).join('; ') || 'none'}
SAFETY RULES: ${asList(agent.safety_rules).join('; ') || 'never invent facts, ask before irreversible actions'}

INSTRUCTIONS
${clean(agent.system_instructions).slice(0, 4000) || 'Help the customer clearly and honestly.'}

This is a live test conversation with the business owner. Stay fully in role. Never claim to have performed an action or used a tool you cannot actually run here; instead describe the step you would take. Ask for missing information rather than inventing it. Keep replies under 160 words.

${transcript ? `CONVERSATION SO FAR\n${transcript}\n` : ''}
Owner: ${message}
${name}:`;

    const reply = await base44.asServiceRole.integrations.Core.InvokeLLM({ prompt });

    return Response.json({ reply: typeof reply === 'string' ? reply.trim() : '' });
  } catch (error) {
    console.error('chatWithAgent failed', error);
    return Response.json({ error: 'The agent could not reply. Please try again.' }, { status: 500 });
  }
}