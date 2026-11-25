import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ErrorNote, Field, Panel, inputCls, money, primaryBtn } from '@/components/recruitment/ui';

const list = (value) => (Array.isArray(value) ? value.join(', ') : value || '');

export const EMPTY_CAMPAIGN = {
  title: '', specialization: '', country: '', city: '', positions_required: 1,
  skills: '', certifications: '', languages: '', experience_min: '', experience_max: '',
  work_mode: 'onsite', schedule: '', availability: '', duration: '', description: '',
  currency: 'USD', pay_frequency: 'daily', initial_offer: '', max_budget: '',
  negotiation_strategy: 'balanced', max_rounds: 3, outreach_mode: 'approval', auto_contact_min_score: 70, retention_days: 180, hiring_manager_name: '', hiring_manager_email: '',
};

export default function CampaignForm({ initial = EMPTY_CAMPAIGN, submitLabel, onSubmit }) {
  const [form, setForm] = useState({
    ...EMPTY_CAMPAIGN, ...initial,
    skills: list(initial.skills), certifications: list(initial.certifications), languages: list(initial.languages),
    experience_min: initial.experience_min ?? '', experience_max: initial.experience_max ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const initialOffer = Number(form.initial_offer);
  const max = Number(form.max_budget);
  const budgetProblem = form.initial_offer && form.max_budget && initialOffer > max ? 'The opening offer cannot be above the maximum budget.' : '';

  const submit = async (e) => {
    e.preventDefault();
    if (budgetProblem) return setError(budgetProblem);
    setSaving(true);
    setError('');
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err?.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <Panel title="The role" description="What the company needs.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Job title"><input required className={inputCls} value={form.title} onChange={set('title')} placeholder="IT Help Desk Technician" /></Field>
          <Field label="Specialization"><input className={inputCls} value={form.specialization} onChange={set('specialization')} placeholder="IT support" /></Field>
          <Field label="Number of professionals"><input required type="number" min="1" max="500" className={inputCls} value={form.positions_required} onChange={set('positions_required')} /></Field>
          <Field label="Work mode">
            <select className={inputCls} value={form.work_mode} onChange={set('work_mode')}>
              <option value="onsite">On-site</option><option value="hybrid">Hybrid</option><option value="remote">Remote</option>
            </select>
          </Field>
          <Field label="Country"><input required className={inputCls} value={form.country} onChange={set('country')} placeholder="Egypt" /></Field>
          <Field label="City"><input className={inputCls} value={form.city} onChange={set('city')} placeholder="Cairo" /></Field>
          <Field label="Job description" className="sm:col-span-2">
            <textarea rows={5} className={inputCls} value={form.description} onChange={set('description')} placeholder="Responsibilities, environment, what success looks like…" />
          </Field>
        </div>
      </Panel>

      <Panel title="Requirements" description="Separate items with commas. The agent scores candidates against exactly these.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Technical skills" className="sm:col-span-2"><input className={inputCls} value={form.skills} onChange={set('skills')} placeholder="Windows troubleshooting, Microsoft Office, Basic networking" /></Field>
          <Field label="Certifications / qualifications"><input className={inputCls} value={form.certifications} onChange={set('certifications')} placeholder="CompTIA A+" /></Field>
          <Field label="Languages"><input className={inputCls} value={form.languages} onChange={set('languages')} placeholder="Arabic, English" /></Field>
          <Field label="Minimum experience (years)"><input type="number" min="0" step="0.5" className={inputCls} value={form.experience_min} onChange={set('experience_min')} /></Field>
          <Field label="Maximum experience (years)"><input type="number" min="0" step="0.5" className={inputCls} value={form.experience_max} onChange={set('experience_max')} /></Field>
          <Field label="Project duration"><input className={inputCls} value={form.duration} onChange={set('duration')} placeholder="5 days" /></Field>
          <Field label="Working schedule"><input className={inputCls} value={form.schedule} onChange={set('schedule')} placeholder="Sun–Thu, 09:00–17:00" /></Field>
          <Field label="Required availability" className="sm:col-span-2"><input className={inputCls} value={form.availability} onChange={set('availability')} placeholder="Start next Monday" /></Field>
        </div>
      </Panel>

      <Panel title="Compensation & negotiation" description="The agent opens at your initial offer and never agrees above the maximum. Requests above it come back to you for a decision.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Currency" hint="Three-letter code"><input required maxLength={3} className={`${inputCls} uppercase`} value={form.currency} onChange={set('currency')} /></Field>
          <Field label="Paid">
            <select className={inputCls} value={form.pay_frequency} onChange={set('pay_frequency')}>
              <option value="hourly">Hourly</option><option value="daily">Daily</option><option value="monthly">Monthly</option>
            </select>
          </Field>
          <Field label="Strategy" hint="How quickly the agent moves toward the request">
            <select className={inputCls} value={form.negotiation_strategy} onChange={set('negotiation_strategy')}>
              <option value="conservative">Conservative</option><option value="balanced">Balanced</option><option value="flexible">Flexible</option>
            </select>
          </Field>
          <Field label="Initial offer"><input required type="number" min="0.01" step="0.01" className={inputCls} value={form.initial_offer} onChange={set('initial_offer')} /></Field>
          <Field label="Maximum approved budget"><input required type="number" min="0.01" step="0.01" className={inputCls} value={form.max_budget} onChange={set('max_budget')} /></Field>
          <Field label="Counteroffers before handing back"><input type="number" min="1" max="6" className={inputCls} value={form.max_rounds} onChange={set('max_rounds')} /></Field>
        </div>
        {form.initial_offer && form.max_budget && !budgetProblem && (
          <p className="mt-3 text-xs text-slate-400">
            Opens at {money(initialOffer, form.currency || 'USD', form.pay_frequency)}; never agrees above {money(max, form.currency || 'USD', form.pay_frequency)} without your approval.
          </p>
        )}
        {budgetProblem && <p className="mt-3 text-xs text-rose-300">{budgetProblem}</p>}
      </Panel>

      <Panel title="Outreach & privacy">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Outreach approval" hint="With approval, nothing is sent until you press Send.">
            <select className={inputCls} value={form.outreach_mode} onChange={set('outreach_mode')}>
              <option value="approval">I approve every message</option>
              <option value="auto">Agent may contact top matches</option>
            </select>
          </Field>
          <Field label="Minimum score for automatic contact"><input type="number" min="0" max="100" className={inputCls} value={form.auto_contact_min_score} onChange={set('auto_contact_min_score')} disabled={form.outreach_mode !== 'auto'} /></Field>
          <Field label="Keep candidate data after closing (days)"><input type="number" min="7" max="1095" className={inputCls} value={form.retention_days} onChange={set('retention_days')} /></Field>
          <Field label="Hiring manager name" hint="Receives candidate evaluation reports"><input className={inputCls} value={form.hiring_manager_name || ''} onChange={set('hiring_manager_name')} placeholder="Sara Ahmed" /></Field>
          <Field label="Hiring manager email"><input type="email" className={inputCls} value={form.hiring_manager_email || ''} onChange={set('hiring_manager_email')} placeholder="hiring@company.com" /></Field>
        </div>
      </Panel>

      <ErrorNote>{error}</ErrorNote>
      <button type="submit" className={primaryBtn} disabled={saving || Boolean(budgetProblem)}>
        {saving && <Loader2 className="h-4 w-4 animate-spin" />} {submitLabel}
      </button>
    </form>
  );
}
