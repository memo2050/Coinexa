import { Check } from 'lucide-react';
import AgentIcon from '@/components/agents/AgentIcon';

export default function ChoiceGrid({ options, value, onChange, multiple = false, columns = 'sm:grid-cols-2' }) {
  const items = options.map((option) =>
    typeof option === 'string' ? { value: option, label: option } : option
  );

  const isSelected = (optionValue) =>
    multiple ? Array.isArray(value) && value.includes(optionValue) : value === optionValue;

  const toggle = (optionValue) => {
    if (!multiple) {
      onChange(optionValue);
      return;
    }
    const current = Array.isArray(value) ? value : [];
    onChange(
      current.includes(optionValue)
        ? current.filter((item) => item !== optionValue)
        : [...current, optionValue]
    );
  };

  return (
    <div className={`grid gap-3 ${columns}`}>
      {items.map((item) => {
        const selected = isSelected(item.value);
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => toggle(item.value)}
            aria-pressed={selected}
            className={`group relative flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition-all duration-300 ${
              selected
                ? 'border-sky-400/60 bg-sky-400/[0.08] shadow-[0_10px_30px_-18px_rgba(34,211,238,0.9)]'
                : 'border-white/10 bg-white/[0.02] hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.04]'
            }`}
          >
            {item.icon && (
              <span
                className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${
                  selected
                    ? 'border-sky-400/40 bg-sky-400/10 text-sky-300'
                    : 'border-white/10 bg-white/[0.03] text-slate-400'
                }`}
              >
                <AgentIcon name={item.icon} className="h-4 w-4" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-white">{item.label}</span>
              {item.hint && <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{item.hint}</span>}
            </span>
            <span
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors ${
                selected ? 'border-sky-400 bg-sky-400 text-[#05070a]' : 'border-white/15 text-transparent'
              }`}
            >
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
          </button>
        );
      })}
    </div>
  );
}