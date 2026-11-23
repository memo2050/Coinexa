import { useRef, useState } from 'react';
import { AlertCircle, Download, FileText, Loader2, Play, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ResultBody from '@/components/agents/ResultBody';
import ApprovalGate from '@/components/agents/ApprovalGate';
import { downloadResult } from '@/components/agents/resultDownload';

export default function AgentTaskRunner({ agent, onRunningChange, onTaskComplete }) {
  const [task, setTask] = useState('');
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const fileInput = useRef(null);
  // One key per submission attempt. A second click or a retried request carries
  // the same key, so the server returns the run it already started rather than
  // executing and metering the task twice.
  const inFlight = useRef(false);
  const submissionKey = useRef(crypto.randomUUID());

  const setRunningState = (value) => {
    setRunning(value);
    onRunningChange?.(value);
  };

  const addFiles = async (event) => {
    const chosen = Array.from(event.target.files || []).slice(0, 3 - files.length);
    if (!chosen.length) return;
    setError('');
    setUploading(true);
    try {
      const uploaded = [];
      for (const file of chosen) {
        const response = await base44.integrations.Core.UploadPrivateFile({ file });
        const record = await base44.entities.AgentUpload.create({
          file_uri: response.file_uri,
          file_name: file.name,
          organization_id: agent.organization_id || '',
        });
        uploaded.push({ name: file.name, uri: response.file_uri, uploadId: record.id });
      }
      setFiles((prev) => [...prev, ...uploaded].slice(0, 3));
    } catch (err) {
      setError(err?.message || 'That file could not be uploaded.');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const execute = async () => {
    const instruction = task.trim();
    if (instruction.length < 5 || running || inFlight.current) return;
    inFlight.current = true;
    setRunningState(true);
    setError('');
    setResult(null);
    try {
      const response = await base44.functions.invoke('runAgentTask', {
        agentId: agent.id,
        task: instruction,
        upload_ids: files.map((file) => file.uploadId),
        idempotencyKey: submissionKey.current,
      });
      setResult(response.data?.task || null);
      setTask('');
      setFiles([]);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'The task could not be executed.');
    } finally {
      inFlight.current = false;
      submissionKey.current = crypto.randomUUID();
      setRunningState(false);
      onTaskComplete?.();
    }
  };

  const handleDecided = (next) => {
    setResult(next);
    onTaskComplete?.();
  };

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#0a0f19] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold text-white">Run a task</h2>
        <span className="text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">Real execution</span>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
        Give {agent.name} a piece of real work. The result is produced by the AI model and saved to its history.
      </p>

      <label htmlFor="agent-task" className="mt-5 block text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">
        Task
      </label>
      <textarea
        id="agent-task"
        rows={5}
        value={task}
        onChange={(event) => setTask(event.target.value)}
        maxLength={4000}
        placeholder="e.g. Draft a reply to this complaint and tell me what we should refund."
        className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-[#05070a]/70 px-3.5 py-3 text-sm text-white placeholder:text-slate-500 focus:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={uploading || files.length >= 3}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs text-slate-300 transition-colors hover:border-white/20 hover:text-white disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
          {uploading ? 'Uploading…' : 'Attach file'}
        </button>
        <input
          ref={fileInput}
          type="file"
          onChange={addFiles}
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.md,.docx,.xlsx"
        />
        {files.map((file) => (
          <span
            key={file.uri}
            className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-slate-300"
          >
            <span className="truncate">{file.name}</span>
            <button
              type="button"
              onClick={() => setFiles((prev) => prev.filter((item) => item.uri !== file.uri))}
              className="text-slate-500 transition-colors hover:text-rose-300"
              aria-label={`Remove ${file.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <span className="text-[0.68rem] text-slate-600">Up to 3 files, stored privately</span>
      </div>

      <button
        type="button"
        onClick={execute}
        disabled={running || task.trim().length < 5}
        className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_-14px_rgba(34,211,238,0.9)] transition-transform duration-300 hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50"
      >
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        {running ? 'Executing…' : 'Execute task'}
      </button>

      {error && (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      <ApprovalGate task={result} onDecided={handleDecided} />

      {result?.output && (
        <div className="mt-5 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[0.68rem] uppercase tracking-[0.16em] text-emerald-300">Result</p>
              {result.execution_id && (
                <p className="mt-1 break-all font-mono text-[0.62rem] text-slate-500">
                  {result.execution_id}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => downloadResult(result)}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-white/25 hover:text-white"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </button>
          </div>
          <div className="mt-3">
            <ResultBody content={result.output} />
          </div>
        </div>
      )}
    </div>
  );
}