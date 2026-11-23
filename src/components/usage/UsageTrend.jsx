const number = new Intl.NumberFormat('en-US');

export default function UsageTrend({ months }) {
  const max = Math.max(1, ...months.map((month) => month.units));

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#0a0f19] p-5 sm:p-6">
      <h2 className="font-heading text-base font-semibold text-white">Usage per month</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        Metered units recorded in each calendar month (UTC).
      </p>

      {months.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No usage has been metered yet.</p>
      ) : (
        <div className="mt-6 flex items-end gap-2 overflow-x-auto pb-1">
          {months.map((month) => (
            <div key={month.key} className="flex min-w-[52px] flex-1 flex-col items-center gap-2">
              <span className="text-[0.68rem] font-semibold text-slate-300">
                {number.format(month.units)}
              </span>
              <div className="flex h-28 w-full items-end">
                <div
                  className="w-full rounded-t-lg bg-gradient-to-t from-blue-600/70 via-sky-500/80 to-cyan-400"
                  style={{ height: `${Math.max(4, (month.units / max) * 100)}%` }}
                />
              </div>
              <span className="whitespace-nowrap text-[0.62rem] uppercase tracking-[0.1em] text-slate-500">
                {month.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}