// Verified, model-specific pricing for AI cost reporting.
//
// A rate is entered here only once the price for that exact model label has been
// confirmed. Anything missing is reported to the admin as "No Rate Configured"
// rather than estimated from a guess. Amounts are USD per 1,000,000 tokens.
export const MODEL_PRICING = {
  // 'exact-model-label': { input_per_mtok: 0, output_per_mtok: 0 },
};

const usable = (rate) =>
  Boolean(rate) && (Number(rate.input_per_mtok) > 0 || Number(rate.output_per_mtok) > 0);

export const rateFor = (model) => {
  const key = String(model || '').trim();
  if (!key) return null;
  const rate = MODEL_PRICING[key];
  return usable(rate) ? rate : null;
};

export const pricedModels = () =>
  Object.keys(MODEL_PRICING).filter((key) => usable(MODEL_PRICING[key]));

// Null means "no verified rate" or "no captured tokens"; the interface renders
// both as "No Rate Configured" rather than showing an invented number.
export const estimateCost = ({ model, inputTokens, outputTokens }) => {
  const rate = rateFor(model);
  if (!rate) return null;
  const input = Number(inputTokens) || 0;
  const output = Number(outputTokens) || 0;
  if (input <= 0 && output <= 0) return null;
  const cost =
    (input / 1e6) * (Number(rate.input_per_mtok) || 0) +
    (output / 1e6) * (Number(rate.output_per_mtok) || 0);
  return Math.round(cost * 10000) / 10000;
};