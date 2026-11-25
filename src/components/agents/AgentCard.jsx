import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Pause, Play, Trash2, Wrench } from 'lucide-react';
import AgentStatusPill from '@/components/agents/AgentStatusPill';
import { displayStatus } from '@/components/agents/agentStatus';
import { HIRED_GLOW, HiredBadge, useHiredWorkspaces } from '@/components/agents/hired';

export default function AgentCard({ agent, onStatusChange, onDelete }) {
  const hired = useHiredWorkspaces().isHired(agent);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (action) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  const nextStatus = agent.status === 'active' ? 'paused' : 'active';

  return (
    <article className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition-all duration-300 hover:-translate-y-1 hover:border-sky-400/30 hover:bg-white/[0.04] ${hired ? HIRED_GLOW : ''}`}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.16),transparent_70%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-heading text-lg font-semibold text-white">{agent.name}</h3>
          <p className="mt-1 line-clamp-1 text-xs uppercase tracking-[0.14em] text-slate-500">
            {agent.specialization || agent.industry || 'General'}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {hired && <HiredBadge />}
          <AgentStatusPill status={displayStatus(agent)} />
        </div>
      </div>

      <p className="relative mt-3 line-clamp-3 text-sm leading-relaxed text-slate-400">
        {agent.summary || agent.role || 'No description yet.'}
      </p>

      <div className="relative mb-4 mt-4 flex flex-wrap gap-1.5">
        {(agent.tools || []).slice(0, 3).map((tool) => (
          <span
            key={tool}
            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[0.68rem] text-slate-400"
          >
            <Wrench className="h-3 w-3" />
            {tool}
          </span>
        ))}
        {(agent.tools || []).length > 3 && (
          <span className="rounded-full border border-white/10 px-2.5 py-1 text-[0.68rem] text-slate-500">
            +{agent.tools.length - 3}
          </span>
        )}
      </div>

      <div className="relative mt-auto flex items-center gap-2 border-t border-white/[0.07] pt-4">
        <Link
          to={`/agents/${agent.id}`}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400 px-4 py-2 text-sm font-semibold text-white transition-transform duration-300 hover:-translate-y-0.5"
        >
          Open
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>

        <button
          type="button"
          onClick={() => run(() => onStatusChange(agent, nextStatus))}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300 transition-colors hover:border-white/20 hover:text-white disabled:opacity-50"
        >
          {nextStatus === 'active' ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          {nextStatus === 'active' ? 'Activate' : 'Pause'}
        </button>

        {confirming ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => run(() => onDelete(agent))}
              disabled={busy}
              className="rounded-full border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-200 disabled:opacity-50"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-full border border-white/10 px-2.5 py-2 text-xs text-slate-400 hover:text-white"
            >
              No
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-slate-400 transition-colors hover:border-rose-400/40 hover:text-rose-300"
            aria-label={`Delete ${agent.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </article>
  );
}