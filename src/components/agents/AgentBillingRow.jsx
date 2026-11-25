import { useState } from 'react';
import { Loader2, ShoppingCart } from 'lucide-react';
import { cancelHire, errorMessage, hireAgent } from '@/components/agents/hired';

const money = (cents) => `$${(cents / 100).toFixed(0)}`;

// Usage and hiring for one agent. `state` comes from useAgentBilling().forAgent / forFeatured.
export default function AgentBillingRow({ billing, state, agentId, featured, name, compact = false, allowCancel = false }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  if (!billing.ready || !billing.data || billing.exempt || !state.plan) return null;

  const run = async (fn) => {
    setBusy(true);
    setNote('');
    try {
      setNote(await fn());
    } catch (e) {
      setNote(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const pct = state.allowance ? Math.min(100, Math.round((state.used / state.allowance) * 100)) : 0;
  const bar = pct >= 100 ? 'bg-rose-400' : pct >= 80 ? 'bg-amber-300' : 'bg-sky-400';
  const hire = state.hire;

  return (
    <div className={`relative ${compact ? 'mt-3' : 'mt-4'} space-y-1.5 text-[0.7rem]`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
      {state.hired ? (
        <>
          <div className="flex justify-between text-slate-400">
            <span>{state.used} of {state.allowance} {state.unitLabel} this period</span>
            <span>
              {hire.status === 'cancelled' ? `ends ${String(hire.ends_at || hire.current_period_end).slice(0, 10)}` : hire.status === 'past_due' ? <span className="text-amber-300">payment failed</span> : `renews ${String(hire.current_period_end).slice(0, 10)}`}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.max(2, pct)}%` }} /></div>
          {pct >= 80 && <p className={pct >= 100 ? 'text-rose-300' : 'text-amber-200'}>{pct >= 100 ? 'This month’s allowance is used up; it resets on renewal.' : 'Over 80% of this month’s allowance used.'}</p>}
          {allowCancel && billing.canManage && hire.status !== 'cancelled' && (
            <button type="button" disabled={busy} className="text-slate-500 underline hover:text-rose-300 disabled:opacity-50"
              onClick={() => window.confirm(`Cancel ${name}? It stays available until the end of the paid period, then stops.`) && run(() => cancelHire({ agentId, featured }))}>
              Cancel hire
            </button>
          )}
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-slate-500">
            {state.left > 0 ? `Free trial: ${state.left} of ${state.allowance} ${state.unitLabel} left` : 'Free trial used'}
          </span>
          {billing.canManage && billing.paymentsReady ? (
            <button type="button" disabled={busy}
              className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
              onClick={() => run(() => hireAgent({ agentId, featured, name }))}>
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShoppingCart className="h-3 w-3" />} Hire · {money(state.plan.price_cents)}/month
            </button>
          ) : (
            <span className="text-slate-500">{money(state.plan.price_cents)}/month{billing.paymentsReady ? '' : ' · hiring opens soon'}</span>
          )}
        </div>
      )}
      {note && <p className="text-sky-200">{note}</p>}
    </div>
  );
}

// Honest label: no agent is connected to its listed tools yet, so each drafts work for
// a person to review and describes the steps it would take in those tools.
export function DraftingBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-0.5 text-[0.64rem] font-medium text-slate-300"
      title="Prepares drafts and next steps for you to review. Its listed tools are not connected yet.">
      Drafting assistant
    </span>
  );
}
