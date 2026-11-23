import { AlertTriangle, CheckCircle2, Clock, Download, Loader2, XCircle } from 'lucide-react';
import { downloadResult } from '@/components/agents/resultDownload';

const STATUS = {
  queued: { label: 'Queued', cls: 'border-white/15 bg-white/[0.04] text-slate-300' },
  running: { label: 'Running', cls: 'border-sky-400/40 bg-sky-400/15 text-sky-200' },
  succeeded: { label: 'Succeeded', cls: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' },
  failed: { label: 'Failed', cls: 'border-rose-400/40 bg-rose-400/10 text-rose-300' },
  awaiting_approval: { label: 'Waiting for approval', cls: 'border-amber-400/40 bg-amber-400/10 text-amber-200' },
  cancelled: { label: 'Rejected', cls: 'border-white/15 bg-white/[0.04] text-slate-400' },
};

export default function WorkflowRunSummary({ task, busy, onApprove, onReject }) {
  if (!task) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm leading-relaxed text-slate-500">
        No run yet. Run a task below and every node above lights up as it actually executes.
      </div>
    );
  }

  const steps = Array.isArray(task.steps) ? task.steps : [];
  const counts = steps.reduce(
    (acc, step) => ({ ...acc, [step.status]: (acc[step.status] || 0) + 1 }),
    {}
  );
  const meta = STATUS[task.status] || STATUS.running;
  const progress = typeof task.progress === 'number' ? Math.min(100, Math.max(0, task.progress)) : 0;
  const waiting = steps.find((step) => step.status === 'AWAITING_APPROVAL');

  return (
    <div className="min-w-0 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.62rem] uppercase tracking-[0.18em] text-slate-500">Latest run</p>
        <span className={`rounded-full border px-2 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.12em] ${meta.cls}`}>
          {meta.label}
        </span>
      </div>

      <p className="mt-2 break-words text-xs leading-relaxed text-slate-400 [overflow-wrap:anywhere]">
        {task.task}
      </p>

      <div className="mt-3 flex items-center gap-2">
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 via-sky-400 to-cyan-300 transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="shrink-0 text-[0.65rem] text-slate-400">{progress}%</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[0.65rem] sm:grid-cols-4">
        <span className="flex items-center gap-1 text-emerald-300">
          <CheckCircle2 className="h-3 w-3" /> {counts.COMPLETED || 0} done
        </span>
        <span className="flex items-center gap-1 text-sky-300">
          <Loader2 className="h-3 w-3" /> {counts.RUNNING || 0} running
        </span>
        <span className="flex items-center gap-1 text-amber-300">
          <Clock className="h-3 w-3" /> {counts.AWAITING_APPROVAL || 0} waiting
        </span>
        <span className="flex items-center gap-1 text-rose-300">
          <XCircle className="h-3 w-3" /> {counts.FAILED || 0} failed
        </span>
      </div>

      <p className="mt-2 break-all text-[0.65rem] text-slate-500">
        {task.execution_id ? `${task.execution_id} · ` : ''}
        {task.workflow_version ? `Workflow v${task.workflow_version} · ` : ''}
        {task.duration_ms ? `${(task.duration_ms / 1000).toFixed(1)}s · ` : ''}
        {task.started_at ? new Date(task.started_at).toLocaleString() : ''}
      </p>

      {task.status === 'awaiting_approval' && (
        <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-3">
          <p className="break-words text-xs font-semibold text-amber-100 [overflow-wrap:anywhere]">
            Paused before: {waiting?.title || 'the next step'}
          </p>
          <p className="mt-1 break-words text-xs leading-relaxed text-amber-200 [overflow-wrap:anywhere]">
            {waiting?.note || 'Nothing further executes until you decide.'}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onApprove}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-400/20 disabled:opacity-60"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Approve and continue
            </button>
            <button
              type="button"
              onClick={onReject}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-400/10 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-400/20 disabled:opacity-60"
            >
              <XCircle className="h-3.5 w-3.5" />
              Reject run
            </button>
          </div>
        </div>
      )}

      {task.error && (
        <p className="mt-3 break-words rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 [overflow-wrap:anywhere]">
          {task.error}
        </p>
      )}

      {Array.isArray(task.warnings) && task.warnings.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3">
          <p className="flex items-center gap-1.5 text-[0.62rem] uppercase tracking-[0.14em] text-amber-300">
            <AlertTriangle className="h-3 w-3" />
            Warnings ({task.warnings.length})
          </p>
          <ul className="mt-1.5 space-y-1">
            {task.warnings.map((warning) => (
              <li
                key={warning}
                className="break-words text-[0.7rem] leading-relaxed text-slate-400 [overflow-wrap:anywhere]"
              >
                {warning}
              </li>
            ))}
          </ul>
        </div>
      )}

      {task.output && (
        <button
          type="button"
          onClick={() => downloadResult(task)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-white/25 hover:text-white"
        >
          <Download className="h-3.5 w-3.5" />
          Download result
        </button>
      )}
    </div>
  );
}