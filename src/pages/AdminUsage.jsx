import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import Nav from '@/components/site/Nav';
import Footer from '@/components/site/Footer';
import UsageStatCards from '@/components/usage/UsageStatCards';
import UsageBreakdown from '@/components/usage/UsageBreakdown';
import UsageTrend from '@/components/usage/UsageTrend';

export default function AdminUsage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await base44.functions.invoke('usageSummary', {});
      if (response.data?.error) setError(response.data.error);
      else setData(response.data);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Usage could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = data
    ? [
        { label: 'Total units', value: data.totals.units },
        { label: 'This month', value: data.currentMonth.units },
        { label: 'Metered events', value: data.totals.events },
        { label: 'Agents metered', value: data.byAgent.filter((row) => row.key !== 'none').length },
      ]
    : [];

  return (
    <div className="min-h-screen bg-[#05070a] text-white">
      <Nav />

      <main className="relative pb-20 pt-28 sm:pb-28">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[26rem] overflow-hidden"
        >
          <div className="absolute left-1/2 top-0 h-[24rem] w-[48rem] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(37,99,235,0.16),transparent_68%)]" />
        </div>

        <div className="relative mx-auto w-full max-w-6xl px-5 sm:px-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-sky-300/90">
                Admin console
              </p>
              <h1 className="mt-4 font-heading text-3xl font-semibold tracking-[-0.02em] text-white sm:text-4xl">
                Usage &amp; consumption
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-400">
                Metered units across every workspace, broken down by agent, workspace and operation
                type. Units are model calls and metered actions recorded as they happen.
              </p>
            </div>

            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:border-sky-400/40 hover:text-white disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          {user && user.role !== 'admin' && (
            <div className="mt-8 flex items-start gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-5">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <p className="text-sm text-amber-200/90">
                This view is limited to administrators.{' '}
                <Link to="/agents" className="underline decoration-amber-300/40 hover:text-white">
                  Go to your agents
                </Link>
                .
              </p>
            </div>
          )}

          {error && user?.role === 'admin' && (
            <p className="mt-8 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">
              {error}
            </p>
          )}

          {loading && !data && user?.role === 'admin' && (
            <div className="mt-10 flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading usage…
            </div>
          )}

          {data && user?.role === 'admin' && (
            <div className="mt-8 space-y-5">
              <UsageStatCards stats={stats} />

              <div className="grid gap-5 lg:grid-cols-2">
                <UsageBreakdown
                  title="Units per agent"
                  description="Every metered action attributed to the agent that produced it."
                  items={data.byAgent}
                  emptyLabel="No usage has been metered yet."
                />
                <UsageBreakdown
                  title="Units per organization"
                  description="What each workspace has consumed in total."
                  items={data.byOrganization}
                  emptyLabel="No usage has been metered yet."
                />
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <UsageBreakdown
                  title="Units per operation"
                  description="Runs, chat replies, agent generation and research calls."
                  items={data.byKind}
                  emptyLabel="No usage has been metered yet."
                />
                <UsageTrend months={data.byMonth} />
              </div>

              <p className="text-[0.68rem] uppercase tracking-[0.14em] text-slate-600">
                Totals are all-time · {data.totals.events} metered events
              </p>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}