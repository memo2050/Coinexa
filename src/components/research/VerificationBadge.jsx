import { STATUS_LABELS } from '@/components/research/researchHelpers';

const STYLES = {
  VERIFIED: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
  PARTIALLY_VERIFIED: 'border-amber-400/30 bg-amber-500/10 text-amber-200',
  ESTIMATED: 'border-yellow-400/25 bg-yellow-500/10 text-yellow-200',
  UNVERIFIED: 'border-rose-400/30 bg-rose-500/10 text-rose-200',
  UNAVAILABLE: 'border-white/10 bg-white/[0.04] text-slate-400',
};

export default function VerificationBadge({ status, className = '' }) {
  const key = STYLES[status] ? status : 'UNAVAILABLE';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.1em] ${STYLES[key]} ${className}`}
    >
      {STATUS_LABELS[key]}
    </span>
  );
}