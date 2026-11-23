import { wizardSteps } from '@/data/agentWizard';

export default function WizardProgress({ current }) {
  const total = wizardSteps.length;
  const percent = Math.round(((Math.min(current, total - 1) + 1) / total) * 100);

  return (
    <div>
      <div className="flex items-center justify-between text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-slate-500">
        <span>
          Step {Math.min(current + 1, total)} of {total}
        </span>
        <span className="text-sky-300/90">{wizardSteps[Math.min(current, total - 1)]?.label}</span>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400 transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-4 hidden flex-wrap gap-2 sm:flex">
        {wizardSteps.map((step, index) => (
          <span
            key={step.key}
            className={`rounded-full border px-3 py-1 text-[0.68rem] font-medium transition-colors ${
              index === current
                ? 'border-sky-400/50 bg-sky-400/10 text-sky-200'
                : index < current
                  ? 'border-white/10 bg-white/[0.03] text-slate-400'
                  : 'border-white/[0.06] text-slate-600'
            }`}
          >
            {step.label}
          </span>
        ))}
      </div>
    </div>
  );
}