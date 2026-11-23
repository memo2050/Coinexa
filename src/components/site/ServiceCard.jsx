import Icon from '@/components/site/Icon';

export function FeaturedServiceCard({ service }) {
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0f19] p-6 transition-all duration-400 hover:-translate-y-1 hover:border-white/20 sm:p-7">
      <div
        className={`pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br ${service.tint} opacity-70 blur-2xl transition-opacity duration-500 group-hover:opacity-100`}
      />
      <div className="relative">
        <span className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.05]">
          <Icon name={service.icon} className={`h-5 w-5 ${service.accent}`} />
        </span>
        <h3 className="mt-6 font-heading text-lg font-semibold text-white">{service.title}</h3>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">{service.text}</p>
      </div>
    </article>
  );
}

export function ServiceCard({ service }) {
  return (
    <article className="group flex h-full flex-col rounded-2xl border border-white/[0.07] bg-[#0a0f19] p-6 transition-all duration-400 hover:-translate-y-1 hover:border-white/20 hover:bg-[#0b121f]">
      <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.04]">
        <Icon name={service.icon} className={`h-5 w-5 ${service.accent}`} />
      </span>
      <h3 className="mt-5 font-heading text-[1.05rem] font-semibold text-white">{service.title}</h3>
      <p className="mt-2.5 flex-1 text-sm leading-relaxed text-slate-400">{service.text}</p>
      <div className="mt-5 flex flex-wrap gap-1.5">
        {service.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-md border border-white/[0.07] bg-white/[0.04] px-2 py-1 text-[0.68rem] font-medium text-slate-400"
          >
            {tag}
          </span>
        ))}
      </div>
    </article>
  );
}