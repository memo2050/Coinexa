const styles = {
  active: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  idle: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
  running: 'border-sky-400/40 bg-sky-400/15 text-sky-200',
  paused: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  failed: 'border-rose-400/30 bg-rose-400/10 text-rose-300',
  draft: 'border-white/15 bg-white/[0.04] text-slate-400',
};

const labels = {
  active: 'Active',
  idle: 'Idle',
  running: 'Running',
  paused: 'Paused',
  failed: 'Failed',
  draft: 'Draft',
};

export default function AgentStatusPill({ status = 'draft', className = '' }) {
  const key = styles[status] ? status : 'draft';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] ${styles[key]} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full bg-current ${key === 'running' ? 'animate-pulse' : ''}`} />
      {labels[key]}
    </span>
  );
}