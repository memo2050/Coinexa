import { useMemo, useState } from 'react';
import SectionHeading from '@/components/site/SectionHeading';
import Reveal from '@/components/site/Reveal';
import PortfolioCard from '@/components/site/PortfolioCard';
import { filters, projects } from '@/data/site';

export default function Portfolio() {
  const [active, setActive] = useState('All');

  const visible = useMemo(
    () => (active === 'All' ? projects : projects.filter((p) => p.category === active)),
    [active]
  );

  return (
    <section id="portfolio" className="relative scroll-mt-24 border-t border-white/[0.05] py-20 sm:py-28">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <Reveal>
            <SectionHeading
              eyebrow="Selected work"
              title="Portfolio of"
              highlight="real outcomes"
              description="A snapshot of recent engagements. Client names are abbreviated under NDA; every number below was measured in production."
            />
          </Reveal>

          <Reveal delay={0.1}>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter projects">
              {filters.map((filter) => {
                const isActive = active === filter;
                return (
                  <button
                    key={filter}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActive(filter)}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition-all duration-300 ${
                      isActive
                        ? 'border-transparent bg-gradient-to-r from-blue-600 to-cyan-400 text-white shadow-[0_10px_28px_-16px_rgba(34,211,238,0.95)]'
                        : 'border-white/10 text-slate-400 hover:border-white/25 hover:text-white'
                    }`}
                  >
                    {filter}
                  </button>
                );
              })}
            </div>
          </Reveal>
        </div>

        <div className="mt-11 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((project, i) => (
            <Reveal key={project.title} delay={(i % 3) * 0.07}>
              <PortfolioCard project={project} />
            </Reveal>
          ))}
        </div>

      </div>
    </section>
  );
}