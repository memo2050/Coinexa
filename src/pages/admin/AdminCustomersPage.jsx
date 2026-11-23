import { Loader2 } from 'lucide-react';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import DataClassBadge from '@/components/admin/DataClassBadge';
import EmptyState from '@/components/admin/EmptyState';
import StatCard from '@/components/admin/StatCard';
import useAdminEndpoint from '@/components/admin/useAdminEndpoint';
import { fmtDate, fmtNumber } from '@/components/admin/format';

export default function AdminCustomersPage() {
  const { data, loading, error, reload } = useAdminEndpoint('adminCustomers');

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Accounts"
        title="Customers & workspaces"
        description="Every account and workspace, classified as production, internal or test. Read-only in this phase."
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
          <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts…
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Production customers"
              value={data.productionCustomers ? fmtNumber(data.productionCustomers) : 'No data yet'}
              tone={data.productionCustomers ? 'default' : 'muted'}
              hint="Accounts in a workspace marked as a customer"
            />
            <StatCard label="Internal accounts" value={fmtNumber(data.summary.internal.accounts)} hint="Platform team estate" />
            <StatCard label="Test accounts" value={fmtNumber(data.summary.test.accounts)} hint="Development and QA" />
            <StatCard label="Workspaces" value={fmtNumber(data.workspaces.length)} hint="Across every class" />
          </div>

          {data.note && (
            <p className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-4 py-2.5 text-xs leading-relaxed text-amber-200/90">
              {data.note}
            </p>
          )}

          <section className="space-y-2">
            <h2 className="font-heading text-base font-semibold text-white">Accounts</h2>
            {data.accounts.length === 0 ? (
              <EmptyState title="No accounts yet" description="Accounts appear as people register." />
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#0a0f19]">
                <table className="w-full min-w-[46rem] text-left text-xs">
                  <thead className="text-[0.6rem] uppercase tracking-[0.14em] text-slate-500">
                    <tr className="border-b border-white/[0.06]">
                      <th className="px-4 py-2.5 font-medium">Account</th>
                      <th className="px-4 py-2.5 font-medium">Role</th>
                      <th className="px-4 py-2.5 font-medium">Class</th>
                      <th className="px-4 py-2.5 font-medium">Workspaces</th>
                      <th className="px-4 py-2.5 font-medium">Registered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.accounts.map((account) => (
                      <tr key={account.id} className="border-b border-white/[0.04] last:border-0">
                        <td className="px-4 py-2.5">
                          <div className="truncate text-slate-200">{account.full_name || 'Unnamed'}</div>
                          <div className="truncate text-[0.64rem] text-slate-500">{account.email}</div>
                        </td>
                        <td className="px-4 py-2.5 text-slate-400">{account.role}</td>
                        <td className="px-4 py-2.5">
                          <DataClassBadge value={account.dataClass} />
                        </td>
                        <td className="px-4 py-2.5 text-slate-400">
                          {account.workspaces.length
                            ? account.workspaces.map((workspace) => workspace.name).join(', ')
                            : 'None'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">
                          {fmtDate(account.created_date)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-base font-semibold text-white">Workspaces</h2>
            <ul className="space-y-2">
              {data.workspaces.map((workspace) => (
                <li key={workspace.id} className="rounded-2xl border border-white/[0.08] bg-[#0a0f19] px-4 py-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-heading text-sm font-semibold text-white">
                      {workspace.name}
                    </span>
                    <DataClassBadge value={workspace.dataClass} />
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[0.58rem] uppercase tracking-[0.1em] text-slate-400">
                      {workspace.plan}
                    </span>
                    {workspace.status === 'suspended' && (
                      <span className="rounded-full border border-rose-400/30 px-2 py-0.5 text-[0.58rem] uppercase tracking-[0.1em] text-rose-300">
                        Suspended
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.66rem] text-slate-400">
                    <span>{workspace.counts.members} members</span>
                    <span>{workspace.counts.agents} agents</span>
                    <span>{workspace.counts.runs} runs</span>
                    <span>{fmtNumber(workspace.counts.units)} model calls</span>
                    <span>limits: {workspace.limits.agents} agents · {workspace.limits.runsPerMonth} runs/mo</span>
                    <span>billing: {workspace.billing.subscription ? 'connected' : 'none'}</span>
                  </div>
                  {workspace.members.length > 0 && (
                    <p className="mt-1.5 truncate text-[0.64rem] text-slate-600">
                      {workspace.members.map((member) => `${member.email} (${member.member_role})`).join(' · ')}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}