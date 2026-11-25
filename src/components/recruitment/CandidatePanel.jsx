import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, CheckCircle2, FileText, Loader2, Mail, Send, ShieldAlert, Sparkles, Trash2, X, XCircle } from 'lucide-react';
import { recruitment, errorText } from '@/api/recruitment';
import { ErrorNote, StatusPill, ghostBtn, inputCls, money, primaryBtn, when } from '@/components/recruitment/ui';

const CRITERION_TONE = { met: 'text-emerald-300', partial: 'text-amber-300', missing: 'text-rose-300', unknown: 'text-slate-500', unverified: 'text-rose-300' };

function Section({ title, children }) {
  return (
    <div className="border-t border-white/[0.06] pt-4">
      <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-slate-400">{title}</h3>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

export default function CandidatePanel({ candidateId, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [edits, setEdits] = useState({});

  const load = useCallback(async () => {
    try {
      setData(await recruitment('getCandidate', { candidate_id: candidateId }));
    } catch (e) {
      setError(errorText(e));
    }
  }, [candidateId]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (key, action, body, confirm) => {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(key);
    setError('');
    try {
      await recruitment(action, body);
      await load();
      onChanged();
    } catch (e) {
      setError(errorText(e));
      await load();
    } finally {
      setBusy('');
    }
  };

  const c = data?.candidate;
  const campaign = data?.campaign;
  const m = (v) => money(v, campaign?.currency, campaign?.pay_frequency);
  const drafts = (data?.messages || []).filter((x) => x.status === 'draft');
  const manage = data?.can_manage;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-[#070b12] p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-heading text-xl font-semibold text-white">{c?.full_name || 'Candidate'}</p>
            {c && <p className="mt-1 text-sm text-slate-400">{[c.headline || c.specialization, [c.city, c.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <ErrorNote>{error}</ErrorNote>
        {!data && !error && <div className="flex items-center gap-2 py-10 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}

        {c && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={c.status} />
              {c.score !== null && c.score !== undefined && <span className="rounded-full border border-sky-400/25 bg-sky-400/10 px-2.5 py-0.5 text-[0.68rem] font-semibold text-sky-200">Match {c.score}/100</span>}
              {c.do_not_contact && <span className="rounded-full border border-rose-400/30 px-2.5 py-0.5 text-[0.68rem] text-rose-200">Do not contact</span>}
              <span className="text-[0.7rem] text-slate-500">Source: {c.source.replace(/_/g, ' ')}{c.source_detail ? ` — ${c.source_detail}` : ''} · basis: {c.lawful_basis.replace(/_/g, ' ')}</span>
            </div>

            {c.status === 'awaiting_approval' && manage && (
              <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-amber-200"><ShieldAlert className="h-4 w-4" /> Above your maximum — your decision</p>
                <p className="mt-1 text-xs text-amber-100/80">
                  The candidate asks {m(c.expected_comp)}. Your maximum is {m(data.negotiation.ceiling)}. The agent has not agreed to anything above it.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className={primaryBtn} disabled={!!busy} onClick={() => act('esc', 'decideEscalation', { candidate_id: c.id, approve: true },
                    `Approve ${m(c.expected_comp)} for ${c.full_name}? This is above the campaign maximum.`)}>
                    <CheckCircle2 className="h-4 w-4" /> Approve {m(c.expected_comp)}
                  </button>
                  <button type="button" className={ghostBtn} disabled={!!busy} onClick={() => act('esc', 'decideEscalation', { candidate_id: c.id, approve: false })}>
                    <XCircle className="h-4 w-4" /> Decline — keep final offer at {m(campaign.max_budget)}
                  </button>
                </div>
              </div>
            )}

            <Section title="Compensation">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div><p className="text-xs text-slate-500">Expected</p><p className="text-white">{m(c.expected_comp)}</p></div>
                <div><p className="text-xs text-slate-500">Current offer</p><p className="text-white">{m(data.negotiation.currentOffer)}</p></div>
                <div><p className="text-xs text-slate-500">Agreed</p><p className="text-emerald-300">{m(c.final_comp)}</p></div>
              </div>
              {data.offers.length > 0 && (
                <ol className="mt-3 space-y-1.5 text-xs">
                  {data.offers.map((o) => (
                    <li key={o.id} className="flex justify-between gap-3 rounded-lg bg-white/[0.02] px-3 py-1.5">
                      <span className="text-slate-300"><b className="capitalize text-white">{o.party}</b> · {o.outcome}{o.note ? ` — ${o.note}` : ''}</span>
                      <span className="shrink-0 text-slate-400">{m(o.amount)} · {when(o.created_date)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Section>

            <Section title="AI match evaluation">
              {c.score_explanation ? (
                <div className="space-y-2">
                  {c.score_explanation.summary && <p className="text-sm text-slate-300">{c.score_explanation.summary}</p>}
                  <ul className="space-y-1.5">
                    {c.score_explanation.criteria.map((k, i) => (
                      <li key={i} className="rounded-lg bg-white/[0.02] px-3 py-2 text-xs">
                        <div className="flex justify-between gap-2">
                          <span className="font-semibold text-white">{k.criterion}</span>
                          <span className={CRITERION_TONE[k.status] || 'text-slate-400'}>{k.status} · {k.score}</span>
                        </div>
                        {k.evidence && <p className="mt-1 text-slate-400">“{k.evidence}”</p>}
                        {k.note && <p className="mt-0.5 text-slate-500">{k.note}</p>}
                      </li>
                    ))}
                  </ul>
                  {c.score_explanation.unverified_claims_removed > 0 && (
                    <p className="text-xs text-amber-300">{c.score_explanation.unverified_claims_removed} claim(s) the AI could not show in the profile were scored zero.</p>
                  )}
                  {c.score_explanation.missing_information?.length > 0 && <p className="text-xs text-slate-400">Missing: {c.score_explanation.missing_information.join('; ')}</p>}
                  <p className="text-[0.68rem] text-slate-500">{c.score_explanation.method}</p>
                </div>
              ) : (
                <p className="text-xs text-slate-500">Not evaluated yet.</p>
              )}
              {manage && (
                <button type="button" className={`${ghostBtn} mt-3`} disabled={!!busy} onClick={() => act('eval', 'evaluate', { campaign_id: c.campaign_id, candidate_id: c.id })}>
                  {busy === 'eval' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {c.score_explanation ? 'Re-evaluate' : 'Evaluate with AI'}
                </button>
              )}
            </Section>

            <Section title="Profile">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div><dt className="text-slate-500">Experience</dt><dd className="text-slate-200">{c.experience_years ?? '—'} years</dd></div>
                <div><dt className="text-slate-500">Availability</dt><dd className="text-slate-200">{c.availability || '—'}</dd></div>
                <div className="col-span-2"><dt className="text-slate-500">Skills</dt><dd className="text-slate-200">{c.skills?.join(', ') || '—'}</dd></div>
                <div><dt className="text-slate-500">Certifications</dt><dd className="text-slate-200">{c.certifications?.join(', ') || '—'}</dd></div>
                <div><dt className="text-slate-500">Languages</dt><dd className="text-slate-200">{c.languages?.join(', ') || '—'}</dd></div>
              </dl>
              {c.profile_text && <p className="mt-3 whitespace-pre-line rounded-lg bg-white/[0.02] p-3 text-xs leading-relaxed text-slate-300">{c.profile_text}</p>}
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                {c.portfolio_url && <a className="text-sky-300 underline" href={c.portfolio_url} target="_blank" rel="noreferrer noopener">Portfolio</a>}
                {data.cv_url && <a className="inline-flex items-center gap-1 text-sky-300 underline" href={data.cv_url} target="_blank" rel="noreferrer noopener"><FileText className="h-3.5 w-3.5" /> CV</a>}
                {c.has_cv && !data.cv_url && <span className="text-slate-500">CV on file — shared only with the candidate’s consent</span>}
              </div>
            </Section>

            <Section title="Contact & consent">
              {c.contact ? (
                <p className="text-sm text-slate-200">{[c.contact.email, c.contact.phone].filter(Boolean).join(' · ') || '—'}</p>
              ) : (
                <p className="text-xs text-slate-400">
                  {c.contact_hint ? `On file: ${c.contact_hint}. ` : 'No contact details. '}
                  {data.contact_restricted ? 'Hidden: the candidate has not agreed to share their details with your company.' : !manage ? 'Visible to owners and admins.' : ''}
                </p>
              )}
              <ul className="mt-2 space-y-1 text-xs text-slate-400">
                {['data_processing', 'share_with_company', 'contact'].map((k) => (
                  <li key={k}>
                    {k.replace(/_/g, ' ')}: {data.consents[k] ? `${data.consents[k].granted ? 'yes' : 'no'} (${data.consents[k].source}, ${when(data.consents[k].recorded_at)})` : 'not recorded'}
                  </li>
                ))}
              </ul>
            </Section>

            <Section title="Messages">
              {data.messages.filter((x) => x.status !== 'draft').map((msg) => (
                <div key={msg.id} className="mb-2 rounded-lg bg-white/[0.02] p-3 text-xs">
                  <p className="text-slate-400">
                    {msg.direction === 'out' ? 'To candidate' : 'From candidate'} · {msg.channel} · {msg.status}
                    {msg.attempts > 1 ? ` (${msg.attempts} attempts)` : ''} · {when(msg.sent_at || msg.created_date)}
                  </p>
                  {msg.subject && <p className="mt-1 font-semibold text-white">{msg.subject}</p>}
                  <p className="mt-1 whitespace-pre-line text-slate-300">{msg.body}</p>
                  {msg.error && <p className="mt-1 text-rose-300">{msg.error}</p>}
                </div>
              ))}
              {drafts.map((d) => (
                <div key={d.id} className="mb-3 rounded-xl border border-sky-400/25 bg-sky-400/[0.04] p-3">
                  <p className="text-xs font-semibold text-sky-200">Draft — waiting for your approval</p>
                  <input className={`${inputCls} mt-2`} value={edits[d.id]?.subject ?? d.subject} onChange={(e) => setEdits((p) => ({ ...p, [d.id]: { ...p[d.id], subject: e.target.value } }))} />
                  <textarea rows={9} className={`${inputCls} mt-2 text-xs`} value={edits[d.id]?.body ?? d.body} onChange={(e) => setEdits((p) => ({ ...p, [d.id]: { ...p[d.id], body: e.target.value } }))} />
                  <p className="mt-1 text-[0.68rem] text-slate-500">Keep the {'{{portal_link}}'} line: it becomes the candidate’s personal link to respond, negotiate or opt out.</p>
                  {manage && (
                    <div className="mt-2 flex gap-2">
                      <button type="button" className={primaryBtn} disabled={!!busy} onClick={() => act(`send-${d.id}`, 'sendMessage', { message_id: d.id, subject: edits[d.id]?.subject, body: edits[d.id]?.body })}>
                        {busy === `send-${d.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Approve & send
                      </button>
                      <button type="button" className={ghostBtn} disabled={!!busy} onClick={() => act(`disc-${d.id}`, 'discardMessage', { message_id: d.id })}>Discard</button>
                    </div>
                  )}
                </div>
              ))}
              {manage && !c.do_not_contact && !['hired', 'declined', 'withdrawn'].includes(c.status) && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={ghostBtn} disabled={!!busy} onClick={() => act('draft', 'draftMessage', { candidate_id: c.id, kind: c.last_contacted_at ? 'follow_up' : 'outreach' })}>
                    {busy === 'draft' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Draft {c.last_contacted_at ? 'follow-up' : 'outreach'} with AI
                  </button>
                </div>
              )}
            </Section>

            {manage && (
              <Section title="Actions">
                <div className="flex flex-wrap gap-2">
                  {c.status === 'agreed' && (
                    <button type="button" className={primaryBtn} disabled={!!busy} onClick={() => act('hire', 'setCandidateStatus', { candidate_id: c.id, status: 'hired' },
                      `Mark ${c.full_name} as hired? Do this only once the employment or contractor agreement is actually in place.`)}>
                      <BadgeCheck className="h-4 w-4" /> Mark as hired
                    </button>
                  )}
                  {!['withdrawn', 'hired'].includes(c.status) && (
                    <button type="button" className={ghostBtn} disabled={!!busy} onClick={() => act('wd', 'setCandidateStatus', { candidate_id: c.id, status: 'withdrawn' })}>Withdraw</button>
                  )}
                  {!c.do_not_contact && (
                    <button type="button" className={ghostBtn} disabled={!!busy} onClick={() => act('dnc', 'setCandidateStatus', { candidate_id: c.id, status: 'do_not_contact' })}>Do not contact</button>
                  )}
                  <button type="button" className={`${ghostBtn} text-rose-200`} disabled={!!busy} onClick={async () => {
                    if (!window.confirm(`Permanently delete ${c.full_name} and all messages, offers and consent records? This cannot be undone.`)) return;
                    setBusy('del');
                    try { await recruitment('deleteCandidate', { candidate_id: c.id }); onChanged(); onClose(); } catch (e) { setError(errorText(e)); setBusy(''); }
                  }}>
                    <Trash2 className="h-4 w-4" /> Delete permanently
                  </button>
                </div>
              </Section>
            )}

            <Section title="History">
              <ul className="space-y-1 text-xs text-slate-400">
                {data.events.map((e) => (
                  <li key={e.id} className={e.level === 'error' ? 'text-rose-300' : e.level === 'warning' ? 'text-amber-200' : ''}>{when(e.created_date)} — {e.detail}</li>
                ))}
              </ul>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}
