import { Link } from 'react-router-dom';
import { ArrowUpRight, GripVertical, Wrench } from 'lucide-react';
import AgentStatusPill from '@/components/agents/AgentStatusPill';
import { displayStatus } from '@/components/agents/agentStatus';
import { HIRED_GLOW, HiredBadge, useAgentBilling } from '@/components/agents/hired';
import { BrandIcon, useAgentBranding } from '@/components/agents/brandIcons';

export default function AgentBoardCard({ agent, dragging = false }) {
  const hired = useAgentBilling().isHired(agent);
  const brandIcon = useAgentBranding().iconFor(agent.id);
  return (
    <article
      className={`rounded-xl border p-3.5 transition-all duration-200 ${
        dragging
          ? 'scale-[1.02] border-sky-400/60 bg-[#101a28] shadow-[0_18px_44px_-20px_rgba(34,211,238,0.9)]'
          : 'border-white/10 bg-white/[0.03] hover:-translate-y-0.5 hover:border-white/20'
      } ${hired && !dragging ? HIRED_GLOW : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {brandIcon && <BrandIcon icon={brandIcon} />}
          <h3 className="min-w-0 truncate font-heading text-sm font-semibold text-white">{agent.name}</h3>
        </div>
        <GripVertical className="h-3.5 w-3.5 shrink-0 text-slate-600" aria-hidden="true" />
      </div>

      <p className="mt-1 line-clamp-1 text-[0.62rem] uppercase tracking-[0.14em] text-slate-500">
        {agent.specialization || agent.industry || 'General'}
      </p>

      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-400">
        {agent.summary || agent.role || 'No description yet.'}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {hired && <HiredBadge />}
        <AgentStatusPill status={displayStatus(agent)} />
        {(agent.tools || []).length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-[0.6rem] text-slate-500">
            <Wrench className="h-2.5 w-2.5" />
            {agent.tools.length}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-2.5">
        <span className="line-clamp-1 text-[0.6rem] text-slate-600">
          {agent.last_run_at
            ? `Last run ${new Date(agent.last_run_at).toLocaleDateString()}`
            : 'No runs yet'}
        </span>
        <Link
          to={`/agents/${agent.id}`}
          onClick={(event) => {
            if (dragging) event.preventDefault();
          }}
          className="inline-flex shrink-0 items-center gap-1 text-[0.68rem] font-medium text-sky-300 transition-colors hover:text-white"
        >
          Open
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    </article>
  );
}