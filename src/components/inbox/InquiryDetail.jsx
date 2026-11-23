import { useEffect, useState } from 'react';
import { Loader2, Mail, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { INQUIRY_STATUSES, STATUS_META, formatDate } from '@/components/inbox/inboxUtils';

export default function InquiryDetail({ inquiry, busy, onClose, onStatusChange, onDelete }) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setConfirming(false);
  }, [inquiry?.id]);

  const meta = STATUS_META[inquiry?.status] || STATUS_META.new;

  return (
    <Dialog open={Boolean(inquiry)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto border-white/10 bg-[#0a0f19] sm:max-w-xl">
        {inquiry && (
          <>
            <DialogHeader>
              <DialogTitle className="font-heading text-xl font-semibold text-white">
                {inquiry.name}
              </DialogTitle>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                <a
                  href={`mailto:${inquiry.email}`}
                  className="inline-flex items-center gap-1.5 text-sky-300 hover:text-white"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {inquiry.email}
                </a>
                {inquiry.reference && <span className="text-slate-600">#{inquiry.reference}</span>}
              </div>
            </DialogHeader>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.1em] ${meta.badge}`}
              >
                {meta.label}
              </span>
              <span className="rounded-md bg-white/[0.05] px-2 py-1 text-[0.68rem] text-slate-400">
                {inquiry.service}
              </span>
              <span className="text-[0.68rem] text-slate-500">
                {formatDate(inquiry.submitted_at || inquiry.created_date)}
              </span>
            </div>

            <div className="mt-5 rounded-xl border border-white/[0.08] bg-[#0d131f] p-4">
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-300">
                {inquiry.message}
              </p>
            </div>

            <div className="mt-5">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Move to
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {INQUIRY_STATUSES.map((status) => {
                  const active = inquiry.status === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      disabled={busy || active}
                      onClick={() => onStatusChange(inquiry, status)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                        active
                          ? 'border-sky-400/40 bg-sky-400/10 text-sky-200'
                          : 'border-white/10 text-slate-400 hover:border-white/25 hover:text-white'
                      }`}
                    >
                      {STATUS_META[status].label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-4">
              <a
                href={`mailto:${inquiry.email}?subject=${encodeURIComponent(
                  `Re: your project enquiry${inquiry.reference ? ` (${inquiry.reference})` : ''}`
                )}`}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400 px-4 py-2.5 text-xs font-semibold text-white"
              >
                <Mail className="h-3.5 w-3.5" />
                Reply by email
              </a>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!confirming) {
                    setConfirming(true);
                    return;
                  }
                  onDelete(inquiry);
                }}
                className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                  confirming
                    ? 'border-rose-400/50 bg-rose-400/10 text-rose-300'
                    : 'border-white/10 text-slate-400 hover:border-rose-400/40 hover:text-rose-300'
                }`}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                {confirming ? 'Confirm delete' : 'Delete'}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}