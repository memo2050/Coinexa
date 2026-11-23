import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import AlertsFeed from '@/components/admin/AlertsFeed';
import EmptyState from '@/components/admin/EmptyState';
import useAdminEndpoint from '@/components/admin/useAdminEndpoint';
import { fmtDate, fmtLabel } from '@/components/admin/format';

const selectClass =
  'rounded-xl border border-white/10 bg-[#05070a]/70 px-3 py-2 text-xs text-slate-200 focus:border-sky-400/60 focus:outline-none';

export default function AdminActivityPage() {
  const [days, setDays] = useState(30);
  const [action, setAction] = useState('all');

  const { data, loading, error, reload } = useAdminEndpoint('adminActivity', {
    days,
    ...(action !== 'all' ? { action } : {}),
  });

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Operations"
        title="Notifications & activity"
        description="Alerts derived from live execution records, and the administrative audit trail written by the platform."
        onRefresh={reload}
        loading={loading}
      />

      <div className="flex flex-wrap gap-2">
        <select value={days} onChange={(event) => setDays(Number(event.target.value))} className={selectClass}>
          <option value={1}>Last 24 hours</option>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
        <select value={action} onChange={(event) => setAction(event.target.value)} className={selectClass}>
          <option value="all">All actions</option>
          {(data?.actions || []).map((entry) => (
            <option key={entry.action} value={entry.action}>
              {fmtLabel(entry.action)} ({entry.count})
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">
          {error}
        </p>
      )}

      {loading && !data && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading activity…
        </div>
      )}

      {data && (
        <>
          <div className="rounded-2xl border border-white/[0.08] bg-[#0a0f19] p-5">
            <h2 className="font-heading text-base font-semibold text-white">Alerts</h2>
            <div className="mt-3">
              <AlertsFeed alerts={data.alerts} />
            </div>
          </div>

          {data.failedRuns.length > 0 && (
            <div className="rounded-2xl border border-white/[0.08] bg-[#0a0f19] p-5">
              <h2 className="font-heading text-base font-semibold text-white">Recent failures</h2>
              <ul className="mt-3 space-y-2">
                {data.failedRuns.map((run) => (
                  <li key={run.id} className="rounded-lg border border-rose-400/20 bg-rose-500/[0.05] px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-slate-200">{run.agent_name}</span>
                      <span className="text-[0.62rem] text-slate-500">{fmtDate(run.at)}</span>
                    </div>
                    <p className="mt-1 break-words text-[0.7rem] text-rose-200/90 [overflow-wrap:anywhere]">
                      {run.error || 'No failure reason recorded.'}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-2xl border border-white/[0.08] bg-[#0a0f19] p-5">
            <h2 className="font-heading text-base font-semibold text-white">Audit trail</h2>
            {data.entries.length === 0 ? (
              <div className="mt-3">
                <EmptyState
                  title="No administrative activity in this window"
                  description="Actions taken in the platform are written here as they happen."
                />
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-white/[0.05]">
                {data.entries.map((entry) => (
                  <li key={entry.id} className="py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/10 px-2 py-0.5 text-[0.58rem] uppercase tracking-[0.1em] text-sky-300">
                        {fmtLabel(entry.action)}
                      </span>
                      <span className="text-[0.66rem] text-slate-500">{entry.organization}</span>
                      <span className="text-[0.62rem] text-slate-600">{fmtDate(entry.at)}</span>
                    </div>
                    <p className="mt-1 break-words text-xs text-slate-300 [overflow-wrap:anywhere]">
                      {entry.detail || 'No detail recorded.'}
                    </p>
                    <p className="mt-0.5 text-[0.62rem] text-slate-600">
                      by {entry.actor_email}
                      {entry.target_type ? ` · ${entry.target_type}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}