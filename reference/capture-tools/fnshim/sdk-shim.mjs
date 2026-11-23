// Stand-in for the Base44 SDK, used only to render Stage 0 reference screenshots.
const store = () => globalThis.__STORE;
const val = (r, k) => r[k];
function match(r, q) {
  if (!q || typeof q !== 'object') return true;
  return Object.entries(q).every(([k, c]) => {
    if (k === '$or') return c.some(x => match(r, x));
    if (k === '$and') return c.every(x => match(r, x));
    const v = val(r, k);
    if (c && typeof c === 'object' && !Array.isArray(c)) {
      return Object.entries(c).every(([op, x]) => {
        if (op === '$in') return Array.isArray(v) ? v.some(i => x.includes(i)) : x.includes(v);
        if (op === '$nin') return !x.includes(v);
        if (op === '$ne') return v !== x;
        if (op === '$gte') return v != null && v >= x;
        if (op === '$gt') return v != null && v > x;
        if (op === '$lte') return v != null && v <= x;
        if (op === '$lt') return v != null && v < x;
        if (op === '$exists') return x ? v != null : v == null;
        return true;
      });
    }
    return Array.isArray(v) && !Array.isArray(c) ? v.includes(c) : v === c;
  });
}
function sortLimit(rows, sort, limit) {
  let r = [...rows];
  if (typeof sort === 'string' && sort) { const d = sort.startsWith('-') ? -1 : 1, k = sort.replace(/^[-+]/, ''); r.sort((a, b) => (a[k] > b[k] ? d : a[k] < b[k] ? -d : 0)); }
  if (limit) r = r.slice(0, limit);
  return r;
}
function entity(name) {
  const rows = () => (store()[name] ||= []);
  return {
    list: async (a, b) => { if (typeof a === 'object' && a) { const items = sortLimit(rows(), a.sort, a.limit); return { items, total: rows().length }; } return sortLimit(rows(), a, b); },
    filter: async (q, s, l) => { const m = rows().filter(r => match(r, q)); if (typeof s === 'object' && s) return { items: sortLimit(m, s.sort, s.limit), total: m.length }; return sortLimit(m, s, l); },
    get: async (id) => { const r = rows().find(x => x.id === id); if (!r) throw Object.assign(new Error('not found'), { status: 404 }); return r; },
    count: async (q) => rows().filter(r => match(r, q)).length,
    aggregate: async ({ query, groupBy, sum = [], dateBucket } = {}) => {
      const src = rows().filter(r => match(r, query)); const groups = new Map();
      for (const r of src) {
        let key = groupBy ? r[groupBy] ?? null : 'all';
        if (dateBucket) { const d = new Date(r[dateBucket.field]); key = new Date(Date.UTC(d.getUTCFullYear(), dateBucket.unit === 'month' ? d.getUTCMonth() : 0, 1)).toISOString(); }
        const g = groups.get(key) || { count: 0 }; g.count++;
        for (const f of sum) g['sum_' + f] = (g['sum_' + f] || 0) + (Number(r[f]) || 0);
        groups.set(key, g);
      }
      return { rows: [...groups].map(([k, g]) => ({ ...(groupBy ? { [groupBy]: k } : {}), ...(dateBucket ? { [dateBucket.field]: k } : {}), ...g })) };
    },
    create: async (d) => ({ id: 'local-' + Math.random().toString(16).slice(2), ...d }),
    update: async (id, d) => ({ ...(rows().find(x => x.id === id) || {}), ...d }),
    delete: async () => ({}),
    bulkCreate: async (a) => a,
  };
}
const entities = new Proxy({}, { get: (_, n) => entity(n) });
const client = () => ({
  auth: { me: async () => globalThis.__USER },
  entities,
  asServiceRole: { entities, integrations: { Core: {} }, connectors: { getConnection: async () => null } },
  integrations: { Core: {} },
  functions: { invoke: async () => ({ data: {} }) },
});
export const createClientFromRequest = () => client();
export const createClient = () => client();
