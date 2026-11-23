import { Link } from 'react-router-dom';
import moment from 'moment';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';

const STATUS_META = {
  queued: { label: 'Queued', icon: Clock, tone: 'border-slate-400/30 text-slate-300' },
  running: { label: 'Running', icon: Loader2, tone: 'border-sky-400/40 text-sky-300' },
  awaiting_approval: {
    label: 'Awaiting approval',
    icon: ShieldCheck,
    tone: 'border-amber-400/40 text-amber-300',
  },
  succeeded: { label: 'Succeeded', icon: CheckCircle2, tone: 'border-emerald-400/40 text-emerald-300' },
  failed: { label: 'Failed', icon: AlertCircle, tone: 'border-rose-400/40 text-rose-300' },
  cancelled: { label: 'Cancelled', icon: XCircle, tone: 'border-slate-400/30 text-slate-400' },
};

// The engine closes interrupted and over-budget runs as failed with these exact
// messages, so the cause can be named without inventing a new status.
const FAILURE_CAUSES = [
  { match: 'reached the execution time limit', label: 'Timed out' },
  { match: 'interrupted before it could finish', label: 'Interrupted' },
];

export default function TaskCard({ task }) {
  const meta = STATUS_META[task.status] || STATUS_META.queued;
  const Icon = meta.icon;
  const failureCause =
    task.status === 'failed'
      ? FAILURE_CAUSES.find((cause) => (task.error || '').includes(cause.match))?.label
      : null;
  const progress = Math.max(0, Math.min(100, Math.round(Number(task.progress) || 0)));
  const when = task.started_at || task.created_date;

  return (
    <article className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20">
      <div className="flex items-start justify-between gap-2">
        <Link
          to={task.agent_id ? `/agents/${task.agent_id}` : '/agents'}
          className="min-w-0 truncate font-heading text-sm font-semibold text-white transition-colors hover:text-sky-300"
        >
          {task.agent_name || 'Agent'}
        </Link>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6rem] ${meta.tone}`}
        >
          <Icon className={`h-2.5 w-2.5 ${task.status === 'running' ? 'animate-spin' : ''}`} />
          {meta.label}
        </span>
      </div>

      <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-300 [overflow-wrap:anywhere]">
        {task.task}
      </p>

      {task.status === 'running' && (
        <div className="mt-2.5">
          <Progress value={progress} className="h-1 bg-white/10" />
          <p className="mt-1 line-clamp-1 text-[0.6rem] text-slate-500">
            {progress}%{task.current_node ? ` · ${task.current_node}` : ''}
          </p>
        </div>
      )}

      {failureCause && (
        <span className="mt-2 inline-flex rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-[0.6rem] text-rose-200">
          {failureCause}
        </span>
      )}

      {(task.status === 'failed' || task.status === 'cancelled') && task.error && (
        <p
          className={`mt-2 line-clamp-2 text-[0.68rem] leading-relaxed [overflow-wrap:anywhere] ${
            task.status === 'failed' ? 'text-rose-300/80' : 'text-slate-400'
          }`}
        >
          {task.error}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-2.5 text-[0.6rem] text-slate-500">
        <span className="truncate font-mono">{task.execution_id || task.id.slice(-6)}</span>
        <span className="shrink-0">{when ? moment(when).fromNow() : '—'}</span>
      </div>
    </article>
  );
}