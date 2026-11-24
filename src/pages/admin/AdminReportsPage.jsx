import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import StatCard from '@/components/admin/StatCard';
import useAdminEndpoint from '@/components/admin/useAdminEndpoint';
import { downloadCsv } from '@/components/admin/csv';
import { fmtDate, fmtNumber, fmtPercent } from '@/components/admin/format';

const selectClass =
  'rounded-xl border border-white/10 bg-[#05070a]/70 px-3 py-2 text-xs text-slate-200 focus:border-sky-400/60 focus:outline-none';

const downloadButton =
  'inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-semibold text-slate-200 transition-colors hover:border-sky-400/40 hover:text-white disabled:opacity-50';

export default function AdminReportsPage() {
  const [days, setDays] = useState(30);
  const overview = useAdminEndpoint('adminOverview');
  const usage = useAdminEndpoint('adminUsage', { days });
  const agents = useAdminEndpoint('adminAgents', {});
  const customers = useAdminEndpoint('adminCustomers', {});
  const spend = useAdminEndpoint('adminAiSpend');

  const loading = overview.loading || usage.loading || agents.loading || customers.loading;
  const error = overview.error || usage.error || agents.error || customers.error;

  const downloadSummary = () => {
    const data = overview.data;
    if (!data) return;
    downloadCsv(
      `coinexa-platform-summary-${days}d.csv`,
      [
        { label: 'Metric', value: (row) => row.metric },
        { label: 'Value', value: (row) => row.value },
        { label: 'Note', value: (row) => row.note },
      ],
      [
        { metric: 'Production customers', value: data.customers.productionWorkspaces, note: data.customers.note || '' },
        { metric: 'Workspaces', value: data.workspaces.total, note: `internal ${data.workspaces.byClass.internal}, test ${data.workspaces.byClass.test}` },
        { metric: 'Accounts', value: data.users.total, note: `${data.users.admins} admin, ${data.users.members} members` },
        { metric: 'AI agents', value: data.agents.total, note: `${data.agents.active} active, ${data.agents.paused} paused, ${data.agents.draft} draft` },
        { metric: 'Executions', value: data.runs.total, note: `${data.runs.succeeded} succeeded, ${data.runs.failed} failed` },
        { metric: 'Success rate', value: data.runs.successRate ?? 'n/a', note: 'succeeded vs failed' },
        { metric: 'Model calls (all time)', value: data.usage.totalUnits, note: `${data.usage.totalEvents} events` },
        { metric: 'Model calls (month)', value: data.usage.monthUnits, note: 'current month' },
        spend.data
          ? {
              metric: 'AI spend (month, USD)',
              value: spend.data.monthCostUsd,
              note: `${spend.data.calls} AI calls; cap $${spend.data.budgetUsd} per month`,
            }
          : { metric: 'Estimated AI cost', value: data.cost.rateConfigured ? 'available' : 'No Rate Configured', note: data.cost.note },
      ]
    );
  };

  const downloadUsage = () => {
    if (!usage.data) return;
    downloadCsv(
      `coinexa-usage-by-agent-${days}d.csv`,
      [
        { label: 'Agent', value: (row) => row.label },
        { label: 'Model calls', value: (row) => row.units },
        { label: 'Events', value: (row) => row.events },
      ],
      usage.data.byAgent
    );
  };

  const downloadAgents = () => {
    if (!agents.data) return;
    downloadCsv(
      'coinexa-agent-inventory.csv',
      [
        { label: 'Agent', value: (row) => row.name },
        { label: 'Workspace', value: (row) => row.organization.name },
        { label: 'Class', value: (row) => row.organization.dataClass },
        { label: 'Status', value: (row) => row.status },
        { label: 'Has workflow', value: (row) => (row.hasWorkflow ? 'yes' : 'no') },
        { label: 'Runs', value: (row) => row.runs.total },
        { label: 'Succeeded', value: (row) => row.runs.succeeded },
        { label: 'Failed', value: (row) => row.runs.failed },
        { label: 'Success rate', value: (row) => row.runs.successRate ?? '' },
        { label: 'Model calls', value: (row) => row.usage.units },
        { label: 'Last run', value: (row) => row.lastRunAt || '' },
      ],
      agents.data.items
    );
  };

  const downloadAccounts = () => {
    if (!customers.data) return;
    downloadCsv(
      'coinexa-accounts.csv',
      [
        { label: 'Name', value: (row) => row.full_name },
        { label: 'Email', value: (row) => row.email },
        { label: 'Role', value: (row) => row.role },
        { label: 'Class', value: (row) => row.dataClass },
        { label: 'Workspaces', value: (row) => row.workspaces.map((workspace) => workspace.name).join(' | ') },
        { label: 'Registered', value: (row) => row.created_date || '' },
      ],
      customers.data.accounts
    );
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Reporting"
        title="Reports"
        description="The same live metrics, with a date window and CSV downloads of exactly what is on screen."
        onRefresh={() => {
          overview.reload();
          usage.reload();
          agents.reload();
          customers.reload();
        }}
        loading={loading}
      />

      <div className="flex flex-wrap items-center gap-2">
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

      {loading && !overview.data && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Building the report…
        </div>
      )}

      {overview.data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Executions (all time)"
              value={fmtNumber(overview.data.runs.total)}
              hint={`${overview.data.runs.last7Days} in the last 7 days`}
            />
            <StatCard
              label="Success rate"
              value={overview.data.runs.successRate === null ? '—' : fmtPercent(overview.data.runs.successRate)}
              hint={`${overview.data.runs.succeeded} succeeded · ${overview.data.runs.failed} failed`}
            />
            <StatCard
              label="Model calls (window)"
              value={fmtNumber(usage.data?.totals.units || 0)}
              hint={`${fmtNumber(usage.data?.totals.events || 0)} metered events`}
            />
            <StatCard
              label="Production customers"
              value={overview.data.customers.productionWorkspaces ? fmtNumber(overview.data.customers.productionWorkspaces) : 'No data yet'}
              tone={overview.data.customers.productionWorkspaces ? 'default' : 'muted'}
              hint="No workspace is marked as a customer yet"
            />
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0a0f19] p-5">
            <h2 className="font-heading text-base font-semibold text-white">Downloads</h2>
            <p className="mt-1 text-xs text-slate-500">
              Each file contains the records currently loaded, not a projection.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={downloadSummary} className={downloadButton}>
                <Download className="h-3.5 w-3.5" /> Platform summary
              </button>
              <button type="button" onClick={downloadUsage} disabled={!usage.data} className={downloadButton}>
                <Download className="h-3.5 w-3.5" /> Usage by agent
              </button>
              <button type="button" onClick={downloadAgents} disabled={!agents.data} className={downloadButton}>
                <Download className="h-3.5 w-3.5" /> Agent inventory
              </button>
              <button type="button" onClick={downloadAccounts} disabled={!customers.data} className={downloadButton}>
                <Download className="h-3.5 w-3.5" /> Accounts
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0a0f19] p-5">
            <h2 className="font-heading text-base font-semibold text-white">Agent performance</h2>
            {agents.data?.items?.length ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[38rem] text-left text-xs">
                  <thead className="text-[0.6rem] uppercase tracking-[0.14em] text-slate-500">
                    <tr className="border-b border-white/[0.06]">
                      <th className="px-3 py-2 font-medium">Agent</th>
                      <th className="px-3 py-2 font-medium">Runs</th>
                      <th className="px-3 py-2 font-medium">Success</th>
                      <th className="px-3 py-2 font-medium">Calls</th>
                      <th className="px-3 py-2 font-medium">Last run</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.data.items.slice(0, 10).map((agent) => (
                      <tr key={agent.id} className="border-b border-white/[0.04] last:border-0">
                        <td className="px-3 py-2 text-slate-200">{agent.name}</td>
                        <td className="px-3 py-2 text-slate-400">{agent.runs.total}</td>
                        <td className="px-3 py-2 text-slate-400">
                          {agent.runs.successRate === null ? '—' : `${agent.runs.successRate}%`}
                        </td>
                        <td className="px-3 py-2 text-slate-400">{fmtNumber(agent.usage.units)}</td>
                        <td className="px-3 py-2 text-slate-500">{fmtDate(agent.lastRunAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">No agents to report on yet.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}