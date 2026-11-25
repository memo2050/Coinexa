import { Loader2 } from 'lucide-react';

export const STATUS = {
  sourced: { label: 'Discovered', tone: 'slate' },
  evaluated: { label: 'Evaluated', tone: 'sky' },
  contacted: { label: 'Contacted', tone: 'sky' },
  interested: { label: 'Interested', tone: 'cyan' },
  negotiating: { label: 'Negotiating', tone: 'amber' },
  awaiting_approval: { label: 'Awaiting your approval', tone: 'amber' },
  agreed: { label: 'Agreed terms', tone: 'emerald' },
  declined: { label: 'Declined', tone: 'rose' },
  hired: { label: 'Hired', tone: 'emerald' },
  withdrawn: { label: 'Withdrawn', tone: 'slate' },
};

const TONES = {
  slate: 'border-white/10 bg-white/[0.04] text-slate-300',
  sky: 'border-sky-400/25 bg-sky-400/10 text-sky-200',
  cyan: 'border-cyan-400/25 bg-cyan-400/10 text-cyan-200',
  amber: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  emerald: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  rose: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
};

export function StatusPill({ status }) {
  const s = STATUS[status] || { label: status, tone: 'slate' };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.68rem] font-semibold ${TONES[s.tone]}`}>
      {s.label}
    </span>
  );
}

export function Panel({ title, description, actions, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-white/[0.07] bg-[#0a0f19] p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="font-heading text-base font-semibold text-white">{title}</h2>}
            {description && <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone = 'text-white' }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#0a0f19] px-4 py-3">
      <p className={`font-heading text-2xl font-semibold ${tone}`}>{value}</p>
      <p className="mt-0.5 text-[0.66rem] uppercase tracking-[0.16em] text-slate-500">{label}</p>
      {hint && <p className="mt-1 text-[0.68rem] text-slate-500">{hint}</p>}
    </div>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="flex items-center gap-2 py-16 text-sm text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">{children}</p>;
}

export const primaryBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_-14px_rgba(34,211,238,0.9)] transition-transform duration-300 hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50';
export const ghostBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:border-white/25 hover:text-white disabled:pointer-events-none disabled:opacity-50';
export const inputCls =
  'w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-sky-400/50 focus:outline-none focus:ring-2 focus:ring-sky-400/20';

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1 block text-[0.7rem] text-slate-500">{hint}</span>}
    </label>
  );
}

const PER = { hourly: 'hour', daily: 'day', monthly: 'month' };

export function money(amount, currency = 'USD', frequency) {
  if (amount === null || amount === undefined || amount === '') return '—';
  let text;
  try {
    text = new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(amount));
  } catch {
    text = `${Number(amount).toFixed(2)} ${currency}`;
  }
  return frequency ? `${text} / ${PER[frequency] || frequency}` : text;
}

export const when = (value) => (value ? new Date(value).toLocaleString() : '—');
