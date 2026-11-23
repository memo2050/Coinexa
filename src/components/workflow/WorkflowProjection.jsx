import { useEffect, useRef, useState } from 'react';
import { GitBranch, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import WorkflowDiagram from './WorkflowDiagram';

// Draws the workflow the current wizard answers would produce, using the same
// server-side graph builder the generator uses. Nothing is saved.
export default function WorkflowProjection({ answers }) {
  const [graph, setGraph] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const runId = useRef(0);

  const payload = {
    preview: true,
    industry: answers.industry_key === 'custom' ? answers.industry_custom : answers.industry,
    agent_title: answers.agent_title,
    business_name: answers.business_name,
    business_description: answers.business_description,
    tasks: answers.tasks,
    responsibilities: answers.responsibilities,
    permissions: answers.permissions,
    tone: answers.tone,
    tools: answers.tools,
  };
  const signature = JSON.stringify(payload);

  useEffect(() => {
    const request = JSON.parse(signature);
    if (!request.industry) {
      setGraph(null);
      return;
    }

    const id = runId.current + 1;
    runId.current = id;
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const response = await base44.functions.invoke('generateAgent', request);
        if (runId.current !== id) return;
        setGraph(response.data?.graph || null);
        setError('');
      } catch (err) {
        if (runId.current !== id) return;
        setError('The workflow could not be drawn yet. Keep going — it appears once the answers reach the server.');
      } finally {
        if (runId.current === id) setLoading(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [signature]);

  return (
    <section className="mt-6 rounded-2xl border border-white/[0.08] bg-[#0a0f19] p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <GitBranch className="h-4 w-4 text-sky-300" />
        <h2 className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-sky-300">
          How a task will be processed
        </h2>
        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.12em] text-slate-500">
          Projected
        </span>
        {graph?.nodes?.length ? (
          <span className="text-[0.6rem] uppercase tracking-[0.12em] text-slate-600">
            {graph.nodes.length} nodes
          </span>
        ) : null}
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />}
      </div>

      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        Each task runs through these nodes in order: the work steps you described, the self-check, and the
        human approval gate where the run stops until you decide. The generator writes the final step
        wording when you build the agent.
      </p>

      {error && <p className="mt-3 text-xs leading-relaxed text-rose-300">{error}</p>}

      <div className="mt-4">
        {graph?.nodes?.length ? (
          <WorkflowDiagram graph={graph} />
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 p-4 text-xs leading-relaxed text-slate-500">
            {loading ? 'Drawing the workflow from your answers…' : 'Answer the questions and the workflow appears here.'}
          </div>
        )}
      </div>
    </section>
  );
}