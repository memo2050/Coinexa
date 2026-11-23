const number = new Intl.NumberFormat('en-US');

export default function UsageStatCards({ stats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-2xl border border-white/[0.08] bg-[#0a0f19] px-4 py-3.5"
        >
          <div className="font-heading text-2xl font-semibold tracking-[-0.02em] text-white">
            {number.format(stat.value)}
          </div>
          <div className="mt-1 text-[0.68rem] uppercase tracking-[0.14em] text-slate-500">
            {stat.label}
          </div>
        </div>
      ))}
    </div>
  );
}