export default function ScoreBreakdown({ score }) {
  if (!score) return null;
  return (
    <div className="mt-4 rounded-xl border border-white/[0.08] bg-[#05070a]/60 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Product score
        </p>
        <p className="text-sm font-semibold text-white">
          {score.total}
          <span className="text-slate-500">/{score.max_total}</span>
        </p>
      </div>

      <ul className="mt-3 space-y-2.5">
        {(score.categories || []).map((category) => {
          const ratio = category.max ? (category.points / category.max) * 100 : 0;
          return (
            <li key={category.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 break-words text-slate-300">{category.label}</span>
                <span className="shrink-0 font-mono text-xs text-slate-400">
                  {category.points}/{category.max}
                </span>
              </div>
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/[0.07]">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${
                    category.status === 'UNAVAILABLE' ? 'from-slate-600 to-slate-500' : 'from-sky-500 to-cyan-400'
                  }`}
                  style={{ width: `${Math.max(2, ratio)}%` }}
                />
              </div>
              <p className="mt-1 break-words text-[0.7rem] leading-relaxed text-slate-500">{category.explanation}</p>
              {category.missing?.length > 0 && (
                <p className="mt-0.5 break-words text-[0.7rem] leading-relaxed text-rose-300/70">
                  Missing: {category.missing.join(', ')}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-3 border-t border-white/[0.06] pt-2.5 text-[0.72rem] leading-relaxed text-slate-400">
        {score.verdict}
      </p>
    </div>
  );
}