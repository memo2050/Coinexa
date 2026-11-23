import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import AgentBoardCard from '@/components/agents/AgentBoardCard';

const COLUMNS = [
  {
    key: 'draft',
    label: 'Draft',
    hint: 'Not activated yet',
    accent: 'text-slate-400',
    drop: 'border-slate-300/40 bg-slate-400/[0.07]',
    empty: 'Drag an agent here to park it as a draft.',
  },
  {
    key: 'active',
    label: 'Active',
    hint: 'Running real work',
    accent: 'text-emerald-300',
    drop: 'border-emerald-400/50 bg-emerald-400/[0.08]',
    empty: 'Drag an agent here to activate it.',
  },
  {
    key: 'paused',
    label: 'Paused',
    hint: 'Not accepting tasks',
    accent: 'text-amber-300',
    drop: 'border-amber-400/50 bg-amber-400/[0.08]',
    empty: 'Drag an agent here to pause it.',
  },
];

const columnOf = (agent) =>
  agent.status === 'active' || agent.status === 'paused' ? agent.status : 'draft';

export default function AgentBoard({ agents = [], onMove }) {
  const grouped = COLUMNS.reduce((acc, column) => {
    acc[column.key] = agents.filter((agent) => columnOf(agent) === column.key);
    return acc;
  }, {});

  const handleDragEnd = (result) => {
    const { destination, source, draggableId } = result;
    if (!destination || destination.droppableId === source.droppableId) return;
    const agent = agents.find((item) => item.id === draggableId);
    if (!agent) return;
    onMove(agent, destination.droppableId);
  };

  return (
    <DragDropContext
      onDragEnd={handleDragEnd}
      dropAnimation={{ duration: 250, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
    >
      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((column) => (
          <Droppable droppableId={column.key} key={column.key}>
            {(provided, snapshot) => (
              <section
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={`flex min-h-[17rem] flex-col rounded-2xl border p-3 transition-all duration-200 ${
                  snapshot.isDraggingOver
                    ? `${column.drop} shadow-[0_22px_60px_-32px_rgba(34,211,238,0.95)]`
                    : 'border-white/[0.07] bg-[#0a0f19]'
                }`}
              >
                <header className="flex items-center justify-between gap-2 px-1 pb-3">
                  <div className="min-w-0">
                    <p
                      className={`text-[0.68rem] font-semibold uppercase tracking-[0.16em] ${column.accent}`}
                    >
                      {column.label}
                    </p>
                    <p className="mt-0.5 text-[0.62rem] text-slate-500">{column.hint}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.68rem] transition-colors ${
                      snapshot.isDraggingOver
                        ? 'border-white/25 bg-white/[0.12] text-white'
                        : 'border-white/10 bg-white/[0.03] text-slate-400'
                    }`}
                  >
                    {snapshot.isDraggingOver ? 'Release to drop' : grouped[column.key].length}
                  </span>
                </header>

                <div className="flex flex-1 flex-col gap-2.5">
                  {grouped[column.key].map((agent, index) => (
                    <Draggable draggableId={agent.id} index={index} key={agent.id}>
                      {(dragProvided, dragSnapshot) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          {...dragProvided.dragHandleProps}
                          className={`transition-opacity duration-150 ${
                            dragSnapshot.isDragging ? 'opacity-100' : ''
                          }`}
                        >
                          <AgentBoardCard agent={agent} dragging={dragSnapshot.isDragging} />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                  {!grouped[column.key].length && (
                    <div
                      className={`flex flex-1 items-center justify-center rounded-xl border border-dashed px-3 py-8 text-center text-[0.7rem] leading-relaxed transition-colors ${
                        snapshot.isDraggingOver
                          ? 'border-white/25 text-slate-300'
                          : 'border-white/10 text-slate-500'
                      }`}
                    >
                      {snapshot.isDraggingOver ? 'Drop here' : column.empty}
                    </div>
                  )}
                </div>
              </section>
            )}
          </Droppable>
        ))}
      </div>
    </DragDropContext>
  );
}