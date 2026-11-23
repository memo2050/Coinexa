import { Search } from 'lucide-react';
import { INQUIRY_STATUSES, SORT_OPTIONS, STATUS_META } from '@/components/inbox/inboxUtils';

export default function InboxToolbar({
  status,
  counts,
  search,
  sort,
  onStatusChange,
  onSearchChange,
  onSortChange,
}) {
  const tabs = [{ value: 'all', label: 'All' }, ...INQUIRY_STATUSES.map((value) => ({
    value,
    label: STATUS_META[value].label,
  }))];

  return (
    <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const active = status === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onStatusChange(tab.value)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? 'border-sky-400/40 bg-sky-400/10 text-sky-200'
                  : 'border-white/10 text-slate-400 hover:border-white/25 hover:text-white'
              }`}
            >
              {tab.label}
              <span className={`ml-1.5 ${active ? 'text-sky-300/70' : 'text-slate-600'}`}>
                {counts ? counts[tab.value] ?? 0 : '—'}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 lg:w-64 lg:flex-none">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search name or email"
            className="w-full rounded-xl border border-white/10 bg-[#0d131f] py-2 pl-9 pr-3 text-xs text-white placeholder:text-slate-500 transition-colors focus:border-sky-400/60 focus:outline-none"
          />
        </div>
        <select
          value={sort}
          onChange={(event) => onSortChange(event.target.value)}
          className="rounded-xl border border-white/10 bg-[#0d131f] px-3 py-2 text-xs text-white transition-colors focus:border-sky-400/60 focus:outline-none"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}