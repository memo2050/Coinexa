import BarList from '@/components/admin/BarList';
import StatCard from '@/components/admin/StatCard';
import useAdminEndpoint from '@/components/admin/useAdminEndpoint';
import { fmtDate, fmtNumber } from '@/components/admin/format';

const LABELS = {
  generateAgent: 'Agent generation',
  chatWithAgent: 'Agent chat',
  runAgentTask: 'Task runs',
  resumeAgentTask: 'Approved steps',
  productResearch: 'Product research',
  recalcResearch: 'Research recalculation',
};

// Real AI spend from the ai_usage ledger (every model call is costed there).
export default function AiSpendPanel() {
  const { data, error } = useAdminEndpoint('adminAiSpend');

  if (error) {
    return <p className="text-xs text-rose-300">{error}</p>;
  }
  if (!data) return null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="AI spend this month"
          value={`$${data.monthCostUsd.toFixed(2)}`}
          tone={data.budgetUsedPercent >= 80 ? 'warn' : 'default'}
          hint={`${data.budgetUsedPercent ?? 0}% of the $${data.budgetUsd} cap. AI features pause when it is reached.`}
        />
        <StatCard label="AI calls" value={fmtNumber(data.calls)} hint={`${fmtNumber(data.failedCalls)} failed · model ${data.model}`} />
        <StatCard
          label="Tokens"
          value={fmtNumber(data.inputTokens + data.outputTokens)}
          hint={`${fmtNumber(data.inputTokens)} in · ${fmtNumber(data.outputTokens)} out`}
        />
        <StatCard label="Web searches" value={fmtNumber(data.webSearches)} hint="Used by product research" />
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-[#0a0f19] p-5">
        <h2 className="font-heading text-base font-semibold text-white">AI spend by feature · {data.month}</h2>
        <p className="mt-1 mb-4 text-xs text-slate-500">Actual cost of every model call, from the AI usage ledger.</p>
        <BarList
          items={data.byFunction.map((row) => ({
            key: row.name,
            label: LABELS[row.name] || row.name,
            value: row.costUsd,
            meta: `${fmtNumber(row.calls)} calls${row.failed ? `, ${row.failed} failed` : ''}`,
          }))}
          formatValue={(value) => `$${Number(value).toFixed(2)}`}
          emptyLabel="No AI calls this month yet."
        />
        {data.lastError && (
          <p className="mt-4 rounded-lg border border-amber-400/20 bg-amber-500/5 px-3 py-2 text-[0.7rem] text-amber-200">
            Last failed AI call ({LABELS[data.lastError.function] || data.lastError.function}, {fmtDate(data.lastError.at)}):{' '}
            {data.lastError.message}
          </p>
        )}
      </div>
    </div>
  );
}
