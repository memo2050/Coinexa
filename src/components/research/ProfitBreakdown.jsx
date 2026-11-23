import VerificationBadge from '@/components/research/VerificationBadge';
import { money } from '@/components/research/researchHelpers';

export default function ProfitBreakdown({ profit }) {
  if (!profit) return null;
  const currency = profit.currency || 'EGP';

  return (
    <div className="mt-4 rounded-xl border border-white/[0.08] bg-[#05070a]/60 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Profit calculation
        </p>
        <VerificationBadge status={profit.status} />
      </div>

      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-400">Selling price</dt>
          <dd className="font-mono text-slate-200">{money(profit.selling_price, currency)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-400">Supplier cost</dt>
          <dd className="font-mono text-slate-200">{money(profit.supplier_cost, currency)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-white/[0.06] pt-1.5">
          <dt className="text-slate-300">Gross profit</dt>
          <dd className="font-mono font-semibold text-white">{money(profit.gross_profit, currency)}</dd>
        </div>
        {(profit.expenses || []).map((expense) => (
          <div key={expense.key} className="flex items-baseline justify-between gap-3">
            <dt className="min-w-0 text-slate-400">
              <span className="break-words">{expense.label}</span>
              {expense.status === 'ESTIMATED' && (
                <span className="ml-1.5 text-[0.6rem] uppercase tracking-[0.1em] text-amber-300/80">assumed</span>
              )}
            </dt>
            <dd className="shrink-0 font-mono text-slate-300">
              {expense.amount === null ? '—' : `− ${money(expense.amount, currency)}`}
            </dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 border-t border-white/[0.06] pt-1.5">
          <dt className="text-slate-400">Total expenses</dt>
          <dd className="font-mono text-slate-200">− {money(profit.total_expenses, currency)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="font-semibold text-white">Estimated net profit</dt>
          <dd className="font-mono text-base font-semibold text-emerald-300">{money(profit.net_profit, currency)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-400">Net margin</dt>
          <dd className="font-mono text-slate-200">
            {profit.margin_percent === null ? '—' : `${profit.margin_percent}%`}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-400">Break-even selling price</dt>
          <dd className="font-mono text-slate-200">{money(profit.break_even_price, currency)}</dd>
        </div>
      </dl>

      {profit.notes?.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-white/[0.06] pt-2.5 text-[0.7rem] leading-relaxed text-amber-200/80">
          {profit.notes.map((note) => (
            <li key={note} className="break-words">
              {note}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}