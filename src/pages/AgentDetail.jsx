import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import moment from 'moment';
import { ArrowLeft, Loader2, Pause, Play, Trash2, Wrench } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import Nav from '@/components/site/Nav';
import Footer from '@/components/site/Footer';
import AgentBlueprint from '@/components/agents/AgentBlueprint';
import AgentStatusPill from '@/components/agents/AgentStatusPill';
import AgentTaskRunner from '@/components/agents/AgentTaskRunner';
import AgentHistory from '@/components/agents/AgentHistory';
import { BrandIcon, useAgentBranding } from '@/components/agents/brandIcons';
import ResearchPanel from '@/components/research/ResearchPanel';
import WorkflowPanel from '@/components/workflow/WorkflowPanel';
import { isResearchAgent } from '@/components/research/researchHelpers';
import { displayStatus, statusDescriptions } from '@/components/agents/agentStatus';
import { HiredBadge, useAgentBilling } from '@/components/agents/hired';
import AgentBillingRow, { DraftingBadge } from '@/components/agents/AgentBillingRow';

function Chips({ items, empty }) {
  if (!items?.length) return <p className="text-xs text-slate-500">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[0.7rem] text-slate-300"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

export default function AgentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const billing = useAgentBilling();
  const { isHired } = billing;
  const brandIcon = useAgentBranding().iconFor(agent?.id);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const record = await base44.entities.Agent.get(id);
        if (!cancelled) setAgent(record);
      } catch (error) {
        if (!cancelled) setAgent(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (loading || agent) return;
    const meta = document.createElement('meta');
    meta.name = 'prerender-status-code';
    meta.content = '404';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, [loading, agent]);

  const changeStatus = async (status) => {
    setBusy(true);
    try {
      const updated = await base44.entities.Agent.update(agent.id, { status });
      setAgent((prev) => ({ ...prev, ...updated }));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await base44.entities.Agent.delete(agent.id);
      navigate('/agents');
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    const fresh = await base44.entities.Agent.get(id).catch(() => null);
    if (fresh) setAgent(fresh);
    setHistoryKey((prev) => prev + 1);
  };

  const shell = (children) => (
    <div className="min-h-screen bg-[#05070a] text-white">
      <Nav />
      {children}
      <Footer />
    </div>
  );

  if (loading) {
    return shell(
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-5 py-32 text-sm text-slate-400 sm:px-8">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading agent…
      </div>
    );
  }

  if (!agent) {
    return shell(
      <div className="mx-auto w-full max-w-6xl px-5 py-32 text-center sm:px-8">
        <h1 className="font-heading text-2xl font-semibold">This agent was not found</h1>
        <p className="mt-2 text-sm text-slate-400">It may have been deleted, or it belongs to another account.</p>
        <Link
          to="/agents"
          className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-slate-300 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to my agents
        </Link>
      </div>
    );
  }

  const isActive = agent.status === 'active';
  const status = displayStatus(agent, { running });

  return shell(
    <main className="mx-auto w-full max-w-6xl px-5 pt-28 pb-20 sm:px-8 sm:pb-28">
      <Link to="/agents" className="inline-flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-white">
        <ArrowLeft className="h-4 w-4" />
        All agents
      </Link>

      <div className="mt-6 flex flex-col gap-5 border-b border-white/[0.07] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            {brandIcon && <BrandIcon icon={brandIcon} />}
            <h1 className="font-heading text-3xl font-semibold leading-tight tracking-[-0.02em] sm:text-4xl">{agent.name}</h1>
            <AgentStatusPill status={status} />
            {isHired(agent) && <HiredBadge />}
            <DraftingBadge />
          </div>
          <p className="mt-2 text-sm text-slate-400">
            {agent.specialization || agent.role || 'AI agent'} · {agent.industry || 'General'}
            {agent.tone ? ` · ${agent.tone}` : ''}
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
            {statusDescriptions[status]}
            {agent.last_run_at ? ` Last run ${moment(agent.last_run_at).fromNow()}.` : ''}
          </p>
          <p className="mt-2 max-w-2xl text-xs leading-relaxed text-slate-500">
            Drafting assistant: it prepares work and next steps for you to review.{(agent.tools || []).length ? ` Its listed tools (${agent.tools.slice(0, 4).join(', ')}) are not connected yet, so it describes what it would do in them rather than doing it.` : ''}
          </p>
          <div className="max-w-md"><AgentBillingRow billing={billing} state={billing.forAgent(agent)} agentId={agent.id} name={agent.name} allowCancel /></div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => changeStatus(isActive ? 'paused' : 'active')}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400 px-5 py-2.5 text-sm font-semibold text-white transition-transform duration-300 hover:-translate-y-0.5 disabled:opacity-60"
          >
            {isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {isActive ? 'Pause agent' : 'Activate agent'}
          </button>

          {confirming ? (
            <span className="inline-flex items-center gap-2">
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="rounded-full border border-rose-400/40 bg-rose-500/10 px-4 py-2.5 text-sm font-medium text-rose-200 disabled:opacity-60"
              >
                Confirm delete
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-full border border-white/10 px-4 py-2.5 text-sm text-slate-400 hover:text-white"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-slate-300 transition-colors hover:border-rose-400/40 hover:text-rose-300"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-[1.35fr_0.9fr]">
        <div className="min-w-0 space-y-5">
          <WorkflowPanel agent={agent} onAgentChange={refresh} />
          {isResearchAgent(agent) && <ResearchPanel agent={agent} onTaskComplete={refresh} />}
          <AgentTaskRunner
            agent={agent}
            onRunningChange={setRunning}
            onTaskComplete={refresh}
          />
          <AgentHistory agentId={agent.id} refreshKey={historyKey} />
        </div>

        <div className="min-w-0 space-y-4">
          <section className="rounded-2xl border border-white/[0.08] bg-[#0a0f19] p-5">
            <div className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-sky-300/90">Agent settings</div>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-[0.68rem] uppercase tracking-[0.14em] text-slate-500">Status</dt>
                <dd className="mt-1 text-slate-200">{isActive ? 'Activated' : agent.status === 'paused' ? 'Paused' : 'Draft'}</dd>
              </div>
              <div>
                <dt className="text-[0.68rem] uppercase tracking-[0.14em] text-slate-500">Business</dt>
                <dd className="mt-1 text-slate-200">{agent.business_name || 'Not provided'}</dd>
              </div>
              <div>
                <dt className="text-[0.68rem] uppercase tracking-[0.14em] text-slate-500">Voice</dt>
                <dd className="mt-1 text-slate-200">{agent.tone || 'Default'}</dd>
              </div>
              <div>
                <dt className="mb-1.5 flex items-center gap-1.5 text-[0.68rem] uppercase tracking-[0.14em] text-slate-500">
                  <Wrench className="h-3 w-3" />
                  Tools requested
                </dt>
                <dd>
                  <Chips items={agent.tools} empty="No tools requested yet." />
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">
                    Planned tooling. None connected yet.
                  </p>
                </dd>
              </div>
              <div>
                <dt className="mb-1.5 text-[0.68rem] uppercase tracking-[0.14em] text-slate-500">Permissions</dt>
                <dd>
                  <Chips items={agent.permissions} empty="No permissions granted." />
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-white/[0.08] bg-[#0a0f19] p-5">
            <div className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-sky-300/90">Definition</div>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">{agent.summary || 'No summary yet.'}</p>
          </section>
        </div>
      </div>

      <div className="mt-5">
        <AgentBlueprint agent={agent} />
      </div>
    </main>
  );
}