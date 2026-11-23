// Per-user throttles for the two model-calling entry points that had no
// server-side limit. Every number lives here and nowhere else, so a limit can
// be raised or lowered in one place without touching the calling functions.
// Windows are meant as a minute or an hour multiple: the message says which.

import { recordUsage } from './tenancy.ts';

export const RATE_LIMITS = {
  // Live agent chat preview.
  chat_reply: { window_seconds: 60, max_calls: 30, label: 'chat messages' },
  // Agent generation (one request designs a whole agent).
  agent_generation: { window_seconds: 3600, max_calls: 20, label: 'agent generations' },
  // Product research: one request makes a web-search model call, so it is the
  // most expensive per-click action in the app.
  research_run: { window_seconds: 3600, max_calls: 10, label: 'research runs' },
  // Profit/score recalculation: pure server computation, no model call. The
  // cap only stops a scripted loop from hammering the endpoint.
  research_recalc: { window_seconds: 60, max_calls: 60, label: 'recalculations' },

  // Authenticated actions that cost no model call but can be scripted. These
  // caps are deliberately generous: one person doing real work never reaches
  // them, a loop does.
  export_xlsx: { window_seconds: 3600, max_calls: 20, label: 'research exports' },
  workflow_edit: { window_seconds: 3600, max_calls: 60, label: 'workflow changes' },
  // Approvals stay the loosest cap: a paused run must never be blocked from
  // being decided because the owner handled several checkpoints in a row.
  task_approval: { window_seconds: 3600, max_calls: 120, label: 'approval decisions' },
  org_change: { window_seconds: 3600, max_calls: 60, label: 'workspace changes' },
  // A returning customer retrying a declined card needs several attempts, so
  // the checkout cap is per hour and well above normal retry behaviour.
  checkout_attempt: { window_seconds: 3600, max_calls: 10, label: 'checkout attempts' },
};

const windowStart = (seconds) => new Date(Date.now() - seconds * 1000).toISOString();

const period = (seconds) => (seconds >= 3600 ? 'per hour' : 'per minute');

// Counts the model calls this user already made in the window, then stamps one
// row for the call about to happen. The stamp is the meter and the counter at
// once, so a burst cannot slip past the limit between check and write.
// It is written before the call, so a call that then fails is counted once —
// erring on the side of metering an attempt rather than hiding spend.
async function consume({ base44, user, kind, organizationId, units, model }) {
  const rule = RATE_LIMITS[kind];
  if (!rule) return { ok: true };

  const used = await base44.asServiceRole.entities.UsageRecord.count({
    user_id: user.id,
    kind,
    created_date: { $gte: windowStart(rule.window_seconds) },
  });

  if (used >= rule.max_calls) {
    return {
      ok: false,
      limit: rule.max_calls,
      message: `You have reached the limit of ${rule.max_calls} ${rule.label} ${period(rule.window_seconds)}. Please wait a moment and try again.`,
    };
  }

  const stamp = await recordUsage(base44, {
    organization_id: organizationId || '',
    user_id: user.id,
    kind,
    units,
    model,
    duration_ms: 0,
  });

  return { ok: true, used: used + 1, limit: rule.max_calls, stamped: Boolean(stamp) };
}

// Model-calling entry points: one unit per call, because a unit is a model call.
export async function consumeModelQuota({ base44, user, kind, organizationId }) {
  return consume({ base44, user, kind, organizationId, units: 1, model: 'automatic' });
}

// Authenticated actions that cost no model call but can still be scripted
// (exports, workflow edits, approvals, workspace changes, checkout attempts).
// They are metered with zero units, so consumption totals stay about real
// model usage and these rows never inflate the usage dashboards.
export async function consumeActionQuota({ base44, user, kind, organizationId }) {
  return consume({ base44, user, kind, organizationId, units: 0, model: '' });
}