import { INQUIRY_STATUSES, STATUS_META } from '@/components/inbox/inboxUtils';

export default function InboxStats({ counts }) {
  const cards = [
    { key: 'all', label: 'Total' },
    ...INQUIRY_STATUSES.map((status) => ({ key: status, label: STATUS_META[status].label })),
  ];

  return (
    <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.key}
          className="rounded-2xl border border-white/[0.08] bg-[#0a0f19] px-4 py-3.5"
        >
          <div className="font-heading text-2xl font-semibold tracking-[-0.02em] text-white">
            {counts ? counts[card.key] ?? 0 : '—'}
          </div>
          <div className="mt-1 text-[0.68rem] uppercase tracking-[0.14em] text-slate-500">
            {card.label}
          </div>
        </div>
      ))}
    </div>
  );
}