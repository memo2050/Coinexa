export default function BarList({ items, formatValue = (value) => value, emptyLabel }) {
  if (!items?.length) {
    return <p className="py-4 text-xs text-slate-500">{emptyLabel}</p>;
  }

  const max = Math.max(...items.map((item) => Number(item.value) || 0), 1);

  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.key ?? item.label}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-xs text-slate-300">{item.label}</span>
            <span className="shrink-0 font-mono text-[0.7rem] text-slate-400">
              {formatValue(item.value)}
              {item.meta ? ` · ${item.meta}` : ''}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 via-sky-400 to-cyan-300"
              style={{ width: `${Math.max(2, (Number(item.value) / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}