import { Activity, CircleDot, Loader2 } from 'lucide-react';

const RUNNING_STATUSES = ['RUNNING', 'AWAITING_APPROVAL'];

export default function WorkflowProgress({ graph, task }) {
  const nodes = graph?.nodes || [];
  const total = nodes.length;
  const byId = Object.fromEntries((task?.steps || []).map((step) => [step.node_id, step]));
  const statusOf = (node) => byId[node.id]?.status;

  const done = nodes.filter((node) => statusOf(node) === 'COMPLETED').length;
  const skipped = nodes.filter((node) => statusOf(node) === 'SKIPPED').length;
  const failed = nodes.filter((node) => statusOf(node) === 'FAILED').length;
  const waiting = nodes.filter((node) => statusOf(node) === 'AWAITING_APPROVAL').length;
  const current = nodes.find((node) => RUNNING_STATUSES.includes(statusOf(node)));
  const live = task?.status === 'queued' || task?.status === 'running' || task?.status === 'awaiting_approval';

  const settled = done + skipped + failed;
  const percent = total ? Math.round((settled / total) * 100) : 0;

  if (!total) return null;

  return (
    <div className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="flex items-center gap-2 text-sm text-slate-200">
          <Activity className="h-3.5 w-3.5 text-sky-300" />
          <span className="font-semibold text-white">
            {done} of {total} steps completed
          </span>
          {skipped > 0 && <span className="text-xs text-slate-500">· {skipped} skipped</span>}
          {failed > 0 && <span className="text-xs text-rose-300">· {failed} failed</span>}
        </p>
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          {live && <Loader2 className="h-3 w-3 animate-spin text-sky-300" />}
          {percent}%
        </span>
      </div>

      <div className="relative mt-2.5 h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 via-sky-400 to-cyan-300 transition-[width] duration-700 ease-out"
          style={{ width: `${percent}%` }}
        />
        {waiting > 0 && (
          <span className="absolute inset-y-0 right-0 w-1/4 bg-gradient-to-r from-transparent to-amber-400/40" />
        )}
      </div>

      <p className="mt-2 flex items-center gap-1.5 text-[0.68rem] leading-relaxed text-slate-500">
        <CircleDot className="h-3 w-3 shrink-0" />
        {!task
          ? `Ready — ${total} steps queued. Run a task below to watch it execute.`
          : waiting
            ? `Paused at "${current?.title || 'approval'}" — waiting for your decision.`
            : task.status === 'queued'
              ? 'Queued — the run starts on the server now.'
              : task.status === 'running' && current
              ? `Now executing: ${current.title}`
              : task.status === 'failed'
                ? 'Run stopped at a failed step.'
                : task.status === 'cancelled'
                  ? 'Run cancelled.'
                  : `${done} of ${total} steps finished.`}
      </p>
    </div>
  );
}