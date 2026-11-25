// Replacement for Base44's Core.InvokeLLM on the Anthropic Messages API.
//
// Same call signature the existing code uses:
//   InvokeLLM({ prompt, response_json_schema?, file_urls?, add_context_from_internet?, model? })
// returns a string, or the parsed object when a JSON schema is given.
//
// Hard spending guard: every call is written to public.ai_usage with its cost, and
// a call is refused once this calendar month's spend reaches AI_MONTHLY_BUDGET_USD
// (default 18, leaving headroom under the owner's $20/month cap, which should also
// be set as a spend limit on the Anthropic key itself).

import { currentContext } from './context.ts';
import { underCostCap, addCost } from './agentBilling.ts';

const API = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

// USD per million tokens, from https://platform.claude.com/en/docs/about-claude/pricing
// (checked 2026-11-23). A model missing here is costed at the most expensive
// listed rate so the budget guard can only err on the safe side.
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
};
const FALLBACK_PRICE = { input: 5, output: 25 };
const WEB_SEARCH_USD = 0.01; // $10 per 1,000 searches

const env = (name: string, fallback = '') => Deno.env.get(name) || fallback;
const model = () => env('AI_MODEL', 'claude-sonnet-5-5');
const budget = () => Number(env('AI_MONTHLY_BUDGET_USD', '18')) || 18;

const priceFor = (name: string) => PRICES[name] || FALLBACK_PRICE;

export const costOf = (name: string, inputTokens: number, outputTokens: number, searches: number) => {
  const price = priceFor(name);
  return (inputTokens / 1e6) * price.input + (outputTokens / 1e6) * price.output + searches * WEB_SEARCH_USD;
};

type Service = { from: (table: string) => any };

const monthStart = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
};

export async function spentThisMonth(service: Service): Promise<number> {
  const { data, error } = await service.from('ai_usage').select('cost_usd').gte('created_date', monthStart()).limit(100000);
  if (error) throw Object.assign(new Error('AI budget could not be checked, so the call was not made.'), { status: 503 });
  return (data || []).reduce((sum: number, row: { cost_usd: number }) => sum + Number(row.cost_usd || 0), 0);
}

async function guardBudget(service: Service) {
  const spent = await spentThisMonth(service);
  if (spent >= budget()) {
    throw Object.assign(
      new Error('The monthly AI budget for this workspace platform has been reached. AI features resume next month.'),
      { status: 429 }
    );
  }
}

// Accepts a JSON answer the model wrote as text (optionally in a ```json fence).
function jsonFromText(blocks: { type: string; text?: string }[] = []): any {
  const text = blocks.filter((b) => b.type === 'text').map((b) => b.text || '').join('').trim();
  if (!text) return undefined;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced?.[1], text];
  const start = text.search(/[[{]/);
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1));
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const value = JSON.parse(candidate.trim());
      if (value && typeof value === 'object') return value;
    } catch { /* try the next candidate */ }
  }
  return undefined;
}

async function ledger(service: Service, row: Record<string, unknown>) {
  const ctx = currentContext();
  const { error } = await service.from('ai_usage').insert({
    user_id: ctx.userId,
    organization_id: ctx.organizationId,
    function_name: ctx.fn,
    ...row,
  });
  if (error) console.error('ai: usage ledger write failed', error.message);
}

const extensionOf = (url: string) => {
  try {
    return new URL(url).pathname.split('.').pop()?.toLowerCase() || '';
  } catch {
    return '';
  }
};

const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);
const TEXTUAL = new Set(['txt', 'csv', 'md', 'json', 'tsv', 'xml', 'html', 'htm', 'log']);

async function fileBlocks(urls: string[]) {
  const blocks: unknown[] = [];
  for (const url of urls.slice(0, 5)) {
    const ext = extensionOf(url);
    if (IMAGE.has(ext)) blocks.push({ type: 'image', source: { type: 'url', url } });
    else if (ext === 'pdf') blocks.push({ type: 'document', source: { type: 'url', url } });
    else if (TEXTUAL.has(ext)) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        const text = (await res.text()).slice(0, 60000);
        blocks.push({ type: 'text', text: `Attached file (${ext}):\n${text}` });
      } catch {
        blocks.push({ type: 'text', text: `An attached .${ext} file could not be read.` });
      }
    } else {
      blocks.push({ type: 'text', text: `An attached file of type .${ext || 'unknown'} could not be read by the model (supported: PDF, images, text, CSV, JSON).` });
    }
  }
  return blocks;
}

// JSON-schema objects from the existing code are used as a tool input schema.
function outputTool(schema: Record<string, unknown>) {
  const input_schema = schema && schema.type === 'object' ? schema : { type: 'object', properties: { result: schema } };
  return {
    name: 'submit_result',
    description: 'Return the final answer in exactly this structure. Call this once, at the end.',
    input_schema,
  };
}

type Args = {
  prompt: string;
  response_json_schema?: Record<string, unknown>;
  file_urls?: string[];
  add_context_from_internet?: boolean;
  model?: string;
  max_tokens?: number;
};

export function makeInvokeLLM(service: Service) {
  return async function InvokeLLM(args: Args) {
    const key = env('ANTHROPIC_API_KEY');
    if (!key) throw Object.assign(new Error('The AI provider is not configured.'), { status: 503 });
    await guardBudget(service);
    // Per-agent AI cost cap for the usage period this request reserved (if any).
    if (!(await underCostCap(service as any))) {
      throw Object.assign(new Error('This agent has reached its monthly processing limit. It resumes next billing period.'), { status: 429 });
    }

    const name = model();
    const schema = args.response_json_schema;
    const tools: unknown[] = [];
    if (args.add_context_from_internet) {
      tools.push({ type: env('AI_WEB_SEARCH_TOOL', 'web_search_20250305'), name: 'web_search', max_uses: Number(env('AI_MAX_SEARCHES', '5')) });
    }
    if (schema) tools.push(outputTool(schema));

    // Some models refuse a forced tool_choice, so the structured answer is requested in
    // the prompt and the tool is left on "auto"; plain-text JSON is accepted as a fallback.
    const instruction = schema
      ? '\n\nWhen you have the final answer, return it by calling the submit_result tool. Do not write the answer as plain text.'
      : '';
    const content = [...(args.file_urls?.length ? await fileBlocks(args.file_urls) : []), { type: 'text', text: String(args.prompt || '') + instruction }];
    const messages: { role: string; content: unknown }[] = [{ role: 'user', content }];
    const maxTokens = args.max_tokens || (args.add_context_from_internet ? 8000 : 4096);

    let inputTokens = 0;
    let outputTokens = 0;
    let searches = 0;

    const call = async (toolChoice?: unknown) => {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': API_VERSION, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: name,
          max_tokens: maxTokens,
          messages,
          ...(tools.length ? { tools } : {}),
          ...(toolChoice ? { tool_choice: toolChoice } : {}),
        }),
        signal: AbortSignal.timeout(Number(env('AI_CALL_TIMEOUT_MS', '120000'))),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = body?.error?.message || `AI provider error (${res.status})`;
        throw Object.assign(new Error(message), { status: res.status === 429 ? 429 : 502 });
      }
      inputTokens += Number(body.usage?.input_tokens || 0) + Number(body.usage?.cache_read_input_tokens || 0);
      outputTokens += Number(body.usage?.output_tokens || 0);
      searches += Number(body.usage?.server_tool_use?.web_search_requests || 0);
      return body;
    };

    let ok = false;
    let failure = '';
    try {
      let body = await call();

      for (let turn = 0; turn < 6; turn += 1) {
        const toolUse = (body.content || []).find((block: { type: string; name?: string }) => block.type === 'tool_use' && block.name === 'submit_result');
        if (toolUse) {
          ok = true;
          const input = toolUse.input || {};
          return schema && schema.type !== 'object' ? input.result : input;
        }
        if (!schema && body.stop_reason !== 'pause_turn') {
          ok = true;
          return (body.content || [])
            .filter((block: { type: string }) => block.type === 'text')
            .map((block: { text: string }) => block.text)
            .join('')
            .trim();
        }
        // Long web-search turns pause; continue them.
        if (body.stop_reason !== 'pause_turn') {
          const parsed = jsonFromText(body.content);
          if (parsed !== undefined) {
            ok = true;
            return schema && schema.type !== 'object' && parsed && typeof parsed === 'object' && 'result' in parsed ? parsed.result : parsed;
          }
        }
        messages.push({ role: 'assistant', content: body.content });
        if (body.stop_reason !== 'pause_turn') {
          messages.push({ role: 'user', content: [{ type: 'text', text: 'Now return the final answer by calling the submit_result tool.' }] });
        }
        body = await call();
      }
      throw Object.assign(new Error('The model did not return a final answer.'), { status: 502 });
    } catch (error) {
      failure = String((error as Error)?.message || error).slice(0, 500);
      throw error;
    } finally {
      const callCost = Number(costOf(name, inputTokens, outputTokens, searches).toFixed(6));
      await addCost(service as any, callCost);
      await ledger(service, {
        model: name,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        web_searches: searches,
        cost_usd: callCost,
        ok,
        ...(failure ? { error: failure } : {}),
      });
    }
  };
}
