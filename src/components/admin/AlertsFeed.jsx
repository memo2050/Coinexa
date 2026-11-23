import { Link } from 'react-router-dom';
import { AlertTriangle, Info, ShieldAlert } from 'lucide-react';

const TONES = {
  critical: { box: 'border-rose-400/30 bg-rose-500/[0.07]', icon: ShieldAlert, tone: 'text-rose-300' },
  warning: { box: 'border-amber-400/30 bg-amber-400/[0.06]', icon: AlertTriangle, tone: 'text-amber-300' },
  info: { box: 'border-sky-400/25 bg-sky-400/[0.05]', icon: Info, tone: 'text-sky-300' },
};

export default function AlertsFeed({ alerts = [], emptyLabel = 'No alerts. Nothing needs attention.' }) {
  if (!alerts.length) {
    return (
      <p className="rounded-2xl border border-white/[0.08] bg-[#0a0f19] px-4 py-5 text-xs text-slate-500">
        {emptyLabel}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {alerts.map((alert) => {
        const meta = TONES[alert.level] || TONES.info;
        const Icon = meta.icon;
        return (
          <li key={alert.key} className={`rounded-xl border px-4 py-3 ${meta.box}`}>
            <div className="flex items-start gap-2.5">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.tone}`} />
              <div className="min-w-0">
                <p className="text-sm text-white">{alert.title}</p>
                {alert.detail && (
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">{alert.detail}</p>
                )}
                {alert.href && (
                  <Link
                    to={alert.href}
                    className={`mt-1.5 inline-block text-[0.7rem] underline decoration-white/20 hover:text-white ${meta.tone}`}
                  >
                    Open
                  </Link>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}