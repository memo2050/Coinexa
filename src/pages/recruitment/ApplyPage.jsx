import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, FileUp, Loader2, MapPin, ShieldCheck } from 'lucide-react';
import Nav from '@/components/site/Nav';
import Footer from '@/components/site/Footer';
import { recruitment, uploadCv, errorText } from '@/api/recruitment';
import { ErrorNote, Field, Loading, Panel, inputCls, money, primaryBtn } from '@/components/recruitment/ui';
import Turnstile, { captchaEnabled } from '@/components/Turnstile';

export default function ApplyPage() {
  const { slug } = useParams();
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [captcha, setCaptcha] = useState(null);
  const [captchaRound, setCaptchaRound] = useState(0);
  const [done, setDone] = useState(null);
  const [cv, setCv] = useState(null);
  const [form, setForm] = useState({
    full_name: '', headline: '', country: '', city: '', experience_years: '', skills: '', certifications: '', languages: '',
    profile_text: '', portfolio_url: '', expected_comp: '', availability: '', email: '', phone: '',
  });
  const [consents, setConsents] = useState({ data_processing: false, share_with_company: false, contact: false });
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  useEffect(() => {
    recruitment('apply_get', { slug }).then((r) => setJob(r.job)).catch((e) => setError(errorText(e)));
  }, [slug]);

  const submit = async (e) => {
    e.preventDefault();
    if (!consents.data_processing) return setError('Please agree to the processing of your information to apply.');
    setBusy(true);
    setError('');
    try {
      const { email, phone, ...candidate } = form;
      const r = await recruitment('apply_submit', { slug, consents, captcha_token: captcha, candidate: { ...candidate, contact: { email, phone } } });
      const token = r.portal_url.split('/r/')[1];
      if (cv && token) await uploadCv(token, cv).catch((err) => setError(`Application sent, but the CV upload failed: ${errorText(err)}`));
      setDone(r.portal_url);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
      setCaptchaRound((n) => n + 1);
    }
  };

  const m = (v) => money(v, job?.currency, job?.pay_frequency);

  return (
    <div className="min-h-screen bg-[#05070a] text-white">
      <Nav />
      <main className="relative pb-20 pt-28">
        <div className="mx-auto w-full max-w-3xl space-y-5 px-5 sm:px-8">
          <ErrorNote>{error}</ErrorNote>
          {!job && !error && <Loading label="Loading the position…" />}
          {job && (
            <>
              <div>
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-sky-300/90">{job.company} is hiring</p>
                <h1 className="mt-2 font-heading text-3xl font-semibold">{job.title}</h1>
                <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-400"><MapPin className="h-4 w-4" /> {[job.city, job.country].filter(Boolean).join(', ')} · {job.work_mode} · {job.positions} {job.positions > 1 ? 'positions' : 'position'}</p>
              </div>
              <Panel>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-slate-500">Offered</dt><dd className="font-heading text-xl">{m(job.offer)}</dd></div>
                  {job.duration && <div><dt className="text-xs text-slate-500">Duration</dt><dd>{job.duration}</dd></div>}
                  {job.schedule && <div><dt className="text-xs text-slate-500">Schedule</dt><dd>{job.schedule}</dd></div>}
                  {job.skills?.length > 0 && <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Skills</dt><dd>{job.skills.join(', ')}</dd></div>}
                </dl>
                {job.description && <p className="mt-4 whitespace-pre-line text-sm text-slate-300">{job.description}</p>}
              </Panel>

              {done ? (
                <Panel title="Application received">
                  <p className="flex items-start gap-2 text-sm text-emerald-200"><CheckCircle2 className="mt-0.5 h-4 w-4" /> Thank you. Keep your personal link to follow the offer, negotiate or update your details:</p>
                  <a href={done} className="mt-2 block break-all text-sm text-sky-300 underline">{done}</a>
                </Panel>
              ) : (
                <form onSubmit={submit}>
                  <Panel title="Apply">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Full name"><input required className={inputCls} value={form.full_name} onChange={set('full_name')} /></Field>
                      <Field label="Email"><input required type="email" className={inputCls} value={form.email} onChange={set('email')} /></Field>
                      <Field label="Phone"><input className={inputCls} value={form.phone} onChange={set('phone')} /></Field>
                      <Field label="Professional headline"><input className={inputCls} value={form.headline} onChange={set('headline')} /></Field>
                      <Field label="Country"><input className={inputCls} value={form.country} onChange={set('country')} /></Field>
                      <Field label="City"><input className={inputCls} value={form.city} onChange={set('city')} /></Field>
                      <Field label="Years of experience"><input type="number" min="0" step="0.5" className={inputCls} value={form.experience_years} onChange={set('experience_years')} /></Field>
                      <Field label={`Expected pay (${job.currency})`}><input type="number" min="0" step="0.01" className={inputCls} value={form.expected_comp} onChange={set('expected_comp')} /></Field>
                      <Field label="Skills" className="sm:col-span-2"><input className={inputCls} value={form.skills} onChange={set('skills')} placeholder="Comma separated" /></Field>
                      <Field label="Certifications"><input className={inputCls} value={form.certifications} onChange={set('certifications')} /></Field>
                      <Field label="Languages"><input className={inputCls} value={form.languages} onChange={set('languages')} /></Field>
                      <Field label="Experience & projects" className="sm:col-span-2" hint="Describe your relevant work. This is what the company's AI reviews.">
                        <textarea rows={5} className={inputCls} value={form.profile_text} onChange={set('profile_text')} />
                      </Field>
                      <Field label="Portfolio link"><input type="url" className={inputCls} value={form.portfolio_url} onChange={set('portfolio_url')} placeholder="https://" /></Field>
                      <Field label="Availability"><input className={inputCls} value={form.availability} onChange={set('availability')} /></Field>
                      <label className="sm:col-span-2 inline-flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                        <FileUp className="h-4 w-4" /> {cv ? cv.name : 'Attach CV (PDF or Word, up to 5 MB)'}
                        <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => setCv(e.target.files?.[0] || null)} />
                      </label>
                    </div>
                    <div className="mt-5 space-y-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                      <p className="flex items-center gap-2 text-xs font-semibold text-slate-200"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Consent</p>
                      {[
                        ['data_processing', `I agree that ${job.company} may store and use my application to consider me for this role (required).`],
                        ['share_with_company', `${job.company} may see my email, phone and CV to contact me directly.`],
                        ['contact', `${job.company} may contact me about this role.`],
                      ].map(([key, text]) => (
                        <label key={key} className="flex items-start gap-2 text-sm text-slate-300">
                          <input type="checkbox" className="mt-1" checked={consents[key]} onChange={(e) => setConsents((c) => ({ ...c, [key]: e.target.checked }))} />
                          {text}
                        </label>
                      ))}
                      <p className="text-[0.7rem] text-slate-500">Applying is not a contract. You can withdraw or erase your data at any time from the personal link you receive.</p>
                    </div>
                    <div className="mt-4"><Turnstile onToken={setCaptcha} resetKey={captchaRound} action="apply" /></div>
                    <button type="submit" className={`${primaryBtn} mt-5`} disabled={busy || (captchaEnabled && !captcha)}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Send application</button>
                  </Panel>
                </form>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
