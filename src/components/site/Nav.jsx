import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, LogOut, Menu, ShieldCheck, X } from 'lucide-react';
import { Image } from '@/components/ui/image';
import { navLinks } from '@/data/site';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';

const BRAND_LOGO =
  '/media/coinexa-logo.png';

export default function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  // What the menu shows follows the signed-in state. The Admin Console link is only a
  // shortcut: admin pages and functions are protected on the server (role + two-step).
  const { user, isAuthenticated } = useAuth();
  const signedIn = Boolean(isAuthenticated && user);
  const isAdmin = signedIn && user?.role === 'admin';
  const signOut = async () => {
    setSigningOut(true);
    setOpen(false);
    await base44.auth.logout('/');
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 14);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'border-b border-white/[0.07] bg-[#05070a]/85 backdrop-blur-xl'
          : 'border-b border-transparent bg-transparent'
      }`}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <a href="#top" className="group flex items-center" aria-label="Coinexa home">
          <Image
            src={BRAND_LOGO}
            alt="Coinexa"
            fittingType="fit"
            originWidth={1671}
            originHeight={941}
            className="h-12 w-[86px] mix-blend-screen"
          />
        </a>

        <nav className="hidden items-center gap-0.5 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="whitespace-nowrap rounded-full px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-white lg:px-4"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-1.5 md:flex">
          {signedIn ? (
            <>
              {isAdmin && (
                <Link
                  to="/admin"
                  className="whitespace-nowrap rounded-full px-3 py-2.5 text-sm font-semibold text-slate-300 transition-colors hover:text-white"
                >
                  Admin Console
                </Link>
              )}
              <Link
                to="/account/security"
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2.5 text-sm font-semibold text-slate-300 transition-colors hover:text-white"
              >
                <ShieldCheck className="h-4 w-4" />
                Security
              </Link>
              <button
                type="button"
                onClick={signOut}
                disabled={signingOut}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:border-sky-400/40 hover:text-white disabled:opacity-60"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="whitespace-nowrap rounded-full px-3.5 py-2.5 text-sm font-semibold text-slate-300 transition-colors hover:text-white"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                className="whitespace-nowrap rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:border-sky-400/40 hover:text-white"
              >
                Sign Up
              </Link>
            </>
          )}
          <Link
            to="/agents/new"
            className="group inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_-14px_rgba(34,211,238,0.9)] transition-transform duration-300 hover:-translate-y-0.5"
          >
            Build a new AI Agent
            <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-white md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <div
        className={`overflow-hidden border-t border-white/[0.06] bg-[#05070a]/95 backdrop-blur-xl transition-[max-height,opacity] duration-400 md:hidden ${
          open ? 'max-h-[34rem] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="space-y-1 px-5 py-4">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-3 text-sm text-slate-300 transition-colors hover:bg-white/[0.05] hover:text-white"
            >
              {link.label}
            </Link>
          ))}
          {signedIn ? (
            <>
              {isAdmin && (
                <Link
                  to="/admin"
                  onClick={() => setOpen(false)}
                  className="mt-2 block rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-center text-sm font-semibold text-slate-200"
                >
                  Admin Console
                </Link>
              )}
              <Link
                to="/account/security"
                onClick={() => setOpen(false)}
                className={`${isAdmin ? '' : 'mt-2 '}block rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-center text-sm font-semibold text-slate-200`}
              >
                Security
              </Link>
              <button
                type="button"
                onClick={signOut}
                disabled={signingOut}
                className="block w-full rounded-xl border border-sky-400/30 bg-sky-500/10 px-3 py-3 text-center text-sm font-semibold text-sky-100 disabled:opacity-60"
              >
                Sign Out
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                onClick={() => setOpen(false)}
                className="mt-2 block rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-center text-sm font-semibold text-slate-200"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                onClick={() => setOpen(false)}
                className="block rounded-xl border border-sky-400/30 bg-sky-500/10 px-3 py-3 text-center text-sm font-semibold text-sky-100"
              >
                Sign Up
              </Link>
            </>
          )}
          <Link
            to="/agents/new"
            onClick={() => setOpen(false)}
            className="block rounded-xl bg-gradient-to-r from-blue-600 to-cyan-400 px-3 py-3 text-center text-sm font-semibold text-white"
          >
            Build a new AI Agent
          </Link>
        </div>
      </div>
    </header>
  );
}