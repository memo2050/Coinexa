import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Download, Loader2, Pause, Play, Send, Sparkles, Square, UserPlus } from 'lucide-react';
import Nav from '@/components/site/Nav';
import Footer from '@/components/site/Footer';
import { recruitment, errorText, downloadText } from '@/api/recruitment';
import { ErrorNote, Loading, Panel, Stat, StatusPill, STATUS, ghostBtn, inputCls, money, primaryBtn, when } from '@/components/recruitment/ui';
import AddCandidates from '@/components/recruitment/AddCandidates';
import CandidatePanel from '@/components/recruitment/CandidatePanel';
import CampaignForm from '@/components/recruitment/CampaignForm';

const STAGES = ['sourced', 'evaluated', 'contacted', 'interested', 'negotiating', 'awaiting_approval', 'agreed', 'hired', 'declined'];

export default function RecruitmentCampaign() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState('candidates');
  const [busy, setBusy] = useState('');
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState({ status: '', q: '', minScore: '' });

  const load = useCallback(async () => {
    try {
      setData(await recruitment('getCampaign', { campaign_id: id }));
      setError('');
    } catch (e) {
      setError(errorText(e));
    }
  }, [id]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 10000); // real-time progress
    return () => clearInterval(timer);
  }, [load]);

  const run = async (key, fn) => {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy('');
    }
  };

  const campaign = data?.campaign;
  const m = (v) => money(v, campaign?.currency, campaign?.pay_frequency);

  const candidates = useMemo(() => {
    const q = filter.q.toLowerCase();
    return (data?.candidates || []).filter((c) =>
      (!filter.status || c.status === filter.status) &&
      (!filter.minScore || (c.score ?? -1) >= Number(filter.minScore)) &&
      (!q || `${c.full_name} ${c.city} ${c.country} ${(c.skills || []).join(' ')}`.toLowerCase().includes(q)));
  }, [data, filter]);

  const evaluateNext = () => run('eval', async () => {
    const r = await recruitment('evaluate', { campaign_id: id });
    setNotice(`${r.evaluated.length} evaluated${r.remaining ? `, ${r.remaining} still to evaluate` : ''}.${r.errors.length ? ` Problems: ${r.errors.join('; ')}` : ''}`);
  });
  const contactQualified = () => run('contact', async () => {
    const r = await recruitment('contactQualified', { campaign_id: id });
    setNotice(`${r.sent.length} of ${r.eligible} qualified candidates emailed.${r.errors.length ? ` Problems: ${r.errors.join('; ')}` : ''}`);
  });
  const report = () => run('report', async () => {
    const r = await recruitment('report', { campaign_id: id });
    downloadText(r.file_name, r.csv);
    setNotice(`Report downloaded: ${r.summary.hired} hired, ${r.summary.agreed} agreed to compensation (not hired yet), ${r.summary.interested} interested — ${r.summary.required} required.`);
  });
  const setStatus = (status) => run(`status-${status}`, () => recruitment('updateCampaign', { campaign_id: id, campaign: { status } }));
  const copyLink = async () => {
    await navigator.clipboard.writeText(campaign.apply_url).catch(() => {});
    setNotice('Application link copied.');
  };

  const counts = data?.counts || {};
  const filled = (counts.agreed || 0) + (counts.hired || 0);

  return (
    <div className="min-h-screen bg-[#05070a] text-white">
      <Nav />
      <main className="relative pb-20 pt-28 sm:pb-28">
        <div className="relative mx-auto w-full max-w-6xl space-y-6 px-5 sm:px-8">
          <Link to="/recruitment" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> All campaigns</Link>
          <ErrorNote>{error}</ErrorNote>
          {notice && <p className="rounded-xl border border-sky-400/25 bg-sky-500/10 px-4 py-2.5 text-sm text-sky-100">{notice}</p>}
          {!data && !error && <Loading label="Loading campaign…" />}

          {campaign && (
            <>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-sky-300/90">Recruitment campaign · {campaign.status}</p>
                  <h1 className="mt-2 font-heading text-3xl font-semibold">{campaign.title}</h1>
                  <p className="mt-2 text-sm text-slate-400">
                    {campaign.positions_required} needed · {[campaign.city, campaign.country].filter(Boolean).join(', ')} · {campaign.work_mode}
                    {campaign.duration ? ` · ${campaign.duration}` : ''} · opening {m(campaign.initial_offer)}, maximum {m(campaign.max_budget)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={ghostBtn} onClick={report} disabled={!!busy}>{busy === 'report' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Final report</button>
                  {data.can_manage && campaign.status === 'active' && <button type="button" className={ghostBtn} onClick={() => setStatus('paused')} disabled={!!busy}><Pause className="h-4 w-4" /> Pause</button>}
                  {data.can_manage && campaign.status === 'paused' && <button type="button" className={ghostBtn} onClick={() => setStatus('active')} disabled={!!busy}><Play className="h-4 w-4" /> Resume</button>}
                  {data.can_manage && campaign.status !== 'closed' && (
                    <button type="button" className={ghostBtn} disabled={!!busy} onClick={() => window.confirm('Close this campaign? Candidates can no longer respond; data is kept for the retention period.') && setStatus('closed')}>
                      <Square className="h-4 w-4" /> Close
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
                {STAGES.map((s) => <Stat key={s} label={STATUS[s].label} value={counts[s] || 0} tone={s === 'awaiting_approval' && counts[s] ? 'text-amber-300' : ['agreed', 'hired'].includes(s) ? 'text-emerald-300' : 'text-white'} />)}
              </div>
              <div>
                <div className="flex justify-between text-xs text-slate-400"><span>Progress: {filled} of {campaign.positions_required} filled (agreed or hired)</span><span>{Math.min(100, Math.round((filled / campaign.positions_required) * 100))}%</span></div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-500 via-sky-400 to-cyan-300" style={{ width: `${Math.max(2, Math.min(100, (filled / campaign.positions_required) * 100))}%` }} />
                </div>
              </div>

              <div className="inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1">
                {[['candidates', 'Candidates'], ['sourcing', 'Sourcing'], ['activity', 'Activity'], ...(data.can_manage ? [['settings', 'Settings']] : [])].map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setTab(key)} className={`rounded-full px-4 py-1.5 text-xs font-semibold ${tab === key ? 'bg-white/[0.12] text-white' : 'text-slate-400 hover:text-white'}`}>{label}</button>
                ))}
              </div>

              {tab === 'candidates' && (
                <Panel
                  title="Candidates"
                  description="Ranked by AI match score. Open a candidate for the evidence behind the score, negotiation history, messages and consent."
                  actions={data.can_manage && (
                    <>
                      <button type="button" className={ghostBtn} onClick={() => setAdding(true)}><UserPlus className="h-4 w-4" /> Add</button>
                      <button type="button" className={ghostBtn} onClick={evaluateNext} disabled={!!busy}>{busy === 'eval' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Evaluate next 5</button>
                      {campaign.outreach_mode === 'auto' && (
                        <button type="button" className={primaryBtn} onClick={contactQualified} disabled={!!busy}>{busy === 'contact' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Contact top matches</button>
                      )}
                    </>
                  )}
                >
                  {data.drafts.length > 0 && <p className="mb-3 text-xs text-sky-200">{data.drafts.length} message draft(s) waiting for your approval — open the candidate to review and send.</p>}
                  <div className="mb-3 grid gap-2 sm:grid-cols-3">
                    <input className={inputCls} placeholder="Search name, city, skill" value={filter.q} onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))} />
                    <select className={inputCls} value={filter.status} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}>
                      <option value="">All stages</option>
                      {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <input className={inputCls} type="number" min="0" max="100" placeholder="Minimum score" value={filter.minScore} onChange={(e) => setFilter((f) => ({ ...f, minScore: e.target.value }))} />
                  </div>
                  {candidates.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-400">
                      {data.candidates.length ? 'No candidates match these filters.' : 'No candidates yet. Add referrals, import your candidate database, or share the application link (Sourcing tab).'}
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px] text-left text-sm">
                        <thead className="text-[0.66rem] uppercase tracking-[0.14em] text-slate-500">
                          <tr><th className="py-2">Candidate</th><th>Location</th><th>Exp.</th><th>Score</th><th>Expected</th><th>Agreed</th><th>Stage</th><th>Source</th></tr>
                        </thead>
                        <tbody>
                          {candidates.map((c) => (
                            <tr key={c.id} onClick={() => setOpen(c.id)} className="cursor-pointer border-t border-white/[0.05] hover:bg-white/[0.03]">
                              <td className="py-2.5"><p className="font-semibold text-white">{c.full_name}</p><p className="text-xs text-slate-500">{c.headline || c.specialization || ''}</p></td>
                              <td className="text-xs text-slate-300">{[c.city, c.country].filter(Boolean).join(', ') || '—'}</td>
                              <td className="text-xs text-slate-300">{c.experience_years ?? '—'}</td>
                              <td className="text-xs">{c.score ?? <span className="text-slate-500">—</span>}</td>
                              <td className="text-xs text-slate-300">{c.expected_comp ? m(c.expected_comp) : '—'}</td>
                              <td className="text-xs text-emerald-300">{c.final_comp ? m(c.final_comp) : '—'}</td>
                              <td><StatusPill status={c.status} /></td>
                              <td className="text-xs text-slate-500">{c.source.replace(/_/g, ' ')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Panel>
              )}

              {tab === 'sourcing' && (
                <div className="grid gap-4 md:grid-cols-2">
                  <Panel title="Public application page" description="Share this link on job boards, your website or with your network. Applicants give consent and can upload a CV.">
                    <div className="flex gap-2">
                      <input readOnly className={inputCls} value={campaign.apply_url} />
                      <button type="button" className={ghostBtn} onClick={copyLink}><Copy className="h-4 w-4" /></button>
                    </div>
                    <a href={campaign.apply_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-sky-300 underline">Preview the page</a>
                  </Panel>
                  <Panel title="Referrals & company database" description="Add people your team refers or who are already in your own candidate database, one at a time or by CSV export.">
                    {data.can_manage && <button type="button" className={primaryBtn} onClick={() => setAdding(true)}><UserPlus className="h-4 w-4" /> Add candidates</button>}
                  </Panel>
                  <Panel title="LinkedIn" className="md:col-span-2" description="Searching LinkedIn requires LinkedIn Talent Solutions partner access (Recruiter System Connect) for your company. Coinexa does not scrape LinkedIn or automate LinkedIn accounts. Until access is approved, add LinkedIn profiles you find yourself as referrals or company-database candidates, with the profile text pasted in." />
                </div>
              )}

              {tab === 'activity' && (
                <Panel title="Execution history" description="Every step the agent and your team took, newest first. Errors and retries are shown as they happened.">
                  <ul className="space-y-1.5 text-sm">
                    {data.events.map((e) => (
                      <li key={e.id} className={`rounded-lg px-3 py-2 ${e.level === 'error' ? 'bg-rose-500/10 text-rose-200' : e.level === 'warning' ? 'bg-amber-500/10 text-amber-100' : 'bg-white/[0.02] text-slate-300'}`}>
                        <span className="text-xs text-slate-500">{when(e.created_date)}</span> — {e.detail}
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}

              {tab === 'settings' && (
                <CampaignForm
                  initial={campaign}
                  submitLabel="Save settings"
                  onSubmit={async (form) => {
                    await recruitment('updateCampaign', { campaign_id: id, campaign: form });
                    await load();
                    setNotice('Settings saved.');
                    setTab('candidates');
                  }}
                />
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
      {adding && campaign && <AddCandidates campaign={campaign} onClose={() => setAdding(false)} onDone={load} />}
      {open && <CandidatePanel candidateId={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}
