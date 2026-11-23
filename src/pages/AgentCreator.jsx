import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import Nav from '@/components/site/Nav';
import Footer from '@/components/site/Footer';
import ChoiceGrid from '@/components/agents/ChoiceGrid';
import WizardProgress from '@/components/agents/WizardProgress';
import AgentBlueprint from '@/components/agents/AgentBlueprint';
import AgentChat from '@/components/agents/AgentChat';
import AgentDemoVideo from '@/components/agents/AgentDemoVideo';
import WorkflowPreview from '@/components/workflow/WorkflowPreview';
import WorkflowProjection from '@/components/workflow/WorkflowProjection';
import { agentCatalog, industriesAll } from '@/data/agentCatalog';
import {
  permissionOptions,
  responsibilityOptions,
  toneOptions,
  toolOptions,
} from '@/data/agentWizard';

const initialForm = {
  industry: '',
  industry_key: '',
  industry_custom: '',
  agent_title: '',
  business_name: '',
  business_description: '',
  tasks: '',
  responsibilities: [],
  permissions: [],
  tone: '',
  tools: [],
};

const fieldClass =
  'w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400/20';

const stepMeta = [
  { question: 'What industry are you in?', help: 'The agent writes its instructions in the language of your sector, including the rules it has to follow.' },
  { question: 'Tell me about your business.', help: 'Plain language is perfect. The more specific you are, the sharper the agent.' },
  { question: 'What should the agent take off your plate?', help: 'List the repetitive work in your own words. One task per line works well.' },
  { question: 'Which responsibilities should it own?', help: 'Pick everything it should handle without you. You can change this later.' },
  { question: 'What is it allowed to do?', help: 'This becomes a hard boundary. The agent can never act beyond what you allow here.' },
  { question: 'How should it sound?', help: 'This shapes every reply, email and message it drafts for you.' },
  { question: 'Which tools should it connect to?', help: 'Optional. Choose the systems it will work inside.' },
  { question: 'Ready to build it.', help: 'Review your answers, then let the generator write the full agent for you.' },
];

export default function AgentCreator() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [created, setCreated] = useState(null);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const selectIndustry = (key) => {
    const industry = industriesAll.find((item) => item.key === key);
    setForm((prev) => ({
      ...prev,
      industry_key: key,
      industry: key === 'custom' ? '' : industry?.label || '',
      agent_title: '',
    }));
  };

  const validate = () => {
    if (step === 0 && !form.industry_key) return 'Pick the business category you work in.';
    if (step === 0 && form.industry_key === 'custom' && form.industry_custom.trim().length < 3) {
      return 'Type the industry or profession you work in.';
    }
    if (step === 0 && form.industry_key !== 'custom' && !form.agent_title) {
      return 'Choose the agent you want to build.';
    }
    if (step === 1 && !form.business_name.trim()) return 'Give your business a name so the agent knows who it works for.';
    if (step === 1 && form.business_description.trim().length < 20) return 'Describe your business in a sentence or two.';
    if (step === 2 && form.tasks.trim().length < 15) return 'Tell the agent what you want it to take off your plate.';
    if (step === 3 && !form.responsibilities.length) return 'Select at least one responsibility.';
    if (step === 4 && !form.permissions.length) return 'Select at least one permission.';
    if (step === 5 && !form.tone) return 'Choose how the agent should sound.';
    return '';
  };

  const next = () => {
    const message = validate();
    if (message) {
      setError(message);
      return;
    }
    setError('');
    setStep((prev) => Math.min(prev + 1, stepMeta.length - 1));
  };

  const back = () => {
    setError('');
    setStep((prev) => Math.max(prev - 1, 0));
  };

  const generate = async () => {
    setGenerating(true);
    setError('');
    try {
      const industry = form.industry_key === 'custom' ? form.industry_custom.trim() : form.industry;

      const response = await base44.functions.invoke('generateAgent', {
        industry,
        agent_title: form.agent_title,
        business_name: form.business_name,
        business_description: form.business_description,
        tasks: form.tasks,
        responsibilities: form.responsibilities,
        permissions: form.permissions,
        tone: form.tone,
        tools: form.tools,
      });

      const spec = response.data?.agent;
      if (!spec?.name) throw new Error('The generator returned an empty agent. Please try again.');

      const workspace = await base44.functions.invoke('manageOrganization', { action: 'bootstrap' });

      const record = await base44.entities.Agent.create({
        ...form,
        industry,
        organization_id: workspace.data?.organization?.id || '',
        name: spec.name,
        specialization: spec.specialization || form.agent_title || spec.role,
        role: spec.role,
        summary: spec.summary,
        system_instructions: spec.system_instructions,
        goals: spec.goals,
        workflow: spec.workflow,
        knowledge_requirements: spec.knowledge_requirements,
        safety_rules: spec.safety_rules,
        workflow_graph: spec.workflow_graph,
        workflow_version: spec.workflow_version || 1,
        workflow_enabled: true,
        status: 'draft',
      });

      setCreated(record);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'The agent could not be generated. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const discard = async () => {
    if (created) await base44.entities.Agent.delete(created.id);
    setCreated(null);
    setForm(initialForm);
    setStep(0);
  };

  const regenerate = async () => {
    if (created) await base44.entities.Agent.delete(created.id);
    setCreated(null);
    setStep(stepMeta.length - 1);
  };

  const reviewRows = [
    { label: 'Category', value: form.industry_key === 'custom' ? form.industry_custom : form.industry, index: 0 },
    { label: 'Agent', value: form.agent_title || 'Chosen by the generator', index: 0 },
    { label: 'Business', value: form.business_name, index: 1 },
    { label: 'Description', value: form.business_description, index: 1 },
    { label: 'Tasks', value: form.tasks, index: 2 },
    { label: 'Responsibilities', value: form.responsibilities.join(' · '), index: 3 },
    { label: 'Permissions', value: form.permissions.join(' · '), index: 4 },
    { label: 'Voice', value: form.tone, index: 5 },
    { label: 'Tools', value: form.tools.length ? form.tools.join(' · ') : 'None selected', index: 6 },
  ];

  const renderStep = () => {
    if (step === 0) {
      const catalogIndustry = agentCatalog.find((item) => item.key === form.industry_key);
      const agentOptions = (catalogIndustry?.agents || []).map((item) => ({
        value: item.title,
        label: item.title,
        hint: item.blurb,
        icon: catalogIndustry.icon,
      }));

      return (
        <div className="space-y-8">
          <div>
            <p className="mb-3 text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">Business category</p>
            <ChoiceGrid
              options={industriesAll}
              value={form.industry_key}
              onChange={selectIndustry}
              columns="sm:grid-cols-2 lg:grid-cols-3"
            />
          </div>

          {form.industry_key === 'custom' ? (
            <div className="space-y-4">
              <div>
                <label htmlFor="custom-industry" className="mb-2 block text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">
                  Your industry or profession
                </label>
                <input
                  id="custom-industry"
                  className={fieldClass}
                  value={form.industry_custom}
                  onChange={(event) => set('industry_custom', event.target.value)}
                  placeholder="e.g. Marine surveying"
                  maxLength={80}
                />
              </div>
              <div>
                <label htmlFor="custom-agent" className="mb-2 block text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">
                  What should this agent be? (optional)
                </label>
                <input
                  id="custom-agent"
                  className={fieldClass}
                  value={form.agent_title}
                  onChange={(event) => set('agent_title', event.target.value)}
                  placeholder="e.g. Survey report writer"
                  maxLength={120}
                />
              </div>
            </div>
          ) : form.industry_key ? (
            <div>
              <p className="mb-3 text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">Choose the agent</p>
              <ChoiceGrid
                options={agentOptions}
                value={form.agent_title}
                onChange={(value) => set('agent_title', value)}
                columns="sm:grid-cols-2"
              />
            </div>
          ) : null}
        </div>
      );
    }

    if (step === 1) {
      return (
        <div className="space-y-4">
          <div>
            <label htmlFor="business-name" className="mb-2 block text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">
              Business name
            </label>
            <input
              id="business-name"
              className={fieldClass}
              value={form.business_name}
              onChange={(event) => set('business_name', event.target.value)}
              placeholder="e.g. Riverside Dental"
              maxLength={120}
            />
          </div>
          <div>
            <label htmlFor="business-description" className="mb-2 block text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">
              What does your business do?
            </label>
            <textarea
              id="business-description"
              rows={5}
              className={fieldClass}
              value={form.business_description}
              onChange={(event) => set('business_description', event.target.value)}
              placeholder="We are a two-chair dental clinic in Portland. We take bookings, answer insurance questions and follow up after appointments."
              maxLength={3000}
            />
          </div>
        </div>
      );
    }

    if (step === 2) {
      return (
        <div>
          <label htmlFor="agent-tasks" className="mb-2 block text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">
            What should it take off your plate?
          </label>
          <textarea
            id="agent-tasks"
            rows={6}
            className={fieldClass}
            value={form.tasks}
            onChange={(event) => set('tasks', event.target.value)}
            placeholder={'Answer questions about opening hours and insurance.\nBook new patients and send reminders.\nEscalate anything clinical to a human.'}
            maxLength={3000}
          />
        </div>
      );
    }

    if (step === 3) {
      return (
        <ChoiceGrid
          multiple
          options={responsibilityOptions}
          value={form.responsibilities}
          onChange={(value) => set('responsibilities', value)}
          columns="sm:grid-cols-2 lg:grid-cols-3"
        />
      );
    }

    if (step === 4) {
      return (
        <ChoiceGrid
          multiple
          options={permissionOptions}
          value={form.permissions}
          onChange={(value) => set('permissions', value)}
          columns="sm:grid-cols-2"
        />
      );
    }

    if (step === 5) {
      return (
        <ChoiceGrid
          options={toneOptions}
          value={form.tone}
          onChange={(value) => set('tone', value)}
          columns="sm:grid-cols-2 lg:grid-cols-3"
        />
      );
    }

    if (step === 6) {
      return (
        <ChoiceGrid
          multiple
          options={toolOptions}
          value={form.tools}
          onChange={(value) => set('tools', value)}
          columns="sm:grid-cols-2 lg:grid-cols-4"
        />
      );
    }

    return (
      <div className="divide-y divide-white/[0.06] rounded-2xl border border-white/10 bg-white/[0.02]">
        {reviewRows.map((row) => (
          <div key={row.label} className="flex items-start gap-4 px-4 py-3.5">
            <span className="w-28 shrink-0 text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">
              {row.label}
            </span>
            <span className="min-w-0 flex-1 whitespace-pre-line text-sm leading-relaxed text-slate-300">
              {row.value || '—'}
            </span>
            <button
              type="button"
              onClick={() => setStep(row.index)}
              className="shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[0.68rem] text-slate-400 transition-colors hover:border-sky-400/40 hover:text-white"
            >
              Edit
            </button>
          </div>
        ))}
      </div>
    );
  };

  if (created) {
    return (
      <div className="min-h-screen bg-[#05070a] text-white">
        <Nav />
        <main className="mx-auto w-full max-w-6xl px-5 pt-28 pb-20 sm:px-8 sm:pb-28">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-sky-300/90">
              <span className="h-1 w-1 rounded-full bg-sky-400" />
              Generated
            </div>
            <h1 className="mt-4 font-heading text-3xl font-semibold leading-[1.12] tracking-[-0.02em] sm:text-4xl">
              {created.name} is <span className="text-gradient">ready to test</span>
            </h1>
            <p className="mt-3 text-base leading-relaxed text-slate-400">
              Talk to it on the right. Nothing reaches customers until you activate it.
            </p>
          </div>

          <div className="mt-8 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <AgentBlueprint agent={created} />
              <WorkflowPreview graph={created.workflow_graph} />
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigate(`/agents/${created.id}`)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400 px-5 py-2.5 text-sm font-semibold text-white transition-transform duration-300 hover:-translate-y-0.5"
                >
                  <Sparkles className="h-4 w-4" />
                  Keep this agent
                </button>
                <button
                  type="button"
                  onClick={regenerate}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-slate-300 transition-colors hover:border-white/20 hover:text-white"
                >
                  Regenerate
                </button>
                <button
                  type="button"
                  onClick={discard}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-4 py-2.5 text-sm text-slate-400 transition-colors hover:border-rose-400/40 hover:text-rose-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Discard
                </button>
              </div>
            </div>

            <div className="lg:sticky lg:top-24 lg:h-[34rem]">
              <AgentChat agentId={created.id} agentName={created.name} />
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const meta = stepMeta[step];

  return (
    <div className="min-h-screen bg-[#05070a] text-white">
      <Nav />

      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[26rem] overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[24rem] w-[48rem] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(37,99,235,0.16),transparent_68%)]" />
      </div>

      <main className="relative mx-auto w-full max-w-4xl px-5 pt-28 pb-20 sm:px-8 sm:pb-28">
        <div className="flex items-center justify-between gap-4">
          <Link
            to="/agents"
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            All agents
          </Link>
          <span className="text-[0.68rem] uppercase tracking-[0.18em] text-slate-600">Agent generator</span>
        </div>

        <div className="mt-6 rounded-2xl border border-white/[0.08] bg-[#0a0f19] p-6 sm:p-8">
          <WizardProgress current={step} />

          <div className="mt-8">
            <h1 className="font-heading text-2xl font-semibold leading-[1.2] tracking-[-0.02em] text-white sm:text-3xl">
              {meta.question}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">{meta.help}</p>
          </div>

          <div className="mt-6">{renderStep()}</div>

          {step >= 1 && <WorkflowProjection answers={form} />}

          {step === stepMeta.length - 1 && <AgentDemoVideo />}

          {error && (
            <p className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">
              {error}
            </p>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-6">
            <button
              type="button"
              onClick={back}
              disabled={step === 0 || generating}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-slate-300 transition-colors hover:border-white/20 hover:text-white disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>

            {step === stepMeta.length - 1 ? (
              <button
                type="button"
                onClick={generate}
                disabled={generating}
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_-14px_rgba(34,211,238,0.9)] transition-transform duration-300 hover:-translate-y-0.5 disabled:opacity-60"
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {generating ? 'Building your agent…' : 'Generate my agent'}
              </button>
            ) : (
              <button
                type="button"
                onClick={next}
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_-14px_rgba(34,211,238,0.9)] transition-transform duration-300 hover:-translate-y-0.5"
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}