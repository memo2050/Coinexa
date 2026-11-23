import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Image } from '@/components/ui/image';
import { navLinks } from '@/data/site';

const BRAND_LOGO =
  'https://base44.app/api/apps/6ae24c523e67d1221bba9b1a/files/mp/public/6ae24c523e67d1221bba9b1a/661246468_coinexa-logo.png';

export default function Footer() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  return (
    <footer className="border-t border-white/[0.06] bg-[#05070a]">
      <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-xs">
            <div className="flex items-center">
              <Image
                src={BRAND_LOGO}
                alt="Coinexa"
                fittingType="fit"
                originWidth={1671}
                originHeight={941}
                className="h-11 w-[80px] mix-blend-screen"
              />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-slate-500">
              An AI and IT engineering studio building software that earns its place in production.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:gap-16">
            <div>
              <h3 className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Explore
              </h3>
              <ul className="mt-4 space-y-2.5">
                {navLinks.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="text-sm text-slate-400 transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Contact
              </h3>
              <ul className="mt-4 space-y-2.5">
                <li>
                  <a
                    href="#contact"
                    className="text-sm text-slate-400 transition-colors hover:text-white"
                  >
                    Start a project
                  </a>
                </li>
                <li className="text-sm text-slate-400">hello@coinexa.net</li>
                <li className="text-sm text-slate-400">Mon–Fri, 9:00–18:00 (UTC)</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-white/[0.06] pt-6 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Coinexa.net. All rights reserved.</p>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              to="/privacy"
              className="whitespace-nowrap text-slate-500 transition-colors hover:text-white"
            >
              Privacy Policy
            </Link>
            <Link
              to="/terms"
              className="whitespace-nowrap text-slate-500 transition-colors hover:text-white"
            >
              Terms of Service
            </Link>
            <a
              href="/presentation/autoadjust-net-deck.pptx"
              download
              className="whitespace-nowrap text-slate-500 transition-colors hover:text-white"
            >
              Download deck
            </a>
            {isAdmin && (
              <Link
                to="/admin"
                className="whitespace-nowrap text-slate-500 transition-colors hover:text-white"
              >
                Admin console
              </Link>
            )}
            <Link
              to={isAdmin ? '/inbox' : '/login'}
              className="whitespace-nowrap text-slate-500 transition-colors hover:text-white"
            >
              {isAdmin ? 'Studio inbox' : 'Studio login'}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}