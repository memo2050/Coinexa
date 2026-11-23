const number = new Intl.NumberFormat('en-US');

export default function UsageBreakdown({ title, description, items, emptyLabel }) {
  const max = Math.max(1, ...items.map((item) => item.units));

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#0a0f19] p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-base font-semibold text-white">{title}</h2>
        <p className="text-[0.68rem] uppercase tracking-[0.14em] text-slate-500">
          {items.length} {items.length === 1 ? 'row' : 'rows'}
        </p>
      </div>
      {description && <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>}

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">{emptyLabel}</p>
      ) : (
        <ul className="mt-5 space-y-3.5">
          {items.map((item) => (
            <li key={item.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm text-slate-300">{item.label}</span>
                <span className="shrink-0 font-heading text-sm font-semibold text-white">
                  {number.format(item.units)}
                  <span className="ml-1.5 text-[0.68rem] font-normal uppercase tracking-[0.12em] text-slate-500">
                    units
                  </span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400"
                  style={{ width: `${Math.max(2, (item.units / max) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-[0.68rem] uppercase tracking-[0.12em] text-slate-600">
                {number.format(item.events)} {item.events === 1 ? 'event' : 'events'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}