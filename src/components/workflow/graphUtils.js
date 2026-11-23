export const mainlineNodes = (nodes = []) => nodes.filter((node) => node.kind !== 'error_handling');

// Rebuilds the arrows from the node order: a straight chain, with the YES and
// NO branches both leading through the human approval checkpoint.
export function withEdges(nodes = []) {
  const list = mainlineNodes(nodes);
  const edges = [];
  list.forEach((node, index) => {
    if (node.kind === 'completion') return;
    if (node.kind === 'decision') {
      const output = list.find((item) => item.kind === 'output');
      const approval = list.find((item) => item.kind === 'approval');
      const yesTarget = approval || output || list[index + 1];
      if (yesTarget && yesTarget.id !== node.id) {
        edges.push({ from: node.id, to: yesTarget.id, label: 'YES', condition: 'yes' });
      }
      if (approval && approval.id !== node.id) {
        edges.push({ from: node.id, to: approval.id, label: 'NO', condition: 'no' });
      }
      return;
    }
    const next = list[index + 1];
    if (next) edges.push({ from: node.id, to: next.id, label: '', condition: 'always' });
  });
  return edges;
}

export function incomingLabel(edges = [], nodeId) {
  const edge = edges.find((item) => item.to === nodeId && item.condition !== 'always');
  return edge?.label || '';
}

export function isBranchTarget(edges = [], nodeId) {
  return edges.some((item) => item.to === nodeId && item.condition === 'no');
}