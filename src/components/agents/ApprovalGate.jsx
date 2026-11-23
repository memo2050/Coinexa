import { useState } from 'react';
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function ApprovalGate({ task, onDecided }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  if (!task || task.status !== 'awaiting_approval') return null;

  const waiting = (task.steps || []).find((step) => step.status === 'AWAITING_APPROVAL');

  const decide = async (decision) => {
    if (busy) return;
    setBusy(decision);
    setError('');
    try {
      const response = await base44.functions.invoke('resumeAgentTask', {
        taskId: task.id,
        decision,
        note: note.trim(),
      });
      setNote('');
      onDecided?.(response.data?.task || null);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'The run could not be continued.');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="mt-5 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-4">
      <p className="flex items-center gap-2 text-[0.68rem] uppercase tracking-[0.16em] text-amber-300">
        <ShieldCheck className="h-3.5 w-3.5" />
        Waiting for your approval
      </p>
      <p className="mt-2 break-words font-heading text-sm font-semibold text-white [overflow-wrap:anywhere]">
        {waiting?.title || 'The run is paused before its next step'}
      </p>
      <p className="mt-1.5 break-words text-xs leading-relaxed text-slate-300 [overflow-wrap:anywhere]">
        {waiting?.note || 'Nothing else executes until you decide.'}
      </p>

      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={300}
        placeholder="Optional note for the run history"
        aria-label="Approval note"
        className="mt-3 w-full rounded-xl border border-white/10 bg-[#05070a]/70 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-amber-400/60 focus:outline-none focus:ring-2 focus:ring-amber-400/20"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => decide('approve')}
          disabled={Boolean(busy)}
          className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-400/20 disabled:opacity-60"
        >
          {busy === 'approve' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          Approve and continue
        </button>
        <button
          type="button"
          onClick={() => decide('reject')}
          disabled={Boolean(busy)}
          className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-400/10 px-3.5 py-1.5 text-xs font-semibold text-rose-200 transition-colors hover:bg-rose-400/20 disabled:opacity-60"
        >
          {busy === 'reject' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <XCircle className="h-3.5 w-3.5" />
          )}
          Reject run
        </button>
      </div>

      {error && (
        <p className="mt-2 break-words text-xs text-rose-300 [overflow-wrap:anywhere]">{error}</p>
      )}
    </div>
  );
}