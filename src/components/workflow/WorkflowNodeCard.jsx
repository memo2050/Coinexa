import { ChevronRight, Loader2 } from 'lucide-react';
import { durationOf, metaFor, STATUS_META } from './workflowMeta';

export default function WorkflowNodeCard({ node, step, selected, onSelect }) {
  const meta = metaFor(node.kind);
  const Icon = meta.icon;
  const status = step?.status;
  const statusMeta = status ? STATUS_META[status] || STATUS_META.PENDING : null;
  const running = status === 'RUNNING';
  const timing = durationOf(step);

  return (
    <button
      type="button"
      onClick={() => onSelect?.(node.id)}
      className={`group w-full min-w-0 rounded-2xl border bg-[#0b1018] px-3.5 py-3 text-left transition-all duration-200 hover:border-sky-400/40 ${
        selected ? 'border-sky-400/50 ring-1 ring-sky-400/30' : 'border-white/[0.09]'
      } ${statusMeta?.wrap || ''}`}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl border ${meta.tone}`}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
              {meta.label}
            </span>
            {statusMeta && (
              <span
                className={`rounded-full border px-1.5 py-0.5 text-[0.55rem] font-semibold uppercase tracking-[0.1em] ${statusMeta.pill}`}
              >
                {statusMeta.label}
              </span>
            )}
            {timing && <span className="text-[0.6rem] text-slate-500">{timing}</span>}
          </span>
          <span className="mt-1 block break-words text-sm font-medium leading-snug text-slate-100 [overflow-wrap:anywhere]">
            {node.title}
          </span>
          {(step?.error || step?.note) && (
            <span
              className={`mt-1 block break-words text-[0.7rem] leading-relaxed [overflow-wrap:anywhere] ${
                step.error ? 'text-rose-300' : 'text-slate-500'
              }`}
            >
              {step.error || step.note}
            </span>
          )}
        </span>

        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-600 transition-colors group-hover:text-slate-300" />
      </div>
    </button>
  );
}