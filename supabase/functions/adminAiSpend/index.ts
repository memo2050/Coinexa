// Coinexa addition (not in the Base44 original): real AI spend for the admin
// console, read from the ai_usage ledger that every model call writes to.
// Platform admins only; the role is re-checked on the server.
import { serveBase44 } from '../_shared/http.ts';
import { adminContext, adminFailure } from '../_shared/adminGuard.ts';
import { service as serviceClient } from '../_shared/base44shim.ts';

const monthStart = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
};
const money = (value: number) => Math.round(value * 10000) / 10000;

serveBase44('adminAiSpend', async (req: Request) => {
  const ctx = await adminContext(req);
  if (ctx.response) return ctx.response;
  try {
    const { data, error } = await serviceClient()
      .from('ai_usage')
      .select('function_name, model, input_tokens, output_tokens, web_searches, cost_usd, ok, error, created_date')
      .gte('created_date', monthStart())
      .order('created_date', { ascending: false })
      .limit(20000);
    if (error) throw error;
    const rows = data || [];
    const byFunction: Record<string, { calls: number; costUsd: number; failed: number }> = {};
    let cost = 0, input = 0, output = 0, searches = 0, failed = 0;
    for (const row of rows) {
      const c = Number(row.cost_usd || 0);
      cost += c;
      input += Number(row.input_tokens || 0);
      output += Number(row.output_tokens || 0);
      searches += Number(row.web_searches || 0);
      if (!row.ok) failed += 1;
      const key = row.function_name || 'other';
      byFunction[key] ||= { calls: 0, costUsd: 0, failed: 0 };
      byFunction[key].calls += 1;
      byFunction[key].costUsd += c;
      if (!row.ok) byFunction[key].failed += 1;
    }
    const budget = Number(Deno.env.get('AI_MONTHLY_BUDGET_USD') || '18');
    const lastError = rows.find((row) => !row.ok && row.error);
    return Response.json({
      month: monthStart().slice(0, 7),
      model: Deno.env.get('AI_MODEL') || 'claude-sonnet-5-5',
      monthCostUsd: money(cost),
      budgetUsd: budget,
      budgetUsedPercent: budget > 0 ? Math.round((cost / budget) * 1000) / 10 : null,
      calls: rows.length,
      failedCalls: failed,
      inputTokens: input,
      outputTokens: output,
      webSearches: searches,
      byFunction: Object.entries(byFunction)
        .map(([name, v]) => ({ name, calls: v.calls, failed: v.failed, costUsd: money(v.costUsd) }))
        .sort((a, b) => b.costUsd - a.costUsd),
      lastError: lastError ? { at: lastError.created_date, function: lastError.function_name, message: lastError.error } : null,
    });
  } catch (error) {
    return adminFailure('adminAiSpend', error, 'AI spend could not be loaded.');
  }
});
