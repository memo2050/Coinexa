import { useEffect, useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { durationOf, metaFor, STATUS_META } from './workflowMeta';

const CHECKPOINTABLE = ['action', 'integration', 'output'];

const fieldClass =
  'w-full rounded-xl border border-white/10 bg-[#05070a]/70 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400/20';

function Row({ label, children }) {
  return (
    <div className="mt-3">
      <p className="text-[0.62rem] uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <div className="mt-1 break-words text-sm leading-relaxed text-slate-300 [overflow-wrap:anywhere]">
        {children}
      </div>
    </div>
  );
}

export default function NodeDetailsPanel({ node, step, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: '', description: '', instructions: '' });

  useEffect(() => {
    setEditing(false);
    setDraft({
      title: node?.title || '',
      description: node?.description || '',
      instructions: node?.instructions || '',
      requires_approval: node?.requires_approval === true,
    });
  }, [node?.id]);

  if (!node) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-slate-500">
        Select a node to see its instructions, data and execution details.
      </div>
    );
  }

  const meta = metaFor(node.kind);
  const Icon = meta.icon;
  const statusMeta = step?.status ? STATUS_META[step.status] : null;
  const timing = durationOf(step);

  const save = () => {
    onUpdate?.(node.id, {
      title: draft.title.trim() || node.title,
      description: draft.description.trim(),
      instructions: draft.instructions.trim(),
      requires_approval: Boolean(draft.requires_approval),
    });
    setEditing(false);
  };

  return (
    <div className="min-w-0 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl border ${meta.tone}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
            {meta.label} node
          </p>
          <h3 className="mt-1 break-words font-heading text-base font-semibold leading-snug text-white [overflow-wrap:anywhere]">
            {node.title}
          </h3>
          {statusMeta && (
            <span
              className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.12em] ${statusMeta.pill}`}
            >
              {statusMeta.label}
            </span>
          )}
        </div>
      </div>

      {editing ? (
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-[0.62rem] uppercase tracking-[0.16em] text-slate-500" htmlFor="node-title">
              Node name
            </label>
            <input
              id="node-title"
              className={`${fieldClass} mt-1`}
              value={draft.title}
              maxLength={120}
              onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
            />
          </div>
          <div>
            <label className="text-[0.62rem] uppercase tracking-[0.16em] text-slate-500" htmlFor="node-description">
              Description
            </label>
            <textarea
              id="node-description"
              rows={2}
              className={`${fieldClass} mt-1`}
              value={draft.description}
              maxLength={400}
              onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
            />
          </div>
          <div>
            <label className="text-[0.62rem] uppercase tracking-[0.16em] text-slate-500" htmlFor="node-instructions">
              Processing instructions
            </label>
            <textarea
              id="node-instructions"
              rows={4}
              className={`${fieldClass} mt-1`}
              value={draft.instructions}
              maxLength={1200}
              onChange={(event) => setDraft((prev) => ({ ...prev, instructions: event.target.value }))}
            />
          </div>
          {CHECKPOINTABLE.includes(node.kind) && (
            <label className="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.05] px-3 py-2">
              <input
                type="checkbox"
                className="mt-0.5 h-3.5 w-3.5 accent-amber-400"
                checked={Boolean(draft.requires_approval)}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, requires_approval: event.target.checked }))
                }
              />
              <span className="text-xs leading-relaxed text-amber-200">
                Pause for my approval before this step runs
              </span>
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={save}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400 px-3.5 py-1.5 text-xs font-semibold text-white"
            >
              <Check className="h-3.5 w-3.5" />
              Apply to workflow
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-400 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          {node.description && <Row label="Description">{node.description}</Row>}
          {node.instructions && <Row label="Processing instructions">{node.instructions}</Row>}
          {node.inputs?.length ? <Row label="Input data">{node.inputs.join(' · ')}</Row> : null}
          {node.outputs?.length ? <Row label="Output data">{node.outputs.join(' · ')}</Row> : null}
          {node.tool && <Row label="Planned integration">{node.tool}</Row>}
          {(CHECKPOINTABLE.includes(node.kind) || node.kind === 'approval') && (
            <Row label="Approval checkpoint">
              {node.kind === 'approval' || node.requires_approval === true
                ? 'On — the run waits for you before this step runs.'
                : node.kind === 'output'
                  ? 'On — the deliverable waits for you unless an approval step already ran.'
                  : 'Off — this step runs without asking.'}
            </Row>
          )}
          {node.branches && (
            <Row label="Branches">
              YES → {node.branches.yes}
              <br />
              NO → {node.branches.no}
            </Row>
          )}
          <Row label="Execution">
            {step
              ? `${statusMeta?.label || step.status}${timing ? ` · ${timing}` : ''}${
                  step.finished_at ? ` · ${new Date(step.finished_at).toLocaleString()}` : ''
                }`
              : 'Not run yet. The status appears here during execution.'}
          </Row>
          {step?.output && <Row label="Step result">{step.output}</Row>}
          {step?.error && (
            <Row label="Error">
              <span className="text-rose-300">{step.error}</span>
            </Row>
          )}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-white/25 hover:text-white"
          >
            <Pencil className="h-3 w-3" />
            Edit this node
          </button>
        </>
      )}
    </div>
  );
}