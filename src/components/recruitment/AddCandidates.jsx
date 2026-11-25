import { useState } from 'react';
import { Loader2, Upload, UserPlus, X } from 'lucide-react';
import { recruitment, errorText } from '@/api/recruitment';
import { ErrorNote, Field, ghostBtn, inputCls, primaryBtn } from '@/components/recruitment/ui';

const EMPTY = {
  full_name: '', headline: '', country: '', city: '', specialization: '', experience_years: '', skills: '', certifications: '',
  languages: '', profile_text: '', portfolio_url: '', expected_comp: '', availability: '', email: '', phone: '',
};

export default function AddCandidates({ campaign, onClose, onDone }) {
  const [tab, setTab] = useState('manual');
  const [form, setForm] = useState(EMPTY);
  const [source, setSource] = useState('referral');
  const [basis, setBasis] = useState('legitimate_interest');
  const [sourceDetail, setSourceDetail] = useState('');
  const [csv, setCsv] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const addOne = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { email, phone, ...candidate } = form;
      await recruitment('addCandidate', { campaign_id: campaign.id, source, lawful_basis: basis, source_detail: sourceDetail, candidate: { ...candidate, contact: { email, phone } } });
      setForm(EMPTY);
      setResult({ added: 1, skipped: [] });
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const importFile = async () => {
    if (!csv) return;
    setBusy(true);
    setError('');
    try {
      const text = await csv.text();
      const r = await recruitment('importCsv', { campaign_id: campaign.id, csv: text, file_name: csv.name, source: 'company_database' });
      setResult(r);
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="my-8 w-full max-w-3xl rounded-2xl border border-white/10 bg-[#0a0f19] p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-semibold text-white">Add candidates</h2>
            <p className="mt-1 text-xs text-slate-400">Only real people from lawful sources: referrals, your own candidate database, or people who contacted you. No scraping.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-4 inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1">
          {[['manual', 'One candidate'], ['csv', 'Import CSV']].map(([key, label]) => (
            <button key={key} type="button" onClick={() => { setTab(key); setResult(null); }}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${tab === key ? 'bg-white/[0.12] text-white' : 'text-slate-400 hover:text-white'}`}>{label}</button>
          ))}
        </div>

        {tab === 'manual' ? (
          <form onSubmit={addOne} className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Source">
              <select className={inputCls} value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="referral">Referral</option><option value="company_database">Company candidate database</option><option value="manual">Contacted us directly</option>
              </select>
            </Field>
            <Field label="Lawful basis" hint="Why you may hold and use this person's details">
              <select className={inputCls} value={basis} onChange={(e) => setBasis(e.target.value)}>
                <option value="legitimate_interest">Legitimate interest</option><option value="existing_relationship">Existing relationship</option><option value="consent">The candidate consented</option>
              </select>
            </Field>
            <Field label="Source detail" className="sm:col-span-2"><input className={inputCls} value={sourceDetail} onChange={(e) => setSourceDetail(e.target.value)} placeholder="e.g. referred by Ahmed (IT team)" /></Field>
            <Field label="Full name"><input required className={inputCls} value={form.full_name} onChange={set('full_name')} /></Field>
            <Field label="Professional headline"><input className={inputCls} value={form.headline} onChange={set('headline')} /></Field>
            <Field label="Country"><input className={inputCls} value={form.country} onChange={set('country')} /></Field>
            <Field label="City"><input className={inputCls} value={form.city} onChange={set('city')} /></Field>
            <Field label="Experience (years)"><input type="number" min="0" step="0.5" className={inputCls} value={form.experience_years} onChange={set('experience_years')} /></Field>
            <Field label={`Expected pay (${campaign.currency} / ${campaign.pay_frequency.replace('ly', '').replace('dai', 'day')})`}><input type="number" min="0" step="0.01" className={inputCls} value={form.expected_comp} onChange={set('expected_comp')} /></Field>
            <Field label="Skills" className="sm:col-span-2"><input className={inputCls} value={form.skills} onChange={set('skills')} placeholder="Comma separated" /></Field>
            <Field label="Certifications"><input className={inputCls} value={form.certifications} onChange={set('certifications')} /></Field>
            <Field label="Languages"><input className={inputCls} value={form.languages} onChange={set('languages')} /></Field>
            <Field label="Profile / CV text" hint="The AI evaluates only what is written here and in the fields above." className="sm:col-span-2">
              <textarea rows={5} className={inputCls} value={form.profile_text} onChange={set('profile_text')} placeholder="Paste the candidate's experience, projects and qualifications" />
            </Field>
            <Field label="Portfolio / CV link"><input type="url" className={inputCls} value={form.portfolio_url} onChange={set('portfolio_url')} placeholder="https://" /></Field>
            <Field label="Availability"><input className={inputCls} value={form.availability} onChange={set('availability')} /></Field>
            <Field label="Email" hint="Stored encrypted"><input type="email" className={inputCls} value={form.email} onChange={set('email')} /></Field>
            <Field label="Phone" hint="Stored encrypted"><input className={inputCls} value={form.phone} onChange={set('phone')} /></Field>
            <div className="sm:col-span-2"><ErrorNote>{error}</ErrorNote></div>
            <div className="flex gap-3 sm:col-span-2">
              <button type="submit" className={primaryBtn} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Add candidate</button>
              {result && <span className="self-center text-sm text-emerald-300">Added.</span>}
            </div>
          </form>
        ) : (
          <div className="mt-5 space-y-4">
            <p className="text-sm text-slate-300">
              Upload a CSV exported from your own ATS or spreadsheet. The first row must hold column names. Recognised columns:
              <code className="ml-1 text-xs text-sky-200">full_name, email, phone, country, city, specialization, experience_years, skills, certifications, languages, profile, portfolio_url, expected_rate, availability</code>.
              Up to 500 rows; rows with problems are listed, never guessed.
            </p>
            <input type="file" accept=".csv,text/csv" onChange={(e) => setCsv(e.target.files?.[0] || null)} className="block text-sm text-slate-300 file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:text-white" />
            <ErrorNote>{error}</ErrorNote>
            <button type="button" className={primaryBtn} onClick={importFile} disabled={!csv || busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Import
            </button>
            {result && (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-sm">
                <p className="text-emerald-300">{result.added} candidates imported.</p>
                {result.skipped?.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-amber-200">{result.skipped.map((s) => <li key={s}>{s}</li>)}</ul>}
              </div>
            )}
          </div>
        )}
        <div className="mt-6 flex justify-end"><button type="button" className={ghostBtn} onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}
