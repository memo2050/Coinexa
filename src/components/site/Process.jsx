import SectionHeading from '@/components/site/SectionHeading';
import Reveal from '@/components/site/Reveal';
import { steps } from '@/data/site';

export default function Process() {
  return (
    <section id="process" className="relative scroll-mt-24 border-t border-white/[0.05] py-20 sm:py-28">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/2 h-[24rem] w-[46rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(56,189,248,0.09),transparent_70%)]" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-5 sm:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="How we work"
            title="A clear path from"
            highlight="idea to production"
            description="No black boxes. Every stage ends with something you can review, test and show to your own stakeholders."
          />
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <Reveal key={step.number} delay={i * 0.08}>
              <div className="group relative h-full overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0f19] p-6 transition-colors duration-400 hover:border-sky-400/30">
                <span className="font-heading text-3xl font-semibold tracking-[-0.02em] text-blue-500/40 transition-colors duration-400 group-hover:text-sky-400/70">
                  {step.number}
                </span>
                <h3 className="mt-4 font-heading text-lg font-semibold text-white">{step.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-slate-400">{step.text}</p>
                <span className="absolute inset-x-6 bottom-0 h-px bg-gradient-to-r from-transparent via-sky-400/40 to-transparent opacity-0 transition-opacity duration-400 group-hover:opacity-100" />
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}