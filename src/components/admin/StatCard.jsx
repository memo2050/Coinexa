export default function StatCard({ label, value, hint, tone = 'default' }) {
  const tones = {
    default: 'text-white',
    muted: 'text-slate-500',
    good: 'text-emerald-300',
    warn: 'text-amber-300',
    bad: 'text-rose-300',
  };

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#0a0f19] px-4 py-3.5">
      <div
        className={`font-heading text-2xl font-semibold tracking-[-0.02em] ${tones[tone] || tones.default}`}
      >
        {value}
      </div>
      <div className="mt-1 text-[0.66rem] uppercase tracking-[0.14em] text-slate-500">{label}</div>
      {hint && <div className="mt-1.5 text-[0.68rem] leading-relaxed text-slate-500">{hint}</div>}
    </div>
  );
}