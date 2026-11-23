import { Circle, Diamond, Hexagon, Square, Star, Triangle } from 'lucide-react';
import { clients, metrics } from '@/data/site';

const shapes = {
  diamond: Diamond,
  circle: Circle,
  triangle: Triangle,
  square: Square,
  star: Star,
  hexagon: Hexagon,
};

export default function TrustBar() {
  return (
    <section className="relative border-y border-white/[0.06] bg-[#060910]/60">
      <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-14">
        <div className="grid grid-cols-3 gap-6">
          {metrics.map((metric) => (
            <div key={metric.label} className="text-center sm:text-left">
              <div className="font-heading text-3xl font-semibold tracking-[-0.02em] text-white sm:text-4xl">
                {metric.value}
              </div>
              <div className="mt-1.5 text-[0.72rem] uppercase tracking-[0.16em] text-slate-500">
                {metric.label}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-white/[0.06] pt-8">
          <p className="text-center text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">
            Trusted by teams in fintech, healthcare, logistics &amp; retail
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-9 gap-y-4">
            {clients.map((client) => {
              const Shape = shapes[client.shape] || Circle;
              return (
                <span
                  key={client.name}
                  className="flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors duration-300 hover:text-slate-300"
                >
                  <Shape className="h-3.5 w-3.5 text-sky-400/70" strokeWidth={1.8} />
                  {client.name}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}