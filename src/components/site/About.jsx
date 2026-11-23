import { Check } from 'lucide-react';
import SectionHeading from '@/components/site/SectionHeading';
import Reveal from '@/components/site/Reveal';
import { aboutBullets, aboutStats } from '@/data/site';

export default function About() {
  return (
    <section id="about" className="relative scroll-mt-24 border-t border-white/[0.05] py-20 sm:py-28">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        <Reveal>
          <SectionHeading
            eyebrow="About Coinexa.net"
            title="Engineers who care about"
            highlight="business impact"
            description="We are machine learning researchers, software architects and security specialists. We stay deliberately small so senior people do the work and communication never has to travel through layers."
          />
          <ul className="mt-8 space-y-3.5">
            {aboutBullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-3 text-sm text-slate-300">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sky-500/15 text-sky-300">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                {bullet}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={0.12}>
          <div className="grid grid-cols-2 gap-4">
            {aboutStats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-white/[0.08] bg-[#0a0f19] p-6 text-center transition-colors duration-400 hover:border-sky-400/30"
              >
                <div className="font-heading text-3xl font-semibold tracking-[-0.02em] text-white">
                  {stat.value}
                </div>
                <div className="mt-1.5 text-[0.72rem] uppercase tracking-[0.14em] text-slate-500">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}