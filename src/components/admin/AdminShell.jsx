import { Link, NavLink, Outlet } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  BellRing,
  Bot,
  CreditCard,
  FileBarChart,
  Gauge,
  LayoutDashboard,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

const NAV = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/agents', label: 'Agents', icon: Bot },
  { to: '/admin/runs', label: 'Executions', icon: Activity },
  { to: '/admin/usage', label: 'Usage & cost', icon: Gauge },
  { to: '/admin/customers', label: 'Customers', icon: Users },
  { to: '/admin/billing', label: 'Billing', icon: CreditCard },
  { to: '/admin/reports', label: 'Reports', icon: FileBarChart },
  { to: '/admin/activity', label: 'Activity', icon: BellRing },
];

const linkClass = ({ isActive }) =>
  `flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors ${
    isActive
      ? 'bg-sky-400/10 text-white shadow-[inset_0_0_0_1px_rgba(56,189,248,0.25)]'
      : 'text-slate-400 hover:bg-white/[0.04] hover:text-white'
  }`;

export default function AdminShell() {
  const { user } = useAuth();

  if (user && user.role !== 'admin') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#05070a] px-5">
        <div className="max-w-md rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-6 text-center">
          <ShieldCheck className="mx-auto h-6 w-6 text-amber-300" />
          <h1 className="mt-3 font-heading text-lg font-semibold text-white">
            Super admin access only
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            This console is limited to platform administrators.
          </p>
          <Link
            to="/agents"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-200 hover:border-white/25 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to your agents
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#05070a] text-white">
      <div className="mx-auto flex w-full max-w-[100rem]">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-white/[0.06] px-4 py-6 lg:flex">
          <Link to="/" className="flex items-center gap-2 px-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-blue-600 via-sky-500 to-cyan-400">
              <ShieldCheck className="h-4 w-4 text-white" />
            </span>
            <span className="font-heading text-sm font-semibold tracking-[-0.01em]">Coinexa</span>
          </Link>
          <p className="mt-5 px-2 text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-slate-600">
            Super admin
          </p>
          <nav className="mt-2 flex-1 space-y-1">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
            <p className="truncate text-[0.68rem] text-slate-400">{user?.email}</p>
            <p className="mt-0.5 text-[0.6rem] uppercase tracking-[0.14em] text-slate-600">
              Administrator
            </p>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#05070a]/95 backdrop-blur-xl lg:hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <Link to="/" className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-sky-300" />
                <span className="font-heading text-sm font-semibold">Coinexa admin</span>
              </Link>
              <Link to="/agents" className="text-[0.7rem] text-slate-400 hover:text-white">
                Exit
              </Link>
            </div>
            <div className="flex gap-1 overflow-x-auto px-3 pb-2.5">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[0.72rem] transition-colors ${
                      isActive
                        ? 'bg-sky-400/15 text-white'
                        : 'text-slate-400 hover:bg-white/[0.05] hover:text-white'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>

          <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}