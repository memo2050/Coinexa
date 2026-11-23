import { GitBranch } from 'lucide-react';
import WorkflowDiagram from './WorkflowDiagram';

export default function WorkflowPreview({ graph }) {
  if (!graph?.nodes?.length) return null;

  return (
    <section className="mt-4 rounded-2xl border border-white/[0.08] bg-[#0a0f19] p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <GitBranch className="h-4 w-4 text-sky-300" />
        <h2 className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-sky-300">
          Agentic workflow
        </h2>
        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.12em] text-slate-500">
          v{graph.version || 1}
        </span>
        <span className="text-[0.6rem] uppercase tracking-[0.12em] text-slate-600">
          {graph.nodes.length} nodes
        </span>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        This graph is what the agent actually runs: reasoning steps, the tools it may use, a decision branch,
        a human approval gate and error handling.
      </p>

      <div className="mt-4">
        <WorkflowDiagram graph={graph} />
      </div>
    </section>
  );
}