import Nav from '@/components/site/Nav';
import Footer from '@/components/site/Footer';

export default function LegalPage({ title, updated, intro, children }) {
  return (
    <div className="min-h-screen bg-[#05070a] text-white">
      <Nav />
      <main className="mx-auto w-full max-w-3xl px-5 pb-20 pt-32 sm:px-8 sm:pt-36">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-sky-300/90">
          Legal
        </p>
        <h1 className="mt-4 font-heading text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 text-xs uppercase tracking-[0.14em] text-slate-500">
          Last updated {updated}
        </p>
        {intro && <p className="mt-6 text-sm leading-relaxed text-slate-400 sm:text-base">{intro}</p>}
        <div className="mt-10 space-y-10">{children}</div>
      </main>
      <Footer />
    </div>
  );
}