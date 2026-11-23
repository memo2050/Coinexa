import Icon from '@/components/site/Icon';

export default function PortfolioCard({ project }) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0f19] transition-all duration-400 hover:-translate-y-1 hover:border-white/20">
      <div className={`relative h-40 overflow-hidden bg-gradient-to-br ${project.gradient}`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_55%)]" />
        <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(to_right,rgba(255,255,255,0.25)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.25)_1px,transparent_1px)] [background-size:32px_32px]" />
        <div className="relative grid h-full place-items-center">
          <span className="grid h-16 w-16 place-items-center rounded-2xl border border-white/30 bg-white/15 text-white shadow-[0_18px_40px_-18px_rgba(0,0,0,0.7)] backdrop-blur-sm transition-transform duration-500 group-hover:scale-110">
            <Icon name={project.icon} className="h-7 w-7" />
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-6">
        <span className="text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-sky-300">
          {project.tag}
        </span>
        <h3 className="mt-2.5 font-heading text-[1.15rem] font-semibold text-white">{project.title}</h3>
        <p className="mt-2.5 flex-1 text-sm leading-relaxed text-slate-400">{project.text}</p>
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/[0.07] pt-4">
          {project.metrics.map((metric) => (
            <div key={metric.label}>
              <div className="font-heading text-lg font-semibold text-white">{metric.value}</div>
              <div className="mt-0.5 text-[0.68rem] text-slate-500">{metric.label}</div>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}