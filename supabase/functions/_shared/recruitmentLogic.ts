// Pure logic for the Recruitment Agent: no network, no database. Everything that
// decides money, evidence or personal data lives here so it can be unit-tested.

// ---------------------------------------------------------------- Negotiation --

export type Strategy = 'conservative' | 'balanced' | 'flexible';

export type NegotiationTerms = {
  initialOffer: number; // the company's opening figure
  maxBudget: number; // the most the agent may ever agree to
  strategy: Strategy;
  maxRounds: number; // counteroffers the agent may make before handing back
};

export type NegotiationState = {
  round: number; // counteroffers already made by the agent
  currentOffer: number; // the agent's last figure (starts at initialOffer)
  approvedCeiling?: number | null; // a higher figure the company approved for THIS candidate
};

export type NegotiationDecision =
  | { action: 'accept'; amount: number; reason: string }
  | { action: 'counter'; amount: number; reason: string }
  | { action: 'escalate'; amount: number; requested: number; reason: string }
  | { action: 'final_offer'; amount: number; reason: string };

// Share of the remaining gap the agent concedes on each counteroffer.
const CONCESSION: Record<Strategy, number> = { conservative: 0.25, balanced: 0.4, flexible: 0.6 };

const money = (value: number) => Math.round(value * 100) / 100;

export function validateTerms(terms: NegotiationTerms): string[] {
  const errors: string[] = [];
  if (!(terms.initialOffer > 0)) errors.push('The initial offer must be above zero.');
  if (!(terms.maxBudget > 0)) errors.push('The maximum budget must be above zero.');
  if (terms.initialOffer > terms.maxBudget) errors.push('The initial offer cannot be higher than the maximum budget.');
  if (!CONCESSION[terms.strategy]) errors.push('Unknown negotiation strategy.');
  if (!(terms.maxRounds >= 1 && terms.maxRounds <= 6)) errors.push('Negotiation rounds must be between 1 and 6.');
  return errors;
}

// Decides the agent's response to a candidate's requested figure. The result can
// never exceed the authorised ceiling (maxBudget, or a higher figure the company
// approved for this candidate). Anything above the ceiling goes to the company.
export function negotiate(terms: NegotiationTerms, state: NegotiationState, requested: number): NegotiationDecision {
  const problems = validateTerms(terms);
  if (problems.length) throw new Error(problems.join(' '));
  if (!(requested > 0)) throw new Error('The requested amount must be above zero.');

  const ceiling = Math.max(terms.maxBudget, state.approvedCeiling || 0);
  const current = Math.min(state.currentOffer || terms.initialOffer, ceiling);

  if (requested <= current) {
    return { action: 'accept', amount: money(requested), reason: 'The request is at or below the current offer.' };
  }
  if (requested <= ceiling && state.round >= terms.maxRounds) {
    return { action: 'accept', amount: money(requested), reason: 'The request is within the authorised budget.' };
  }
  if (requested > ceiling && state.round >= terms.maxRounds) {
    if (current < ceiling) {
      return { action: 'final_offer', amount: money(ceiling), reason: 'Final offer at the authorised maximum.' };
    }
    return {
      action: 'escalate',
      amount: money(ceiling),
      requested: money(requested),
      reason: 'The request is above the authorised maximum; the company must decide.',
    };
  }

  const target = Math.min(requested, ceiling);
  let next = money(current + (target - current) * CONCESSION[terms.strategy]);
  if (next <= current) next = money(Math.min(target, current + 0.01));
  next = Math.min(next, ceiling);

  // Close to the ask and within budget: settle instead of haggling over small change.
  if (requested <= ceiling && requested - next <= Math.max(1, requested * 0.03)) {
    return { action: 'accept', amount: money(requested), reason: 'The remaining gap is small and within budget.' };
  }
  return { action: 'counter', amount: next, reason: `Counteroffer (round ${state.round + 1} of ${terms.maxRounds}).` };
}

// ------------------------------------------------- Money in generated wording --

// Every number in the text that looks like an amount. Used to make sure AI-written
// wording never states a figure above what the engine authorised.
export function amountsIn(text: string): number[] {
  const found: number[] = [];
  for (const match of String(text || '').matchAll(/(?<![\w.])(\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.(\d{1,2}))?(?![\w%])/g)) {
    const whole = match[1].replace(/[,\s]/g, '');
    const value = Number(`${whole}${match[2] ? `.${match[2]}` : ''}`);
    if (Number.isFinite(value)) found.push(value);
  }
  return found;
}

// True when no amount in the text is above the authorised figure. Small numbers
// (days, years, counts) are allowed because they cannot be confused with pay.
export function wordingWithinLimit(text: string, authorised: number, smallNumberLimit = 31): boolean {
  return amountsIn(text).every((value) => value <= authorised || value <= smallNumberLimit);
}

// --------------------------------------------------------- Evidence checking --

const normalise = (value: string) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

// The AI must quote evidence from the candidate's own profile. Quotes that do not
// appear in the source text are removed and counted, so a score can never rest on
// an invented qualification.
export function verifyEvidence(
  criteria: { criterion: string; score: number; evidence?: string; status?: string }[],
  sourceText: string
) {
  const haystack = ` ${normalise(sourceText)} `;
  let removed = 0;
  const checked = (criteria || []).map((item) => {
    const quote = normalise(item.evidence || '');
    const ok = quote.length >= 3 && haystack.includes(quote);
    if (item.evidence && !ok) {
      removed += 1;
      return { ...item, evidence: '', status: 'unverified', score: Math.min(item.score, 0) };
    }
    if (!item.evidence) return { ...item, status: item.status || 'unknown', score: Math.min(item.score, 0) };
    return { ...item, status: item.status || 'met' };
  });
  return { criteria: checked, removed };
}

export function weightedScore(criteria: { score: number; weight?: number }[]) {
  const usable = (criteria || []).filter((c) => Number.isFinite(c.score));
  const totalWeight = usable.reduce((sum, c) => sum + (c.weight || 1), 0);
  if (!totalWeight) return 0;
  const value = usable.reduce((sum, c) => sum + Math.max(0, Math.min(100, c.score)) * (c.weight || 1), 0) / totalWeight;
  return Math.round(value);
}

// ------------------------------------------------------------- Personal data --

export const maskEmail = (email: string) => {
  const [user, domain] = String(email || '').split('@');
  if (!user || !domain) return '';
  return `${user[0]}${'*'.repeat(Math.max(1, Math.min(4, user.length - 1)))}@${domain}`;
};

export const maskPhone = (phone: string) => {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 4 ? `•••• ${digits.slice(-3)}` : '';
};

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

function importKey(rawBase64: string) {
  const raw = unb64(rawBase64);
  if (raw.length !== 32) throw new Error('RECRUITMENT_DATA_KEY must be 32 bytes (base64).');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

// AES-256-GCM. Format: v1:<iv>:<ciphertext>, both base64.
export async function encryptJson(value: unknown, keyBase64: string): Promise<string> {
  const key = await importKey(keyBase64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(value));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
  return `v1:${b64(iv)}:${b64(cipher)}`;
}

export async function decryptJson<T = Record<string, string>>(payload: string, keyBase64: string): Promise<T | null> {
  if (!payload) return null;
  const [version, ivText, cipherText] = payload.split(':');
  if (version !== 'v1' || !ivText || !cipherText) throw new Error('Unknown encrypted format.');
  const key = await importKey(keyBase64);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(ivText) }, key, unb64(cipherText));
  return JSON.parse(new TextDecoder().decode(plain));
}

export function newPortalToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256(text: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// --------------------------------------------------------------------- CSV --

// RFC 4180 parser (quoted fields, embedded commas, quotes and newlines).
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const input = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  return rows.slice(1).map((cells) => Object.fromEntries(headers.map((h, i) => [h, (cells[i] || '').trim()])));
}

// Cells that start with = + - @ are prefixed so spreadsheets never run them as formulas.
export function toCsv(rows: Record<string, unknown>[], columns: { key: string; label: string }[]) {
  const cell = (value: unknown) => {
    let text = value === null || value === undefined ? '' : Array.isArray(value) ? value.join('; ') : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [columns.map((c) => cell(c.label)).join(','), ...rows.map((r) => columns.map((c) => cell(r[c.key])).join(','))].join('\r\n');
}

export const listFrom = (value: unknown, max = 30) =>
  (Array.isArray(value) ? value : String(value || '').split(/[;,\n]/))
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, max)
    .map((item) => item.slice(0, 120));
