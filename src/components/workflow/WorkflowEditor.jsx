import { useState } from 'react';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { GripVertical, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { ADDABLE_KINDS, metaFor } from './workflowMeta';
import { mainlineNodes } from './graphUtils';

const fieldClass =
  'w-full rounded-xl border border-white/10 bg-[#05070a]/70 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400/20';

const LOCKED = ['start', 'completion', 'error_handling'];

export default function WorkflowEditor({ nodes, onChange, onSave, onCancel, busy }) {
  const [kind, setKind] = useState('ai_processing');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  const list = mainlineNodes(nodes);
  const hidden = nodes.filter((node) => node.kind === 'error_handling');

  const handleDragEnd = (result) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    const reordered = Array.from(list);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    onChange([...reordered, ...hidden]);
  };

  const remove = (node) => {
    if (LOCKED.includes(node.kind)) return;
    onChange(nodes.filter((item) => item.id !== node.id));
  };

  const add = () => {
    const value = title.trim();
    if (value.length < 3) {
      setError('Give the new step a name of at least three characters.');
      return;
    }
    const node = {
      id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      kind,
      title: value,
      description: '',
      instructions: value,
      inputs: [],
      outputs: [],
      editable: true,
    };
    const next = [...list];
    const completionIndex = next.findIndex((item) => item.kind === 'completion');
    next.splice(completionIndex === -1 ? next.length : completionIndex, 0, node);
    onChange([...next, ...hidden]);
    setTitle('');
    setError('');
  };

  return (
    <div className="min-w-0">
      <p className="text-xs leading-relaxed text-slate-500">
        Drag a step to change the order. Steps are linked in that order: the decision node keeps its YES path to the
        deliverable and its NO path to human approval.
      </p>

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="workflow-steps">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="mt-3 space-y-1.5">
              {list.map((node, index) => {
                const meta = metaFor(node.kind);
                const Icon = meta.icon;
                const locked = LOCKED.includes(node.kind);
                return (
                  <Draggable key={node.id} draggableId={node.id} index={index} isDragDisabled={locked}>
                    {(dragProvided, snapshot) => (
                      <div
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                        className={`flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2 ${
                          snapshot.isDragging
                            ? 'border-sky-400/50 bg-[#101827]'
                            : 'border-white/[0.08] bg-white/[0.02]'
                        }`}
                      >
                        <span
                          {...dragProvided.dragHandleProps}
                          className={`shrink-0 ${locked ? 'opacity-30' : 'text-slate-500 hover:text-slate-300'}`}
                          aria-label="Reorder step"
                        >
                          <GripVertical className="h-4 w-4" />
                        </span>
                        <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="min-w-0 flex-1 break-words text-xs leading-snug text-slate-200 [overflow-wrap:anywhere]">
                          {node.title}
                        </span>
                        {!locked && (
                          <button
                            type="button"
                            onClick={() => remove(node)}
                            className="shrink-0 rounded-full p-1 text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
                            aria-label={`Remove ${node.title}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </Draggable>
                );
              })}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
        <p className="text-[0.62rem] uppercase tracking-[0.16em] text-slate-500">Add a step</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            className={`${fieldClass} sm:w-40`}
            aria-label="Node type"
          >
            {ADDABLE_KINDS.map((item) => (
              <option key={item} value={item}>
                {metaFor(item).label}
              </option>
            ))}
          </select>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="What should this step do?"
            maxLength={120}
            className={fieldClass}
            aria-label="New step name"
          />
          <button
            type="button"
            onClick={add}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-white/10 px-3.5 py-2 text-xs text-slate-200 transition-colors hover:border-sky-400/40 hover:text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSave(nodes)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save new version
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3.5 py-2 text-xs text-slate-400 transition-colors hover:text-white disabled:opacity-60"
        >
          <X className="h-3.5 w-3.5" />
          Discard
        </button>
      </div>
    </div>
  );
}