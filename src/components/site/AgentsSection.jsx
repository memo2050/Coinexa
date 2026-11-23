import { Link } from 'react-router-dom';
import { ArrowUpRight, Bot, CalendarCheck, ShieldCheck } from 'lucide-react';
import SectionHeading from '@/components/site/SectionHeading';
import Reveal from '@/components/site/Reveal';

const capabilities = [
  {
    icon: Bot,
    accent: 'text-sky-300',
    title: 'Answers in your voice',
    text: 'Describe your business once. The agent handles the questions, follow-ups and routine replies in the tone you set.',
  },
  {
    icon: CalendarCheck,
    accent: 'text-cyan-300',
    title: 'Works inside your tools',
    text: 'Point it at your inbox, calendar or knowledge base and it books, chases and confirms without the back-and-forth.',
  },
  {
    icon: ShieldCheck,
    accent: 'text-emerald-300',
    title: 'Acts only within limits',
    text: 'You grant permissions per agent. Anything sensitive or outside its brief is handed straight back to a human.',
  },
];

export default function AgentsSection() {
  return (
    <section id="agents" className="relative scroll-mt-24 border-t border-white/[0.05] py-20 sm:py-28">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[26rem] w-[52rem] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(34,211,238,0.13),transparent_68%)]" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-5 sm:px-8">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <Reveal>
            <SectionHeading
              eyebrow="AI agents"
              title="Put an agent to work"
              highlight="inside your business"
              description="Answer eight questions and the generator writes the role, instructions, workflow and guardrails for you. Test it in the browser, then activate it when you are happy."
            />
          </Reveal>

          <Reveal delay={0.1}>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/agents/new"
                className="group inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_-14px_rgba(34,211,238,0.9)] transition-transform duration-300 hover:-translate-y-0.5"
              >
                Build an agent
                <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
              <Link
                to="/agents"
                className="inline-flex items-center rounded-full border border-white/10 px-5 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:border-white/25 hover:text-white"
              >
                My agents
              </Link>
            </div>
          </Reveal>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {capabilities.map((item, i) => {
            const Icon = item.icon;
            return (
              <Reveal key={item.title} delay={i * 0.08}>
                <article className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0f19] p-6 transition-all duration-400 hover:-translate-y-1 hover:border-white/20 sm:p-7">
                  <span className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.05]">
                    <Icon className={`h-5 w-5 ${item.accent}`} />
                  </span>
                  <h3 className="mt-6 font-heading text-lg font-semibold text-white">{item.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-400">{item.text}</p>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}