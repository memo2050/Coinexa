// AI Recruitment & Talent Sourcing Agent — server side.
//
// One function, two audiences:
//   • signed-in company users (workspace members): campaigns, candidates, AI
//     evaluation, outreach, negotiation decisions, reports, retention;
//   • candidates (no account): the portal (/r/<token>) and the public application
//     page (/apply/<slug>), authorised only by an unguessable link.
//
// Rules that hold everywhere:
//   • every read and write is scoped to the caller's workspace (organization_id);
//     the tables have no browser access at all, so this function is the only door;
//   • writes need a workspace owner or admin; members can view (contacts masked);
//   • amounts come from the negotiation engine and can never exceed the authorised
//     ceiling; anything above it waits for the company;
//   • nothing is invented: no sample candidates, no simulated sends or replies.
import { serveBase44 } from '../_shared/http.ts';
import { createClientFromRequest, service } from '../_shared/base44shim.ts';
import { ensureOrganization, membershipFor, canManage } from '../_shared/tenancy.ts';
import { requestContext } from '../_shared/context.ts';
import {
  negotiate, validateTerms, wordingWithinLimit, verifyEvidence, weightedScore, maskEmail, maskPhone,
  EMAIL_RE, encryptJson, decryptJson, newPortalToken, sha256, parseCsv, toCsv, listFrom,
  type NegotiationTerms, type Strategy,
} from '../_shared/recruitmentLogic.ts';
import * as iv from './interviews.ts';
import { reserve as reserveUsage, attachCurrent, planRow, featuredSubject } from '../_shared/agentBilling.ts';

const db = () => service();
const env = (name: string, fallback = '') => Deno.env.get(name) || fallback;
const appUrl = () => env('APP_URL').replace(/\/$/, '');
const fail = (message: string, status = 400) => Object.assign(new Error(message), { status });
const clean = (value: unknown, max = 200) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const num = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const CONSENT_VERSION = 'recruitment-consent-v1';
const PORTAL_DAYS = 30;
const DAILY_EMAIL_CAP = 50;

type Row = Record<string, any>;

// ------------------------------------------------------------------ helpers --

async function must<T>(promise: PromiseLike<{ data: T; error: any }>): Promise<T> {
  const { data, error } = await promise;
  if (error) throw fail(error.message, 500);
  return data;
}

async function event(orgId: string, kind: string, detail: string, extra: Row = {}) {
  await db().from('recruitment_events').insert({ organization_id: orgId, kind, detail: detail.slice(0, 600), ...extra });
}

async function audit(orgId: string, user: Row | null, action: string, targetType: string, targetId: string, detail: string) {
  await db().from('audit_logs').insert({
    organization_id: orgId, actor_id: user?.id || '', actor_email: user?.email || '',
    action, target_type: targetType, target_id: targetId, detail: detail.slice(0, 400),
  });
}

function dataKey() {
  const key = env('RECRUITMENT_DATA_KEY');
  if (!key) throw fail('Secure storage for candidate contact details is not configured yet.', 503);
  return key;
}

async function readContact(candidate: Row): Promise<{ email?: string; phone?: string }> {
  if (!candidate.contact_enc) return {};
  return (await decryptJson(candidate.contact_enc, dataKey())) || {};
}

async function writeContact(contact: { email?: string; phone?: string }) {
  const email = clean(contact.email, 160).toLowerCase();
  const phone = clean(contact.phone, 40);
  if (email && !EMAIL_RE.test(email)) throw fail('Enter a valid email address.');
  if (!email && !phone) return { contact_enc: null, contact_hint: null };
  return {
    contact_enc: await encryptJson({ ...(email ? { email } : {}), ...(phone ? { phone } : {}) }, dataKey()),
    contact_hint: [email ? maskEmail(email) : '', phone ? maskPhone(phone) : ''].filter(Boolean).join(' · '),
  };
}

async function latestConsents(candidateId: string) {
  const rows = await must(db().from('recruitment_consents').select('kind, granted, recorded_at, source, text_version')
    .eq('candidate_id', candidateId).order('recorded_at', { ascending: false }));
  const out: Record<string, Row> = {};
  for (const row of rows as Row[]) if (!out[row.kind]) out[row.kind] = row;
  return out;
}

// Contact details reach the company only when it supplied them itself, or the
// candidate agreed to share them.
function contactShareable(candidate: Row, consents: Record<string, Row>) {
  if (['manual', 'csv_import', 'company_database', 'referral'].includes(candidate.source)) return true;
  return consents.share_with_company?.granted === true;
}

const termsOf = (c: Row): NegotiationTerms => ({
  initialOffer: Number(c.initial_offer), maxBudget: Number(c.max_budget),
  strategy: c.negotiation_strategy as Strategy, maxRounds: Number(c.max_rounds),
});

async function negotiationState(candidateId: string, campaign: Row) {
  const offers = await must(db().from('recruitment_offers').select('*').eq('candidate_id', candidateId).order('created_date')) as Row[];
  const agentOffers = offers.filter((o) => (o.party === 'agent' || o.party === 'company') && ['offer', 'counter'].includes(o.outcome));
  const approved = offers.filter((o) => o.outcome === 'approved').map((o) => Number(o.amount));
  return {
    offers,
    state: {
      round: offers.filter((o) => o.party === 'agent' && o.outcome === 'counter').length,
      currentOffer: agentOffers.length ? Number(agentOffers[agentOffers.length - 1].amount) : Number(campaign.initial_offer),
      approvedCeiling: approved.length ? Math.max(...approved) : null,
    },
  };
}

const fmtMoney = (amount: number, campaign: Row) =>
  `${new Intl.NumberFormat('en-US', { style: 'currency', currency: campaign.currency, maximumFractionDigits: 2 }).format(amount)} per ${
    { hourly: 'hour', daily: 'day', monthly: 'month' }[campaign.pay_frequency as string]
  }`;

// ------------------------------------------------------------------- email --

const escapeHtml = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function sendEmail(to: string, subject: string, text: string) {
  const key = env('RESEND_API_KEY');
  if (!key) throw fail('Email is not configured (RESEND_API_KEY).', 503);
  const redirect = env('EMAIL_REDIRECT_TO');
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111">${text
    .split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')}</p>`).join('')}</div>`;
  let lastError = '';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: env('EMAIL_FROM', 'Coinexa <onboarding@resend.dev>'),
          to: [redirect || to],
          subject: (redirect ? `[staging → ${to}] ` : '') + subject.replace(/[\r\n]+/g, ' ').slice(0, 180),
          text, html,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) return { attempts: attempt };
      lastError = `Email provider refused the message (${res.status}) ${(await res.text()).slice(0, 160)}`;
      if (res.status < 500 && res.status !== 429) break; // not retryable
    } catch (error) {
      lastError = (error as Error).message;
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 800));
  }
  throw Object.assign(fail(lastError || 'Email failed.', 502), { attempts: 3 });
}

// ---------------------------------------------------------- sourcing sources --

// Integration-ready registry. Only sources that work today are marked available;
// the others state exactly what is needed. No scraping and no account automation.
function integrations() {
  const emailReady = Boolean(env('RESEND_API_KEY'));
  const ownDomain = !/resend\.dev/.test(env('EMAIL_FROM', 'resend.dev'));
  return [
    { key: 'manual', group: 'sourcing', name: 'Manual entry & referrals', status: 'available', detail: 'Add candidates your team or employees refer, with the lawful basis recorded.' },
    { key: 'csv', group: 'sourcing', name: 'Company candidate database (CSV import)', status: 'available', detail: 'Import an export from your own ATS or spreadsheet (up to 500 rows per file).' },
    { key: 'apply', group: 'sourcing', name: 'Public application page', status: 'available', detail: 'Share the campaign link; candidates apply with consent and upload a CV.' },
    { key: 'cv_import', group: 'sourcing', name: 'CV files (PDF import)', status: 'available', detail: 'Upload up to 5 PDF CVs at a time; the agent reads each CV and creates the candidate from what it actually says.' },
    { key: 'ats', group: 'sourcing', name: 'ATS connectors (Greenhouse, Lever, Workable)', status: 'requires_credentials', detail: 'Adapter slot is ready; needs your ATS API key and a connector build. Use CSV import meanwhile.' },
    { key: 'email', group: 'communication', name: 'Email (Resend)', status: emailReady ? (ownDomain ? 'available' : 'limited') : 'requires_credentials',
      detail: !emailReady ? 'Add RESEND_API_KEY.' : ownDomain ? 'Sending from your verified domain.'
        : 'Test sender only: until a company domain is verified in Resend, mail is delivered only to the account owner (staging sends everything to the owner).' },
    { key: 'portal', group: 'communication', name: 'Candidate response portal', status: 'available', detail: 'Secure personal link per candidate: review, accept, counter, consent, CV upload, data deletion.' },
    { key: 'interviews', group: 'communication', name: 'Written AI interviews', status: 'available', detail: 'Text-only interview in the candidate portal, from a question plan you approve; scored with quoted evidence and sent to your hiring manager.' },
    { key: 'whatsapp', group: 'communication', name: 'WhatsApp / SMS', status: 'requires_credentials', detail: 'Needs a WhatsApp Business or SMS provider account; not connected.' },
  ];
}

// --------------------------------------------------------------- AI helpers --

async function invokeAI(base44: Row, args: Row) {
  try {
    return await base44.asServiceRole.integrations.Core.InvokeLLM(args);
  } catch (error) {
    if ((error as { status?: number }).status === 429) throw error; // budget or rate limit: do not retry
    return await base44.asServiceRole.integrations.Core.InvokeLLM(args); // one retry
  }
}

function profileText(c: Row) {
  return [
    c.full_name, c.headline, c.specialization,
    c.experience_years !== null && c.experience_years !== undefined ? `${c.experience_years} years of experience` : '',
    c.country, c.city, (c.skills || []).join(', '), (c.certifications || []).join(', '), (c.languages || []).join(', '),
    c.availability, c.profile_text, c.cv_text ? `CV:\n${String(c.cv_text).slice(0, 6000)}` : '',
  ].filter(Boolean).join('\n');
}

function ruleCriteria(campaign: Row, c: Row) {
  const out: Row[] = [];
  const sameCountry = c.country && campaign.country && c.country.toLowerCase() === campaign.country.toLowerCase();
  const sameCity = !campaign.city || (c.city && c.city.toLowerCase() === campaign.city.toLowerCase());
  if (campaign.work_mode !== 'remote') {
    out.push({ criterion: 'Location', weight: 1, source: 'rule',
      score: !c.country ? 0 : sameCountry && sameCity ? 100 : sameCountry ? 60 : 10,
      status: !c.country ? 'unknown' : sameCountry && sameCity ? 'met' : sameCountry ? 'partial' : 'missing',
      evidence: [c.city, c.country].filter(Boolean).join(', '), note: `Required: ${[campaign.city, campaign.country].filter(Boolean).join(', ')}` });
  }
  if (campaign.experience_min !== null || campaign.experience_max !== null) {
    const y = num(c.experience_years);
    const min = num(campaign.experience_min) ?? 0;
    const max = num(campaign.experience_max) ?? Infinity;
    out.push({ criterion: 'Experience range', weight: 1.5, source: 'rule',
      score: y === null ? 0 : y >= min && y <= max ? 100 : y > max ? 70 : Math.max(0, Math.round(100 * (y / Math.max(min, 1)))),
      status: y === null ? 'unknown' : y >= min && y <= max ? 'met' : 'partial',
      evidence: y === null ? '' : `${y} years`, note: `Required: ${min}–${Number.isFinite(max) ? max : 'any'} years` });
  }
  const ask = num(c.expected_comp);
  out.push({ criterion: 'Compensation fit', weight: 1, source: 'rule',
    score: ask === null ? 0 : ask <= Number(campaign.max_budget) ? 100 : Math.max(0, Math.round(100 - ((ask - Number(campaign.max_budget)) / Number(campaign.max_budget)) * 200)),
    status: ask === null ? 'unknown' : ask <= Number(campaign.max_budget) ? 'met' : 'partial',
    evidence: ask === null ? '' : fmtMoney(ask, campaign), note: `Budget up to ${fmtMoney(Number(campaign.max_budget), campaign)}` });
  return out;
}

const EVAL_SCHEMA = {
  type: 'object',
  properties: {
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          criterion: { type: 'string' },
          weight: { type: 'number' },
          score: { type: 'number' },
          status: { type: 'string', enum: ['met', 'partial', 'missing', 'unknown'] },
          evidence: { type: 'string', description: 'Exact words copied from the candidate profile; empty if there is none.' },
          note: { type: 'string' },
        },
        required: ['criterion', 'score', 'status', 'evidence'],
      },
    },
    summary: { type: 'string' },
    concerns: { type: 'array', items: { type: 'string' } },
    missing_information: { type: 'array', items: { type: 'string' } },
  },
  required: ['criteria', 'summary'],
};

async function evaluateOne(base44: Row, campaign: Row, candidate: Row) {
  const source = profileText(candidate);
  const prompt = `You assess one candidate for a job using ONLY the candidate profile below. Never assume or invent experience, skills, employers, certifications or language ability.
For each requirement, copy the exact supporting words from the profile into "evidence" (a short quote, verbatim). If the profile does not show it, set status "unknown" and leave evidence empty.
Score each requirement 0-100. Do not consider age, gender, nationality, religion, health, family status, photos or any other protected attribute.

JOB: ${campaign.title}${campaign.specialization ? ` (${campaign.specialization})` : ''}
Required technical skills: ${(campaign.skills || []).join(', ') || 'not specified'}
Certifications / qualifications: ${(campaign.certifications || []).join(', ') || 'none required'}
Languages: ${(campaign.languages || []).join(', ') || 'not specified'}
Availability needed: ${campaign.availability || 'not specified'}; schedule: ${campaign.schedule || 'not specified'}; duration: ${campaign.duration || 'not specified'}
Description: ${campaign.description || ''}

Make one criterion per required skill, one for certifications (if any), one for languages (if any), one for relevant project experience and one for availability.

CANDIDATE PROFILE:
"""
${source.slice(0, 8000)}
"""`;
  const result = await invokeAI(base44, { prompt, response_json_schema: EVAL_SCHEMA });
  const parsed = typeof result === 'string' ? JSON.parse(result) : result || {};
  const ai = (parsed.criteria || []).slice(0, 15).map((c: Row) => ({
    criterion: clean(c.criterion, 120), weight: Math.min(3, Math.max(0.5, Number(c.weight) || 1)),
    score: Math.max(0, Math.min(100, Number(c.score) || 0)), status: c.status, evidence: clean(c.evidence, 300), note: clean(c.note, 300), source: 'ai',
  }));
  const { criteria: verified, removed } = verifyEvidence(ai, source);
  const criteria = [...verified, ...ruleCriteria(campaign, candidate)];
  return {
    score: weightedScore(criteria as { score: number; weight?: number }[]),
    explanation: {
      summary: clean(parsed.summary, 800),
      criteria,
      concerns: listFrom(parsed.concerns, 8),
      missing_information: listFrom(parsed.missing_information, 8),
      unverified_claims_removed: removed,
      method: 'AI assessment of the candidate’s own profile text; every quoted piece of evidence is checked against that text and unverifiable claims score zero. Location, experience and pay are checked by fixed rules.',
    },
  };
}

// --------------------------------------------------------- company context --

async function companyContext(req: Request) {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch(() => null) as Row | null;
  if (!user) throw fail('Please sign in.', 401);
  const { organization } = await ensureOrganization({ base44, user });
  if (!organization) throw fail('No workspace is available.', 500);
  const membership = await membershipFor({ base44, user, organizationId: organization.id });
  const ctx = requestContext.getStore();
  if (ctx) ctx.organizationId = organization.id;
  return { base44, user, org: organization as Row, manage: canManage(membership), role: membership?.member_role || 'member' };
}

const requireManage = (manage: boolean) => {
  if (!manage) throw fail('Only a workspace owner or admin can do that.', 403);
};

async function campaignFor(orgId: string, id: string) {
  const row = await must(db().from('recruitment_campaigns').select('*').eq('id', clean(id, 80)).eq('organization_id', orgId).maybeSingle());
  if (!row) throw fail('Campaign not found.', 404);
  return row as Row;
}

async function candidateFor(orgId: string, id: string) {
  const row = await must(db().from('recruitment_candidates').select('*').eq('id', clean(id, 80)).eq('organization_id', orgId).maybeSingle());
  if (!row) throw fail('Candidate not found.', 404);
  return row as Row;
}

function campaignInput(body: Row, existing: Row | null = null) {
  const pick = (key: string, max = 200) => (body[key] !== undefined ? clean(body[key], max) : existing?.[key] ?? '');
  const data: Row = {
    title: pick('title', 160),
    specialization: pick('specialization', 160),
    country: pick('country', 80),
    city: pick('city', 80),
    positions_required: Math.round(num(body.positions_required) ?? existing?.positions_required ?? 1),
    skills: body.skills !== undefined ? listFrom(body.skills) : existing?.skills || [],
    certifications: body.certifications !== undefined ? listFrom(body.certifications) : existing?.certifications || [],
    languages: body.languages !== undefined ? listFrom(body.languages, 10) : existing?.languages || [],
    experience_min: body.experience_min !== undefined ? num(body.experience_min) : existing?.experience_min ?? null,
    experience_max: body.experience_max !== undefined ? num(body.experience_max) : existing?.experience_max ?? null,
    work_mode: ['onsite', 'remote', 'hybrid'].includes(body.work_mode) ? body.work_mode : existing?.work_mode || 'onsite',
    schedule: pick('schedule', 200),
    availability: pick('availability', 200),
    duration: pick('duration', 120),
    description: pick('description', 6000),
    currency: (clean(body.currency, 3) || existing?.currency || 'USD').toUpperCase(),
    pay_frequency: ['hourly', 'daily', 'monthly'].includes(body.pay_frequency) ? body.pay_frequency : existing?.pay_frequency || 'daily',
    initial_offer: num(body.initial_offer) ?? existing?.initial_offer,
    max_budget: num(body.max_budget) ?? existing?.max_budget,
    negotiation_strategy: ['conservative', 'balanced', 'flexible'].includes(body.negotiation_strategy) ? body.negotiation_strategy : existing?.negotiation_strategy || 'balanced',
    max_rounds: Math.round(num(body.max_rounds) ?? existing?.max_rounds ?? 3),
    outreach_mode: body.outreach_mode === 'auto' ? 'auto' : body.outreach_mode === 'approval' ? 'approval' : existing?.outreach_mode || 'approval',
    auto_contact_min_score: Math.round(num(body.auto_contact_min_score) ?? existing?.auto_contact_min_score ?? 70),
    retention_days: Math.round(num(body.retention_days) ?? existing?.retention_days ?? 180),
    hiring_manager_name: pick('hiring_manager_name', 120),
    hiring_manager_email: (body.hiring_manager_email !== undefined ? clean(body.hiring_manager_email, 160) : existing?.hiring_manager_email || '').toLowerCase(),
  };
  if (data.hiring_manager_email && !EMAIL_RE.test(data.hiring_manager_email)) throw fail('Enter a valid hiring manager email.');
  if (!data.title) throw fail('Give the campaign a job title.');
  if (!data.country) throw fail('Choose the country.');
  if (!/^[A-Z]{3}$/.test(data.currency)) throw fail('Use a three-letter currency code such as USD or EGP.');
  if (!(data.positions_required >= 1 && data.positions_required <= 500)) throw fail('Positions must be between 1 and 500.');
  if (data.experience_min !== null && data.experience_max !== null && data.experience_min > data.experience_max) throw fail('Minimum experience is above the maximum.');
  const problems = validateTerms({ initialOffer: Number(data.initial_offer), maxBudget: Number(data.max_budget), strategy: data.negotiation_strategy, maxRounds: data.max_rounds });
  if (problems.length) throw fail(problems.join(' '));
  return data;
}

function candidateInput(body: Row) {
  const name = clean(body.full_name, 120);
  if (!name) throw fail('Enter the candidate’s name.');
  return {
    full_name: name,
    headline: clean(body.headline, 200),
    country: clean(body.country, 80),
    city: clean(body.city, 80),
    specialization: clean(body.specialization, 160),
    experience_years: num(body.experience_years),
    skills: listFrom(body.skills),
    certifications: listFrom(body.certifications),
    languages: listFrom(body.languages, 10),
    profile_text: clean(body.profile_text, 8000),
    portfolio_url: /^https?:\/\//.test(clean(body.portfolio_url, 300)) ? clean(body.portfolio_url, 300) : null,
    expected_comp: num(body.expected_comp),
    availability: clean(body.availability, 200),
  };
}

function publicCandidate(c: Row, opts: { contact?: Row | null } = {}) {
  return {
    id: c.id, campaign_id: c.campaign_id, full_name: c.erased_at ? '(erased at candidate request)' : c.full_name,
    headline: c.headline, country: c.country, city: c.city, specialization: c.specialization,
    experience_years: c.experience_years, skills: c.skills, certifications: c.certifications, languages: c.languages,
    profile_text: c.profile_text, portfolio_url: c.portfolio_url, has_cv: Boolean(c.cv_path),
    source: c.source, source_detail: c.source_detail, lawful_basis: c.lawful_basis,
    contact_hint: c.contact_hint, contact: opts.contact || null,
    expected_comp: c.expected_comp, final_comp: c.final_comp, availability: c.availability,
    status: c.status, score: c.score, score_explanation: c.score_explanation, evaluated_at: c.evaluated_at,
    do_not_contact: c.do_not_contact, last_contacted_at: c.last_contacted_at, responded_at: c.responded_at,
    hired_at: c.hired_at, created_date: c.created_date,
  };
}

const FUNNEL = ['sourced', 'evaluated', 'contacted', 'interested', 'negotiating', 'awaiting_approval', 'agreed', 'declined', 'hired', 'withdrawn'];

function funnel(rows: Row[]) {
  const counts: Row = Object.fromEntries(FUNNEL.map((s) => [s, 0]));
  for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
  return counts;
}

async function issuePortalLink(candidate: Row) {
  const token = newPortalToken();
  const expires = new Date(Date.now() + PORTAL_DAYS * 86400000).toISOString();
  await must(db().from('recruitment_candidates').update({ portal_token_hash: await sha256(token), portal_expires_at: expires }).eq('id', candidate.id));
  return `${appUrl()}/r/${token}`;
}

const deps: iv.Deps = { db, must, fail, event, invokeAI, fmtMoney };

// Recruitment allowance (featured agent, billed per workspace): campaigns, candidate
// evaluations and written interviews are units; other AI work only counts toward the
// plan's monthly cost cap.
const RECRUITMENT = 'recruitment';
async function useRecruitment(orgId: string, meter: 'campaign' | 'evaluation' | 'interview') {
  const lease = await reserveUsage(db(), { organizationId: orgId, subject: featuredSubject(RECRUITMENT), plan: RECRUITMENT, meter, planRow: await planRow(db(), RECRUITMENT) });
  if (!lease.ok) throw Object.assign(fail(lease.message || 'Recruitment allowance reached.', lease.status || 429), { billing: lease.info });
  return lease;
}
const recruitmentCost = (orgId: string) => attachCurrent(db(), { organizationId: orgId, subject: featuredSubject(RECRUITMENT), plan: RECRUITMENT });

async function latestInterview(candidateId: string) {
  return (await must(db().from('recruitment_interviews').select('*').eq('candidate_id', candidateId).neq('status', 'cancelled')
    .order('created_date', { ascending: false }).limit(1).maybeSingle())) as Row | null;
}

// ===================================================== company: the actions ==

async function companyAction(req: Request, body: Row) {
  const { base44, user, org, manage, role } = await companyContext(req);
  const orgId = org.id as string;
  const action = clean(body.action, 40);
  // AI work that is not itself a unit counts toward the recruitment cost cap.
  if (['draftMessage', 'contactQualified', 'generateInterviewPlan', 'evaluateInterview'].includes(action)) await recruitmentCost(orgId);

  if (action === 'overview') {
    const campaigns = await must(db().from('recruitment_campaigns').select('*').eq('organization_id', orgId).order('created_date', { ascending: false }).limit(200)) as Row[];
    const candidates = await must(db().from('recruitment_candidates').select('campaign_id, status, country, city, specialization, experience_years, expected_comp, final_comp')
      .eq('organization_id', orgId).limit(20000)) as Row[];
    const f = body.filters || {};
    const match = (v: unknown, q: unknown) => !q || String(v || '').toLowerCase().includes(String(q).toLowerCase());
    const filteredCampaigns = campaigns.filter((c) =>
      match(c.country, f.country) && match(c.city, f.city) && match(`${c.specialization} ${c.title}`, f.specialization) && (!f.campaign_id || c.id === f.campaign_id));
    const ids = new Set(filteredCampaigns.map((c) => c.id));
    const filteredCandidates = candidates.filter((c) => ids.has(c.campaign_id)
      && (num(f.experience_min) === null || (num(c.experience_years) ?? -1) >= Number(f.experience_min))
      && (num(f.experience_max) === null || (num(c.experience_years) ?? Infinity) <= Number(f.experience_max))
      && (num(f.comp_max) === null || (num(c.final_comp ?? c.expected_comp) ?? 0) <= Number(f.comp_max)));
    const byCampaign = filteredCampaigns.map((c) => {
      const mine = filteredCandidates.filter((x) => x.campaign_id === c.id);
      const counts = funnel(mine);
      const filled = counts.agreed + counts.hired;
      return { ...c, counts, discovered: mine.length, completion: Math.min(100, Math.round((filled / c.positions_required) * 100)) };
    });
    const totals = funnel(filteredCandidates);
    const required = filteredCampaigns.filter((c) => c.status === 'active').reduce((s, c) => s + c.positions_required, 0);
    return {
      role, can_manage: manage,
      totals: { ...totals, discovered: filteredCandidates.length,
        contacted_total: filteredCandidates.filter((c) => !['sourced', 'evaluated'].includes(c.status)).length,
        active_campaigns: filteredCampaigns.filter((c) => c.status === 'active').length, required,
        completion: required ? Math.min(100, Math.round(((totals.agreed + totals.hired) / required) * 100)) : 0 },
      campaigns: byCampaign,
      integrations: integrations(),
    };
  }

  if (action === 'createCampaign') {
    requireManage(manage);
    const data = campaignInput(body.campaign || {});
    const lease = await useRecruitment(orgId, 'campaign');
    let row: Row;
    try {
      row = await must(db().from('recruitment_campaigns').insert({ ...data, organization_id: orgId, status: 'active', created_by_id: user.id, created_by: user.email }).select('*').single()) as Row;
    } catch (error) {
      await lease.release();
      throw error;
    }
    await event(orgId, 'campaign.created', `Campaign “${row.title}” created: ${row.positions_required} × ${row.title} in ${[row.city, row.country].filter(Boolean).join(', ')}; budget up to ${fmtMoney(Number(row.max_budget), row)}.`, { campaign_id: row.id });
    await audit(orgId, user, 'recruitment.campaign_created', 'RecruitmentCampaign', row.id, row.title);
    return { campaign: row };
  }

  if (action === 'updateCampaign') {
    requireManage(manage);
    const existing = await campaignFor(orgId, body.campaign_id);
    const data = campaignInput(body.campaign || {}, existing);
    const status = ['active', 'paused', 'closed'].includes(body.campaign?.status) ? body.campaign.status : existing.status;
    const row = await must(db().from('recruitment_campaigns').update({ ...data, status, closed_at: status === 'closed' ? existing.closed_at || new Date().toISOString() : null })
      .eq('id', existing.id).select('*').single()) as Row;
    await event(orgId, 'campaign.updated', `Campaign settings updated${status !== existing.status ? ` (status: ${status})` : ''}.`, { campaign_id: row.id });
    await audit(orgId, user, 'recruitment.campaign_updated', 'RecruitmentCampaign', row.id, `status ${status}`);
    return { campaign: row };
  }

  if (action === 'getCampaign') {
    const campaign = await campaignFor(orgId, body.campaign_id);
    const rows = await must(db().from('recruitment_candidates').select('*').eq('campaign_id', campaign.id).order('score', { ascending: false, nullsFirst: false }).limit(1000)) as Row[];
    const events = await must(db().from('recruitment_events').select('*').eq('campaign_id', campaign.id).order('created_date', { ascending: false }).limit(60));
    const pendingDrafts = await must(db().from('recruitment_messages').select('id, candidate_id, kind, subject, created_date').eq('campaign_id', campaign.id).eq('status', 'draft'));
    const interviews = await must(db().from('recruitment_interviews').select('id, candidate_id, status, score, expires_at, completed_at, report_sent_at, created_date')
      .eq('campaign_id', campaign.id).neq('status', 'cancelled').order('created_date', { ascending: false })) as Row[];
    const latestByCandidate: Row = {};
    for (const i of interviews) if (!latestByCandidate[i.candidate_id]) latestByCandidate[i.candidate_id] = i;
    const plan = await must(db().from('recruitment_interview_plans').select('*').eq('campaign_id', campaign.id).maybeSingle());
    return {
      interviews: latestByCandidate,
      plan,
      role, can_manage: manage,
      campaign: { ...campaign, apply_url: `${appUrl()}/apply/${campaign.apply_slug}` },
      counts: funnel(rows),
      candidates: rows.map((c) => publicCandidate(c)),
      drafts: pendingDrafts,
      events,
    };
  }

  if (action === 'getCandidate') {
    const candidate = await candidateFor(orgId, body.candidate_id);
    const campaign = await campaignFor(orgId, candidate.campaign_id);
    const consents = await latestConsents(candidate.id);
    const contact = manage && contactShareable(candidate, consents) ? await readContact(candidate) : null;
    const [messages, offers, events] = await Promise.all([
      must(db().from('recruitment_messages').select('*').eq('candidate_id', candidate.id).order('created_date')),
      must(db().from('recruitment_offers').select('*').eq('candidate_id', candidate.id).order('created_date')),
      must(db().from('recruitment_events').select('*').eq('candidate_id', candidate.id).order('created_date', { ascending: false }).limit(40)),
    ]);
    let cvUrl = null;
    if (candidate.cv_path && manage && contactShareable(candidate, consents)) {
      const { data } = await db().storage.from('private').createSignedUrl(candidate.cv_path, 600);
      cvUrl = data?.signedUrl || null;
    }
    const { state } = await negotiationState(candidate.id, campaign);
    const interview = await latestInterview(candidate.id);
    const interviewMessages = interview ? await iv.transcript(deps, interview.id) : [];
    const plan = await must(db().from('recruitment_interview_plans').select('status, questions').eq('campaign_id', campaign.id).maybeSingle()) as Row | null;
    return {
      interview, interview_messages: interviewMessages, plan_status: plan?.status || 'none', plan_questions: plan?.questions?.length || 0,
      can_manage: manage, campaign, candidate: publicCandidate(candidate, { contact }), consents, messages, offers, events,
      cv_url: cvUrl, contact_restricted: !contactShareable(candidate, consents),
      negotiation: { ...state, ceiling: Math.max(Number(campaign.max_budget), state.approvedCeiling || 0) },
    };
  }

  if (action === 'addCandidate') {
    requireManage(manage);
    const campaign = await campaignFor(orgId, body.campaign_id);
    const source = ['manual', 'referral', 'company_database'].includes(body.source) ? body.source : 'manual';
    const lawful = ['legitimate_interest', 'existing_relationship', 'consent'].includes(body.lawful_basis) ? body.lawful_basis : 'legitimate_interest';
    const data = candidateInput(body.candidate || {});
    const contact = await writeContact(body.candidate?.contact || {});
    const row = await must(db().from('recruitment_candidates').insert({
      ...data, ...contact, organization_id: orgId, campaign_id: campaign.id, source, lawful_basis: lawful,
      source_detail: clean(body.source_detail, 200), created_by_id: user.id, created_by: user.email,
    }).select('*').single()) as Row;
    await event(orgId, 'candidate.added', `${row.full_name} added (${source.replace('_', ' ')}).`, { campaign_id: campaign.id, candidate_id: row.id });
    return { candidate: publicCandidate(row) };
  }

  if (action === 'importCsv') {
    requireManage(manage);
    const campaign = await campaignFor(orgId, body.campaign_id);
    const rows = parseCsv(String(body.csv || '').slice(0, 2_000_000));
    if (!rows.length) throw fail('The file has no rows. The first line must be the column names.');
    if (rows.length > 500) throw fail('Import up to 500 candidates per file.');
    const source = body.source === 'company_database' ? 'company_database' : 'csv_import';
    const results = { added: 0, skipped: [] as string[] };
    for (const [index, r] of rows.entries()) {
      try {
        const data = candidateInput({
          full_name: r.full_name || r.name, headline: r.headline || r.title, country: r.country, city: r.city,
          specialization: r.specialization, experience_years: r.experience_years || r.experience, skills: r.skills,
          certifications: r.certifications, languages: r.languages, profile_text: r.profile || r.summary || r.profile_text,
          portfolio_url: r.portfolio_url || r.portfolio || r.cv_url, expected_comp: r.expected_comp || r.expected_rate, availability: r.availability,
        });
        const contact = await writeContact({ email: r.email, phone: r.phone });
        await must(db().from('recruitment_candidates').insert({
          ...data, ...contact, organization_id: orgId, campaign_id: campaign.id, source, lawful_basis: 'legitimate_interest',
          source_detail: clean(body.file_name, 120) || 'CSV import', created_by_id: user.id, created_by: user.email,
        }));
        results.added += 1;
      } catch (error) {
        results.skipped.push(`Row ${index + 2}: ${(error as Error).message}`);
      }
    }
    await event(orgId, 'candidate.imported', `${results.added} candidates imported from ${clean(body.file_name, 120) || 'a CSV file'}${results.skipped.length ? `; ${results.skipped.length} rows skipped` : ''}.`, { campaign_id: campaign.id, level: results.skipped.length ? 'warning' : 'info' });
    await audit(orgId, user, 'recruitment.csv_import', 'RecruitmentCampaign', campaign.id, `${results.added} added`);
    return results;
  }

  if (action === 'evaluate') {
    requireManage(manage);
    const campaign = await campaignFor(orgId, body.campaign_id);
    let targets: Row[];
    if (body.candidate_id) targets = [await candidateFor(orgId, body.candidate_id)];
    else {
      targets = await must(db().from('recruitment_candidates').select('*').eq('campaign_id', campaign.id).is('evaluated_at', null).is('erased_at', null).limit(5)) as Row[];
    }
    const done: Row[] = [];
    const errors: string[] = [];
    for (const candidate of targets) {
      if (candidate.campaign_id !== campaign.id) continue;
      let lease;
      try {
        lease = await useRecruitment(orgId, 'evaluation');
      } catch (error) {
        errors.push((error as Error).message);
        break;
      }
      try {
        const { score, explanation } = await evaluateOne(base44, campaign, candidate);
        const status = candidate.status === 'sourced' ? 'evaluated' : candidate.status;
        await must(db().from('recruitment_candidates').update({ score, score_explanation: explanation, evaluated_at: new Date().toISOString(), status }).eq('id', candidate.id));
        await event(orgId, 'candidate.evaluated', `${candidate.full_name}: match score ${score}/100${explanation.unverified_claims_removed ? ` (${explanation.unverified_claims_removed} unverifiable claim(s) removed)` : ''}.`, { campaign_id: campaign.id, candidate_id: candidate.id });
        done.push({ id: candidate.id, score });
      } catch (error) {
        await lease.release();
        const message = (error as Error).message;
        errors.push(`${candidate.full_name}: ${message}`);
        await event(orgId, 'candidate.evaluation_failed', `${candidate.full_name}: ${message}`, { campaign_id: campaign.id, candidate_id: candidate.id, level: 'error' });
        if ((error as { status?: number }).status === 429) break;
      }
    }
    const { count: remaining } = await db().from('recruitment_candidates').select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaign.id).is('evaluated_at', null).is('erased_at', null);
    return { evaluated: done, errors, remaining: remaining || 0 };
  }

  if (action === 'draftMessage') {
    requireManage(manage);
    const candidate = await candidateFor(orgId, body.candidate_id);
    const campaign = await campaignFor(orgId, candidate.campaign_id);
    const kind = body.kind === 'follow_up' ? 'follow_up' : 'outreach';
    const draft = await draftOutreach(base44, org, campaign, candidate, kind);
    const row = await must(db().from('recruitment_messages').insert({
      organization_id: orgId, campaign_id: campaign.id, candidate_id: candidate.id, direction: 'out', channel: 'email',
      kind, subject: draft.subject, body: draft.body, status: 'draft', created_by_id: user.id, created_by: user.email,
    }).select('*').single());
    await event(orgId, 'message.drafted', `${kind === 'follow_up' ? 'Follow-up' : 'Outreach'} drafted for ${candidate.full_name} (${draft.by}).`, { campaign_id: campaign.id, candidate_id: candidate.id });
    return { message: row };
  }

  if (action === 'sendMessage') {
    requireManage(manage);
    const message = await must(db().from('recruitment_messages').select('*').eq('id', clean(body.message_id, 80)).eq('organization_id', orgId).maybeSingle()) as Row;
    if (!message) throw fail('Message not found.', 404);
    if (message.status === 'sent') throw fail('This message was already sent.', 409);
    const subject = clean(body.subject, 180) || message.subject;
    const text = clean(body.body, 8000) || message.body;
    const result = await deliver(orgId, user, message, subject, text);
    return result;
  }

  if (action === 'discardMessage') {
    requireManage(manage);
    await must(db().from('recruitment_messages').update({ status: 'discarded' }).eq('id', clean(body.message_id, 80)).eq('organization_id', orgId).eq('status', 'draft'));
    return { ok: true };
  }

  if (action === 'contactQualified') {
    requireManage(manage);
    const campaign = await campaignFor(orgId, body.campaign_id);
    if (campaign.outreach_mode !== 'auto') throw fail('Automatic outreach is off for this campaign. Approve each message instead, or switch the campaign to automatic outreach.', 409);
    if (campaign.status !== 'active') throw fail('The campaign is not active.', 409);
    const targets = await must(db().from('recruitment_candidates').select('*').eq('campaign_id', campaign.id).eq('status', 'evaluated')
      .gte('score', campaign.auto_contact_min_score).eq('do_not_contact', false).not('contact_enc', 'is', null).order('score', { ascending: false }).limit(5)) as Row[];
    const sent: string[] = [];
    const errors: string[] = [];
    for (const candidate of targets) {
      try {
        const draft = await draftOutreach(base44, org, campaign, candidate, 'outreach');
        const message = await must(db().from('recruitment_messages').insert({
          organization_id: orgId, campaign_id: campaign.id, candidate_id: candidate.id, direction: 'out', channel: 'email',
          kind: 'outreach', subject: draft.subject, body: draft.body, status: 'draft', created_by_id: user.id, created_by: user.email,
        }).select('*').single()) as Row;
        await deliver(orgId, user, message, draft.subject, draft.body);
        sent.push(candidate.full_name);
      } catch (error) {
        errors.push(`${candidate.full_name}: ${(error as Error).message}`);
      }
    }
    return { sent, errors, eligible: targets.length };
  }

  if (action === 'decideEscalation') {
    requireManage(manage);
    const candidate = await candidateFor(orgId, body.candidate_id);
    const campaign = await campaignFor(orgId, candidate.campaign_id);
    if (candidate.status !== 'awaiting_approval') throw fail('This candidate is not waiting for a company decision.', 409);
    const lastRequest = (await negotiationState(candidate.id, campaign)).offers.filter((o) => o.party === 'candidate').pop();
    if (!lastRequest) throw fail('No candidate request found.', 409);
    const amount = Number(lastRequest.amount);
    if (body.approve === true) {
      await must(db().from('recruitment_offers').insert({ organization_id: orgId, campaign_id: campaign.id, candidate_id: candidate.id, round: lastRequest.round,
        party: 'company', amount, currency: campaign.currency, pay_frequency: campaign.pay_frequency, outcome: 'approved', note: clean(body.note, 300) || `Approved by ${user.email}`,
        created_by_id: user.id, created_by: user.email }));
      await must(db().from('recruitment_offers').insert({ organization_id: orgId, campaign_id: campaign.id, candidate_id: candidate.id, round: lastRequest.round,
        party: 'agent', amount, currency: campaign.currency, pay_frequency: campaign.pay_frequency, outcome: 'accepted', note: 'Agreed after company approval.' }));
      await must(db().from('recruitment_candidates').update({ status: 'agreed', final_comp: amount }).eq('id', candidate.id));
      await event(orgId, 'negotiation.approved', `Company approved ${fmtMoney(amount, campaign)} for ${candidate.full_name} (above the campaign maximum).`, { campaign_id: campaign.id, candidate_id: candidate.id });
      await audit(orgId, user, 'recruitment.budget_exception_approved', 'RecruitmentCandidate', candidate.id, fmtMoney(amount, campaign));
    } else {
      await must(db().from('recruitment_offers').insert({ organization_id: orgId, campaign_id: campaign.id, candidate_id: candidate.id, round: lastRequest.round,
        party: 'company', amount: Number(campaign.max_budget), currency: campaign.currency, pay_frequency: campaign.pay_frequency, outcome: 'declined',
        note: clean(body.note, 300) || `Request declined; final offer stays at the maximum.`, created_by_id: user.id, created_by: user.email }));
      await must(db().from('recruitment_candidates').update({ status: 'negotiating' }).eq('id', candidate.id));
      await event(orgId, 'negotiation.declined', `Company declined ${candidate.full_name}'s request of ${fmtMoney(amount, campaign)}; the final offer stays at ${fmtMoney(Number(campaign.max_budget), campaign)}.`, { campaign_id: campaign.id, candidate_id: candidate.id });
    }
    return { ok: true };
  }

  if (action === 'setCandidateStatus') {
    requireManage(manage);
    const candidate = await candidateFor(orgId, body.candidate_id);
    const next = clean(body.status, 30);
    if (next === 'hired') {
      if (candidate.status !== 'agreed') throw fail('Only a candidate who agreed to the terms can be marked as hired.', 409);
      await must(db().from('recruitment_candidates').update({ status: 'hired', hired_at: new Date().toISOString() }).eq('id', candidate.id));
    } else if (next === 'withdrawn') {
      await must(db().from('recruitment_candidates').update({ status: 'withdrawn' }).eq('id', candidate.id));
    } else if (next === 'do_not_contact') {
      await must(db().from('recruitment_candidates').update({ do_not_contact: true }).eq('id', candidate.id));
    } else throw fail('Unknown status change.');
    await event(orgId, 'candidate.status', `${candidate.full_name}: ${next.replace(/_/g, ' ')} (by ${user.email}).`, { campaign_id: candidate.campaign_id, candidate_id: candidate.id });
    await audit(orgId, user, `recruitment.candidate_${next}`, 'RecruitmentCandidate', candidate.id, candidate.full_name);
    return { ok: true };
  }

  if (action === 'deleteCandidate') {
    requireManage(manage);
    const candidate = await candidateFor(orgId, body.candidate_id);
    if (candidate.cv_path) await db().storage.from('private').remove([candidate.cv_path]);
    await must(db().from('recruitment_candidates').delete().eq('id', candidate.id));
    await event(orgId, 'candidate.deleted', `A candidate record and all its messages, offers and consents were permanently deleted by ${user.email}.`, { campaign_id: candidate.campaign_id });
    await audit(orgId, user, 'recruitment.candidate_deleted', 'RecruitmentCandidate', candidate.id, 'permanent deletion');
    return { ok: true };
  }

  if (action === 'purgeExpired') {
    requireManage(manage);
    const closed = await must(db().from('recruitment_campaigns').select('id, title, closed_at, retention_days').eq('organization_id', orgId).eq('status', 'closed')) as Row[];
    let removed = 0;
    for (const c of closed) {
      if (!c.closed_at || Date.now() - new Date(c.closed_at).getTime() < c.retention_days * 86400000) continue;
      const doomed = await must(db().from('recruitment_candidates').select('id, cv_path').eq('campaign_id', c.id)) as Row[];
      const paths = doomed.map((d) => d.cv_path).filter(Boolean);
      if (paths.length) await db().storage.from('private').remove(paths);
      await must(db().from('recruitment_candidates').delete().eq('campaign_id', c.id));
      removed += doomed.length;
      await event(orgId, 'retention.purged', `Retention period ended: ${doomed.length} candidate records deleted from “${c.title}”.`, { campaign_id: c.id });
    }
    await audit(orgId, user, 'recruitment.retention_purge', 'Organization', orgId, `${removed} candidate records deleted`);
    return { removed };
  }

  if (action === 'report') {
    const campaign = await campaignFor(orgId, body.campaign_id);
    const rows = await must(db().from('recruitment_candidates').select('*').eq('campaign_id', campaign.id).is('erased_at', null).order('score', { ascending: false, nullsFirst: false })) as Row[];
    const out: Row[] = [];
    for (const c of rows) {
      const consents = await latestConsents(c.id);
      const shareable = manage && contactShareable(c, consents);
      const contact = shareable ? await readContact(c) : {};
      const stage = c.status === 'hired' ? 'Hired' : c.status === 'agreed' ? 'Agreed to compensation (not hired yet)'
        : ['interested', 'negotiating', 'awaiting_approval'].includes(c.status) ? 'Expressed interest' : c.status === 'declined' ? 'Declined' : 'Not yet confirmed';
      out.push({
        name: c.full_name, profile: c.headline || c.specialization, country: c.country, city: c.city, specialization: c.specialization,
        experience: c.experience_years, skills: c.skills, portfolio: c.portfolio_url, cv: c.cv_path ? 'CV on file (open in Coinexa)' : '',
        email: contact.email || (shareable ? '' : 'Not authorised for sharing'), phone: contact.phone || '',
        expected: c.expected_comp, final: c.final_comp, currency: campaign.currency, frequency: campaign.pay_frequency,
        availability: c.availability, response: c.status, stage,
        consent: consents.data_processing ? `${consents.data_processing.granted ? 'Data processing: yes' : 'Data processing: no'}; sharing: ${consents.share_with_company?.granted ? 'yes' : 'no'} (${consents.data_processing.recorded_at})`
          : `No portal consent (basis: ${c.lawful_basis.replace(/_/g, ' ')})`,
        score: c.score, explanation: c.score_explanation?.summary || '',
        interview: await (async () => { const i = await latestInterview(c.id); return i ? `${i.status}${i.score !== null && i.score !== undefined ? ` ${i.score}/100` : ''}` : 'not invited'; })(),
      });
    }
    await audit(orgId, user, 'recruitment.report_downloaded', 'RecruitmentCampaign', campaign.id, `${out.length} rows`);
    const csv = toCsv(out, [
      { key: 'name', label: 'Candidate' }, { key: 'stage', label: 'Stage' }, { key: 'profile', label: 'Professional profile' },
      { key: 'country', label: 'Country' }, { key: 'city', label: 'City' }, { key: 'specialization', label: 'Specialization' },
      { key: 'experience', label: 'Experience (years)' }, { key: 'skills', label: 'Relevant skills' }, { key: 'portfolio', label: 'Portfolio / CV link' },
      { key: 'cv', label: 'CV' }, { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' },
      { key: 'expected', label: 'Expected compensation' }, { key: 'final', label: 'Final negotiated compensation' },
      { key: 'currency', label: 'Currency' }, { key: 'frequency', label: 'Pay frequency' }, { key: 'availability', label: 'Availability' },
      { key: 'response', label: 'Candidate status' }, { key: 'consent', label: 'Consent' }, { key: 'score', label: 'AI match score' }, { key: 'interview', label: 'Written interview' },
      { key: 'explanation', label: 'Match explanation' },
    ]);
    const summary = {
      hired: out.filter((r) => r.stage === 'Hired').length,
      agreed: out.filter((r) => r.stage.startsWith('Agreed')).length,
      interested: out.filter((r) => r.stage === 'Expressed interest').length,
      required: campaign.positions_required,
    };
    return { file_name: `coinexa-recruitment-${campaign.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`, csv, rows: out, summary };
  }

  if (action === 'getInterviewPlan') {
    const campaign = await campaignFor(orgId, body.campaign_id);
    const plan = await must(db().from('recruitment_interview_plans').select('*').eq('campaign_id', campaign.id).maybeSingle());
    return { can_manage: manage, plan };
  }

  if (action === 'generateInterviewPlan') {
    requireManage(manage);
    const campaign = await campaignFor(orgId, body.campaign_id);
    const count = Math.max(3, Math.min(12, Math.round(Number(body.count) || 8)));
    const questions = await iv.generatePlan(deps, base44, campaign, count);
    const row = await must(db().from('recruitment_interview_plans').upsert({
      organization_id: orgId, campaign_id: campaign.id, questions, status: 'draft', approved_at: null, approved_by: null,
      created_by_id: user.id, created_by: user.email,
    }, { onConflict: 'campaign_id' }).select('*').single());
    await event(orgId, 'interview.plan_drafted', `AI drafted ${questions.length} interview questions; waiting for approval.`, { campaign_id: campaign.id });
    return { plan: row };
  }

  if (action === 'saveInterviewPlan') {
    requireManage(manage);
    const campaign = await campaignFor(orgId, body.campaign_id);
    const plan = iv.validatePlan(deps, campaign, body);
    const approve = body.approve === true;
    if (approve && plan.questions.length < 3) throw fail('Approve at least 3 questions.');
    const row = await must(db().from('recruitment_interview_plans').upsert({
      organization_id: orgId, campaign_id: campaign.id, ...plan, status: approve ? 'approved' : 'draft',
      approved_at: approve ? new Date().toISOString() : null, approved_by: approve ? user.email : null,
      created_by_id: user.id, created_by: user.email,
    }, { onConflict: 'campaign_id' }).select('*').single());
    await event(orgId, approve ? 'interview.plan_approved' : 'interview.plan_saved', `Interview plan ${approve ? 'approved' : 'saved as draft'}: ${plan.questions.length} questions, up to ${plan.max_followups} follow-ups each, links valid ${plan.valid_days} days.`, { campaign_id: campaign.id });
    if (approve) await audit(orgId, user, 'recruitment.interview_plan_approved', 'RecruitmentCampaign', campaign.id, `${plan.questions.length} questions`);
    return { plan: row };
  }

  if (action === 'inviteToInterview') {
    requireManage(manage);
    const candidate = await candidateFor(orgId, body.candidate_id);
    const campaign = await campaignFor(orgId, candidate.campaign_id);
    if (campaign.status !== 'active') throw fail('The campaign is not active.', 409);
    if (candidate.do_not_contact || candidate.erased_at || ['declined', 'withdrawn', 'hired'].includes(candidate.status)) throw fail('This candidate cannot be invited.', 409);
    const plan = await must(db().from('recruitment_interview_plans').select('*').eq('campaign_id', campaign.id).maybeSingle()) as Row | null;
    if (!plan || plan.status !== 'approved') throw fail('Approve the interview questions for this campaign first (Interviews tab).', 409);
    await must(db().from('recruitment_interviews').update({ status: 'cancelled' }).eq('candidate_id', candidate.id).in('status', ['invited', 'in_progress']));
    const interviewLease = await useRecruitment(orgId, 'interview');
    let interview: Row;
    try {
      interview = await must(db().from('recruitment_interviews').insert({
      organization_id: orgId, campaign_id: campaign.id, candidate_id: candidate.id, questions: plan.questions, max_followups: plan.max_followups,
      expires_at: new Date(Date.now() + plan.valid_days * 86400000).toISOString(), created_by_id: user.id, created_by: user.email,
    }).select('*').single()) as Row;
    } catch (error) {
      await interviewLease.release();
      throw error;
    }
    const first = candidate.full_name.split(' ')[0];
    const message = await must(db().from('recruitment_messages').insert({
      organization_id: orgId, campaign_id: campaign.id, candidate_id: candidate.id, direction: 'out', channel: 'email', kind: 'interview_invite',
      subject: `Written interview: ${campaign.title} with ${org.name}`,
      body: `Hello ${first},\n\nThank you for your interest in the ${campaign.title} role at ${org.name}. The next step is a short written interview: ${plan.questions.length} questions about your experience, answered in a chat on your personal page. It is text only — no call or video — and you can take your time and come back while the link is valid (${plan.valid_days} days).\n\nStart the interview here:\n{{portal_link}}\n\nThe interview is conducted by an AI assistant; ${org.name}'s hiring manager reviews your answers and makes every decision. You can also decline or ask not to be contacted again on that page.\n\nKind regards,\n${org.name}`,
      status: 'draft', created_by_id: user.id, created_by: user.email,
    }).select('*').single());
    await event(orgId, 'interview.invited', `Interview prepared for ${candidate.full_name}; invitation waiting for approval to send.`, { campaign_id: campaign.id, candidate_id: candidate.id });
    return { interview, message };
  }

  if (action === 'evaluateInterview') {
    requireManage(manage);
    const candidate = await candidateFor(orgId, body.candidate_id);
    const campaign = await campaignFor(orgId, candidate.campaign_id);
    const interview = await latestInterview(candidate.id);
    if (!interview || !['completed', 'evaluated'].includes(interview.status)) throw fail('The interview is not finished yet.', 409);
    return await iv.evaluateInterview(deps, base44, interview, campaign, candidate);
  }

  if (action === 'candidateReport' || action === 'sendHiringReport') {
    if (action === 'sendHiringReport') requireManage(manage);
    const candidate = await candidateFor(orgId, body.candidate_id);
    const campaign = await campaignFor(orgId, candidate.campaign_id);
    const consents = await latestConsents(candidate.id);
    const contact = manage && contactShareable(candidate, consents) ? await readContact(candidate) : null;
    const interview = await latestInterview(candidate.id);
    const messages = interview ? await iv.transcript(deps, interview.id) : [];
    const offers = (await negotiationState(candidate.id, campaign)).offers;
    const text = iv.buildReport(deps, { campaign, candidate, contact, consents, interview, messages, offers });
    const fileName = `coinexa-candidate-${candidate.full_name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.txt`;
    if (action === 'candidateReport') {
      await audit(orgId, user, 'recruitment.candidate_report', 'RecruitmentCandidate', candidate.id, 'viewed or downloaded');
      return { text, file_name: fileName };
    }
    const to = clean(body.to, 160).toLowerCase() || campaign.hiring_manager_email;
    if (!to || !EMAIL_RE.test(to)) throw fail('Add the hiring manager’s email in the campaign settings first.', 409);
    const subject = `Candidate report: ${candidate.full_name} — ${campaign.title}`;
    const { attempts } = await sendEmail(to, subject, `${campaign.hiring_manager_name ? `Hello ${campaign.hiring_manager_name},\n\n` : ''}${text}\n\nOpen the campaign in Coinexa: ${appUrl()}/recruitment/${campaign.id}`);
    await must(db().from('recruitment_messages').insert({ organization_id: orgId, campaign_id: campaign.id, candidate_id: candidate.id, direction: 'out', channel: 'email',
      kind: 'hiring_report', subject: `${subject} (to ${to})`, body: 'Candidate evaluation report sent to the hiring manager.', status: 'sent', attempts, sent_at: new Date().toISOString(),
      created_by_id: user.id, created_by: user.email }));
    if (interview) await must(db().from('recruitment_interviews').update({ report_sent_at: new Date().toISOString() }).eq('id', interview.id));
    await event(orgId, 'report.sent', `Evaluation report for ${candidate.full_name} emailed to the hiring manager (${to}).`, { campaign_id: campaign.id, candidate_id: candidate.id });
    await audit(orgId, user, 'recruitment.report_sent', 'RecruitmentCandidate', candidate.id, `to ${to}`);
    return { ok: true, to };
  }

  throw fail('Unknown action.');
}

// Company bulk import of CV files (multipart). Each PDF is stored privately, read by
// the AI (text copied verbatim, fields only where the CV states them) and becomes a
// candidate with source "cv_import". Nothing is guessed: unreadable files are reported.
async function importCvFiles(req: Request, form: FormData) {
  const { base44, user, org, manage } = await companyContext(req);
  requireManage(manage);
  const orgId = org.id as string;
  const campaign = await campaignFor(orgId, String(form.get('campaign_id') || ''));
  await recruitmentCost(orgId);
  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (!files.length) throw fail('Choose at least one PDF.');
  if (files.length > 5) throw fail('Import up to 5 CVs at a time.');
  const results = { added: [] as string[], skipped: [] as string[] };
  for (const file of files) {
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('larger than 5 MB');
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!file.name.toLowerCase().endsWith('.pdf') || String.fromCharCode(...bytes.slice(0, 4)) !== '%PDF') throw new Error('not a PDF');
      const path = `recruitment/${orgId}/imports/${crypto.randomUUID()}.pdf`;
      const { error } = await db().storage.from('private').upload(path, bytes, { contentType: 'application/pdf', upsert: false });
      if (error) throw new Error(error.message);
      const { data: signed } = await db().storage.from('private').createSignedUrl(path, 600);
      let cv;
      try {
        cv = await iv.readCv(deps, base44, signed?.signedUrl || '');
      } catch (error) {
        await db().storage.from('private').remove([path]);
        throw error;
      }
      if (!cv.full_name || cv.cv_text.length < 40) {
        await db().storage.from('private').remove([path]);
        throw new Error('no readable name or text (scanned image?)');
      }
      const contact = await writeContact({ email: EMAIL_RE.test(cv.email) ? cv.email : '', phone: cv.phone });
      const row = await must(db().from('recruitment_candidates').insert({
        organization_id: orgId, campaign_id: campaign.id, full_name: cv.full_name, headline: cv.headline, country: cv.country, city: cv.city,
        experience_years: cv.experience_years, skills: cv.skills, certifications: cv.certifications, languages: cv.languages,
        cv_text: cv.cv_text, cv_path: path, ...contact, source: 'cv_import', lawful_basis: 'legitimate_interest', source_detail: clean(file.name, 120),
        created_by_id: user.id, created_by: user.email,
      }).select('id, full_name').single()) as Row;
      results.added.push(row.full_name);
    } catch (error) {
      results.skipped.push(`${file.name}: ${(error as Error).message}`);
    }
  }
  await event(orgId, 'candidate.cv_imported', `${results.added.length} candidates created from CV files${results.skipped.length ? `; ${results.skipped.length} skipped` : ''}.`, { campaign_id: campaign.id, level: results.skipped.length ? 'warning' : 'info' });
  await audit(orgId, user, 'recruitment.cv_import', 'RecruitmentCampaign', campaign.id, `${results.added.length} added`);
  return results;
}

// Outreach wording: written by the AI from the real campaign details, then checked so
// it never states pay above the current authorised offer. If the check fails, a fixed
// template is used instead.
async function draftOutreach(base44: Row, org: Row, campaign: Row, candidate: Row, kind: 'outreach' | 'follow_up') {
  const offer = Number(campaign.initial_offer);
  const facts = [
    `Role: ${campaign.title}${campaign.specialization ? ` (${campaign.specialization})` : ''}`,
    `Location: ${[campaign.city, campaign.country].filter(Boolean).join(', ')} — ${campaign.work_mode}`,
    campaign.duration ? `Duration: ${campaign.duration}` : '',
    campaign.schedule ? `Schedule: ${campaign.schedule}` : '',
    `Compensation offered: ${fmtMoney(offer, campaign)}`,
    (campaign.skills || []).length ? `Key skills: ${campaign.skills.join(', ')}` : '',
  ].filter(Boolean).join('\n');
  const template = {
    subject: kind === 'follow_up' ? `Following up: ${campaign.title} opportunity` : `${campaign.title} opportunity with ${org.name}`,
    body: `Hello ${candidate.full_name.split(' ')[0]},\n\n${kind === 'follow_up'
      ? `I'm following up on the ${campaign.title} role I shared recently, in case it is still of interest.`
      : `${org.name} is looking for ${campaign.positions_required > 1 ? `${campaign.positions_required} professionals` : 'a professional'} for a ${campaign.title} role, and your background looks relevant.`}\n\n${facts}\n\nYou can read the full job description, see the offer, tell us your availability and expected compensation, or decline — all on your personal page:\n{{portal_link}}\n\nIf you'd rather not hear from us again, you can say so on that page and we will not contact you about this role.\n\nKind regards,\n${org.name}`,
    by: 'template',
  };
  try {
    const result = await invokeAI(base44, {
      prompt: `Write a short, personal, professional recruitment email (${kind === 'follow_up' ? 'a polite follow-up to an earlier message' : 'first contact'}) to ${candidate.full_name} from ${org.name}.
Use ONLY these facts; do not add benefits, numbers, promises, deadlines or claims that are not listed:
${facts}
${candidate.headline || candidate.specialization ? `Candidate background (from their profile): ${candidate.headline || candidate.specialization}` : ''}
Mention the compensation exactly as given. Include the line {{portal_link}} on its own where the candidate can review the full job description and respond, and say they can decline or ask not to be contacted again on that page. Plain text, under 180 words. Return subject and body.`,
      response_json_schema: { type: 'object', properties: { subject: { type: 'string' }, body: { type: 'string' } }, required: ['subject', 'body'] },
    });
    const draft = typeof result === 'string' ? JSON.parse(result) : result;
    const body = clean(draft?.body, 4000);
    const subject = clean(draft?.subject, 160);
    if (body && subject && body.includes('{{portal_link}}') && wordingWithinLimit(`${subject} ${body}`, offer)) {
      return { subject, body, by: 'AI, checked' };
    }
  } catch (error) {
    console.error('recruitment: AI draft failed, using template', (error as Error).message);
  }
  return template;
}

async function deliver(orgId: string, user: Row, message: Row, subject: string, text: string) {
  const candidate = await candidateFor(orgId, message.candidate_id);
  const campaign = await campaignFor(orgId, message.campaign_id);
  if (candidate.do_not_contact || candidate.erased_at) throw fail('This candidate asked not to be contacted.', 409);
  if (campaign.status !== 'active') throw fail('The campaign is not active.', 409);
  const contact = await readContact(candidate);
  if (!contact.email) throw fail('There is no email address for this candidate.', 409);
  if (!text.includes('{{portal_link}}')) throw fail('The message must keep the {{portal_link}} line so the candidate can respond or opt out.');
  if (!wordingWithinLimit(`${subject} ${text}`, Math.max(Number(campaign.initial_offer), Number(candidate.final_comp) || 0))) {
    throw fail('The message mentions an amount above the authorised offer. Edit the amount before sending.');
  }
  const since = new Date(Date.now() - 86400000).toISOString();
  const { count } = await db().from('recruitment_messages').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'sent').gte('sent_at', since);
  if ((count || 0) >= DAILY_EMAIL_CAP) throw fail(`Daily outreach limit reached (${DAILY_EMAIL_CAP} emails). Try again tomorrow.`, 429);

  const link = await issuePortalLink(candidate);
  const finalText = text.replace('{{portal_link}}', link);
  try {
    const { attempts } = await sendEmail(contact.email, subject, finalText);
    await must(db().from('recruitment_messages').update({ status: 'sent', subject, body: text, attempts, sent_at: new Date().toISOString(), error: null }).eq('id', message.id));
    const nextStatus = ['sourced', 'evaluated'].includes(candidate.status) ? 'contacted' : candidate.status;
    await must(db().from('recruitment_candidates').update({ status: nextStatus, last_contacted_at: new Date().toISOString() }).eq('id', candidate.id));
    if (message.kind !== 'interview_invite' && !(await must(db().from('recruitment_offers').select('id').eq('candidate_id', candidate.id).limit(1)) as Row[]).length) {
      await must(db().from('recruitment_offers').insert({ organization_id: orgId, campaign_id: campaign.id, candidate_id: candidate.id, round: 0,
        party: 'company', amount: Number(campaign.initial_offer), currency: campaign.currency, pay_frequency: campaign.pay_frequency, outcome: 'offer', note: 'Opening offer in outreach.' }));
    }
    await event(orgId, 'message.sent', `${message.kind === 'follow_up' ? 'Follow-up' : message.kind === 'interview_invite' ? 'Interview invitation' : 'Outreach'} emailed to ${candidate.full_name}${attempts > 1 ? ` after ${attempts} attempts` : ''} (approved by ${user.email}).`, { campaign_id: campaign.id, candidate_id: candidate.id });
    return { ok: true, attempts };
  } catch (error) {
    const err = error as Error & { attempts?: number };
    await must(db().from('recruitment_messages').update({ status: 'failed', attempts: err.attempts || 1, error: err.message.slice(0, 400) }).eq('id', message.id));
    await event(orgId, 'message.failed', `Email to ${candidate.full_name} failed: ${err.message}`, { campaign_id: campaign.id, candidate_id: candidate.id, level: 'error' });
    throw error;
  }
}

// ============================================== candidates: portal & apply ==

async function candidateByToken(token: string) {
  const t = clean(token, 100);
  if (t.length < 30) throw fail('This link is not valid.', 404);
  const row = await must(db().from('recruitment_candidates').select('*').eq('portal_token_hash', await sha256(t)).maybeSingle()) as Row;
  if (!row || row.erased_at) throw fail('This link is not valid.', 404);
  if (row.portal_expires_at && new Date(row.portal_expires_at).getTime() < Date.now()) throw fail('This link has expired. Ask the company for a new one.', 410);
  return row;
}

async function ipHash(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  return (await sha256(`${ip}|${env('RECRUITMENT_DATA_KEY', 'k')}`)).slice(0, 32);
}

async function recordConsents(orgId: string, candidateId: string, consents: Row, source: 'portal' | 'application', ip: string) {
  const rows = (['data_processing', 'share_with_company', 'contact', 'ai_interview'] as const)
    .filter((kind) => typeof consents?.[kind] === 'boolean')
    .map((kind) => ({ organization_id: orgId, candidate_id: candidateId, kind, granted: consents[kind], text_version: CONSENT_VERSION, source, ip_hash: ip }));
  if (rows.length) await must(db().from('recruitment_consents').insert(rows));
}

function jobView(campaign: Row, org: Row) {
  return {
    company: org.name, title: campaign.title, specialization: campaign.specialization, country: campaign.country, city: campaign.city,
    positions: campaign.positions_required, skills: campaign.skills, certifications: campaign.certifications, languages: campaign.languages,
    experience_min: campaign.experience_min, experience_max: campaign.experience_max, work_mode: campaign.work_mode,
    schedule: campaign.schedule, availability: campaign.availability, duration: campaign.duration, description: campaign.description,
    currency: campaign.currency, pay_frequency: campaign.pay_frequency, status: campaign.status,
  };
}

async function portalView(candidate: Row) {
  const campaign = await must(db().from('recruitment_campaigns').select('*').eq('id', candidate.campaign_id).single()) as Row;
  const org = await must(db().from('organizations').select('name').eq('id', candidate.organization_id).single()) as Row;
  const { offers, state } = await negotiationState(candidate.id, campaign);
  const consents = await latestConsents(candidate.id);
  return {
    job: jobView(campaign, org),
    candidate: { first_name: candidate.full_name.split(' ')[0], status: candidate.status, availability: candidate.availability,
      expected_comp: candidate.expected_comp, final_comp: candidate.final_comp, has_cv: Boolean(candidate.cv_path), do_not_contact: candidate.do_not_contact,
      contact_on_file: Boolean(candidate.contact_enc) },
    current_offer: candidate.status === 'agreed' || candidate.status === 'hired' ? Number(candidate.final_comp) : state.currentOffer,
    // The company's internal approve/decline decisions stay internal; the candidate sees offers and answers.
    offers: offers
      .filter((o) => !(o.party === 'company' && ['approved', 'declined'].includes(o.outcome)))
      .map((o) => ({ party: o.party, amount: Number(o.amount), outcome: o.outcome, at: o.created_date })),
    consents: Object.fromEntries(Object.entries(consents).map(([k, v]) => [k, { granted: v.granted, at: v.recorded_at }])),
    consent_version: CONSENT_VERSION,
    notice: 'Accepting here confirms your interest and the agreed rate. It is not an employment contract; any contract is issued separately by the company.',
    interview: await (async () => {
      const i = await latestInterview(candidate.id);
      if (!i) return null;
      const expired = ['invited', 'in_progress'].includes(i.status) && new Date(i.expires_at).getTime() < Date.now();
      return { status: expired ? 'expired' : i.status, expires_at: i.expires_at, questions: i.questions.length, current: i.current_index + 1 };
    })(),
  };
}

// Cloudflare Turnstile check for the public application form (on when the secret is set).
async function checkCaptcha(token: unknown, req: Request) {
  const secret = env('TURNSTILE_SECRET_KEY');
  if (!secret) return;
  const response = typeof token === 'string' ? token.slice(0, 2048) : '';
  if (!response) throw fail('Please complete the security check.');
  const form = new URLSearchParams({ secret, response });
  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (ip) form.set('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form, signal: AbortSignal.timeout(10000) })
    .then((res) => res.json()).catch(() => null);
  if (!r?.success) throw fail('The security check failed. Please try again.');
}

async function publicAction(req: Request, body: Row) {
  const action = clean(body.action, 40);

  if (action === 'portal_get') {
    const candidate = await candidateByToken(body.token);
    return await portalView(candidate);
  }

  if (action === 'portal_respond') {
    const candidate = await candidateByToken(body.token);
    const campaign = await must(db().from('recruitment_campaigns').select('*').eq('id', candidate.campaign_id).single()) as Row;
    const orgId = candidate.organization_id;
    const ip = await ipHash(req);
    const response = clean(body.response, 30);
    const consents = body.consents || {};
    const known = await latestConsents(candidate.id);
    const processing = typeof consents.data_processing === 'boolean' ? consents.data_processing : known.data_processing?.granted === true;

    await recordConsents(orgId, candidate.id, consents, 'portal', ip);

    if (response === 'opt_out') {
      await must(db().from('recruitment_candidates').update({ do_not_contact: true, status: 'declined', responded_at: new Date().toISOString() }).eq('id', candidate.id));
      await event(orgId, 'candidate.opted_out', `${candidate.full_name} asked not to be contacted again.`, { campaign_id: campaign.id, candidate_id: candidate.id });
      return await portalView({ ...candidate, do_not_contact: true, status: 'declined' });
    }
    if (response === 'decline') {
      await must(db().from('recruitment_candidates').update({ status: 'declined', responded_at: new Date().toISOString() }).eq('id', candidate.id));
      await must(db().from('recruitment_messages').insert({ organization_id: orgId, campaign_id: campaign.id, candidate_id: candidate.id, direction: 'in', channel: 'portal', kind: 'reply', body: clean(body.note, 2000) || 'Declined the offer.', status: 'received' }));
      await event(orgId, 'candidate.declined', `${candidate.full_name} declined via the portal.`, { campaign_id: campaign.id, candidate_id: candidate.id });
      return await portalView({ ...candidate, status: 'declined' });
    }
    if (['closed', 'paused'].includes(campaign.status)) throw fail('This position is no longer open.', 409);
    if (['agreed', 'hired'].includes(candidate.status) && response !== 'update_details') throw fail('You have already agreed terms for this role.', 409);
    if (!processing) throw fail('Please agree to the processing of your information so the company can consider your response.');

    const updates: Row = { responded_at: new Date().toISOString() };
    if (body.availability !== undefined) updates.availability = clean(body.availability, 200);
    if (body.contact && (body.contact.email || body.contact.phone)) Object.assign(updates, await writeContact(body.contact));
    if (body.note) {
      await must(db().from('recruitment_messages').insert({ organization_id: orgId, campaign_id: campaign.id, candidate_id: candidate.id, direction: 'in', channel: 'portal', kind: 'reply', body: clean(body.note, 2000), status: 'received' }));
    }

    const { state } = await negotiationState(candidate.id, campaign);
    const terms = termsOf(campaign);
    let decision: Row | null = null;

    if (response === 'accept_offer') {
      const amount = Math.min(state.currentOffer, Math.max(terms.maxBudget, state.approvedCeiling || 0));
      decision = { action: 'accept', amount, reason: 'The candidate accepted the current offer.' };
      await must(db().from('recruitment_offers').insert({ organization_id: orgId, campaign_id: campaign.id, candidate_id: candidate.id, round: state.round,
        party: 'candidate', amount, currency: campaign.currency, pay_frequency: campaign.pay_frequency, outcome: 'accepted', note: 'Accepted the offer in the portal.' }));
      Object.assign(updates, { status: 'agreed', final_comp: amount });
    } else if (response === 'request') {
      const requested = num(body.amount);
      if (requested === null || requested <= 0) throw fail('Enter the compensation you are asking for.');
      if (requested > Number(campaign.max_budget) * 20) throw fail('Please check the amount and the pay period.');
      updates.expected_comp = requested;
      const d = negotiate(terms, state, requested);
      decision = d;
      await must(db().from('recruitment_offers').insert({ organization_id: orgId, campaign_id: campaign.id, candidate_id: candidate.id, round: state.round,
        party: 'candidate', amount: requested, currency: campaign.currency, pay_frequency: campaign.pay_frequency, outcome: 'request', note: clean(body.note, 300) }));
      const outcome = d.action === 'accept' ? 'accepted' : d.action === 'escalate' ? 'escalated' : 'counter';
      await must(db().from('recruitment_offers').insert({ organization_id: orgId, campaign_id: campaign.id, candidate_id: candidate.id,
        round: d.action === 'counter' ? state.round + 1 : state.round, party: 'agent',
        amount: d.amount, currency: campaign.currency, pay_frequency: campaign.pay_frequency, outcome, note: d.reason }));
      updates.status = d.action === 'accept' ? 'agreed' : d.action === 'escalate' ? 'awaiting_approval' : 'negotiating';
      if (d.action === 'accept') updates.final_comp = d.amount;
      await event(orgId, `negotiation.${d.action}`, `${candidate.full_name} asked ${fmtMoney(requested, campaign)} → agent ${d.action === 'accept' ? `agreed at ${fmtMoney(d.amount, campaign)}` : d.action === 'escalate' ? `held at ${fmtMoney(d.amount, campaign)} and asked the company to decide` : `offered ${fmtMoney(d.amount, campaign)}`}.`, { campaign_id: campaign.id, candidate_id: candidate.id, level: d.action === 'escalate' ? 'warning' : 'info' });
    } else if (response === 'interested' || response === 'update_details') {
      if (['sourced', 'evaluated', 'contacted'].includes(candidate.status)) updates.status = 'interested';
      await event(orgId, 'candidate.interested', `${candidate.full_name} ${response === 'interested' ? 'is interested' : 'updated their details'}${updates.availability ? ` (availability: ${updates.availability})` : ''}.`, { campaign_id: campaign.id, candidate_id: candidate.id });
    } else {
      throw fail('Unknown response.');
    }

    await must(db().from('recruitment_candidates').update(updates).eq('id', candidate.id));
    if (decision?.action === 'accept') {
      await event(orgId, 'candidate.agreed', `${candidate.full_name} agreed at ${fmtMoney(Number(decision.amount), campaign)}. Not hired until the company confirms.`, { campaign_id: campaign.id, candidate_id: candidate.id });
    }
    const view = await portalView({ ...candidate, ...updates });
    return { ...view, decision: decision ? { action: decision.action, amount: decision.amount } : null };
  }

  if (action === 'portal_erase') {
    const candidate = await candidateByToken(body.token);
    if (candidate.cv_path) await db().storage.from('private').remove([candidate.cv_path]);
    await must(db().from('recruitment_messages').delete().eq('candidate_id', candidate.id));
    await must(db().from('recruitment_candidates').update({
      full_name: 'Erased candidate', headline: null, profile_text: null, portfolio_url: null, cv_path: null, contact_enc: null, contact_hint: null,
      skills: [], certifications: [], languages: [], score_explanation: null, availability: null, city: null,
      erased_at: new Date().toISOString(), do_not_contact: true, status: 'withdrawn', portal_token_hash: null,
    }).eq('id', candidate.id));
    await event(candidate.organization_id, 'candidate.erased', 'A candidate erased their personal data via the portal (GDPR request).', { campaign_id: candidate.campaign_id, candidate_id: candidate.id });
    return { erased: true };
  }

  if (action.startsWith('portal_interview_')) {
    const candidate = await candidateByToken(body.token);
    await recruitmentCost(candidate.organization_id);
    const interview = await latestInterview(candidate.id);
    if (!interview) throw fail('There is no interview for you yet.', 404);
    const campaign = await must(db().from('recruitment_campaigns').select('*').eq('id', candidate.campaign_id).single()) as Row;
    const open = ['invited', 'in_progress'].includes(interview.status);
    if (open && new Date(interview.expires_at).getTime() < Date.now()) {
      await must(db().from('recruitment_interviews').update({ status: 'expired' }).eq('id', interview.id));
      throw fail('This interview link has expired. Ask the company to invite you again.', 410);
    }
    const view = async () => {
      const fresh = await latestInterview(candidate.id) as Row;
      const msgs = await iv.transcript(deps, fresh.id);
      return { status: fresh.status, questions: fresh.questions.length, current: fresh.current_index + 1, expires_at: fresh.expires_at,
        messages: msgs.map((m) => ({ role: m.role, kind: m.kind, content: m.content, at: m.created_date })) };
    };
    if (action === 'portal_interview_get') return await view();

    if (action === 'portal_interview_start') {
      if (interview.status !== 'invited') return await view();
      if (body.consents?.ai_interview !== true) throw fail('Please confirm that you agree to a written interview conducted by an AI assistant.');
      const known = await latestConsents(candidate.id);
      if (!(known.data_processing?.granted || body.consents?.data_processing === true)) throw fail('Please also agree to the processing of your information.');
      await recordConsents(candidate.organization_id, candidate.id, body.consents, 'portal', await ipHash(req));
      const org = await must(db().from('organizations').select('name').eq('id', candidate.organization_id).single()) as Row;
      await must(db().from('recruitment_interviews').update({ status: 'in_progress', started_at: new Date().toISOString() }).eq('id', interview.id));
      await iv.startInterview(deps, interview, org.name, candidate.full_name.split(' ')[0]);
      await event(candidate.organization_id, 'interview.started', `${candidate.full_name} started the written interview.`, { campaign_id: campaign.id, candidate_id: candidate.id });
      return await view();
    }

    if (action === 'portal_interview_answer') {
      if (interview.status !== 'in_progress') throw fail('This interview is not in progress.', 409);
      const text = clean(body.text, 3000);
      if (text.length < 2) throw fail('Write your answer first.');
      const msgs = await iv.transcript(deps, interview.id);
      if (msgs.at(-1)?.role !== 'agent') throw fail('Your previous answer is still being processed.', 409);
      const base44 = createClientFromRequest(req);
      const { done } = await iv.answer(deps, base44, interview, campaign, text);
      if (done) {
        await event(candidate.organization_id, 'interview.completed', `${candidate.full_name} completed the written interview.`, { campaign_id: campaign.id, candidate_id: candidate.id });
        try {
          await iv.evaluateInterview(deps, base44, { ...interview, status: 'completed' }, campaign, candidate);
        } catch (error) {
          await event(candidate.organization_id, 'interview.evaluation_failed', `Scoring ${candidate.full_name}'s interview failed: ${(error as Error).message}. It can be retried from the candidate panel.`, { campaign_id: campaign.id, candidate_id: candidate.id, level: 'error' });
        }
      }
      return await view();
    }
    throw fail('Unknown action.');
  }

  if (action === 'apply_get') {
    const campaign = await must(db().from('recruitment_campaigns').select('*').eq('apply_slug', clean(body.slug, 40)).maybeSingle()) as Row;
    if (!campaign || campaign.status !== 'active') throw fail('This position is not open for applications.', 404);
    const org = await must(db().from('organizations').select('name').eq('id', campaign.organization_id).single()) as Row;
    return { job: { ...jobView(campaign, org), offer: Number(campaign.initial_offer) }, consent_version: CONSENT_VERSION };
  }

  if (action === 'apply_submit') {
    const campaign = await must(db().from('recruitment_campaigns').select('*').eq('apply_slug', clean(body.slug, 40)).maybeSingle()) as Row;
    if (!campaign || campaign.status !== 'active') throw fail('This position is not open for applications.', 404);
    if (body.consents?.data_processing !== true) throw fail('Please agree to the processing of your information to apply.');
    await checkCaptcha(body.captcha_token, req);
    const ip = await ipHash(req);
    const hourAgo = new Date(Date.now() - 3600000).toISOString();
    const { count } = await db().from('recruitment_consents').select('id', { count: 'exact', head: true }).eq('ip_hash', ip).eq('source', 'application').eq('kind', 'data_processing').gte('recorded_at', hourAgo);
    if ((count || 0) >= 10) throw fail('Too many applications from this connection. Please try again later.', 429);
    const email = clean(body.candidate?.contact?.email, 160);
    if (!EMAIL_RE.test(email)) throw fail('Enter a valid email address.');
    const data = candidateInput(body.candidate || {});
    const contact = await writeContact(body.candidate?.contact || {});
    const row = await must(db().from('recruitment_candidates').insert({
      ...data, ...contact, organization_id: campaign.organization_id, campaign_id: campaign.id, source: 'application',
      lawful_basis: 'consent', source_detail: 'Public application page', status: 'interested', responded_at: new Date().toISOString(),
    }).select('*').single()) as Row;
    await recordConsents(campaign.organization_id, row.id, body.consents, 'application', ip);
    await event(campaign.organization_id, 'candidate.applied', `${row.full_name} applied through the public page.`, { campaign_id: campaign.id, candidate_id: row.id });
    const link = await issuePortalLink(row);
    return { ok: true, portal_url: link };
  }

  throw fail('Unknown action.');
}

// CV upload (multipart): portal token or application follow-up, PDF/DOC/DOCX up to 5 MB.
async function uploadCv(req: Request, form: FormData) {
  const candidate = await candidateByToken(String(form.get('token') || ''));
  await recruitmentCost(candidate.organization_id);
  if ((await latestConsents(candidate.id)).data_processing?.granted !== true) {
    throw fail('Please agree to the processing of your information before uploading a CV.');
  }
  const file = form.get('file');
  if (!(file instanceof File)) throw fail('Choose a file.');
  if (file.size > 5 * 1024 * 1024) throw fail('The CV must be 5 MB or smaller.');
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const types: Record<string, string> = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  if (!types[ext]) throw fail('Upload a PDF or Word document.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const magicOk = ext === 'pdf' ? String.fromCharCode(...bytes.slice(0, 4)) === '%PDF' : ext === 'docx' ? bytes[0] === 0x50 && bytes[1] === 0x4b : bytes[0] === 0xd0 && bytes[1] === 0xcf;
  if (!magicOk) throw fail('The file does not look like a real PDF or Word document.');
  const path = `recruitment/${candidate.organization_id}/${candidate.id}/cv-${Date.now()}.${ext}`;
  const { error } = await db().storage.from('private').upload(path, bytes, { contentType: types[ext], upsert: false });
  if (error) throw fail(error.message, 500);
  if (candidate.cv_path) await db().storage.from('private').remove([candidate.cv_path]);
  let cvText: string | null = null;
  if (ext === 'pdf') {
    // Best effort: the company's AI evaluation reads the CV text; a failure here only means it reads the profile alone.
    try {
      const { data: signed } = await db().storage.from('private').createSignedUrl(path, 600);
      const cv = await iv.readCv(deps, createClientFromRequest(req), signed?.signedUrl || '');
      cvText = cv.cv_text || null;
    } catch (error) {
      console.error('recruitment: CV text extraction failed', (error as Error).message);
    }
  }
  await must(db().from('recruitment_candidates').update({ cv_path: path, cv_text: cvText }).eq('id', candidate.id));
  await event(candidate.organization_id, 'candidate.cv_uploaded', `${candidate.full_name} uploaded a CV.`, { campaign_id: candidate.campaign_id, candidate_id: candidate.id });
  return { ok: true };
}

serveBase44('recruitment', async (req: Request) => {
  try {
    if ((req.headers.get('content-type') || '').startsWith('multipart/form-data')) {
      const form = await req.formData();
      return Response.json(form.get('mode') === 'import' ? await importCvFiles(req, form) : await uploadCv(req, form));
    }
    const body = await req.json().catch(() => ({}));
    const action = clean(body.action, 40);
    const result = action.startsWith('portal_') || action.startsWith('apply_')
      ? await publicAction(req, body)
      : await companyAction(req, body);
    return Response.json(result);
  } catch (error) {
    const status = Number((error as { status?: number }).status) || 500;
    if (status >= 500) console.error('recruitment failed', (error as Error).message);
    return Response.json({ error: status >= 500 && status !== 502 && status !== 503 ? 'Something went wrong. Please try again.' : (error as Error).message }, { status });
  }
});
