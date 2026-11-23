import { ArrowRight, Sparkles } from 'lucide-react';
import { Image } from '@/components/ui/image';
import Icon from '@/components/site/Icon';
import HeroVideo from '@/components/site/HeroVideo';
import { hero } from '@/data/site';

const HERO_ORB =
  'https://media.base44.com/images/public/6ae24c523e67d1221bba9b1a/90ce52eba_generated_image.png';

const HERO_VIDEO =
  'https://media.base44.com/videos/public/6ae24c523e67d1221bba9b1a/75080e433_video4.mp4';

const chipPositions = {
  left: 'left-[-4%] top-[16%] sm:left-[-8%]',
  right: 'right-[-2%] top-[42%] sm:right-[-8%]',
  bottom: 'bottom-[6%] left-1/2 -translate-x-1/2 sm:bottom-[2%]',
};

export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pb-20 pt-32 sm:pt-36 lg:pb-28 lg:pt-44">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="grid-veil absolute inset-0 opacity-40 [mask-image:radial-gradient(circle_at_55%_10%,black,transparent_72%)]" />
        <div className="absolute right-[-14%] top-[-22%] h-[46rem] w-[46rem] rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.4),transparent_62%)]" />
        <div className="absolute left-[-18%] top-[38%] h-[32rem] w-[32rem] rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.16),transparent_66%)]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#05070a] to-transparent" />
      </div>

      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-6">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-[0.78rem] text-slate-300 backdrop-blur">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            {hero.badge}
          </div>

          <h1 className="mt-7 font-heading text-[2.5rem] font-semibold leading-[1.06] tracking-[-0.03em] text-white sm:text-[3.4rem] lg:text-[3.9rem]">
            {hero.headlineStart}{' '}
            <span className="text-gradient">{hero.headlineHighlight}</span>{' '}
            <span className="text-gradient">{hero.headlineEnd}</span>
          </h1>

          <p className="mt-6 max-w-xl text-[0.98rem] leading-relaxed text-slate-400 sm:text-[1.05rem]">
            {hero.paragraph}
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href="#portfolio"
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_16px_40px_-18px_rgba(34,211,238,0.95)] transition-transform duration-300 hover:-translate-y-0.5"
            >
              View our work
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </a>
            <a
              href="#contact"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-6 py-3.5 text-sm font-semibold text-white transition-colors duration-300 hover:border-white/35 hover:bg-white/[0.05]"
            >
              <Sparkles className="h-4 w-4 text-sky-300" />
              Talk to an engineer
            </a>
          </div>

        </div>

        <div className="relative mx-auto w-full max-w-[30rem] lg:max-w-[34rem]">
          <div className="relative aspect-square w-full">
            <div className="absolute inset-[6%] rounded-full bg-[radial-gradient(circle_at_50%_42%,rgba(56,189,248,0.5),rgba(37,99,235,0.24)_46%,transparent_72%)] blur-2xl" />
            <div className="absolute inset-[6%] rounded-full border border-white/[0.11]" />
            <div className="absolute inset-[17%] rounded-full border border-white/[0.07]" />
            <div className="absolute inset-[28%] rounded-full border border-white/[0.05]" />
            <div className="absolute inset-0 animate-spin [animation-duration:28s]">
              <span className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-cyan-300 shadow-[0_0_16px_4px_rgba(34,211,238,0.55)]" />
            </div>
            <Image
              src={HERO_ORB}
              alt="Three dimensional neural sphere representing applied artificial intelligence"
              fittingType="fit"
              className="relative z-10 h-full w-full mix-blend-screen"
            />
          </div>

          {hero.chips.map((chip, i) => (
            <div
              key={chip.label}
              className={`absolute z-20 hidden sm:block ${chipPositions[chip.position]}`}
            >
              <div
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0c1220]/90 px-3.5 py-2.5 shadow-[0_18px_40px_-22px_rgba(0,0,0,0.9)] backdrop-blur-md"
                style={{ animation: `float 7s ease-in-out ${i * 0.9}s infinite` }}
              >
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.06] text-sky-300">
                  <Icon name={chip.icon} className="h-4 w-4" />
                </span>
                <span className="leading-tight">
                  <span className="block text-[0.66rem] uppercase tracking-[0.14em] text-slate-500">
                    {chip.label}
                  </span>
                  <span className="block text-sm font-semibold text-white">{chip.value}</span>
                </span>
              </div>
            </div>
          ))}

          <style>{`@keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }`}</style>
        </div>
      </div>

      <div className="relative mt-14 pl-5 sm:mt-16 sm:pl-8 lg:pl-[max(2rem,calc((100vw-72rem)/2+2rem))]">
        <HeroVideo src={HERO_VIDEO} />
      </div>
    </section>
  );
}