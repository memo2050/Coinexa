import moment from 'moment';

const number = new Intl.NumberFormat('en-US');

export const fmtNumber = (value) => number.format(Number(value) || 0);

export const fmtPercent = (value) =>
  value === null || value === undefined ? '—' : `${value}%`;

export const fmtMoney = (value, currency = 'USD') =>
  value === null || value === undefined
    ? '—'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value) || 0);

export const fmtDate = (value) => (value ? moment(value).format('D MMM YYYY, HH:mm') : '—');

export const fmtRelative = (value) => (value ? moment(value).fromNow() : '—');

export const fmtDuration = (ms) => {
  const value = Number(ms) || 0;
  if (!value) return '—';
  if (value < 1000) return `${Math.round(value)} ms`;
  if (value < 60000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.floor(value / 60000)}m ${Math.round((value % 60000) / 1000)}s`;
};

export const fmtLabel = (value) =>
  String(value || 'unknown').replace(/_/g, ' ').replace(/^\w/, (char) => char.toUpperCase());