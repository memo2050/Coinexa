import { Link } from 'react-router-dom';
import { ArrowLeft, LogOut, Mail } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

export default function InboxHeader() {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#05070a]/85 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-5 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-[0.7rem] bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-600 text-white">
            <Mail className="h-4 w-4" />
          </span>
          <div>
            <p className="font-heading text-sm font-semibold text-white">Inquiry inbox</p>
            <p className="text-[0.7rem] text-slate-500">coinexa.net</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden max-w-[14rem] truncate text-xs text-slate-500 lg:block">
            {user?.email}
          </span>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3.5 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-white/25 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Site
          </Link>
          <button
            type="button"
            onClick={() => logout()}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3.5 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-rose-400/40 hover:text-rose-300"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}