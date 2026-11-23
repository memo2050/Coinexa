import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Database,
  FileText,
  GitBranch,
  Inbox,
  Play,
  Plug,
  Send,
  Sparkles,
  UserCheck,
  Zap,
} from 'lucide-react';

export const NODE_META = {
  start: { label: 'Start', icon: Play, tone: 'border-white/12 bg-white/[0.04] text-slate-300' },
  trigger: { label: 'Trigger', icon: Zap, tone: 'border-sky-400/25 bg-sky-400/10 text-sky-300' },
  input: { label: 'Input', icon: Inbox, tone: 'border-sky-400/25 bg-sky-400/10 text-sky-300' },
  data_collection: { label: 'Data collection', icon: Database, tone: 'border-cyan-400/25 bg-cyan-400/10 text-cyan-300' },
  ai_processing: { label: 'AI processing', icon: Sparkles, tone: 'border-violet-400/25 bg-violet-400/10 text-violet-300' },
  analysis: { label: 'Analysis', icon: BarChart3, tone: 'border-violet-400/25 bg-violet-400/10 text-violet-300' },
  decision: { label: 'Decision', icon: GitBranch, tone: 'border-amber-400/25 bg-amber-400/10 text-amber-300' },
  action: { label: 'Action', icon: Send, tone: 'border-blue-400/25 bg-blue-400/10 text-blue-300' },
  integration: { label: 'Integration', icon: Plug, tone: 'border-teal-400/25 bg-teal-400/10 text-teal-300' },
  approval: { label: 'Human approval', icon: UserCheck, tone: 'border-amber-400/30 bg-amber-400/10 text-amber-300' },
  output: { label: 'Output', icon: FileText, tone: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' },
  completion: { label: 'Completion', icon: CheckCircle2, tone: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' },
  error_handling: { label: 'Error handling', icon: AlertTriangle, tone: 'border-rose-400/25 bg-rose-400/10 text-rose-300' },
};

export const STATUS_META = {
  PENDING: { label: 'Pending', pill: 'border-white/12 bg-white/[0.04] text-slate-400', wrap: '' },
  RUNNING: {
    label: 'Running',
    pill: 'border-sky-400/40 bg-sky-400/15 text-sky-200',
    wrap: 'border-sky-400/40 shadow-[0_0_34px_-16px_rgba(56,189,248,0.9)]',
  },
  COMPLETED: { label: 'Completed', pill: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300', wrap: '' },
  FAILED: { label: 'Failed', pill: 'border-rose-400/40 bg-rose-400/10 text-rose-300', wrap: 'border-rose-400/30' },
  AWAITING_APPROVAL: {
    label: 'Waiting for approval',
    pill: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
    wrap: 'border-amber-400/40 shadow-[0_0_30px_-16px_rgba(251,191,36,0.9)]',
  },
  SKIPPED: { label: 'Skipped', pill: 'border-white/10 bg-white/[0.02] text-slate-500', wrap: 'opacity-75' },
};

export const ADDABLE_KINDS = [
  'ai_processing',
  'analysis',
  'decision',
  'action',
  'data_collection',
  'integration',
  'approval',
  'output',
];

export function metaFor(kind) {
  return NODE_META[kind] || NODE_META.ai_processing;
}

export function durationOf(step) {
  if (!step?.started_at || !step?.finished_at) return '';
  const ms = new Date(step.finished_at).getTime() - new Date(step.started_at).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}