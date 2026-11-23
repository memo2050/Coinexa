export function displayStatus(agent, { running = false } = {}) {
  if (running) return 'running';
  if (!agent) return 'draft';
  if (agent.status === 'paused') return 'paused';
  if (agent.last_run_status === 'failed') return 'failed';
  if (agent.status === 'active') {
    return agent.last_run_status === 'succeeded' ? 'active' : 'idle';
  }
  return 'draft';
}

export const statusDescriptions = {
  running: 'Executing a task right now.',
  active: 'Activated and completing tasks successfully.',
  idle: 'Activated and waiting for its first task.',
  paused: 'Paused. It will not accept tasks until you activate it.',
  failed: 'The last task failed. Open the execution history for the reason.',
  draft: 'Draft. Activate it to start running real work.',
};