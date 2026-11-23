import { Quote } from 'lucide-react';
import SectionHeading from '@/components/site/SectionHeading';
import Reveal from '@/components/site/Reveal';
import { testimonials } from '@/data/site';

export default function Testimonials() {
  return (
    <section className="relative border-t border-white/[0.05] py-20 sm:py-28">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="Client voices"
            title="What partners say"
            highlight="about us"
            align="center"
          />
        </Reveal>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {testimonials.map((item, i) => (
            <Reveal key={item.name} delay={i * 0.08}>
              <figure className="flex h-full flex-col rounded-2xl border border-white/[0.08] bg-[#0a0f19] p-6">
                <Quote className="h-5 w-5 text-sky-400/60" />
                <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-slate-300">
                  “{item.quote}”
                </blockquote>
                <figcaption className="mt-6 flex items-center gap-3 border-t border-white/[0.07] pt-5">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 text-xs font-semibold text-white">
                    {item.initials}
                  </span>
                  <span className="leading-tight">
                    <span className="block text-sm font-semibold text-white">{item.name}</span>
                    <span className="block text-xs text-slate-500">{item.role}</span>
                  </span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}