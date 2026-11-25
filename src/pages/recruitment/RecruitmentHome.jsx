import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Briefcase, Filter, MapPin, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import Nav from '@/components/site/Nav';
import Footer from '@/components/site/Footer';
import SectionHeading from '@/components/site/SectionHeading';
import { recruitment, errorText } from '@/api/recruitment';
import { ErrorNote, Loading, Panel, Stat, ghostBtn, inputCls, money, primaryBtn } from '@/components/recruitment/ui';

const INTEGRATION_TONE = {
  available: 'text-emerald-300',
  limited: 'text-amber-300',
  requires_credentials: 'text-slate-400',
  requires_approval: 'text-slate-400',
};
const INTEGRATION_LABEL = {
  available: 'Working',
  limited: 'Limited',
  requires_credentials: 'Needs credentials',
  requires_approval: 'Needs partner approval',
};

export default function RecruitmentHome() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async (f = filters) => {
    setError('');
    try {
      setData(await recruitment('overview', { filters: f }));
    } catch (e) {
      setError(errorText(e));
    }
  }, [filters]);

  useEffect(() => {
    load();
    const timer = setInterval(() => load(), 15000); // live progress
    return () => clearInterval(timer);
  }, [load]);

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value || undefined }));

  const purge = async () => {
    if (!window.confirm('Delete candidate records from closed campaigns whose retention period has ended? This cannot be undone.')) return;
    setBusy(true);
    try {
      const r = await recruitment('purgeExpired');
      setNotice(`${r.removed} candidate records deleted under the retention policy.`);
      load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const t = data?.totals;

  return (
    <div className="min-h-screen bg-[#05070a] text-white">
      <Nav />
      <main className="relative pb-20 pt-28 sm:pb-28">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[26rem] overflow-hidden">
          <div className="absolute left-1/2 top-0 h-[24rem] w-[48rem] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(37,99,235,0.16),transparent_68%)]" />
        </div>
        <div className="relative mx-auto w-full max-w-6xl space-y-6 px-5 sm:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <SectionHeading
              eyebrow="AI Recruitment & Talent Sourcing Agent"
              title="Recruitment"
              highlight="campaigns"
              description="Find, evaluate, contact and negotiate with IT professionals worldwide — within the budget you approve, with consent and a full audit trail."
            />
            <div className="flex flex-wrap gap-3">
              <button type="button" className={ghostBtn} onClick={() => load()}>
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
              {data?.can_manage && (
                <Link to="/recruitment/new" className={primaryBtn}>
                  <Plus className="h-4 w-4" /> New campaign
                </Link>
              )}
            </div>
          </div>

          <ErrorNote>{error}</ErrorNote>
          {notice && <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-200">{notice}</p>}

          {!data && !error && <Loading label="Loading recruitment…" />}

          {data && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Stat label="Active campaigns" value={t.active_campaigns} hint={`${t.required} professionals required`} />
                <Stat label="Discovered" value={t.discovered} />
                <Stat label="Contacted" value={t.contacted_total} />
                <Stat label="Interested" value={t.interested} />
                <Stat label="Negotiating" value={t.negotiating} />
                <Stat label="Need your approval" value={t.awaiting_approval} tone={t.awaiting_approval ? 'text-amber-300' : 'text-white'} />
                <Stat label="Agreed terms" value={t.agreed} tone="text-emerald-300" />
                <Stat label="Hired" value={t.hired} tone="text-emerald-300" />
                <Stat label="Declined" value={t.declined} />
                <Stat label="Completion" value={`${t.completion}%`} hint="Agreed + hired vs required" />
              </div>

              <Panel
                title="Filters"
                actions={<Filter className="h-4 w-4 text-slate-500" />}
              >
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
                  <input className={inputCls} placeholder="Country" value={filters.country || ''} onChange={(e) => setFilter('country', e.target.value)} />
                  <input className={inputCls} placeholder="City" value={filters.city || ''} onChange={(e) => setFilter('city', e.target.value)} />
                  <input className={inputCls} placeholder="Specialization" value={filters.specialization || ''} onChange={(e) => setFilter('specialization', e.target.value)} />
                  <select className={inputCls} value={filters.campaign_id || ''} onChange={(e) => setFilter('campaign_id', e.target.value)}>
                    <option value="">All campaigns</option>
                    {data.campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                  <input className={inputCls} type="number" min="0" placeholder="Min years" value={filters.experience_min || ''} onChange={(e) => setFilter('experience_min', e.target.value)} />
                  <input className={inputCls} type="number" min="0" placeholder="Max years" value={filters.experience_max || ''} onChange={(e) => setFilter('experience_max', e.target.value)} />
                  <input className={inputCls} type="number" min="0" placeholder="Max pay" value={filters.comp_max || ''} onChange={(e) => setFilter('comp_max', e.target.value)} />
                </div>
              </Panel>

              <div className="grid gap-4 md:grid-cols-2">
                {data.campaigns.length === 0 && (
                  <Panel className="md:col-span-2">
                    <div className="py-8 text-center">
                      <Briefcase className="mx-auto h-8 w-8 text-sky-300" />
                      <p className="mt-3 font-heading text-lg text-white">No recruitment campaigns yet</p>
                      <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
                        Create a campaign with the role, location, skills and the budget you approve. Then add candidates from referrals, your own
                        database or the public application page.
                      </p>
                      {data.can_manage && (
                        <Link to="/recruitment/new" className={`${primaryBtn} mt-5`}>
                          <Plus className="h-4 w-4" /> Create the first campaign
                        </Link>
                      )}
                    </div>
                  </Panel>
                )}
                {data.campaigns.map((c) => (
                  <Link
                    key={c.id}
                    to={`/recruitment/${c.id}`}
                    className="group rounded-2xl border border-white/[0.07] bg-[#0a0f19] p-5 transition-colors hover:border-sky-400/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-heading text-lg font-semibold text-white">{c.title}</p>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                          <MapPin className="h-3.5 w-3.5" /> {[c.city, c.country].filter(Boolean).join(', ')} · {c.work_mode} · {c.positions_required} needed
                        </p>
                      </div>
                      <span className={`rounded-full border px-2.5 py-0.5 text-[0.68rem] font-semibold ${c.status === 'active' ? 'border-emerald-400/30 text-emerald-200' : 'border-white/10 text-slate-400'}`}>
                        {c.status}
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-slate-400">
                      Up to {money(c.max_budget, c.currency, c.pay_frequency)} · opening {money(c.initial_offer, c.currency, c.pay_frequency)}
                    </p>
                    <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-full rounded-full bg-gradient-to-r from-blue-500 via-sky-400 to-cyan-300" style={{ width: `${Math.max(2, c.completion)}%` }} />
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[0.7rem] text-slate-400">
                      <span><b className="block text-sm text-white">{c.discovered}</b>found</span>
                      <span><b className="block text-sm text-white">{c.counts.interested + c.counts.negotiating}</b>in talks</span>
                      <span><b className="block text-sm text-amber-300">{c.counts.awaiting_approval}</b>approval</span>
                      <span><b className="block text-sm text-emerald-300">{c.counts.agreed + c.counts.hired}</b>filled</span>
                    </div>
                    <p className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-sky-300">
                      Open workspace <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </p>
                  </Link>
                ))}
              </div>

              <Panel
                title="Integrations"
                description="What the agent can use today, and what still needs credentials or partner approval. Nothing is simulated: unavailable sources are simply not used."
              >
                <div className="grid gap-3 md:grid-cols-2">
                  {data.integrations.map((i) => (
                    <div key={i.key} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-white">{i.name}</p>
                        <span className={`text-[0.7rem] font-semibold ${INTEGRATION_TONE[i.status]}`}>{INTEGRATION_LABEL[i.status]}</span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-slate-400">{i.detail}</p>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel
                title="Privacy & retention"
                description="Contact details are encrypted at rest and shown to your team only when you supplied them or the candidate agreed to share them. Candidates can decline, opt out or erase their data from their personal link. Closed campaigns keep candidate records only for their retention period."
                actions={
                  data.can_manage && (
                    <button type="button" className={ghostBtn} onClick={purge} disabled={busy}>
                      <Trash2 className="h-4 w-4" /> Apply retention now
                    </button>
                  )
                }
              >
                <p className="flex items-center gap-2 text-xs text-slate-500">
                  <ShieldCheck className="h-4 w-4 text-emerald-300" /> Your role: {data.role}. {data.can_manage ? 'You can create campaigns and act on candidates.' : 'You can view campaigns; owners and admins make changes.'}
                </p>
              </Panel>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
