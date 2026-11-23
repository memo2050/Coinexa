// Classification and aggregation helpers shared by the super admin endpoints.
//
// A workspace is counted as production only when it is explicitly marked as a
// customer workspace. Everything else is reported as internal or test, so the
// dashboard can never present the development estate as real business.

export const DATA_CLASSES = ['customer', 'internal', 'test'];

export const dataClassOf = (organization) => {
  const declared = organization?.data_class;
  if (DATA_CLASSES.includes(declared)) return declared;
  if (organization?.internal === true) return 'internal';
  return 'test';
};

export const isProductionWorkspace = (organization) => dataClassOf(organization) === 'customer';

export const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

export const startOfMonthIso = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
};

export const daysAgoIso = (days) =>
  new Date(Date.now() - Number(days) * 86400000).toISOString();

export const monthKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

export const monthLabel = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
};

export const settledValue = (settled, fallback) =>
  settled.status === 'fulfilled' && settled.value !== undefined && settled.value !== null
    ? settled.value
    : fallback;

export const settledList = (settled) => {
  const value = settledValue(settled, []);
  return Array.isArray(value) ? value : value?.items || [];
};

export const settledRows = (settled) => settledValue(settled, { rows: [] })?.rows || [];

export const settledCount = (settled) => Number(settledValue(settled, 0)) || 0;

export const sumRows = (rows, key = 'sum_units') =>
  rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);

export const percent = (part, total) => (Number(total) > 0 ? round((Number(part) / Number(total)) * 100, 1) : null);