import { useEffect, useState } from 'react';
import moment from 'moment';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  Loader2,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ResultBody from '@/components/agents/ResultBody';
import { downloadResult } from '@/components/agents/resultDownload';

const STATUS_META = {
  queued: { label: 'Queued', icon: Clock, tone: 'text-slate-300', dot: 'text-slate-400' },
  running: { label: 'Running', icon: Loader2, tone: 'text-sky-300', dot: 'text-sky-300' },
  awaiting_approval: { label: 'Waiting for approval', icon: ShieldCheck, tone: 'text-amber-300', dot: 'text-amber-300' },
  succeeded: { label: 'Completed', icon: CheckCircle2, tone: 'text-emerald-300', dot: 'text-emerald-300' },
  failed: { label: 'Failed', icon: AlertCircle, tone: 'text-rose-300', dot: 'text-rose-300' },
  cancelled: { label: 'Cancelled', icon: XCircle, tone: 'text-slate-400', dot: 'text-slate-500' },
};

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'running', label: 'Running' },
  { value: 'queued', label: 'Queued' },
  { value: 'awaiting_approval', label: 'Waiting for approval' },
  { value: 'succeeded', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const RANGE_OPTIONS = [
  { value: 'all', label: 'All time', days: 0 },
  { value: 'day', label: 'Last 24 hours', days: 1 },
  { value: 'week', label: 'Last 7 days', days: 7 },
  { value: 'month', label: 'Last 30 days', days: 30 },
];

const selectClass =
  'rounded-xl border border-white/10 bg-[#05070a]/70 px-3 py-2 text-xs text-slate-200 focus:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400/20';

const formatTime = (value) => (value ? moment(value).format('D MMM YYYY, HH:mm') : '—');

export default function AgentHistory({ agentId, refreshKey = 0 }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [status, setStatus] = useState('all');
  const [range, setRange] = useState('all');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const query = { agent_id: agentId };
    if (status !== 'all') query.status = status;
    const days = RANGE_OPTIONS.find((option) => option.value === range)?.days || 0;
    if (days) {
      query.created_date = { $gte: new Date(Date.now() - days * 86400000).toISOString() };
    }

    base44.entities.AgentTask.filter(query, { sort: '-created_date', limit: 40 })
      .then((page) => {
        if (cancelled) return;
        setTasks(page.items);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [agentId, refreshKey, status, range]);

  useEffect(() => {
    const unsubscribe = base44.entities.AgentTask.subscribe((event) => {
      const data = event?.data;
      if (!data || data.agent_id !== agentId) return;
      setTasks((prev) => {
        const exists = prev.some((item) => item.id === data.id);
        if (!exists) return [data, ...prev];
        return prev.map((item) => (item.id === data.id ? { ...item, ...data } : item));
      });
    });
    return unsubscribe;
  }, [agentId]);

  return (
    <div className="min-w-0 max-w-full rounded-2xl border border-white/[0.08] bg-[#0a0f19] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold text-white">Execution history</h2>
        <span className="text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">
          {tasks.length} saved
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <label className="min-w-0 flex-1 sm:max-w-[13rem]">
          <span className="sr-only">Filter by status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className={`${selectClass} w-full`}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value} className="bg-[#0a0f19]">
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 flex-1 sm:max-w-[13rem]">
          <span className="sr-only">Filter by date</span>
          <select value={range} onChange={(event) => setRange(event.target.value)} className={`${selectClass} w-full`}>
            {RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value} className="bg-[#0a0f19]">
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading history…
        </div>
      ) : tasks.length ? (
        <ul className="mt-4 min-w-0 divide-y divide-white/[0.06]">
          {tasks.map((task) => {
            const meta = STATUS_META[task.status] || STATUS_META.queued;
            const Icon = meta.icon;
            const open = openId === task.id;
            const approvals = Array.isArray(task.approvals) ? task.approvals : [];

            return (
              <li key={task.id} className="min-w-0 py-3.5">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : task.id)}
                  className="flex w-full min-w-0 items-start gap-3 text-left"
                >
                  <Icon
                    className={`mt-0.5 h-4 w-4 shrink-0 ${meta.dot} ${task.status === 'running' ? 'animate-spin' : ''}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm text-slate-200 [overflow-wrap:anywhere]">
                      {task.task}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.66rem] text-slate-500">
                      <span className={`uppercase tracking-[0.14em] ${meta.tone}`}>{meta.label}</span>
                      {task.execution_id && (
                        <span className="break-all font-mono text-[0.62rem] text-slate-500">
                          {task.execution_id}
                        </span>
                      )}
                      <span>
                        {formatTime(task.started_at || task.created_date)}
                        {task.duration_ms ? ` · ${(task.duration_ms / 1000).toFixed(1)}s` : ''}
                      </span>
                    </span>
                  </span>
                  <ChevronDown
                    className={`mt-0.5 h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
                  />
                </button>

                {open && (
                  <div className="mt-3 min-w-0 max-w-full overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5">
                    <dl className="grid gap-2 text-[0.7rem] sm:grid-cols-2">
                      <div className="min-w-0">
                        <dt className="text-slate-500">Started</dt>
                        <dd className="break-words text-slate-300">{formatTime(task.started_at || task.created_date)}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-slate-500">Completed</dt>
                        <dd className="break-words text-slate-300">{formatTime(task.finished_at)}</dd>
                      </div>
                    </dl>

                    {task.error ? (
                      <p className="mt-3 break-words text-sm text-rose-200 [overflow-wrap:anywhere]">{task.error}</p>
                    ) : task.output ? (
                      <div className="mt-3 min-w-0 max-w-full overflow-x-auto">
                        <ResultBody content={task.output} />
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-slate-500">
                        No result yet — this run is {meta.label.toLowerCase()}.
                      </p>
                    )}

                    {approvals.length > 0 && (
                      <div className="mt-3 rounded-lg border border-white/[0.08] bg-[#05070a]/60 p-3">
                        <p className="text-[0.62rem] uppercase tracking-[0.16em] text-slate-500">Approval trail</p>
                        <ul className="mt-2 space-y-1.5">
                          {approvals.map((entry, index) => (
                            <li key={`${entry.node_id}-${index}`} className="text-[0.7rem] leading-relaxed text-slate-400">
                              <span className={entry.decision === 'approved' ? 'text-emerald-300' : 'text-rose-300'}>
                                {entry.decision === 'approved' ? 'Approved' : 'Rejected'}
                              </span>{' '}
                              by {entry.by}
                              {entry.by_email ? ` (${entry.by_email})` : ''} · {formatTime(entry.at)}
                              {entry.node_title ? ` · ${entry.node_title}` : ''}
                              {entry.note ? ` — ${entry.note}` : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {task.warnings?.length > 0 && (
                      <p className="mt-2 break-words text-[0.7rem] text-amber-200/80 [overflow-wrap:anywhere]">
                        {task.warnings.join(' ')}
                      </p>
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
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 text-sm leading-relaxed text-slate-400">
          No executions match these filters yet. Run a task above and it will be saved here with its result.
        </p>
      )}
    </div>
  );
}