import { Loader2 } from 'lucide-react';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import StatCard from '@/components/admin/StatCard';
import AlertsFeed from '@/components/admin/AlertsFeed';
import BarList from '@/components/admin/BarList';
import DataClassBadge from '@/components/admin/DataClassBadge';
import useAdminEndpoint from '@/components/admin/useAdminEndpoint';
import { fmtDate, fmtNumber, fmtPercent } from '@/components/admin/format';

export default function AdminHome() {
  const { data, loading, error, reload } = useAdminEndpoint('adminOverview');

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Super admin"
        title="Platform overview"
        description="Live counts read from the platform database. Customer, subscription and revenue figures stay empty until a workspace is explicitly marked as a production customer."
        onRefresh={reload}
        loading={loading}
      />

      {error && (
        <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">
          {error}
        </p>
      )}

      {loading && !data && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading overview…
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Production customers"
              value={
                data.customers.productionWorkspaces ? fmtNumber(data.customers.productionWorkspaces) : 'No data yet'
              }
              tone={data.customers.productionWorkspaces ? 'default' : 'muted'}
              hint={data.customers.note || 'Workspaces marked as customer accounts.'}
            />
            <StatCard
              label="Workspaces"
              value={fmtNumber(data.workspaces.total)}
              hint={`${data.workspaces.byClass.internal} internal · ${data.workspaces.byClass.test} test`}
            />
            <StatCard
              label="Accounts"
              value={fmtNumber(data.users.total)}
              hint={`${data.users.admins} admin · ${data.users.members} members`}
            />
            <StatCard
              label="AI agents"
              value={fmtNumber(data.agents.total)}
              hint={`${data.agents.active} active · ${data.agents.paused} paused · ${data.agents.draft} draft`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Executions"
              value={fmtNumber(data.runs.total)}
              hint={`${fmtNumber(data.runs.last7Days)} in the last 7 days`}
            />
            <StatCard
              label="Success rate"
              value={data.runs.successRate === null ? '—' : fmtPercent(data.runs.successRate)}
              tone={data.runs.failed > 0 ? 'warn' : 'good'}
              hint={`${data.runs.succeeded} succeeded · ${data.runs.failed} failed`}
            />
            <StatCard
              label="Model calls this month"
              value={fmtNumber(data.usage.monthUnits)}
              hint={
                data.classification.customer.workspaces === 0
                  ? 'Internal and test workspaces only — no customer usage yet'
                  : `${fmtNumber(data.usage.totalEvents)} metered events all time`
              }
            />
            <StatCard
              label="Estimated AI cost"
              value={data.cost.rateConfigured ? 'Available' : 'No Rate Configured'}
              tone="muted"
              hint={data.cost.note}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-white/[0.08] bg-[#0a0f19] p-5 lg:col-span-2">
              <h2 className="font-heading text-base font-semibold text-white">Needs attention</h2>
              <p className="mt-1 text-xs text-slate-500">
                Derived from execution, approval and workspace-limit records.
              </p>
              <div className="mt-4">
                <AlertsFeed alerts={data.alerts} />
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-[#0a0f19] p-5">
              <h2 className="font-heading text-base font-semibold text-white">Data classification</h2>
              <p className="mt-1 text-xs text-slate-500">
                Only production workspaces count toward customer and revenue metrics.
              </p>
              <ul className="mt-4 space-y-3">
                {['customer', 'internal', 'test'].map((key) => (
                  <li key={key} className="flex items-center justify-between gap-3">
                    <DataClassBadge value={key} />
                    <span className="font-mono text-[0.7rem] text-slate-400">
                      {data.classification[key].workspaces} ws · {data.classification[key].agents} agents
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/[0.08] bg-[#0a0f19] p-5">
              <h2 className="font-heading text-base font-semibold text-white">Metered operations</h2>
              <p className="mt-1 text-xs text-slate-500">Model calls recorded per operation type.</p>
              <div className="mt-4">
                <BarList
                  items={data.usage.byKind.map((row) => ({
                    key: row.key,
                    label: row.label,
                    value: row.units,
                    meta: `${row.events} events`,
                  }))}
                  formatValue={(value) => `${fmtNumber(value)} calls`}
                  emptyLabel="No usage has been metered yet."
                />
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-[#0a0f19] p-5">
              <h2 className="font-heading text-base font-semibold text-white">Workflow coverage</h2>
              <p className="mt-1 text-xs text-slate-500">
                Agents without a workflow cannot execute.
              </p>
              <div className="mt-4 space-y-3 text-xs text-slate-300">
                <div className="flex items-center justify-between">
                  <span>Agents with a workflow</span>
                  <span className="font-mono text-slate-400">{data.agents.withWorkflow}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Agents without a workflow</span>
                  <span className="font-mono text-amber-300">{data.agents.withoutWorkflow}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Active agents missing one</span>
                  <span className="font-mono text-slate-400">{data.agents.activeWithoutWorkflow}</span>
                </div>
                <div className="flex items-center justify-between border-t border-white/[0.06] pt-3">
                  <span>Runs awaiting approval</span>
                  <span className="font-mono text-slate-400">{data.runs.awaitingApproval}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Runs in flight</span>
                  <span className="font-mono text-slate-400">{data.runs.inFlight}</span>
                </div>
              </div>
            </div>
          </div>

          <p className="text-[0.66rem] uppercase tracking-[0.14em] text-slate-600">
            Read at {fmtDate(data.generatedAt)} · live platform database
          </p>
        </>
      )}
    </div>
  );
}