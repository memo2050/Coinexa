// The board columns. Every AgentTask status maps to exactly one column, so no run
// can disappear from the board.
export const TASK_COLUMNS = [
  {
    key: 'pending',
    label: 'Pending',
    hint: 'Waiting on your approval decision',
    accent: 'text-amber-300',
    dot: 'bg-amber-400',
    statuses: ['awaiting_approval'],
    empty: 'No run is waiting on you.',
  },
  {
    key: 'in_progress',
    label: 'In progress',
    hint: 'Queued or executing right now',
    accent: 'text-sky-300',
    dot: 'bg-sky-400',
    statuses: ['queued', 'running'],
    empty: 'No run is executing right now.',
  },
  {
    key: 'completed',
    label: 'Completed',
    hint: 'Execution succeeded',
    accent: 'text-emerald-300',
    dot: 'bg-emerald-400',
    statuses: ['succeeded'],
    empty: 'Successful runs will appear here.',
  },
  {
    key: 'needs_attention',
    label: 'Needs attention',
    hint: 'Failed, timed out, interrupted or cancelled',
    accent: 'text-rose-300',
    dot: 'bg-rose-400',
    statuses: ['failed', 'cancelled'],
    empty: 'No failed or interrupted runs.',
  },
];

export const columnKeyFor = (status) =>
  TASK_COLUMNS.find((column) => column.statuses.includes(status))?.key || 'pending';