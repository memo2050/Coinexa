// Evidence-first product research engine shared by productResearch, recalcResearch
// and exportResearchXlsx. All money and scoring is computed here on the server —
// never by the language model.

export const STATUS = {
  VERIFIED: 'VERIFIED',
  PARTIALLY_VERIFIED: 'PARTIALLY_VERIFIED',
  ESTIMATED: 'ESTIMATED',
  UNVERIFIED: 'UNVERIFIED',
  UNAVAILABLE: 'UNAVAILABLE',
};

export const SUPPLIERS = [
  { key: 'safqa', name: 'Safqa' },
  { key: 'taager', name: 'Taager' },
  { key: 'tagerly', name: 'Tagerly' },
];

export const DEFAULT_ASSUMPTIONS = {
  currency: 'EGP',
  shipping_cost: 0,
  advertising_cost: 0,
  payment_fee_percent: 2.5,
  packaging_cost: 0,
  return_rate_percent: 8,
  other_cost: 0,
};

export const SCORE_MAX = 100;

const num = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const round = (value, digits = 2) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const text = (value, max = 600) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

const list = (value, max = 8, itemMax = 300) =>
  Array.isArray(value)
    ? value.map((item) => text(item, itemMax)).filter(Boolean).slice(0, max)
    : [];

/* ---------------------------------------------------------------- URLs ---- */

export function isHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function hostOf(value) {
  if (!isHttpUrl(value)) return '';
  return new URL(value.trim()).hostname.toLowerCase();
}

export function normalizeUrl(value) {
  if (!isHttpUrl(value)) return '';
  const url = new URL(value.trim());
  return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, '')}`.toLowerCase();
}

export function supplierKeyFor(name) {
  const value = text(name, 80).toLowerCase();
  if (!value) return '';
  const match = SUPPLIERS.find((supplier) => value.includes(supplier.key));
  return match ? match.key : '';
}

const NON_PRODUCT_LAST_SEGMENT =
  /^(home|home-and-kitchen|home-kitchen|kitchen|collections?|categories?|category|shop|store|products?|catalog|catalogue|search|results|en|ar|eg|all|new|offers|deals|brands?|pages?|index)$/i;

/** A supplier link only counts when it points at one individual product page,
 *  not the supplier's home, category or search page. */
export function looksLikeProductPage(url) {
  if (!isHttpUrl(url)) return false;
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  if (segments.length < 2) return false;
  const last = segments[segments.length - 1].toLowerCase();
  if (NON_PRODUCT_LAST_SEGMENT.test(last)) return false;
  const hasNumericId = /\d{3,}/.test(last);
  const hasLongSlug = last.length >= 10 && last.split('-').filter(Boolean).length >= 2;
  return hasNumericId || hasLongSlug;
}

/** A supplier link only counts as verified when its host belongs to that supplier,
 *  the page is an individual product page, and the exact page appears in the
 *  sources the research actually cited. */
export function classifySupplierUrl(url, supplierKey, sources, pageType = '') {
  if (!isHttpUrl(url)) {
    return { status: STATUS.UNVERIFIED, url: '', reason: 'No valid product URL was returned.' };
  }
  const clean = url.trim();
  const host = hostOf(clean);
  const key = supplierKey || supplierKeyFor(host);
  const onSupplierHost = key ? host.includes(key) : false;
  if (!onSupplierHost) {
    return {
      status: STATUS.UNVERIFIED,
      url: clean,
      reason: `Link host "${host}" is not a ${key ? SUPPLIERS.find((s) => s.key === key)?.name : 'known supplier'} domain.`,
    };
  }
  if (['category', 'home', 'search', 'other'].includes(String(pageType).toLowerCase())) {
    return {
      status: STATUS.UNVERIFIED,
      url: clean,
      reason: `The research labelled this page a ${String(pageType).toLowerCase()} page, not an individual product page.`,
    };
  }
  if (!looksLikeProductPage(clean)) {
    return {
      status: STATUS.UNVERIFIED,
      url: clean,
      reason: 'This link is a store or category page, not the individual product listing.',
    };
  }
  const covered = (sources || []).some((source) => normalizeUrl(source?.url) === normalizeUrl(clean));
  if (!covered) {
    return {
      status: STATUS.UNVERIFIED,
      url: clean,
      reason: 'This link was not listed among the pages the research actually opened.',
    };
  }
  return { status: STATUS.VERIFIED, url: clean, reason: 'Individual product page cited in the research sources.' };
}

/* -------------------------------------------------------------- Profit ---- */

const EXPENSE_LABELS = {
  payment_fee: 'Payment processing fees',
  shipping_cost: 'Shipping cost',
  packaging_cost: 'Packaging cost',
  advertising_cost: 'Advertising cost',
  expected_return_cost: 'Expected return cost',
  other_cost: 'Other expenses',
};

export function computeProfit(input = {}) {
  const given = input.assumptions && typeof input.assumptions === 'object' ? input.assumptions : {};
  const assumptions = { ...DEFAULT_ASSUMPTIONS, ...given };
  const currency = text(assumptions.currency, 8) || 'EGP';
  const selling = num(input.selling_price);
  const cost = num(input.supplier_cost);

  const value = (key) => {
    const own = num(given[key]);
    return own === null ? num(DEFAULT_ASSUMPTIONS[key]) : own;
  };
  const provided = (key) => num(given[key]) !== null;

  const feePercent = value('payment_fee_percent');
  const returnRate = value('return_rate_percent');
  const shipping = value('shipping_cost');
  const advertising = value('advertising_cost');
  const packaging = value('packaging_cost');
  const other = value('other_cost');
  const expectedReturn = round(((shipping || 0) + (packaging || 0)) * ((returnRate || 0) / 100));
  const paymentFee = selling === null ? null : round(selling * ((feePercent || 0) / 100));

  const expense = (key, amount, basis, isProvided) => ({
    key,
    label: EXPENSE_LABELS[key],
    amount: round(amount),
    basis,
    status: isProvided ? STATUS.VERIFIED : STATUS.ESTIMATED,
  });

  const expenses = [
    expense('shipping_cost', shipping, `Supplier shipping assumption (${currency}).`, provided('shipping_cost')),
    expense('advertising_cost', advertising, `Ad spend per order assumption (${currency}).`, provided('advertising_cost')),
    expense('payment_fee', paymentFee, `${feePercent}% of the selling price.`, provided('payment_fee_percent')),
    expense('packaging_cost', packaging, `Packaging per order assumption (${currency}).`, provided('packaging_cost')),
    expense(
      'expected_return_cost',
      expectedReturn,
      `${returnRate}% return rate applied to shipping + packaging.`,
      provided('return_rate_percent')
    ),
    expense('other_cost', other, `Other per-order costs assumption (${currency}).`, provided('other_cost')),
  ];

  const totalExpenses = round(expenses.reduce((sum, item) => sum + (item.amount || 0), 0));
  const gross = selling !== null && cost !== null ? round(selling - cost) : null;
  const net = gross !== null ? round(gross - totalExpenses) : null;
  const margin = net !== null && selling > 0 ? round((net / selling) * 100, 1) : null;
  const fixed = (shipping || 0) + (advertising || 0) + (packaging || 0) + expectedReturn + (other || 0);
  const feeRate = 1 - (feePercent || 0) / 100;
  const breakEven =
    cost !== null && feeRate > 0 ? round((cost + fixed) / feeRate) : null;

  let status = STATUS.ESTIMATED;
  if (selling === null || cost === null) status = STATUS.UNAVAILABLE;
  else if (
    input.cost_status === STATUS.VERIFIED &&
    expenses.every((item) => item.status === STATUS.VERIFIED)
  )
    status = STATUS.VERIFIED;

  const notes = [];
  if (cost === null) notes.push('No supplier price was found, so profit cannot be calculated.');
  if (selling === null) notes.push('No selling price was found or supplied, so profit cannot be calculated.');
  if (input.cost_status && input.cost_status !== STATUS.VERIFIED)
    notes.push(`The supplier price is ${input.cost_status.replace('_', ' ').toLowerCase()}, so this profit is not verified.`);
  const unknownExpenses = expenses.filter((item) => item.status === STATUS.ESTIMATED).map((item) => item.label.toLowerCase());
  if (unknownExpenses.length)
    notes.push(`Not supplied by you, so treated as an assumption: ${unknownExpenses.join(', ')}.`);

  return {
    currency,
    selling_price: selling,
    supplier_cost: cost,
    gross_profit: gross,
    expenses,
    total_expenses: totalExpenses,
    net_profit: net,
    margin_percent: margin,
    break_even_price: breakEven,
    status,
    verified: status === STATUS.VERIFIED,
    notes,
  };
}

/* --------------------------------------------------------------- Score ---- */

export function computeScore(product = {}, profit = {}) {
  const categories = [];
  const push = (key, label, max, points, status, explanation, evidence, missing) =>
    categories.push({ key, label, max, points, status, explanation, evidence: list(evidence, 6), missing: list(missing, 6) });

  /* 1. Verified supplier availability — 15 */
  const urlVerified = product.supplier_url_status === STATUS.VERIFIED;
  const stockKnown = ['in_stock', 'out_of_stock'].includes(product.stock_status);
  if (!urlVerified) {
    push('supplier_availability', 'Verified supplier availability', 15, 0, STATUS.UNAVAILABLE,
      'No supplier product page could be verified, so availability cannot be scored.',
      [], ['Verified supplier product URL']);
  } else if (product.stock_status === 'in_stock') {
    push('supplier_availability', 'Verified supplier availability', 15, 15, STATUS.VERIFIED,
      'Supplier page verified and it shows the product as in stock.',
      [product.supplier_url], []);
  } else {
    push('supplier_availability', 'Verified supplier availability', 15, 10, STATUS.PARTIALLY_VERIFIED,
      'Supplier page verified, but the stock status on it was not confirmed.',
      [product.supplier_url], stockKnown ? [] : ['Stock status shown on the supplier page']);
  }

  /* 2. Demand evidence — 20 */
  const sourced = (product.demand_evidence || []).filter((item) => item.status === STATUS.VERIFIED);
  const demandPoints = Math.min(20, sourced.length * 5);
  push('demand_evidence', 'Product demand evidence', 20, demandPoints,
    sourced.length ? (sourced.length >= 4 ? STATUS.VERIFIED : STATUS.PARTIALLY_VERIFIED) : STATUS.UNAVAILABLE,
    sourced.length
      ? `${sourced.length} independent demand signal${sourced.length === 1 ? '' : 's'} found with a source (5 points each, capped at 20).`
      : 'No demand signal could be tied to a source, so no demand points are awarded.',
    sourced.map((item) => item.source_url),
    sourced.length ? [] : ['At least one sourced demand signal (trends, listings, reviews)']);

  /* 3. Competition opportunity — 15 */
  const priced = (product.competitors || []).filter((item) => item.price !== null && item.price !== undefined);
  let competition;
  if (!product.competitors || !product.competitors.length) {
    competition = { points: 0, status: STATUS.UNAVAILABLE, text: 'No Egyptian competitor listings were found, so the competitive field is unknown.' };
  } else if (priced.length <= 2) {
    competition = { points: 15, status: STATUS.PARTIALLY_VERIFIED, text: `${priced.length} priced competitor listing(s) — a thin field, which leaves room to enter.` };
  } else if (priced.length <= 6) {
    competition = { points: 10, status: STATUS.PARTIALLY_VERIFIED, text: `${priced.length} priced competitor listings — competitive but not crowded.` };
  } else {
    competition = { points: 5, status: STATUS.PARTIALLY_VERIFIED, text: `${priced.length} priced competitor listings — a crowded field that needs a clear angle.` };
  }
  push('competition', 'Competition opportunity', 15, competition.points, competition.status, competition.text,
    (product.competitors || []).map((item) => item.url),
    priced.length ? [] : ['Competitor prices']);

  /* 4. Profitability — 20 */
  const margin = profit.margin_percent;
  let profitability;
  if (margin === null || margin === undefined) {
    profitability = { points: 0, status: STATUS.UNAVAILABLE, text: 'Profit could not be calculated, so profitability is not scored.' };
  } else if (margin >= 35) profitability = { points: 20, status: profit.status, text: `Estimated net margin of ${margin}% — strong.` };
  else if (margin >= 25) profitability = { points: 16, status: profit.status, text: `Estimated net margin of ${margin}% — healthy.` };
  else if (margin >= 15) profitability = { points: 11, status: profit.status, text: `Estimated net margin of ${margin}% — workable but thin.` };
  else if (margin >= 5) profitability = { points: 6, status: profit.status, text: `Estimated net margin of ${margin}% — weak after expenses.` };
  else profitability = { points: 2, status: profit.status, text: `Estimated net margin of ${margin}% — not viable as priced.` };
  push('profitability', 'Profitability', 20, profitability.points, profitability.status, profitability.text,
    [], margin === null || margin === undefined ? ['Supplier price and selling price'] : []);

  /* 5. Problem-solving value — 10 */
  const hasPain = !!product.pain_point;
  const hasAudience = !!product.target_audience;
  push('problem_value', 'Problem-solving value', 10, hasPain && hasAudience ? 10 : hasPain ? 6 : 0,
    hasPain && hasAudience ? STATUS.PARTIALLY_VERIFIED : hasPain ? STATUS.PARTIALLY_VERIFIED : STATUS.UNAVAILABLE,
    hasPain && hasAudience
      ? 'A concrete customer problem and the audience that feels it are both described.'
      : hasPain
        ? 'The customer problem is described, but the audience that would buy it is not.'
        : 'No customer problem was identified for this product.',
    [], hasAudience ? (hasPain ? [] : ['Customer problem']) : ['Customer problem', 'Target audience']);

  /* 6. Supplier reliability — 10 */
  const supplierKnown = !!product.supplier_name;
  const shippingKnown = !!product.shipping_note;
  push('supplier_reliability', 'Supplier reliability', 10,
    urlVerified && (shippingKnown || stockKnown) ? 10 : supplierKnown ? 6 : 0,
    urlVerified && (shippingKnown || stockKnown) ? STATUS.PARTIALLY_VERIFIED : supplierKnown ? STATUS.PARTIALLY_VERIFIED : STATUS.UNAVAILABLE,
    urlVerified && (shippingKnown || stockKnown)
      ? 'The supplier and their page are known, with shipping or stock information alongside.'
      : supplierKnown
        ? 'The supplier is named, but shipping terms and stock confirmation are missing.'
        : 'No supplier could be identified.',
    [product.supplier_url], shippingKnown ? [] : ['Shipping terms']);

  /* 7. Differentiation — 10 */
  const advantages = (product.advantages || []).length;
  push('differentiation', 'Product differentiation', 10, advantages >= 2 ? 10 : advantages === 1 ? 6 : 0,
    advantages ? STATUS.PARTIALLY_VERIFIED : STATUS.UNAVAILABLE,
    advantages >= 2
      ? `${advantages} differentiating points were identified against competing listings.`
      : advantages === 1
        ? 'Only one differentiating point was identified.'
        : 'No differentiating factor was identified, so the product competes on price alone.',
    [], advantages ? [] : ['A reason to buy this product over the current listings']);

  const total = categories.reduce((sum, item) => sum + item.points, 0);
  const missing = categories.filter((item) => item.status === STATUS.UNAVAILABLE);
  const complete = missing.length === 0;
  const verdict = !complete
    ? `INCOMPLETE — ${total}/${SCORE_MAX} points awarded, but ${missing.length} category(ies) could not be scored from evidence.`
    : total >= 75
      ? `Strong candidate — ${total}/${SCORE_MAX}.`
      : total >= 60
        ? `Worth a paid test — ${total}/${SCORE_MAX}.`
        : total >= 45
          ? `Weak candidate — ${total}/${SCORE_MAX}.`
          : `Pass — ${total}/${SCORE_MAX}.`;

  return {
    categories,
    total,
    max_total: SCORE_MAX,
    complete,
    missing_categories: missing.map((item) => item.label),
    verdict,
    status: complete ? STATUS.PARTIALLY_VERIFIED : STATUS.UNAVAILABLE,
  };
}

/* -------------------------------------------------------- Normalisation ---- */

const STOCK_VALUES = { in_stock: 'in_stock', out_of_stock: 'out_of_stock', unknown: 'unknown' };

export function normalizeStock(value) {
  const raw = text(value, 40).toLowerCase();
  if (!raw) return 'unknown';
  if (/(out of stock|unavailable|sold out|نفذ)/.test(raw)) return 'out_of_stock';
  if (/(in stock|available|متوفر|limited)/.test(raw)) return 'in_stock';
  return STOCK_VALUES[raw] || 'unknown';
}

export function normalizeProduct(raw = {}, context = {}) {
  const sources = context.sources || [];
  const supplierKey = supplierKeyFor(raw.supplier_key || raw.supplier_name || '');
  const supplierUrl = classifySupplierUrl(
    raw.supplier_url,
    supplierKey,
    sources,
    raw.supplier_url_type
  );

  const supplierPrice = num(raw.supplier_price);
  const priceStatus =
    supplierPrice === null
      ? STATUS.UNAVAILABLE
      : supplierUrl.status === STATUS.VERIFIED
        ? STATUS.VERIFIED
        : STATUS.UNVERIFIED;

  const suggested = num(raw.suggested_selling_price);
  const userSelling = num(context.selling_price);
  const sellingPrice = userSelling !== null ? userSelling : suggested;
  const sellingStatus =
    userSelling !== null ? STATUS.VERIFIED : sellingPrice !== null ? STATUS.ESTIMATED : STATUS.UNAVAILABLE;

  const competitors = (Array.isArray(raw.competitors) ? raw.competitors : [])
    .map((item) => ({
      name: text(item?.name, 120) || 'Unnamed listing',
      url: isHttpUrl(item?.url) ? item.url.trim() : '',
      price: num(item?.price),
      note: text(item?.note, 200),
    }))
    .slice(0, 8);

  const demandEvidence = (Array.isArray(raw.demand_evidence) ? raw.demand_evidence : [])
    .map((item) => ({
      statement: text(item?.statement, 300),
      source_url: isHttpUrl(item?.source_url) ? item.source_url.trim() : '',
      kind: text(item?.kind, 40) || 'indicator',
    }))
    .filter((item) => item.statement)
    .map((item) => ({ ...item, status: item.source_url ? STATUS.VERIFIED : STATUS.UNVERIFIED }))
    .slice(0, 8);

  const product = {
    name: text(raw.name, 160) || 'Untitled product',
    description: text(raw.description, 900),
    image_url: isHttpUrl(raw.image_url) ? raw.image_url.trim() : '',
    supplier_key: supplierKey,
    supplier_name: text(raw.supplier_name, 80) || (supplierKey ? SUPPLIERS.find((s) => s.key === supplierKey)?.name : ''),
    supplier_url: supplierUrl.url,
    supplier_url_status: supplierUrl.status,
    supplier_url_reason: supplierUrl.reason,
    supplier_price: supplierPrice,
    supplier_price_status: priceStatus,
    currency: text(raw.currency, 8) || context.currency || 'EGP',
    stock_status: normalizeStock(raw.stock_status),
    stock_note: text(raw.stock_note, 200),
    shipping_note: text(raw.shipping_note, 240),
    suggested_selling_price: suggested,
    selling_price: sellingPrice,
    selling_price_status: sellingStatus,
    pain_point: text(raw.pain_point, 400),
    target_audience: text(raw.target_audience, 300),
    advantages: list(raw.advantages, 6),
    disadvantages: list(raw.disadvantages, 6),
    saturation: text(raw.saturation, 400),
    differentiation: text(raw.differentiation, 400),
    competitors,
    demand_evidence: demandEvidence,
    missing_information: list(raw.missing_information, 8),
    verified_at: new Date().toISOString(),
  };

  product.profit = computeProfit({
    selling_price: product.selling_price,
    supplier_cost: product.supplier_price,
    assumptions: context.assumptions,
    cost_status: product.supplier_price_status,
  });
  product.score = computeScore(product, product.profit);
  product.confidence = confidenceFor(product);
  product.recommendation = recommendationFor(product);
  return product;
}

function confidenceFor(product) {
  const checks = [
    product.supplier_url_status === STATUS.VERIFIED,
    product.supplier_price_status === STATUS.VERIFIED,
    product.stock_status !== 'unknown',
    product.demand_evidence.some((item) => item.status === STATUS.VERIFIED),
    product.competitors.some((item) => item.price !== null),
    !!product.pain_point,
  ];
  const passed = checks.filter(Boolean).length;
  if (product.supplier_url_status !== STATUS.VERIFIED && product.supplier_price_status === STATUS.UNAVAILABLE)
    return STATUS.UNAVAILABLE;
  if (passed >= 5) return STATUS.VERIFIED;
  if (passed >= 3) return STATUS.PARTIALLY_VERIFIED;
  if (product.supplier_price !== null) return STATUS.ESTIMATED;
  return STATUS.UNVERIFIED;
}

function recommendationFor(product) {
  if (product.supplier_url_status !== STATUS.VERIFIED || product.supplier_price === null)
    return 'Do not stock yet — the supplier page and price are not verified. Ask the supplier directly for the live listing and price.';
  if (!product.score.complete)
    return `Hold — the evidence is incomplete (missing: ${product.score.missing_categories.join(', ')}). Collect those before committing stock.`;
  if (product.score.total >= 60)
    return `Test it — ${product.score.total}/100 with verified sourcing. Order a small batch and validate demand with paid traffic before scaling.`;
  return `Pass for now — ${product.score.total}/100. Only revisit with a stronger differentiator or a lower supplier price.`;
}

/* -------------------------------------------------------------- Research ---- */

export const RESEARCH_SCHEMA = {
  type: 'object',
  properties: {
    products: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          image_url: { type: 'string' },
          supplier_name: { type: 'string' },
          supplier_key: { type: 'string' },
          supplier_url: { type: 'string' },
          supplier_url_type: {
            type: 'string',
            enum: ['product', 'category', 'home', 'search', 'unknown'],
            description: 'What kind of page supplier_url points at. Use "product" only for an individual product listing.',
          },
          supplier_price: { type: 'number' },
          currency: { type: 'string' },
          stock_status: { type: 'string' },
          stock_note: { type: 'string' },
          shipping_note: { type: 'string' },
          suggested_selling_price: { type: 'number' },
          pain_point: { type: 'string' },
          target_audience: { type: 'string' },
          advantages: { type: 'array', items: { type: 'string' } },
          disadvantages: { type: 'array', items: { type: 'string' } },
          saturation: { type: 'string' },
          differentiation: { type: 'string' },
          competitors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                url: { type: 'string' },
                price: { type: 'number' },
                note: { type: 'string' },
              },
            },
          },
          demand_evidence: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                statement: { type: 'string' },
                source_url: { type: 'string' },
                kind: { type: 'string' },
              },
            },
          },
          missing_information: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'supplier_name'],
      },
    },
    sources: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          url: { type: 'string' },
          kind: { type: 'string' },
        },
      },
    },
    limitations: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['products', 'sources'],
};

export function buildResearchPrompt({ query, suppliers, market, maxProducts, assumptions }) {
  const wanted = (suppliers?.length ? suppliers : SUPPLIERS.map((s) => s.name)).join(', ');
  return `You are Hazel, a professional e-commerce product research analyst for the ${market} market.

RESEARCH REQUEST
- Product or category to research: ${query}
- Supplier platforms in scope: ${wanted}
- Target market for competitors: ${market}
- Maximum products to return: ${maxProducts}

NON-NEGOTIABLE RULES
1. Never invent a product URL. Every supplier URL and competitor URL must be a page you actually saw in your search results, copied exactly, with no query string you did not see.
2. supplier_url must be the individual product listing, never the supplier's home page, a category page, a search page or a collection page. A category URL is rejected as unverified. Set supplier_url_type to "product" only when the page shows that single product with its own price.
3. Never invent a price. If you did not see a supplier price on the supplier's own page, omit the field entirely. A price lifted from a category page is not a product price.
4. Never invent stock status or shipping terms. If the page did not show it, say "unknown".
5. Every page you opened must appear in "sources" as {label, url, kind}. Any product URL that is not in "sources" will be rejected by the system and marked unverified.
6. Accuracy beats quantity. Return 1 verified product rather than 5 guesses. If you cannot verify anything, return an empty products array and explain why in "limitations".
7. Never claim sales volume unless a source states it. Describe demand only from observable signals (search interest, number of listings, review counts, advertising presence).
8. If a supplier platform requires a login to browse its catalog, say so in "limitations" instead of guessing its contents.

WHAT TO RETURN PER PRODUCT
- Exact product name as listed by the supplier.
- Supplier platform name (Safqa, Taager, Tagerly, or the supplier's own store name).
- The supplier product page URL (from your sources), supplier price in EGP, stock status, shipping note if shown.
- A suggested retail selling price for the ${market} market, and why it is realistic there.
- Real competitor listings (Egyptian store or marketplace) with their URL and displayed price.
- Demand evidence, each with the source URL.
- The customer problem it solves, who buys it, advantages, disadvantages, saturation, and a differentiation angle.
- Anything you could not establish, listed in "missing_information".

Note: the selling price, profit, expenses and scores are calculated by the system, not by you. Do not compute profits.`;
}

export function reportToMarkdown(report) {
  const lines = [`# Product research — ${report.query}`, '', `Market: ${report.market} · Suppliers: ${(report.suppliers || []).join(', ')}`, ''];
  if (!report.products?.length) {
    lines.push('No product met the verification standard for this request.', '');
    (report.limitations || []).forEach((item) => lines.push(`- ${item}`));
    return lines.join('\n');
  }
  report.products.forEach((product, index) => {
    const profit = product.profit || {};
    lines.push(`## ${index + 1}. ${product.name}`);
    lines.push(`- Supplier: ${product.supplier_name || 'unknown'} — ${product.supplier_url || 'no verified link'} (${product.supplier_url_status})`);
    lines.push(`- Supplier price: ${product.supplier_price ?? 'unavailable'} ${product.currency} (${product.supplier_price_status})`);
    lines.push(`- Stock: ${product.stock_status} · verified ${new Date(product.verified_at).toLocaleString()}`);
    lines.push(`- Selling price: ${product.selling_price ?? 'unavailable'} ${product.currency} (${product.selling_price_status})`);
    lines.push(`- Gross profit: ${profit.gross_profit ?? 'n/a'} · Net profit: ${profit.net_profit ?? 'n/a'} (${profit.status}) · Margin: ${profit.margin_percent ?? 'n/a'}%`);
    lines.push(`- Score: ${product.score?.total ?? 0}/100 (${product.score?.complete ? 'complete' : 'INCOMPLETE'})`);
    lines.push(`- Recommendation: ${product.recommendation}`);
    lines.push('');
  });
  if (report.limitations?.length) {
    lines.push('## Limitations');
    report.limitations.forEach((item) => lines.push(`- ${item}`));
  }
  return lines.join('\n');
}