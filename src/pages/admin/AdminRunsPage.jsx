import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import DataClassBadge from '@/components/admin/DataClassBadge';
import EmptyState from '@/components/admin/EmptyState';
import useAdminEndpoint from '@/components/admin/useAdminEndpoint';
import { fmtDate, fmtDuration, fmtLabel, fmtRelative } from '@/components/admin/format';

const selectClass =
  'rounded-xl border border-white/10 bg-[#05070a]/70 px-3 py-2 text-xs text-slate-200 focus:border-sky-400/60 focus:outline-none';

const STATUS_TONE = {
  queued: 'text-slate-300',
  running: 'text-sky-300',
  awaiting_approval: 'text-amber-300',
  succeeded: 'text-emerald-300',
  failed: 'text-rose-300',
  cancelled: 'text-slate-400',
};

const STAGES = ['Input received', 'AI processing', 'Decision & action', 'Output produced'];

const stageIndexFor = (run) => {
  if (!run) return -1;
  if (run.status === 'succeeded') return 3;
  if (run.status === 'failed') return 1;
  if (run.status === 'cancelled') return 1;
  if (run.status === 'awaiting_approval') return 2;
  if (run.status === 'running') return 1;
  return 0;
};

export default function AdminRunsPage() {
  const [status, setStatus] = useState('all');
  const [days, setDays] = useState(30);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const { data, loading, error, reload } = useAdminEndpoint('adminRuns', { status, days, limit: 40 });

  // Near-real-time: the feed refreshes itself while the monitor is open.
  useEffect(() => {
    const timer = setInterval(() => {
      if (!detail) reload();
    }, 20000);
    return () => clearInterval(timer);
  }, [reload, detail]);

  const openRun = useCallback(async (id) => {
    setDetailLoading(true);
    setDetailError('');
    try {
      const response = await base44.functions.invoke('adminRuns', { task_id: id });
      if (response.data?.error) setDetailError(response.data.error);
      else setDetail(response.data.run);
    } catch (err) {
      setDetailError(err?.response?.data?.error || err?.message || 'That run could not be loaded.');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const stageIndex = stageIndexFor(detail);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Monitoring"
        title="Executions"
        description="Every agent run with its lifecycle, duration and failure reason. The list refreshes every 20 seconds."
        onRefresh={reload}
        loading={loading}
      />

      {detail ? (
        <div className="rounded-2xl border border-white/[0.08] bg-[#0a0f19] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="inline-flex items-center gap-1.5 text-[0.7rem] text-slate-400 hover:text-white"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to the feed
              </button>
              <h2 className="mt-2 font-heading text-lg font-semibold text-white">
                {detail.agent.name}
              </h2>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-[0.7rem] text-slate-500">
                <span className={`uppercase tracking-[0.14em] ${STATUS_TONE[detail.status] || 'text-slate-400'}`}>
                  {fmtLabel(detail.status)}
                </span>
                <DataClassBadge value={detail.organization.dataClass} />
                <span>{detail.organization.name}</span>
                <span className="font-mono">{detail.execution_id || detail.id.slice(-6)}</span>
              </p>
            </div>
            <div className="text-right text-[0.7rem] text-slate-400">
              <p>{fmtDuration(detail.duration_ms)}</p>
              <p className="text-slate-600">{fmtDate(detail.started_at || detail.created_date)}</p>
            </div>
          </div>

          <ol className="mt-5 grid gap-2 sm:grid-cols-4">
            {STAGES.map((stage, index) => (
              <li
                key={stage}
                className={`rounded-xl border px-3 py-2.5 text-[0.68rem] ${
                  index <= stageIndex
                    ? 'border-sky-400/30 bg-sky-400/[0.07] text-sky-200'
                    : 'border-white/[0.07] bg-white/[0.015] text-slate-500'
                }`}
              >
                <span className="block text-[0.58rem] uppercase tracking-[0.16em] opacity-70">
                  Step {index + 1}
                </span>
                {stage}
              </li>
            ))}
          </ol>

          <div className="mt-5 space-y-4">
            <section>
              <h3 className="text-[0.66rem] uppercase tracking-[0.16em] text-slate-500">
                Task received
              </h3>
              <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-300 [overflow-wrap:anywhere]">
                {detail.task || 'No task text was stored for this run.'}
              </p>
              {detail.attachments.length > 0 && (
                <p className="mt-1.5 text-[0.7rem] text-slate-500">
                  Attachments: {detail.attachments.join(', ')}
                </p>
              )}
            </section>

            {detail.steps.length > 0 && (
              <section>
                <h3 className="text-[0.66rem] uppercase tracking-[0.16em] text-slate-500">
                  Workflow steps
                </h3>
                <ul className="mt-2 space-y-1.5">
                  {detail.steps.map((step, index) => {
                    const stepDuration =
                      step.started_at && step.finished_at
                        ? new Date(step.finished_at).getTime() - new Date(step.started_at).getTime()
                        : 0;
                    return (
                      <li
                        key={`${step.node_id || index}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2 text-[0.7rem]"
                      >
                        <span className="min-w-0 truncate text-slate-300">
                          {step.title || step.node_id || `Step ${index + 1}`}
                          {step.kind ? (
                            <span className="ml-2 text-[0.6rem] uppercase tracking-[0.1em] text-slate-600">
                              {step.kind}
                            </span>
                          ) : null}
                        </span>
                        <span className="flex shrink-0 items-center gap-3 text-slate-500">
                          <span>{String(step.status || 'pending').toLowerCase()}</span>
                          {stepDuration > 0 ? <span>{fmtDuration(stepDuration)}</span> : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {detail.approvals.length > 0 && (
              <section>
                <h3 className="text-[0.66rem] uppercase tracking-[0.16em] text-slate-500">
                  Human decisions
                </h3>
                <ul className="mt-2 space-y-1.5 text-[0.7rem] text-slate-400">
                  {detail.approvals.map((entry, index) => (
                    <li key={`${entry.at || index}`}>
                      <span className={entry.decision === 'approved' ? 'text-emerald-300' : 'text-rose-300'}>
                        {fmtLabel(entry.decision || 'decision')}
                      </span>{' '}
                      by {entry.by_email || entry.by || 'unknown'} · {fmtDate(entry.at)}
                      {entry.note ? ` — ${entry.note}` : ''}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {detail.error && (
              <section>
                <h3 className="text-[0.66rem] uppercase tracking-[0.16em] text-slate-500">
                  Failure reason
                </h3>
                <p className="mt-1.5 break-words rounded-xl border border-rose-400/25 bg-rose-500/[0.07] px-3 py-2 text-sm text-rose-200 [overflow-wrap:anywhere]">
                  {detail.error}
                </p>
              </section>
            )}

            {detail.output && (
              <details className="rounded-xl border border-white/[0.07] bg-white/[0.015] px-3 py-2.5">
                <summary className="cursor-pointer text-[0.7rem] text-slate-300">
                  Output produced (may contain customer content)
                </summary>
                <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words text-[0.7rem] leading-relaxed text-slate-400 [overflow-wrap:anywhere]">
                  {detail.output}
                </pre>
              </details>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <select value={status} onChange={(event) => setStatus(event.target.value)} className={selectClass}>
              <option value="all">All statuses</option>
              <option value="in_flight">In flight</option>
              <option value="awaiting_approval">Awaiting approval</option>
              <option value="succeeded">Succeeded</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select value={days} onChange={(event) => setDays(Number(event.target.value))} className={selectClass}>
              <option value={1}>Last 24 hours</option>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={0}>All time</option>
            </select>
          </div>

          {(error || detailError) && (
            <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">
              {error || detailError}
            </p>
          )}

          {loading && !data && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading executions…
            </div>
          )}

          {detailLoading && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Opening run…
            </div>
          )}

          {data && !data.items.length && (
            <EmptyState
              title="No executions in this window"
              description="Runs appear here as soon as an agent executes a task."
            />
          )}

          {data && data.items.length > 0 && (
            <ul className="space-y-2">
              {data.items.map((run) => (
                <li key={run.id}>
                  <button
                    type="button"
                    onClick={() => openRun(run.id)}
                    className="flex w-full items-start gap-3 rounded-2xl border border-white/[0.08] bg-[#0a0f19] px-4 py-3 text-left transition-colors hover:border-sky-400/30"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-heading text-sm font-semibold text-white">
                          {run.agent_name || 'Agent'}
                        </span>
                        <span className={`text-[0.62rem] uppercase tracking-[0.14em] ${STATUS_TONE[run.status] || 'text-slate-400'}`}>
                          {fmtLabel(run.status)}
                        </span>
                        <DataClassBadge value={run.data_class} />
                      </div>
                      <p className="mt-1 line-clamp-1 text-[0.7rem] text-slate-400">
                        {run.error || run.current_node || run.organization_name}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[0.62rem] text-slate-600">
                        <span className="font-mono">{run.execution_id || run.id.slice(-6)}</span>
                        <span>{run.step_count} steps</span>
                        <span>{fmtDuration(run.duration_ms)}</span>
                        <span>{fmtRelative(run.started_at || run.created_date)}</span>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {data?.hasMore && (
            <p className="text-center text-[0.68rem] text-slate-600">
              Showing the most recent 40 runs. Narrow the window to see older ones.
            </p>
          )}
        </>
      )}
    </div>
  );
}