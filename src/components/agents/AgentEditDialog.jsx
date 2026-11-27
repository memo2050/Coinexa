import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, RotateCcw, Sparkles, Upload, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { APPROVED_ICONS, BrandIcon, iconLabel, refreshAgentBranding } from '@/components/agents/brandIcons';

// Edit an agent from the AI Agents pages (platform admins only; the Edit button is shown
// to admins, and every request is re-checked on the server: admin role + two-step
// sign-in). Name, icon, description, category and status. The icon suggestion is only a
// proposal: nothing changes until Save. Uploads are validated again on the server.
const MAX_RASTER = 256 * 1024;
const MAX_SVG = 64 * 1024;
const TYPES = { 'image/png': 'PNG', 'image/webp': 'WebP', 'image/svg+xml': 'SVG' };

const call = async (payload) => {
  try {
    const res = await base44.functions.invoke('adminAgentBranding', payload);
    if (res.data?.error) throw new Error(res.data.error);
    return res.data;
  } catch (err) {
    throw new Error(err?.response?.data?.error || err?.message || 'The request failed.');
  }
};

const readDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.readAsDataURL(file);
  });

const imageSize = (src) =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });

// Same limits as the server, checked first so the admin gets an answer before saving.
async function checkFile(file) {
  const type = TYPES[file.type] ? file.type : /\.svg$/i.test(file.name) ? 'image/svg+xml' : file.type;
  if (!TYPES[type]) return { error: 'Choose a PNG, WebP or SVG file.' };
  if (type === 'image/svg+xml' && file.size > MAX_SVG) return { error: 'SVG icons must be 64 KB or smaller.' };
  if (type !== 'image/svg+xml' && file.size > MAX_RASTER) return { error: 'PNG and WebP icons must be 256 KB or smaller.' };
  const dataUrl = await readDataUrl(file);
  const size = await imageSize(dataUrl);
  if (!size) return { error: 'This file could not be shown as an image.' };
  if (type !== 'image/svg+xml') {
    const { width, height } = size;
    if (width < 32 || height < 32) return { error: `The image is ${width} × ${height} px; icons must be at least 32 × 32 px.` };
    if (width > 2048 || height > 2048) return { error: `The image is ${width} × ${height} px; at most 2048 px per side.` };
    if (width / height > 2 || height / width > 2) return { error: `The image is ${width} × ${height} px; icons must be close to square.` };
  }
  return { dataUrl, label: `${TYPES[type]} · ${Math.max(1, Math.round(file.size / 1024))} KB${type !== 'image/svg+xml' ? ` · ${size.width} × ${size.height} px` : ''}` };
}

export default function AgentEditDialog({ subject, onClose, onSaved }) {
  const [item, setItem] = useState(null);
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    call({ action: 'get', subject }).then(setItem).catch((err) => setLoadError(err.message));
  }, [subject]);
  if (!item) {
    return (
      <Frame onClose={onClose} title="Edit agent">
        <div className="px-5 py-8 text-sm">
          {loadError ? <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{loadError}</p>
            : <span className="inline-flex items-center gap-2 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</span>}
        </div>
      </Frame>
    );
  }
  return <Editor item={item} onClose={onClose} onSaved={onSaved} />;
}

function Frame({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0a0f19] text-left shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <p className="font-heading text-lg font-semibold text-white">{title}</p>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const field = 'mt-1.5 w-full rounded-xl border border-white/10 bg-[#05070a]/70 px-3 py-2 text-sm text-white focus:border-sky-400/60 focus:outline-none';

function Editor({ item, onClose, onSaved }) {
  const isAgent = item.kind === 'agent';
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description || '');
  const [category, setCategory] = useState(item.category || '');
  const [status, setStatus] = useState(item.status || 'draft');
  const [choice, setChoice] = useState({ kind: 'keep' });
  const [suggestion, setSuggestion] = useState(item.suggestion);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const shownIcon =
    choice.kind === 'library' ? { kind: 'library', key: choice.key }
      : choice.kind === 'upload' ? { kind: 'preview', src: choice.dataUrl }
        : choice.kind === 'none' ? (item.defaultIcon ? { kind: 'library', key: item.defaultIcon } : null)
          : item.icon || (item.defaultIcon ? { kind: 'library', key: item.defaultIcon } : null);

  const nameChanged = name.replace(/\s+/g, ' ').trim() !== item.name;
  const descriptionChanged = description.trim() !== (item.description || '').trim();
  const categoryChanged = isAgent && category.replace(/\s+/g, ' ').trim() !== (item.category || '');
  const statusChanged = isAgent && status !== item.status;
  const dirty = nameChanged || descriptionChanged || categoryChanged || statusChanged || choice.kind !== 'keep';
  const customised = Boolean(item.icon) || item.name !== item.defaultName || (!isAgent && item.description !== item.defaultDescription);

  const suggest = async () => {
    setBusy('suggest');
    setError('');
    try {
      const s = await call({ action: 'suggest', subject: item.subject });
      setSuggestion({ icon: s.icon, reason: s.reason, source: s.source });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const pickFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    const checked = await checkFile(file);
    if (checked.error) setError(checked.error);
    else setChoice({ kind: 'upload', dataUrl: checked.dataUrl, label: checked.label });
  };

  const save = async () => {
    setBusy('save');
    setError('');
    try {
      const icon = choice.kind === 'upload' ? { kind: 'upload', data: choice.dataUrl } : choice;
      const res = await call({
        action: 'save',
        subject: item.subject,
        name: nameChanged ? name : undefined,
        description: descriptionChanged ? description : undefined,
        category: categoryChanged ? category : undefined,
        status: statusChanged ? status : undefined,
        icon,
      });
      await refreshAgentBranding();
      onSaved(res.agent);
    } catch (err) {
      setError(err.message);
      setBusy('');
    }
  };

  const reset = async () => {
    setBusy('reset');
    setError('');
    try {
      const res = await call({ action: 'reset', subject: item.subject });
      await refreshAgentBranding();
      onSaved(res.agent);
    } catch (err) {
      setError(err.message);
      setBusy('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="branding-title">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0a0f19] text-left shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
          <div className="min-w-0">
            <p className="text-[0.62rem] uppercase tracking-[0.16em] text-sky-300">Edit agent · admin</p>
            <h2 id="branding-title" className="mt-1 truncate font-heading text-lg font-semibold text-white">{item.name}</h2>
            <p className="mt-0.5 truncate text-[0.7rem] text-slate-500">{isAgent ? 'Changes apply wherever this agent appears' : 'Featured agent · shown to every workspace'}</p>
          </div>
          <button type="button" onClick={onClose} disabled={Boolean(busy)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-4">
          <label className="block">
            <span className="text-xs font-semibold text-slate-300">Agent name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={field} />
            <span className="mt-1 block text-[0.66rem] text-slate-500">Default: {item.defaultName} · 2–80 characters</span>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-300">Description</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={600} rows={3} className={`${field} resize-y`} />
            <span className="mt-1 block text-[0.66rem] text-slate-500">{description.length}/600 characters</span>
          </label>

          {isAgent && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold text-slate-300">Category</span>
                <input value={category} onChange={(e) => setCategory(e.target.value)} maxLength={60} className={field} />
                <span className="mt-1 block text-[0.66rem] text-slate-500">Shown under the name on agent cards</span>
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-300">Status</span>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className={field}>
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                </select>
              </label>
            </div>
          )}

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-300">Icon</span>
              <div className="flex gap-2">
                <button type="button" onClick={suggest} disabled={Boolean(busy)} className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1.5 text-[0.7rem] font-semibold text-sky-200 hover:border-sky-400/60 disabled:opacity-60">
                  {busy === 'suggest' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Suggest icon
                </button>
                <button type="button" onClick={() => fileRef.current?.click()} disabled={Boolean(busy)} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[0.7rem] font-semibold text-slate-200 hover:border-white/25 disabled:opacity-60">
                  <Upload className="h-3.5 w-3.5" /> Upload icon
                </button>
                <input ref={fileRef} type="file" accept="image/png,image/webp,image/svg+xml,.svg" className="hidden" onChange={pickFile} />
              </div>
            </div>

            {suggestion && (
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-sky-400/20 bg-sky-500/[0.06] px-3 py-2.5">
                <BrandIcon icon={{ kind: 'library', key: suggestion.icon }} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white">Suggested: {iconLabel(suggestion.icon)}</p>
                  <p className="text-[0.66rem] text-slate-400">{suggestion.reason} <span className="text-slate-500">({suggestion.source === 'ai' ? 'AI suggestion' : 'rule-based suggestion'})</span></p>
                </div>
                <button type="button" onClick={() => setChoice({ kind: 'library', key: suggestion.icon })} className="shrink-0 rounded-full border border-sky-400/40 px-3 py-1 text-[0.68rem] font-semibold text-sky-200 hover:bg-sky-500/10">
                  {choice.kind === 'library' && choice.key === suggestion.icon ? 'Selected' : 'Use this'}
                </button>
              </div>
            )}

            <div className="mt-3 grid grid-cols-6 gap-2 sm:grid-cols-9" role="listbox" aria-label="Approved icons">
              {APPROVED_ICONS.map(({ key, label }) => {
                const selected = choice.kind === 'library' && choice.key === key;
                return (
                  <button key={key} type="button" role="option" aria-selected={selected} title={label} onClick={() => setChoice({ kind: 'library', key })}
                    className={`grid place-items-center rounded-xl border p-1.5 transition-colors ${selected ? 'border-sky-400 bg-sky-500/10' : 'border-white/[0.06] hover:border-white/20'}`}>
                    <BrandIcon icon={{ kind: 'library', key }} />
                  </button>
                );
              })}
            </div>
            {choice.kind === 'upload' && <p className="mt-2 text-[0.66rem] text-slate-400">Uploaded file: {choice.label} (checked again on the server when you save)</p>}
            {(item.icon || choice.kind !== 'keep') && (
              <button type="button" onClick={() => setChoice({ kind: 'none' })} className="mt-2 text-[0.66rem] text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline">
                Use no custom icon
              </button>
            )}
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
            <p className="text-[0.62rem] uppercase tracking-[0.16em] text-slate-500">Preview</p>
            <div className="mt-3 flex items-center gap-3">
              {shownIcon ? <BrandIcon icon={shownIcon} /> : <span className="inline-grid h-8 w-8 place-items-center rounded-lg border border-dashed border-white/15 text-[0.55rem] text-slate-600">none</span>}
              <div className="min-w-0">
                <p className="truncate font-heading text-lg font-semibold text-white">{name.replace(/\s+/g, ' ').trim() || '—'}</p>
                <p className="truncate text-xs uppercase tracking-[0.14em] text-slate-500">{isAgent ? category.trim() || 'General' : 'Featured agent'}</p>
              </div>
            </div>
            {description.trim() && <p className="mt-2 line-clamp-2 text-sm text-slate-400">{description.trim()}</p>}
            <p className="mt-3 text-[0.62rem] text-slate-500">Icons are shown at 32 × 32 px on agent cards. {dirty ? 'Not saved yet.' : 'Current settings.'}</p>
          </div>

          {error && <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] px-5 py-3.5">
          {confirmReset ? (
            <div className="flex items-center gap-2 text-xs text-slate-300">
              Reset to “{item.defaultName}”{isAgent ? '' : ', the default description'} and the default icon?
              <button type="button" onClick={reset} disabled={Boolean(busy)} className="rounded-full bg-rose-500/80 px-3 py-1 font-semibold text-white hover:bg-rose-500">
                {busy === 'reset' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Reset'}
              </button>
              <button type="button" onClick={() => setConfirmReset(false)} className="text-slate-400 hover:text-white">Cancel</button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmReset(true)} disabled={!customised || Boolean(busy)} className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white disabled:opacity-40">
              <RotateCcw className="h-3.5 w-3.5" /> Reset name & icon
            </button>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={Boolean(busy)} className="rounded-full px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white">Cancel</button>
            <button type="button" onClick={save} disabled={!dirty || Boolean(busy)} className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
              {busy === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
