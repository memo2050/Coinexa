export const INQUIRY_STATUSES = ['new', 'in_review', 'contacted', 'closed'];

export const STATUS_META = {
  new: {
    label: 'New',
    dot: 'bg-sky-400',
    badge: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
  },
  in_review: {
    label: 'In review',
    dot: 'bg-amber-400',
    badge: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  },
  contacted: {
    label: 'Contacted',
    dot: 'bg-violet-400',
    badge: 'border-violet-400/30 bg-violet-400/10 text-violet-300',
  },
  closed: {
    label: 'Closed',
    dot: 'bg-slate-500',
    badge: 'border-white/15 bg-white/[0.06] text-slate-400',
  },
};

export const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first', sort: '-submitted_at' },
  { value: 'oldest', label: 'Oldest first', sort: 'submitted_at' },
  { value: 'name', label: 'Name A–Z', sort: 'name' },
];

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function excerpt(text, max = 150) {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
}