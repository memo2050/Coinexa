import { ArrowUpRight } from 'lucide-react';
import { STATUS_META, excerpt, formatDate } from '@/components/inbox/inboxUtils';

export default function InquiryRow({ inquiry, onOpen }) {
  const meta = STATUS_META[inquiry.status] || STATUS_META.new;

  return (
    <button
      type="button"
      onClick={() => onOpen(inquiry)}
      className="group w-full rounded-2xl border border-white/[0.08] bg-[#0a0f19] p-5 text-left transition-colors duration-300 hover:border-sky-400/30"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
            <span className="truncate font-heading text-[0.98rem] font-semibold text-white">
              {inquiry.name}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-slate-400">{inquiry.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.1em] ${meta.badge}`}
          >
            {meta.label}
          </span>
          <ArrowUpRight className="h-4 w-4 text-slate-600 transition-colors group-hover:text-sky-300" />
        </div>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-slate-400">{excerpt(inquiry.message)}</p>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-white/[0.07] pt-3 text-[0.68rem] text-slate-500">
        <span className="rounded-md bg-white/[0.05] px-2 py-1 text-slate-400">{inquiry.service}</span>
        <span>{formatDate(inquiry.submitted_at || inquiry.created_date)}</span>
        {inquiry.reference && <span className="text-slate-600">#{inquiry.reference}</span>}
      </div>
    </button>
  );
}