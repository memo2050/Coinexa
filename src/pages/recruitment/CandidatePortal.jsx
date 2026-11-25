import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, FileUp, Loader2, MapPin, ShieldCheck, Trash2 } from 'lucide-react';
import Nav from '@/components/site/Nav';
import Footer from '@/components/site/Footer';
import { recruitment, uploadCv, errorText } from '@/api/recruitment';
import { ErrorNote, Field, Loading, Panel, ghostBtn, inputCls, money, primaryBtn, when } from '@/components/recruitment/ui';
import PortalInterview from '@/components/recruitment/PortalInterview';

const CONSENT_TEXT = {
  data_processing: 'I agree that the company may store and use the information I give here to consider me for this role.',
  share_with_company: 'The company may see my email, phone and CV so it can contact me directly.',
  contact: 'The company may contact me about this role.',
};

export default function CandidatePortal() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [done, setDone] = useState('');
  const [form, setForm] = useState({ amount: '', availability: '', email: '', phone: '', note: '' });
  const [consents, setConsents] = useState({ data_processing: false, share_with_company: false, contact: false });
  const [erased, setErased] = useState(false);

  const apply = (view) => {
    setData(view);
    setForm((f) => ({ ...f, availability: f.availability || view.candidate.availability || '' }));
    setConsents((c) => Object.fromEntries(Object.keys(c).map((k) => [k, view.consents?.[k]?.granted ?? c[k]])));
  };

  useEffect(() => {
    recruitment('portal_get', { token }).then(apply).catch((e) => setError(errorText(e)));
  }, [token]);

  const respond = async (response, extra = {}) => {
    setBusy(response);
    setError('');
    setDone('');
    try {
      const view = await recruitment('portal_respond', {
        token, response, consents, availability: form.availability, note: form.note,
        contact: form.email || form.phone ? { email: form.email, phone: form.phone } : undefined, ...extra,
      });
      apply(view);
      const d = view.decision;
      setDone(
        response === 'decline' ? 'Thank you — we have recorded that you are not interested.'
          : response === 'opt_out' ? 'Understood. You will not be contacted about this role again.'
          : d?.action === 'accept' ? `Agreed at ${money(d.amount, view.job.currency, view.job.pay_frequency)}. The company will confirm next steps with you.`
          : d?.action === 'counter' ? `The company can offer ${money(d.amount, view.job.currency, view.job.pay_frequency)}. You can accept it or reply with a different figure.`
          : d?.action === 'final_offer' ? `This is the company's final offer: ${money(d.amount, view.job.currency, view.job.pay_frequency)}.`
          : d?.action === 'escalate' ? 'Your request is above what the agent can agree to. It has been passed to the company for a decision; you will hear back.'
          : 'Thank you — your response has been saved.'
      );
      setForm((f) => ({ ...f, amount: '', note: '' }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy('');
    }
  };

  const onCv = async (file) => {
    if (!file) return;
    setBusy('cv');
    setError('');
    try {
      await uploadCv(token, file);
      setDone('CV uploaded.');
      apply(await recruitment('portal_get', { token }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy('');
    }
  };

  const erase = async () => {
    if (!window.confirm('Erase your personal information from this recruitment? This cannot be undone and the company will no longer be able to contact you about it.')) return;
    setBusy('erase');
    try {
      await recruitment('portal_erase', { token });
      setErased(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy('');
    }
  };

  const job = data?.job;
  const m = (v) => money(v, job?.currency, job?.pay_frequency);
  const finished = ['agreed', 'hired', 'declined', 'withdrawn'].includes(data?.candidate?.status);

  return (
    <div className="min-h-screen bg-[#05070a] text-white">
      <Nav />
      <main className="relative pb-20 pt-28">
        <div className="mx-auto w-full max-w-3xl space-y-5 px-5 sm:px-8">
          {erased ? (
            <Panel title="Your information has been erased">
              <p className="text-sm text-slate-300">Your details, messages and CV were deleted. This link no longer works.</p>
            </Panel>
          ) : (
            <>
              <ErrorNote>{error}</ErrorNote>
              {!data && !error && <Loading label="Loading your offer…" />}
              {job && (
                <>
                  <div>
                    <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-sky-300/90">{job.company} · personal page</p>
                    <h1 className="mt-2 font-heading text-3xl font-semibold">Hello {data.candidate.first_name}</h1>
                    <p className="mt-2 text-sm text-slate-400">Review the role below and tell us whether you are interested, what you would like to be paid, and when you are available.</p>
                  </div>

                  {done && <p className="flex items-start gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{done}</p>}

                  <Panel title={job.title}>
                    <p className="flex items-center gap-1.5 text-sm text-slate-300"><MapPin className="h-4 w-4" /> {[job.city, job.country].filter(Boolean).join(', ')} · {job.work_mode}</p>
                    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                      <div><dt className="text-xs text-slate-500">Current offer</dt><dd className="font-heading text-xl text-white">{m(data.current_offer)}</dd></div>
                      {job.duration && <div><dt className="text-xs text-slate-500">Duration</dt><dd>{job.duration}</dd></div>}
                      {job.schedule && <div><dt className="text-xs text-slate-500">Schedule</dt><dd>{job.schedule}</dd></div>}
                      {job.availability && <div><dt className="text-xs text-slate-500">Start / availability</dt><dd>{job.availability}</dd></div>}
                      {job.skills?.length > 0 && <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Skills</dt><dd>{job.skills.join(', ')}</dd></div>}
                      {(job.experience_min !== null || job.experience_max !== null) && <div><dt className="text-xs text-slate-500">Experience</dt><dd>{job.experience_min ?? 0}–{job.experience_max ?? 'any'} years</dd></div>}
                      {job.languages?.length > 0 && <div><dt className="text-xs text-slate-500">Languages</dt><dd>{job.languages.join(', ')}</dd></div>}
                      {job.certifications?.length > 0 && <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Certifications</dt><dd>{job.certifications.join(', ')}</dd></div>}
                    </dl>
                    {job.description && <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-slate-300">{job.description}</p>}
                  </Panel>

                  <PortalInterview token={token} summary={data.interview} dataConsentGiven={!!data.consents?.data_processing?.granted} />

                  {data.offers.length > 0 && (
                    <Panel title="Offers so far">
                      <ol className="space-y-1.5 text-sm">
                        {data.offers.map((o, i) => (
                          <li key={i} className="flex justify-between rounded-lg bg-white/[0.02] px-3 py-2">
                            <span className="text-slate-300">{o.party === 'candidate' ? 'You' : 'Company'} · {o.outcome === 'request' ? 'asked' : o.outcome}</span>
                            <span className="text-slate-400">{m(o.amount)} · {when(o.at)}</span>
                          </li>
                        ))}
                      </ol>
                    </Panel>
                  )}

                  {!finished && job.status === 'active' && (
                    <Panel title="Your response">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="When are you available?" className="sm:col-span-2"><input className={inputCls} value={form.availability} onChange={(e) => setForm({ ...form, availability: e.target.value })} placeholder="e.g. from 2 December, full days" /></Field>
                        {!data.candidate.contact_on_file && (
                          <>
                            <Field label="Email"><input type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
                            <Field label="Phone"><input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
                          </>
                        )}
                        <Field label="Message (optional)" className="sm:col-span-2"><textarea rows={3} className={inputCls} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
                      </div>

                      <div className="mt-4 space-y-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                        <p className="flex items-center gap-2 text-xs font-semibold text-slate-200"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Your consent</p>
                        {Object.entries(CONSENT_TEXT).map(([key, text]) => (
                          <label key={key} className="flex items-start gap-2 text-sm text-slate-300">
                            <input type="checkbox" className="mt-1" checked={consents[key]} onChange={(e) => setConsents((c) => ({ ...c, [key]: e.target.checked }))} />
                            <span>{text}{key === 'data_processing' && <b className="text-slate-400"> (required to respond)</b>}</span>
                          </label>
                        ))}
                        <p className="text-[0.7rem] text-slate-500">Recorded with the date and time ({data.consent_version}). You can withdraw by declining, opting out or erasing your data below.</p>
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <button type="button" className={primaryBtn} disabled={!!busy} onClick={() => respond('accept_offer')}>
                          {busy === 'accept_offer' && <Loader2 className="h-4 w-4 animate-spin" />} Accept {m(data.current_offer)}
                        </button>
                        <button type="button" className={ghostBtn} disabled={!!busy} onClick={() => respond('interested')}>
                          {busy === 'interested' && <Loader2 className="h-4 w-4 animate-spin" />} I'm interested — save my details
                        </button>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <input type="number" min="0" step="0.01" className={inputCls} placeholder={`Your requested pay (${job.currency} per ${{ hourly: 'hour', daily: 'day', monthly: 'month' }[job.pay_frequency]})`} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                        <button type="button" className={ghostBtn} disabled={!!busy || !form.amount} onClick={() => respond('request', { amount: Number(form.amount) })}>
                          {busy === 'request' && <Loader2 className="h-4 w-4 animate-spin" />} Send
                        </button>
                      </div>
                      <p className="mt-3 text-xs text-slate-500">{data.notice}</p>
                      <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
                        <button type="button" className={ghostBtn} disabled={!!busy} onClick={() => respond('decline')}>Not interested</button>
                        <button type="button" className={ghostBtn} disabled={!!busy} onClick={() => respond('opt_out')}>Don't contact me again</button>
                      </div>
                    </Panel>
                  )}

                  {finished && (
                    <Panel title="Status">
                      <p className="text-sm text-slate-300">
                        {data.candidate.status === 'agreed' ? `You agreed terms at ${m(data.candidate.final_comp)}. The company will contact you to confirm. ${data.notice}`
                          : data.candidate.status === 'hired' ? 'The company has confirmed your engagement.'
                          : 'You have declined this role. Thank you for letting us know.'}
                      </p>
                    </Panel>
                  )}

                  <Panel title="Your CV & data">
                    <div className="flex flex-wrap items-center gap-3">
                      <label className={`${ghostBtn} cursor-pointer`}>
                        {busy === 'cv' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />} {data.candidate.has_cv ? 'Replace CV' : 'Upload CV'} (PDF or Word, 5 MB)
                        <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => onCv(e.target.files?.[0])} />
                      </label>
                      <button type="button" className={`${ghostBtn} text-rose-200`} disabled={!!busy} onClick={erase}><Trash2 className="h-4 w-4" /> Erase my data</button>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">Your contact details are stored encrypted and shared with the company only if you allow it above.</p>
                  </Panel>
                </>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
