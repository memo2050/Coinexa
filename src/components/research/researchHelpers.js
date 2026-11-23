export function isResearchAgent(agent) {
  const haystack = [
    agent?.name,
    agent?.specialization,
    agent?.industry,
    agent?.summary,
    agent?.business_description,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!haystack) return false;
  if (haystack.includes('hazel')) return true;
  return /(product|market|sourcing|supplier)\s*research/.test(haystack);
}

export function money(value, currency = 'EGP') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`;
}

export const STATUS_LABELS = {
  VERIFIED: 'Verified',
  PARTIALLY_VERIFIED: 'Partly verified',
  ESTIMATED: 'Estimated',
  UNVERIFIED: 'Unverified',
  UNAVAILABLE: 'Unavailable',
};

export const STOCK_LABELS = {
  in_stock: 'In stock',
  out_of_stock: 'Out of stock',
  unknown: 'Availability unknown',
};