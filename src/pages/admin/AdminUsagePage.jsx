import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import BarList from '@/components/admin/BarList';
import StatCard from '@/components/admin/StatCard';
import EmptyState from '@/components/admin/EmptyState';
import useAdminEndpoint from '@/components/admin/useAdminEndpoint';
import { fmtNumber } from '@/components/admin/format';
import AiSpendPanel from '@/components/admin/AiSpendPanel';

const selectClass =
  'rounded-xl border border-white/10 bg-[#05070a]/70 px-3 py-2 text-xs text-slate-200 focus:border-sky-400/60 focus:outline-none';

export default function AdminUsagePage() {
  const [days, setDays] = useState(30);
  const { data, loading, error, reload } = useAdminEndpoint('adminUsage', { days });

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Consumption"
        title="Usage & cost"
        description="Real AI spend from the AI usage ledger, plus metered operations grouped by operation, agent, workspace and model."
        onRefresh={reload}
        loading={loading}
      />

      <div className="flex flex-wrap gap-2">
        <select value={days} onChange={(event) => setDays(Number(event.target.value))} className={selectClass}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={0}>All time</option>
        </select>
      </div>

      {error && (
        <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">
          {error}
        </p>
      )}

      {loading && !data && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading usage…
        </div>
      )}

      {data && (
        <>
          <AiSpendPanel />

          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Metered operations" value={fmtNumber(data.totals.units)} hint="Metered units in this window" />
            <StatCard label="Metered events" value={fmtNumber(data.totals.events)} hint="One row per operation" />
          </div>

          {data.classification && (
            <p className="rounded-xl border border-white/[0.07] bg-white/[0.015] px-4 py-2.5 text-xs leading-relaxed text-slate-400">
              By data class — Production {fmtNumber(data.classification.units.customer)} · Internal{' '}
              {fmtNumber(data.classification.units.internal)} · Test{' '}
              {fmtNumber(data.classification.units.test)} model calls.
              {data.classification.note ? ` ${data.classification.note}` : ''}
            </p>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/[0.08] bg-[#0a0f19] p-5">
              <h2 className="font-heading text-base font-semibold text-white">Per operation</h2>
              <div className="mt-3">
                <BarList
                  items={data.byKind.map((row) => ({
                    key: row.key,
                    label: row.label,
                    value: row.units,
                    meta: `${row.events} events`,
                  }))}
                  formatValue={(value) => fmtNumber(value)}
                  emptyLabel="No usage recorded in this window."
                />
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-[#0a0f19] p-5">
              <h2 className="font-heading text-base font-semibold text-white">Per agent</h2>
              <div className="mt-3">
                <BarList
                  items={data.byAgent.map((row) => ({
                    key: row.key,
                    label: row.label,
                    value: row.units,
                    meta: `${row.events} events`,
                  }))}
                  formatValue={(value) => fmtNumber(value)}
                  emptyLabel="No usage recorded in this window."
                />
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-[#0a0f19] p-5">
              <h2 className="font-heading text-base font-semibold text-white">Per workspace</h2>
              <div className="mt-3">
                <BarList
                  items={data.byOrganization.map((row) => ({
                    key: row.key,
                    label: row.label,
                    value: row.units,
                    meta: `${row.events} events`,
                  }))}
                  formatValue={(value) => fmtNumber(value)}
                  emptyLabel="No usage recorded in this window."
                />
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-[#0a0f19] p-5">
              <h2 className="font-heading text-base font-semibold text-white">Per model</h2>
              <p className="mt-1 text-xs text-slate-500">
                Calls are attributed to the model label the platform routed them to.
              </p>
              <ul className="mt-3 space-y-2">
                {data.byModel.length === 0 && (
                  <li className="text-xs text-slate-500">No usage recorded in this window.</li>
                )}
                {data.byModel.map((row) => (
                  <li
                    key={row.model}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2 text-xs"
                  >
                    <span className="truncate font-mono text-slate-300">{row.model}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-slate-400">{fmtNumber(row.units)} calls</span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[0.56rem] uppercase tracking-[0.1em] ${
                          row.priced
                            ? 'border-emerald-400/30 text-emerald-300'
                            : 'border-slate-500/30 text-slate-400'
                        }`}
                      >
                        {row.priced ? 'Rated' : 'No rate'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0a0f19] p-5">
            <h2 className="font-heading text-base font-semibold text-white">Over time</h2>
            {data.byMonth.length === 0 ? (
              <div className="mt-3">
                <EmptyState title="No usage in this window" description="Metered months appear here." />
              </div>
            ) : (
              <ul className="mt-3 space-y-1.5 text-xs">
                {data.byMonth.map((month) => (
                  <li key={month.key} className="flex items-center justify-between border-b border-white/[0.05] py-1.5">
                    <span className="text-slate-400">{month.label}</span>
                    <span className="font-mono text-slate-300">
                      {fmtNumber(month.units)} calls · {month.events} events
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>


          <p className="text-[0.7rem] text-slate-500">
            The previous usage console is still available at{' '}
            <Link to="/usage" className="underline decoration-white/20 hover:text-white">
              /usage
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}