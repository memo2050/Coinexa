import { ArrowDown } from 'lucide-react';
import WorkflowNodeCard from './WorkflowNodeCard';
import { incomingLabel, isBranchTarget, mainlineNodes } from './graphUtils';

function Connector({ label }) {
  return (
    <div className="flex flex-col items-center py-1">
      <span className="h-3 w-px bg-white/15" aria-hidden="true" />
      <span className="flex items-center gap-1">
        {label && (
          <span
            className={`rounded-full border px-2 py-0.5 text-[0.55rem] font-semibold uppercase tracking-[0.14em] ${
              label === 'NO'
                ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                : 'border-sky-400/30 bg-sky-400/10 text-sky-300'
            }`}
          >
            {label}
          </span>
        )}
        <ArrowDown className="h-3 w-3 text-slate-600" aria-hidden="true" />
      </span>
      <span className="h-3 w-px bg-white/15" aria-hidden="true" />
    </div>
  );
}

export default function WorkflowDiagram({ graph, stepsById = {}, selectedId, onSelect }) {
  const nodes = mainlineNodes(graph?.nodes || []);
  const errorNode = (graph?.nodes || []).find((node) => node.kind === 'error_handling');
  const edges = graph?.edges || [];

  return (
    <div className="min-w-0">
      {nodes.map((node, index) => {
        const branch = isBranchTarget(edges, node.id);
        return (
          <div
            key={node.id}
            className={branch ? 'ml-3 border-l border-dashed border-amber-400/30 pl-3 sm:ml-5 sm:pl-4' : ''}
          >
            {index > 0 && <Connector label={incomingLabel(edges, node.id)} />}
            <WorkflowNodeCard
              node={node}
              step={stepsById[node.id]}
              selected={selectedId === node.id}
              onSelect={onSelect}
            />
          </div>
        );
      })}

      {errorNode && (
        <div className="mt-1">
          <Connector label="" />
          <WorkflowNodeCard
            node={errorNode}
            step={stepsById[errorNode.id]}
            selected={selectedId === errorNode.id}
            onSelect={onSelect}
          />
        </div>
      )}
    </div>
  );
}