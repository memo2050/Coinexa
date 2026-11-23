import { AlertTriangle, CheckCircle2, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';

const VERDICTS = {
  PASS: {
    icon: ShieldCheck,
    ring: 'border-emerald-400/30 bg-emerald-500/10',
    text: 'text-emerald-300',
    label: 'Cross-account isolation verified',
  },
  FAIL: {
    icon: ShieldAlert,
    ring: 'border-rose-400/30 bg-rose-500/10',
    text: 'text-rose-300',
    label: 'Isolation failure detected',
  },
  INCONCLUSIVE: {
    icon: AlertTriangle,
    ring: 'border-amber-400/30 bg-amber-500/10',
    text: 'text-amber-300',
    label: 'Not conclusive from this account',
  },
};

export default function IsolationReport({ report }) {
  const style = VERDICTS[report.verdict] || VERDICTS.INCONCLUSIVE;

  return (
    <div className="space-y-5">
      <div className={`rounded-2xl border px-5 py-4 ${style.ring}`}>
        <div className={`flex items-center gap-2 ${style.text}`}>
          <style.icon className="h-5 w-5" />
          <p className="font-heading text-base font-semibold">{style.label}</p>
        </div>
        {report.verdict !== 'INCONCLUSIVE' && (
          <p className="mt-2 text-sm text-slate-300">
            {report.passed} of {report.total} checks blocked as expected
            {report.failed > 0 ? `, ${report.failed} failed` : ''}.
          </p>
        )}
        {report.note && <p className="mt-2 text-sm leading-relaxed text-slate-400">{report.note}</p>}
      </div>

      {report.checks?.length > 0 && (
        <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0f19]">
          {report.checks.map((check) => (
            <li key={check.id} className="flex items-start gap-3 px-4 py-3">
              {check.passed ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-200">{check.label}</p>
                <p className="mt-0.5 font-mono text-[0.66rem] text-slate-500">
                  expected {check.expectation} &middot; observed {check.observed}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}