import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { recruitment, errorText } from '@/api/recruitment';
import { ErrorNote, Field, Panel, ghostBtn, inputCls, primaryBtn, when } from '@/components/recruitment/ui';

const INTERVIEW_STATUS = {
  invited: 'Invited', in_progress: 'In progress', completed: 'Completed', evaluated: 'Scored', expired: 'Expired', cancelled: 'Cancelled',
};

// Interviews tab: the written (text-only) interview plan for the campaign, and where
// each candidate's interview stands. Questions are used only after a manager approves them.
export default function InterviewPlan({ campaignId, canManage, plan, interviews, candidates, onOpen, onChanged }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setForm(plan ? { questions: plan.questions, max_followups: plan.max_followups, valid_days: plan.valid_days } : { questions: [], max_followups: 2, valid_days: 7 });
  }, [plan?.id, plan?.status, plan?.updated_date]);

  const run = async (key, fn) => {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      await fn();
      await onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy('');
    }
  };

  const generate = () => run('generate', async () => {
    const r = await recruitment('generateInterviewPlan', { campaign_id: campaignId, count: 8 });
    setForm({ questions: r.plan.questions, max_followups: r.plan.max_followups, valid_days: r.plan.valid_days });
    setNotice('Questions drafted. Review and edit them, then approve.');
  });
  const save = (approve) => run(approve ? 'approve' : 'save', async () => {
    await recruitment('saveInterviewPlan', { campaign_id: campaignId, ...form, approve });
    setNotice(approve ? 'Interview plan approved. You can now invite candidates from their panel.' : 'Draft saved.');
  });
  const setQ = (i, key, value) => setForm((f) => ({ ...f, questions: f.questions.map((q, j) => (j === i ? { ...q, [key]: value } : q)) }));

  const rows = Object.values(interviews || {});
  const nameOf = (cid) => candidates.find((c) => c.id === cid)?.full_name || 'Candidate';

  return (
    <div className="space-y-4">
      <ErrorNote>{error}</ErrorNote>
      {notice && <p className="rounded-xl border border-sky-400/25 bg-sky-500/10 px-4 py-2.5 text-sm text-sky-100">{notice}</p>}
      <Panel
        title="Written interview questions"
        description="Candidates answer these in a text chat on their personal page — no calls, no voice. The AI may ask a short follow-up when an answer is unclear. Nothing is sent to candidates until you approve the questions and the invitation."
        actions={canManage && (
          <>
            <span className="self-center text-xs text-slate-400">{plan ? (plan.status === 'approved' ? `Approved ${when(plan.approved_at)}` : 'Draft — not approved') : 'No plan yet'}</span>
            <button type="button" className={ghostBtn} onClick={generate} disabled={!!busy}>{busy === 'generate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {form?.questions.length ? 'Redraft with AI' : 'Draft with AI'}</button>
          </>
        )}
      >
        {!form?.questions.length ? (
          <p className="py-6 text-center text-sm text-slate-400">No questions yet. {canManage ? 'Draft them with AI from the job requirements, or add your own.' : ''}</p>
        ) : (
          <ol className="space-y-3">
            {form.questions.map((q, i) => (
              <li key={q.id || i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="flex items-start gap-2">
                  <span className="mt-2 text-xs font-semibold text-slate-500">{i + 1}.</span>
                  <div className="flex-1 space-y-2">
                    <textarea className={`${inputCls} min-h-[56px]`} value={q.question} disabled={!canManage} onChange={(e) => setQ(i, 'question', e.target.value)} />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input className={inputCls} placeholder="What it tests (criterion)" value={q.criterion || ''} disabled={!canManage} onChange={(e) => setQ(i, 'criterion', e.target.value)} />
                      <input className={inputCls} placeholder="What a strong answer shows" value={q.strong_answer || ''} disabled={!canManage} onChange={(e) => setQ(i, 'strong_answer', e.target.value)} />
                    </div>
                  </div>
                  {canManage && (
                    <button type="button" aria-label="Remove question" className="mt-2 text-slate-500 hover:text-rose-300" onClick={() => setForm((f) => ({ ...f, questions: f.questions.filter((_, j) => j !== i) }))}><Trash2 className="h-4 w-4" /></button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
        {canManage && form && (
          <div className="mt-4 space-y-3">
            {form.questions.length < 12 && (
              <button type="button" className={ghostBtn} onClick={() => setForm((f) => ({ ...f, questions: [...f.questions, { id: '', question: '', criterion: '', strong_answer: '' }] }))}><Plus className="h-4 w-4" /> Add question</button>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Follow-ups per question" hint="0–2. The AI asks one only when an answer is unclear.">
                <select className={inputCls} value={form.max_followups} onChange={(e) => setForm((f) => ({ ...f, max_followups: Number(e.target.value) }))}>
                  {[0, 1, 2].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </Field>
              <Field label="Invitation link valid (days)" hint="1–30">
                <input className={inputCls} type="number" min="1" max="30" value={form.valid_days} onChange={(e) => setForm((f) => ({ ...f, valid_days: Number(e.target.value) }))} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={ghostBtn} onClick={() => save(false)} disabled={!!busy || !form.questions.length}>{busy === 'save' && <Loader2 className="h-4 w-4 animate-spin" />} Save draft</button>
              <button type="button" className={primaryBtn} onClick={() => save(true)} disabled={!!busy || form.questions.length < 3}>{busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Approve questions</button>
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Interviews" description="Open a candidate to invite them, read the full transcript and scores, download the report or send it to your hiring manager.">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No candidates invited yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-[0.66rem] uppercase tracking-[0.14em] text-slate-500">
                <tr><th className="py-2">Candidate</th><th>Interview</th><th>Score</th><th>Link expires</th><th>Report</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => onOpen(r.candidate_id)} className="cursor-pointer border-t border-white/[0.05] hover:bg-white/[0.03]">
                    <td className="py-2.5 font-semibold text-white">{nameOf(r.candidate_id)}</td>
                    <td className="text-xs text-slate-300">{INTERVIEW_STATUS[r.status] || r.status}</td>
                    <td className="text-xs">{r.score ?? '—'}</td>
                    <td className="text-xs text-slate-400">{['invited', 'in_progress'].includes(r.status) ? when(r.expires_at) : '—'}</td>
                    <td className="text-xs text-slate-400">{r.report_sent_at ? `Sent ${when(r.report_sent_at)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

export { INTERVIEW_STATUS };
