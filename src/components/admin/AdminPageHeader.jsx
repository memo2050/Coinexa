import { Loader2, RefreshCw } from 'lucide-react';

export default function AdminPageHeader({ eyebrow, title, description, onRefresh, loading }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-sky-300/90">
          {eyebrow}
        </p>
        <h1 className="mt-3 font-heading text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">{description}</p>
        )}
      </div>
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-slate-200 transition-colors hover:border-sky-400/40 hover:text-white disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      )}
    </div>
  );
}