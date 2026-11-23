export function downloadResult(task) {
  if (!task) return;
  const body = task.output || task.error || '';
  const header = [
    `Agent: ${task.agent_name || 'Agent'}`,
    `Task: ${task.task || ''}`,
    `Status: ${task.status || ''}`,
    task.started_at ? `Run at: ${new Date(task.started_at).toLocaleString()}` : '',
    '',
    body,
  ]
    .filter(Boolean)
    .join('\n');

  const blob = new Blob([header], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const slug = (task.agent_name || 'agent').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  link.href = url;
  link.download = `${slug}-${(task.id || 'result').slice(0, 6)}.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}