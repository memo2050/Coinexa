import Nav from '@/components/site/Nav';
import Hero from '@/components/site/Hero';
import TrustBar from '@/components/site/TrustBar';
import Services from '@/components/site/Services';
import ShowcaseVideo from '@/components/site/ShowcaseVideo';
import AgentsSection from '@/components/site/AgentsSection';
import Portfolio from '@/components/site/Portfolio';
import Process from '@/components/site/Process';
import Pricing from '@/components/site/Pricing';
import About from '@/components/site/About';
import Testimonials from '@/components/site/Testimonials';
import Contact from '@/components/site/Contact';
import Footer from '@/components/site/Footer';

export default function Home() {
  return (
    <div className="min-h-screen bg-[#05070a] text-white">
      <Nav />
      <main>
        <Hero />
        <TrustBar />
        <Services />
        <AgentsSection />
        <Portfolio />
        <Process />
        <ShowcaseVideo src="https://base44.app/api/apps/6ae24c523e67d1221bba9b1a/files/mp/public/6ae24c523e67d1221bba9b1a/10f317cc7_coinexa-showreel.mp4" />
        <Pricing />
        <About />
        <Testimonials />
        <Contact />
      </main>
      <Footer />
    </div>
  );
}