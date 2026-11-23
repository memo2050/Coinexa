import { Loader2 } from 'lucide-react';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import EmptyState from '@/components/admin/EmptyState';
import StatCard from '@/components/admin/StatCard';
import useAdminEndpoint from '@/components/admin/useAdminEndpoint';
import { fmtDate, fmtMoney, fmtNumber } from '@/components/admin/format';

export default function AdminBillingPage() {
  const { data, loading, error, reload } = useAdminEndpoint('adminBilling');

  const modeLabel =
    data?.mode === 'live' ? 'Live' : data?.mode === 'test' ? 'Test mode' : 'Not connected';

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Billing"
        title="Subscriptions & revenue"
        description="Read directly from the connected Stripe account. Live payments stay off: nothing here can charge a customer."
        onRefresh={reload}
        loading={loading}
      />

      {data && (
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-3 py-1 text-[0.62rem] uppercase tracking-[0.14em] ${
              data.mode === 'live'
                ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-300'
                : 'border-amber-400/35 bg-amber-400/10 text-amber-300'
            }`}
          >
            Stripe · {modeLabel}
          </span>
          <span className="rounded-full border border-white/10 px-3 py-1 text-[0.62rem] uppercase tracking-[0.14em] text-slate-400">
            Read only
          </span>
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">
          {error}
        </p>
      )}

      {loading && !data && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading billing…
        </div>
      )}

      {data && (
        <>
          {data.error && (
            <p className="rounded-xl border border-amber-400/30 bg-amber-400/[0.07] px-4 py-2.5 text-xs text-amber-200">
              {data.error}
            </p>
          )}
          {data.note && (
            <p className="rounded-xl border border-white/[0.07] bg-white/[0.015] px-4 py-2.5 text-xs leading-relaxed text-slate-400">
              {data.note}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Monthly recurring revenue"
              value={
                data.totals.monthlyRecurringRevenue > 0
                  ? fmtMoney(data.totals.monthlyRecurringRevenue, data.totals.currency)
                  : 'No data yet'
              }
              tone={data.totals.monthlyRecurringRevenue > 0 ? 'default' : 'muted'}
              hint={data.mode === 'test' ? 'Test-mode records only' : 'From active subscriptions'}
            />
            <StatCard
              label="Active subscriptions"
              value={fmtNumber(data.totals.activeSubscriptions)}
              hint={`${fmtNumber(data.totals.canceledSubscriptions)} cancelled or unpaid`}
            />
            <StatCard
              label="Revenue collected"
              value={
                data.totals.revenueCollected > 0
                  ? fmtMoney(data.totals.revenueCollected, data.totals.currency)
                  : 'No data yet'
              }
              tone={data.totals.revenueCollected > 0 ? 'default' : 'muted'}
              hint={`${fmtNumber(data.totals.invoices)} invoices`}
            />
            <StatCard label="Published plans" value={fmtNumber(data.plans.length)} hint="From the server price catalog" />
          </div>

          <section className="space-y-2">
            <h2 className="font-heading text-base font-semibold text-white">Plans</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {data.plans.map((plan) => (
                <div key={plan.key} className="rounded-2xl border border-white/[0.08] bg-[#0a0f19] px-4 py-3">
                  <p className="font-heading text-sm font-semibold text-white">{plan.name}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {fmtMoney(plan.amount, plan.currency)} / month · unlocks the {plan.plan} plan
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-base font-semibold text-white">Subscriptions</h2>
            {data.subscriptions.length === 0 ? (
              <EmptyState
                title="No subscription exists yet"
                description="Once a real customer subscribes, their subscription appears here with its status and renewal date."
              />
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#0a0f19]">
                <table className="w-full min-w-[40rem] text-left text-xs">
                  <thead className="text-[0.6rem] uppercase tracking-[0.14em] text-slate-500">
                    <tr className="border-b border-white/[0.06]">
                      <th className="px-4 py-2.5 font-medium">Status</th>
                      <th className="px-4 py-2.5 font-medium">Amount</th>
                      <th className="px-4 py-2.5 font-medium">Renews</th>
                      <th className="px-4 py-2.5 font-medium">Customer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.subscriptions.map((subscription) => (
                      <tr key={subscription.id} className="border-b border-white/[0.04] last:border-0">
                        <td className="px-4 py-2.5 text-slate-300">
                          {subscription.status}
                          {subscription.cancel_at_period_end ? ' · cancels' : ''}
                        </td>
                        <td className="px-4 py-2.5 text-slate-300">
                          {fmtMoney(subscription.amount, subscription.currency)} / {subscription.interval}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">{fmtDate(subscription.current_period_end)}</td>
                        <td className="px-4 py-2.5 font-mono text-[0.62rem] text-slate-600">{subscription.customer}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-base font-semibold text-white">Invoices</h2>
            {data.invoices.length === 0 ? (
              <EmptyState
                title="No invoices yet"
                description="Billing history appears here once a payment is made."
              />
            ) : (
              <ul className="space-y-1.5">
                {data.invoices.map((invoice) => (
                  <li
                    key={invoice.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-white/[0.015] px-3 py-2 text-xs"
                  >
                    <span className="font-mono text-[0.62rem] text-slate-500">{invoice.id}</span>
                    <span className="text-slate-300">
                      {fmtMoney(invoice.amount_paid, invoice.currency)} · {invoice.status}
                    </span>
                    <span className="text-slate-500">{fmtDate(invoice.created)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}