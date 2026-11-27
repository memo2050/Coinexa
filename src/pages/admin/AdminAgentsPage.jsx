import { useState } from 'react';
import { ChevronDown, Loader2, PencilLine } from 'lucide-react';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import DataClassBadge from '@/components/admin/DataClassBadge';
import EmptyState from '@/components/admin/EmptyState';
import useAdminEndpoint from '@/components/admin/useAdminEndpoint';
import { fmtDate, fmtDuration, fmtLabel, fmtNumber, fmtPercent } from '@/components/admin/format';
import AgentBrandingEditor from '@/components/admin/AgentBrandingEditor';
import { BrandIcon } from '@/components/agents/brandIcons';

const selectClass =
  'w-full rounded-xl border border-white/10 bg-[#05070a]/70 px-3 py-2 text-xs text-slate-200 focus:border-sky-400/60 focus:outline-none';

const STATUS_TONE = {
  active: 'text-emerald-300',
  paused: 'text-amber-300',
  draft: 'text-slate-400',
};

export default function AdminAgentsPage() {
  const [status, setStatus] = useState('all');
  const [workflow, setWorkflow] = useState('all');
  const [performance, setPerformance] = useState('all');
  const [organizationId, setOrganizationId] = useState('all');
  const [openId, setOpenId] = useState(null);
  const [editing, setEditing] = useState(null);
  // Names and icons (super admin only; the server re-checks every request).
  const branding = useAdminEndpoint('adminAgentBranding', { action: 'list' });
  const brandBySubject = new Map(
    [...(branding.data?.featured || []), ...(branding.data?.agents || [])].map((item) => [item.subject, item]),
  );
  const editButton = (subject) => {
    const item = brandBySubject.get(subject);
    return (
      <button
        type="button"
        disabled={!item}
        onClick={(event) => {
          event.stopPropagation();
          setEditing(item);
        }}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[0.68rem] font-semibold text-slate-200 transition-colors hover:border-sky-400/40 hover:text-white disabled:opacity-50"
      >
        <PencilLine className="h-3.5 w-3.5" /> Name & icon
      </button>
    );
  };

  const { data, loading, error, reload } = useAdminEndpoint('adminAgents', {
    status,
    workflow,
    performance,
    organization_id: organizationId,
  });

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Command center"
        title="AI agents"
        description="Every agent on the platform with its workflow, execution and usage record. Configuration and status are not changed here; agent names and icons can be edited by the super admin."
        onRefresh={() => {
          reload();
          branding.reload();
        }}
        loading={loading}
      />

      {branding.error && (
        <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">{branding.error}</p>
      )}
      {branding.data && (
        <div>
          <p className="mb-2 text-[0.68rem] uppercase tracking-[0.14em] text-slate-600">Featured agents</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {branding.data.featured.map((item) => (
              <li key={item.subject} className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-[#0a0f19] px-4 py-3">
                <BrandIcon icon={item.icon || { kind: 'library', key: item.defaultIcon }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-heading text-sm font-semibold text-white">{item.name}</p>
                  <p className="truncate text-[0.66rem] text-slate-500">{item.icon || item.name !== item.defaultName ? 'Customised' : 'Default name and icon'}</p>
                </div>
                {editButton(item.subject)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label>
          <span className="sr-only">Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className={selectClass}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="draft">Draft</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Workflow</span>
          <select value={workflow} onChange={(event) => setWorkflow(event.target.value)} className={selectClass}>
            <option value="all">Any workflow</option>
            <option value="present">Has workflow</option>
            <option value="missing">Missing workflow</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Performance</span>
          <select
            value={performance}
            onChange={(event) => setPerformance(event.target.value)}
            className={selectClass}
          >
            <option value="all">Any performance</option>
            <option value="healthy">Healthy (90%+)</option>
            <option value="attention">Needs attention</option>
            <option value="idle">No runs yet</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Workspace</span>
          <select
            value={organizationId}
            onChange={(event) => setOrganizationId(event.target.value)}
            className={selectClass}
          >
            <option value="all">All workspaces</option>
            {(data?.organizations || []).map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">
          {error}
        </p>
      )}

      {loading && !data && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading agents…
        </div>
      )}

      {data && !data.items.length && (
        <EmptyState
          title="No agent matches these filters"
          description="Change or clear the filters to see the rest of the inventory."
        />
      )}

      {data && data.items.length > 0 && (
        <>
          <p className="text-[0.68rem] uppercase tracking-[0.14em] text-slate-600">
            {data.shown} of {data.total} agents
          </p>
          <ul className="space-y-2">
            {data.items.map((agent) => {
              const open = openId === agent.id;
              return (
                <li key={agent.id} className="rounded-2xl border border-white/[0.08] bg-[#0a0f19]">
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : agent.id)}
                    className="flex w-full items-start gap-3 px-4 py-3.5 text-left"
                  >
                    {brandBySubject.get(agent.id)?.icon && <BrandIcon icon={brandBySubject.get(agent.id).icon} />}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-heading text-sm font-semibold text-white">
                          {brandBySubject.get(agent.id)?.name || agent.name}
                        </span>
                        <span className={`text-[0.62rem] uppercase tracking-[0.14em] ${STATUS_TONE[agent.status] || 'text-slate-400'}`}>
                          {agent.status}
                        </span>
                        <DataClassBadge value={agent.organization.dataClass} />
                        {!agent.hasWorkflow && (
                          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[0.58rem] uppercase tracking-[0.12em] text-amber-300">
                            No workflow
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-[0.7rem] text-slate-500">
                        {agent.specialization || 'No specialization'} · {agent.organization.name}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.66rem] text-slate-400">
                        <span>{agent.runs.total} runs</span>
                        <span className={agent.runs.failed > 0 ? 'text-rose-300' : ''}>
                          {agent.runs.successRate === null ? 'no outcome yet' : `${fmtPercent(agent.runs.successRate)} success`}
                        </span>
                        <span>{fmtDuration(agent.runs.avgDurationMs)} avg</span>
                        <span>{fmtNumber(agent.usage.units)} model calls</span>
                        <span>last run {fmtDate(agent.lastRunAt)}</span>
                      </div>
                    </div>
                    <ChevronDown
                      className={`mt-1 h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {open && (
                    <div className="border-t border-white/[0.06] px-4 py-3.5">
                      <dl className="grid gap-3 text-[0.7rem] sm:grid-cols-2 lg:grid-cols-3">
                        <div>
                          <dt className="text-slate-500">Category</dt>
                          <dd className="text-slate-300">{agent.category}</dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Workflow</dt>
                          <dd className="text-slate-300">
                            {agent.hasWorkflow
                              ? `${agent.workflowSteps} steps · v${agent.workflowVersion || '—'}${agent.workflowEnabled ? '' : ' · disabled'}`
                              : 'No executable workflow'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Last outcome</dt>
                          <dd className="text-slate-300">{fmtLabel(agent.lastRunStatus || 'none')}</dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Runs succeeded / failed</dt>
                          <dd className="text-slate-300">
                            {agent.runs.succeeded} / {agent.runs.failed}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Agent reference</dt>
                          <dd className="break-all font-mono text-[0.62rem] text-slate-500">{agent.id}</dd>
                        </div>
                      </dl>
                      <div className="mt-3">{editButton(agent.id)}</div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {editing && (
        <AgentBrandingEditor
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            branding.reload();
            reload();
          }}
        />
      )}
    </div>
  );
}