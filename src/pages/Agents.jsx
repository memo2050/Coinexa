import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import { ArrowRight, Bot, Briefcase, LayoutDashboard, LayoutGrid, Loader2, Plus, ShieldCheck, Sparkles } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import Nav from '@/components/site/Nav';
import Footer from '@/components/site/Footer';
import Reveal from '@/components/site/Reveal';
import SectionHeading from '@/components/site/SectionHeading';
import AgentCard from '@/components/agents/AgentCard';
import AgentBoard from '@/components/agents/AgentBoard';
import { HIRED_GLOW, HiredBadge, useHiredWorkspaces } from '@/components/agents/hired';

export default function Agents() {
  const { anyHired } = useHiredWorkspaces();
  const [agents, setAgents] = useState([]);
  const [counts, setCounts] = useState({ total: 0, active: 0, paused: 0 });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('grid');
  const moveInFlight = useRef(false);
  const { toast } = useToast();

  const loadAgents = async () => {
    const [page, total, active, paused] = await Promise.all([
      base44.entities.Agent.list({ sort: '-updated_date', limit: 60 }),
      base44.entities.Agent.count(),
      base44.entities.Agent.count({ status: 'active' }),
      base44.entities.Agent.count({ status: 'paused' }),
    ]);
    setAgents(page.items);
    setCounts({ total, active, paused });
  };

  useEffect(() => {
    let cancelled = false;
    loadAgents()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleStatusChange = async (agent, status) => {
    const updated = await base44.entities.Agent.update(agent.id, { status });
    setAgents((prev) => prev.map((item) => (item.id === agent.id ? { ...item, ...updated } : item)));
    setCounts((prev) => {
      const next = { ...prev, active: prev.active, paused: prev.paused };
      if (agent.status === 'active') next.active -= 1;
      if (agent.status === 'paused') next.paused -= 1;
      if (status === 'active') next.active += 1;
      if (status === 'paused') next.paused += 1;
      return next;
    });
  };

  const applyCountDelta = (previous, next) => {
    setCounts((prev) => {
      const counts = { ...prev };
      if (previous === 'active') counts.active = Math.max(0, counts.active - 1);
      if (previous === 'paused') counts.paused = Math.max(0, counts.paused - 1);
      if (next === 'active') counts.active += 1;
      if (next === 'paused') counts.paused += 1;
      return counts;
    });
  };

  // Drag and drop moves the agent between lifecycle columns and persists it immediately.
  // Only the status field is written, so every other agent detail stays untouched.
  const handleBoardMove = async (agent, status) => {
    if (!agent || agent.status === status || moveInFlight.current) return;
    const previous = agent.status;

    moveInFlight.current = true;
    setAgents((prev) => prev.map((item) => (item.id === agent.id ? { ...item, status } : item)));
    applyCountDelta(previous, status);

    try {
      await base44.entities.Agent.update(agent.id, { status });
      await loadAgents();
    } catch (error) {
      setAgents((prev) =>
        prev.map((item) => (item.id === agent.id ? { ...item, status: previous } : item))
      );
      applyCountDelta(status, previous);
      toast({
        variant: 'destructive',
        title: 'Status not saved',
        description: 'The card was returned to its column. Please try again.',
      });
    } finally {
      moveInFlight.current = false;
    }
  };

  const handleDelete = async (agent) => {
    await base44.entities.Agent.delete(agent.id);
    setAgents((prev) => prev.filter((item) => item.id !== agent.id));
    setCounts((prev) => ({
      total: Math.max(0, prev.total - 1),
      active: agent.status === 'active' ? Math.max(0, prev.active - 1) : prev.active,
      paused: agent.status === 'paused' ? Math.max(0, prev.paused - 1) : prev.paused,
    }));
  };

  const stats = [
    { label: 'Agents', value: counts.total },
    { label: 'Active', value: counts.active },
    { label: 'Paused', value: counts.paused },
  ];

  return (
    <div className="min-h-screen bg-[#05070a] text-white">
      <Nav />

      <main className="relative pb-20 pt-28 sm:pb-28">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[26rem] overflow-hidden">
          <div className="absolute left-1/2 top-0 h-[24rem] w-[48rem] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(37,99,235,0.16),transparent_68%)]" />
        </div>

        <div className="relative mx-auto w-full max-w-6xl px-5 sm:px-8">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <Reveal>
              <SectionHeading
                eyebrow="Agent workspace"
                title="Your AI"
                highlight="agents"
                description="Describe your business once. Your agents take over the repetitive work and hand back anything that needs a human."
              />
            </Reveal>

            <Reveal delay={0.1}>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  to="/tasks"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:border-white/25 hover:text-white"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Task board
                </Link>
                <Link
                  to="/agents/new"
                  className="group inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_-14px_rgba(34,211,238,0.9)] transition-transform duration-300 hover:-translate-y-0.5"
                >
                  <Plus className="h-4 w-4" />
                  New agent
                </Link>
              </div>
            </Reveal>
          </div>

          <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="grid grid-cols-3 gap-3 sm:max-w-md lg:w-full">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-white/[0.07] bg-[#0a0f19] px-4 py-3">
                  <p className="font-heading text-2xl font-semibold text-white">{stat.value}</p>
                  <p className="mt-0.5 text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">{stat.label}</p>
                </div>
              ))}
            </div>

            <div
              role="group"
              aria-label="Agents view"
              className="inline-flex w-fit shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1"
            >
              {[
                { key: 'grid', label: 'Grid', icon: LayoutGrid },
                { key: 'board', label: 'Board', icon: LayoutDashboard },
              ].map((option) => {
                const Icon = option.icon;
                const selected = view === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setView(option.key)}
                    aria-pressed={selected}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                      selected
                        ? 'bg-white/[0.12] text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Link
            to="/recruitment"
            className="group mt-8 flex flex-col gap-4 rounded-2xl border border-sky-400/25 bg-[linear-gradient(120deg,rgba(37,99,235,0.14),rgba(34,211,238,0.06))] p-5 transition-colors hover:border-sky-400/50 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-4">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-400 ${anyHired ? HIRED_GLOW : ''}`}><Briefcase className="h-5 w-5 text-white" /></span>
              <div>
                <div className="flex flex-wrap items-center gap-2"><p className="text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-sky-300">Featured agent</p>{anyHired && <HiredBadge />}</div>
                <p className="mt-1 font-heading text-lg font-semibold text-white">AI Recruitment & Talent Sourcing Agent</p>
                <p className="mt-1 max-w-2xl text-sm text-slate-400">
                  Find, evaluate, contact and negotiate with IT professionals worldwide — inside the budget you approve, with candidate consent and a full audit trail.
                </p>
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-sky-300">
              Open recruitment <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>

          <Link
            to="/network-security"
            className="group mt-4 flex flex-col gap-4 rounded-2xl border border-sky-400/25 bg-[linear-gradient(120deg,rgba(37,99,235,0.14),rgba(34,211,238,0.06))] p-5 transition-colors hover:border-sky-400/50 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-4">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-400 ${anyHired ? HIRED_GLOW : ''}`}><ShieldCheck className="h-5 w-5 text-white" /></span>
              <div>
                <div className="flex flex-wrap items-center gap-2"><p className="text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-sky-300">Featured agent</p>{anyHired && <HiredBadge />}</div>
                <p className="mt-1 font-heading text-lg font-semibold text-white">Cyber Security Scan Agent</p>
                <p className="mt-1 max-w-2xl text-sm text-slate-400">
                  Scan your own local network from a linked Windows PC, find devices and open ports, and get a prioritised security report — authorised scans only.
                </p>
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-sky-300">
              Open network security <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>

          <div className="mt-10">
            {loading ? (
              <div className="flex items-center gap-2 py-16 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading your agents…
              </div>
            ) : agents.length ? (
              view === 'board' ? (
                <>
                  <p className="mb-3 text-xs text-slate-500">
                    Drag an agent card into another column to change its lifecycle status.
                  </p>
                  <AgentBoard agents={agents} onMove={handleBoardMove} />
                </>
              ) : (
                <div className="grid grid-cols-1 items-stretch gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
                  {agents.map((agent, i) => (
                    <Reveal key={agent.id} delay={(i % 4) * 0.06} className="h-full">
                      <AgentCard agent={agent} onStatusChange={handleStatusChange} onDelete={handleDelete} />
                    </Reveal>
                  ))}
                </div>
              )
            ) : (
              <div className="rounded-2xl border border-white/[0.07] bg-[#0a0f19] px-6 py-14 text-center">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-sky-300">
                  <Bot className="h-6 w-6" />
                </span>
                <h2 className="mt-5 font-heading text-xl font-semibold text-white">No agents yet</h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-400">
                  Answer a few questions about your business and the generator writes the role, instructions, workflow and safety rules for you.
                </p>
                <Link
                  to="/agents/new"
                  className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400 px-5 py-2.5 text-sm font-semibold text-white transition-transform duration-300 hover:-translate-y-0.5"
                >
                  <Sparkles className="h-4 w-4" />
                  Build your first agent
                </Link>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}