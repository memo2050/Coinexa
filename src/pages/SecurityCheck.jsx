import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, ShieldCheck } from 'lucide-react';
import IsolationReport from '@/components/security/IsolationReport';

export default function SecurityCheck() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setError('');
    setReport(null);
    try {
      const response = await base44.functions.invoke('verifyTenantIsolation', {});
      if (response.data?.error) setError(response.data.error);
      else setReport(response.data);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'The check could not run.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-3xl px-5 py-16 sm:px-8">
        <p className="text-[0.68rem] uppercase tracking-[0.18em] text-slate-500">Temporary</p>
        <h1 className="mt-2 font-heading text-3xl font-semibold text-white">Workspace isolation check</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Runs real reads, writes and API calls as the account signed in right now, and reports whether
          another workspace&rsquo;s records are reachable. Sign in as the non-admin test account to get a
          meaningful verdict.
        </p>

        <button
          type="button"
          onClick={run}
          disabled={running}
          className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_-14px_rgba(34,211,238,0.9)] transition-transform duration-300 hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {running ? 'Running checks…' : 'Run isolation check'}
        </button>

        {error && (
          <p className="mt-5 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">
            {error}
          </p>
        )}

        {report && (
          <div className="mt-8">
            <IsolationReport report={report} />
          </div>
        )}
      </div>
    </div>
  );
}