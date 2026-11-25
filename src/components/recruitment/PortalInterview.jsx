import { useEffect, useRef, useState } from 'react';
import { Loader2, MessageSquareText, Send } from 'lucide-react';
import { recruitment, errorText } from '@/api/recruitment';
import { ErrorNote, Panel, inputCls, primaryBtn, when } from '@/components/recruitment/ui';

// Written interview inside the candidate portal. Text only: no microphone, voice or call.
export default function PortalInterview({ token, summary, dataConsentGiven }) {
  const [view, setView] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [agree, setAgree] = useState({ ai_interview: false, data_processing: false });
  const endRef = useRef(null);

  useEffect(() => {
    if (!summary || summary.status === 'invited' || summary.status === 'expired') return;
    recruitment('portal_interview_get', { token }).then(setView).catch((e) => setError(errorText(e)));
  }, [token, summary?.status]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [view?.messages?.length]);

  if (!summary) return null;

  const call = async (action, body) => {
    setBusy(true);
    setError('');
    try {
      setView(await recruitment(action, { token, ...body }));
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const status = view?.status || summary.status;
  const messages = view?.messages || [];

  return (
    <Panel title="Written interview" description="A short interview in text. Answer in your own words — there is no call, video or voice recording, and you can come back later while your link is valid.">
      <ErrorNote>{error}</ErrorNote>
      {status === 'expired' && <p className="text-sm text-slate-300">This interview link has expired. Ask the company to invite you again if you are still interested.</p>}
      {status === 'cancelled' && <p className="text-sm text-slate-300">This interview was replaced by a newer invitation.</p>}

      {status === 'invited' && (
        <div className="space-y-3 text-sm">
          <p className="text-slate-300">{summary.questions} questions about your experience and skills. Valid until {when(summary.expires_at)}.</p>
          <label className="flex items-start gap-2 text-slate-300">
            <input type="checkbox" className="mt-1" checked={agree.ai_interview} onChange={(e) => setAgree({ ...agree, ai_interview: e.target.checked })} />
            I agree to a written interview conducted by an AI assistant. My answers will be summarised and scored for the company’s hiring manager, who makes every decision.
          </label>
          {!dataConsentGiven && (
            <label className="flex items-start gap-2 text-slate-300">
              <input type="checkbox" className="mt-1" checked={agree.data_processing} onChange={(e) => setAgree({ ...agree, data_processing: e.target.checked })} />
              I agree that the company may store and use the information I give here to consider me for this role.
            </label>
          )}
          <button type="button" className={primaryBtn} disabled={busy || !agree.ai_interview || (!dataConsentGiven && !agree.data_processing)}
            onClick={() => call('portal_interview_start', { consents: { ai_interview: true, ...(dataConsentGiven ? {} : { data_processing: true }) } })}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareText className="h-4 w-4" />} Start the interview
          </button>
        </div>
      )}

      {['in_progress', 'completed', 'evaluated'].includes(status) && (
        <div className="space-y-3">
          {status === 'in_progress' && <p className="text-xs text-slate-500">Question {Math.min(view?.current || summary.current, view?.questions || summary.questions)} of {view?.questions || summary.questions}</p>}
          <div className="max-h-[480px] space-y-2 overflow-y-auto rounded-xl bg-white/[0.02] p-3">
            {messages.map((msg, i) => (
              <p key={i} className={`whitespace-pre-line rounded-xl px-3 py-2 text-sm ${msg.role === 'candidate' ? 'ml-8 bg-sky-500/15 text-sky-50' : 'mr-8 bg-white/[0.05] text-slate-200'}`}>{msg.content}</p>
            ))}
            {busy && <p className="mr-8 flex items-center gap-2 rounded-xl bg-white/[0.05] px-3 py-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Reading your answer…</p>}
            <div ref={endRef} />
          </div>
          {status === 'in_progress' ? (
            <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); if (await call('portal_interview_answer', { text })) setText(''); }}>
              <textarea rows={4} maxLength={3000} className={inputCls} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your answer…" disabled={busy} />
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">{text.length}/3000</span>
                <button type="submit" className={primaryBtn} disabled={busy || text.trim().length < 2}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send answer</button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-emerald-200">Interview complete — thank you. The company will review your answers.</p>
          )}
        </div>
      )}
    </Panel>
  );
}
