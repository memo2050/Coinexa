const CLASSES = {
  customer: {
    label: 'Production',
    className: 'border-emerald-400/35 bg-emerald-500/10 text-emerald-300',
  },
  internal: {
    label: 'Internal',
    className: 'border-purple-400/35 bg-purple-500/10 text-purple-300',
  },
  test: {
    label: 'Test',
    className: 'border-amber-400/35 bg-amber-500/10 text-amber-300',
  },
};

export default function DataClassBadge({ value, className = '' }) {
  const meta = CLASSES[value] || CLASSES.test;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-[0.12em] ${meta.className} ${className}`}
    >
      {meta.label}
    </span>
  );
}