import { Target, ListChecks, Route, BookOpen, Wrench, ShieldCheck, Terminal } from 'lucide-react';

function Section({ icon: Icon, title, children }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-sky-300/90">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Bullets({ items, empty = 'Not specified yet.' }) {
  if (!items?.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="flex gap-2.5 text-sm leading-relaxed text-slate-300">
          <span className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-sky-400" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Chips({ items, empty }) {
  if (!items?.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-300"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

export default function AgentBlueprint({ agent }) {
  if (!agent) return null;

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-sky-500/[0.08] via-white/[0.02] to-transparent p-5">
        <div className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-sky-300/90">Role & identity</div>
        <h3 className="mt-2 font-heading text-xl font-semibold text-white">{agent.role || agent.name}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">{agent.summary}</p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">{agent.industry}</span>
          {agent.tone && (
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">{agent.tone}</span>
          )}
        </div>
      </section>

      <Section icon={Target} title="Goals">
        <Bullets items={agent.goals} />
      </Section>

      <Section icon={ListChecks} title="Responsibilities">
        <Bullets items={agent.responsibilities} />
      </Section>

      <Section icon={Route} title="Workflow">
        {agent.workflow?.length ? (
          <ol className="space-y-3">
            {agent.workflow.map((step, index) => (
              <li key={`${step}-${index}`} className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-sky-400/30 bg-sky-400/10 text-[0.7rem] font-semibold text-sky-300">
                  {index + 1}
                </span>
                <span className="pt-0.5 text-sm leading-relaxed text-slate-300">{step}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-slate-500">Not specified yet.</p>
        )}
      </Section>

      <Section icon={BookOpen} title="Knowledge it needs">
        <Bullets items={agent.knowledge_requirements} />
      </Section>

      <Section icon={Wrench} title="Tools requested">
        <Chips items={agent.tools} empty="No tools requested yet." />
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Planned tooling for this agent. Nothing is connected to it yet.
        </p>
      </Section>

      <Section icon={ShieldCheck} title="Permissions">
        <Chips items={agent.permissions} empty="No permissions granted." />
      </Section>

      <Section icon={ShieldCheck} title="Safety rules">
        <Bullets items={agent.safety_rules} />
      </Section>

      <Section icon={Terminal} title="System instructions">
        <p className="whitespace-pre-wrap rounded-xl border border-white/[0.06] bg-[#05070a]/80 p-4 font-mono text-xs leading-relaxed text-slate-400">
          {agent.system_instructions || 'Not generated yet.'}
        </p>
      </Section>
    </div>
  );
}