import SectionHeading from '@/components/site/SectionHeading';
import Reveal from '@/components/site/Reveal';
import { FeaturedServiceCard, ServiceCard } from '@/components/site/ServiceCard';
import { featuredServices, services } from '@/data/site';

export default function Services() {
  return (
    <section id="services" className="relative scroll-mt-24 py-20 sm:py-28">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[26rem] w-[52rem] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(37,99,235,0.14),transparent_68%)]" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-5 sm:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="What we do"
            title="Full-stack AI & IT services,"
            highlight="under one roof"
            description="From the first prototype to a production system serving millions of requests, one cross-functional team carries the work from idea to operations."
          />
        </Reveal>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {featuredServices.map((service, i) => (
            <Reveal key={service.title} delay={i * 0.08}>
              <FeaturedServiceCard service={service} />
            </Reveal>
          ))}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service, i) => (
            <Reveal key={service.title} delay={(i % 3) * 0.07}>
              <ServiceCard service={service} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}