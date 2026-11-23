import { useCallback, useEffect, useMemo, useState } from 'react';
import { GitBranch, Loader2, Pencil, Power, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import WorkflowDiagram from './WorkflowDiagram';
import WorkflowEditor from './WorkflowEditor';
import NodeDetailsPanel from './NodeDetailsPanel';
import WorkflowRunSummary from './WorkflowRunSummary';
import WorkflowProgress from './WorkflowProgress';
import { withEdges } from './graphUtils';

const LEGEND = [
  { label: 'Pending', dot: 'bg-slate-500' },
  { label: 'Running', dot: 'bg-sky-400' },
  { label: 'Completed', dot: 'bg-emerald-400' },
  { label: 'Waiting', dot: 'bg-amber-400' },
  { label: 'Failed', dot: 'bg-rose-400' },
  { label: 'Skipped', dot: 'bg-slate-600' },
];

export default function WorkflowPanel({ agent, onAgentChange }) {
  const [graph, setGraph] = useState(agent.workflow_graph || null);
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(!agent.workflow_graph);
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draftNodes, setDraftNodes] = useState([]);
  const [enabled, setEnabled] = useState(agent.workflow_enabled !== false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const loadLatest = useCallback(async () => {
    const page = await base44.entities.AgentTask.filter(
      { agent_id: agent.id },
      { sort: '-created_date', limit: 1 }
    );
    setTask(page.items[0] || null);
  }, [agent.id]);

  useEffect(() => {
    if (graph) {
      loadLatest();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await base44.functions.invoke('agentWorkflow', {
          action: 'build',
          agentId: agent.id,
        });
        if (!cancelled) {
          setGraph(response.data?.graph || null);
          onAgentChange?.();
          loadLatest();
        }
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.error || 'The workflow could not be prepared.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agent.id]);

  useEffect(() => {
    const unsubscribe = base44.entities.AgentTask.subscribe((event) => {
      const data = event?.data;
      if (!data || data.agent_id !== agent.id) return;
      setTask((prev) => {
        if (event.type === 'create' || !prev || prev.id !== data.id) return data;
        return { ...prev, ...data };
      });
    });
    return unsubscribe;
  }, [agent.id]);

  useEffect(() => {
    if (!task || (task.status !== 'running' && task.status !== 'awaiting_approval')) return undefined;
    const timer = setInterval(loadLatest, 3000);
    return () => clearInterval(timer);
  }, [task?.status, loadLatest]);

  useEffect(() => {
    if (!graph) return;
    setSelectedId((prev) =>
      prev && graph.nodes.some((node) => node.id === prev)
        ? prev
        : task?.current_node || graph.nodes[0]?.id || null
    );
  }, [graph, task?.current_node]);

  const stepsById = useMemo(
    () => Object.fromEntries((task?.steps || []).map((step) => [step.node_id, step])),
    [task]
  );

  const selectedNode = (editing ? draftNodes : graph?.nodes || []).find(
    (node) => node.id === selectedId
  ) || null;

  const beginEdit = () => {
    setDraftNodes((graph?.nodes || []).map((node) => ({ ...node })));
    setEditing(true);
    setError('');
  };

  const saveGraph = async (nodes) => {
    setBusy('save');
    setError('');
    try {
      const next = { ...graph, nodes, edges: withEdges(nodes) };
      const response = await base44.functions.invoke('agentWorkflow', {
        action: 'save',
        agentId: agent.id,
        graph: next,
      });
      setGraph(response.data?.graph || next);
      setEditing(false);
      onAgentChange?.();
    } catch (err) {
      const details = err?.response?.data?.errors;
      setError(
        Array.isArray(details) && details.length
          ? details.join(' ')
          : err?.response?.data?.error || 'The workflow could not be saved.'
      );
    } finally {
      setBusy('');
    }
  };

  const updateNode = (id, patch) => {
    const source = editing ? draftNodes : (graph?.nodes || []).map((node) => ({ ...node }));
    setDraftNodes(source.map((node) => (node.id === id ? { ...node, ...patch } : node)));
    setEditing(true);
  };

  const regenerate = async () => {
    setBusy('build');
    setError('');
    try {
      const response = await base44.functions.invoke('agentWorkflow', {
        action: 'build',
        agentId: agent.id,
      });
      setGraph(response.data?.graph || null);
      setEditing(false);
      onAgentChange?.();
    } catch (err) {
      setError(err?.response?.data?.error || 'The workflow could not be regenerated.');
    } finally {
      setBusy('');
    }
  };

  const toggle = async () => {
    setBusy('toggle');
    setError('');
    try {
      const response = await base44.functions.invoke('agentWorkflow', {
        action: 'toggle',
        agentId: agent.id,
        enabled: !enabled,
      });
      setEnabled(response.data?.agent?.workflow_enabled !== false);
      onAgentChange?.();
    } catch (err) {
      setError(err?.response?.data?.error || 'The workflow could not be switched.');
    } finally {
      setBusy('');
    }
  };

  const decide = async (decision) => {
    if (!task) return;
    setBusy(decision);
    setError('');
    try {
      const response = await base44.functions.invoke('resumeAgentTask', {
        taskId: task.id,
        decision,
      });
      if (response.data?.task) setTask(response.data.task);
      onAgentChange?.();
    } catch (err) {
      setError(err?.response?.data?.error || 'The run could not be continued.');
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="min-w-0 rounded-2xl border border-white/[0.08] bg-[#0a0f19] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-sky-300" />
          <h2 className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-sky-300">Workflow</h2>
          {graph?.version && (
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.12em] text-slate-500">
              v{graph.version}
            </span>
          )}
          {!enabled && (
            <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.12em] text-amber-300">
              Off
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            disabled={Boolean(busy)}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[0.7rem] text-slate-300 transition-colors hover:border-white/25 hover:text-white disabled:opacity-50"
          >
            <Power className="h-3 w-3" />
            {enabled ? 'Deactivate' : 'Activate'}
          </button>
          <button
            type="button"
            onClick={regenerate}
            disabled={Boolean(busy)}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[0.7rem] text-slate-300 transition-colors hover:border-white/25 hover:text-white disabled:opacity-50"
          >
            {busy === 'build' ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Regenerate
          </button>
          {!editing && (
            <button
              type="button"
              onClick={beginEdit}
              disabled={!graph}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[0.7rem] text-slate-300 transition-colors hover:border-sky-400/40 hover:text-white disabled:opacity-50"
            >
              <Pencil className="h-3 w-3" />
              Edit workflow
            </button>
          )}
        </div>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        Every run executes this graph on the server, node by node. Statuses below are the real execution record —
        nothing is simulated.
      </p>

      {graph && !editing && <WorkflowProgress graph={graph} task={task} />}

      {error && (
        <p className="mt-3 break-words rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 [overflow-wrap:anywhere]">
          {error}
        </p>
      )}

      {loading ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Building the workflow…
        </div>
      ) : (
        <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="min-w-0">
            {editing ? (
              <WorkflowEditor
                nodes={draftNodes}
                onChange={setDraftNodes}
                onSave={saveGraph}
                onCancel={() => setEditing(false)}
                busy={busy === 'save'}
              />
            ) : (
              <WorkflowDiagram
                graph={graph}
                stepsById={stepsById}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            )}

            <div className="mt-3 flex flex-wrap gap-3">
              {LEGEND.map((item) => (
                <span key={item.label} className="inline-flex items-center gap-1.5 text-[0.6rem] text-slate-500">
                  <span className={`h-1.5 w-1.5 rounded-full ${item.dot}`} />
                  {item.label}
                </span>
              ))}
            </div>
          </div>

          <div className="min-w-0 space-y-3">
            <WorkflowRunSummary
              task={task}
              busy={Boolean(busy)}
              onApprove={() => decide('approve')}
              onReject={() => decide('reject')}
            />
            <NodeDetailsPanel node={selectedNode} step={stepsById[selectedNode?.id]} onUpdate={updateNode} />
            {editing && (
              <p className="text-[0.65rem] leading-relaxed text-slate-500">
                Node edits are kept in the draft until you save a new version.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}