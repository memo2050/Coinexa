import { useState } from 'react';
import { ArrowUpRight, Check, Loader2 } from 'lucide-react';
import SectionHeading from '@/components/site/SectionHeading';
import Reveal from '@/components/site/Reveal';
import { pricingTiers } from '@/data/site';
import { base44 } from '@/api/base44Client';
import { startCheckout } from '@/lib/checkout';

export default function Pricing() {
  const [busyTier, setBusyTier] = useState(null);
  const [checkoutError, setCheckoutError] = useState('');

  const handleCheckout = async (tier) => {
    setCheckoutError('');
    setBusyTier(tier.key);
    try {
      const user = await base44.auth.me().catch(() => null);
      if (!user) {
        base44.auth.redirectToLogin('/#pricing');
        return;
      }
      await startCheckout(tier.key);
    } catch (error) {
      setCheckoutError(error.message);
    } finally {
      setBusyTier(null);
    }
  };

  return (
    <section id="pricing" className="relative scroll-mt-24 border-t border-white/[0.05] py-20 sm:py-28">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-[24rem] w-[46rem] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(34,211,238,0.1),transparent_70%)]" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-5 sm:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="Pricing"
            title="Clear scope,"
            highlight="predictable cost"
            description="Three ways to work with the studio. Every engagement starts with a short paid discovery so the estimate is based on your systems, not a guess."
          />
        </Reveal>

        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {pricingTiers.map((tier, i) => (
            <Reveal key={tier.name} delay={i * 0.08}>
              <div
                className={`relative flex h-full flex-col rounded-2xl p-6 transition-all duration-300 sm:p-7 ${
                  tier.highlight
                    ? 'border border-sky-400/35 bg-[#0a1220] shadow-[0_24px_60px_-30px_rgba(56,189,248,0.55)]'
                    : 'surface hairline hover:border-white/15'
                }`}
              >
                {tier.highlight && (
                  <span className="absolute -top-3 left-6 rounded-full bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400 px-3 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-white">
                    Most chosen
                  </span>
                )}

                <h3 className="font-heading text-lg font-semibold text-white">{tier.name}</h3>
                <p className="mt-2 min-h-[2.75rem] text-sm leading-relaxed text-slate-400">{tier.tagline}</p>

                <div className="mt-5 flex items-end gap-2">
                  <span className="font-heading text-4xl font-semibold tracking-[-0.03em] text-white">{tier.price}</span>
                  <span className="pb-1.5 text-xs text-slate-500">{tier.cadence}</span>
                </div>

                <ul className="mt-6 flex-1 space-y-2.5 border-t border-white/[0.07] pt-5">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm text-slate-300">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                      {feature}
                    </li>
                  ))}
                </ul>

                {tier.key ? (
                  <button
                    type="button"
                    onClick={() => handleCheckout(tier)}
                    disabled={busyTier === tier.key}
                    className={`mt-7 inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold transition-all duration-300 disabled:opacity-70 ${
                      tier.highlight
                        ? 'bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400 text-white hover:-translate-y-0.5'
                        : 'border border-white/12 bg-white/[0.04] text-slate-200 hover:border-white/25 hover:text-white'
                    }`}
                  >
                    {busyTier === tier.key ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Opening checkout…
                      </>
                    ) : (
                      <>
                        {tier.cta}
                        <ArrowUpRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                ) : (
                  <a
                    href="#contact"
                    className={`mt-7 inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold transition-all duration-300 ${
                      tier.highlight
                        ? 'bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400 text-white hover:-translate-y-0.5'
                        : 'border border-white/12 bg-white/[0.04] text-slate-200 hover:border-white/25 hover:text-white'
                    }`}
                  >
                    {tier.cta}
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                )}
              </div>
            </Reveal>
          ))}
        </div>

        {checkoutError && (
          <p className="mt-6 text-center text-sm text-rose-300">{checkoutError}</p>
        )}

        <Reveal delay={0.1}>
          <p className="mt-8 text-center text-sm text-slate-500">
            All prices in USD, excluding taxes. Need something in between? We scope custom engagements in a 30-minute call.
          </p>
        </Reveal>
      </div>
    </section>
  );
}