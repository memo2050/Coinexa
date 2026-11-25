import { useEffect, useState } from 'react';
import { BadgeCheck } from 'lucide-react';
import { supabase } from '@/api/base44Client';

// "Hired" status for every agent, existing and future.
//
// It is never stored per agent and never decided in the browser: a workspace is hired
// only while its payment is confirmed on the server (the signature-verified Stripe
// webhook records an active, paid subscription), exposed as the read-only database
// column organizations.hired. Every agent in a hired workspace shows the status.

// Subtle red glow around a hired agent's card or icon.
export const HIRED_GLOW = 'ring-1 ring-red-500/35 shadow-[0_0_28px_-6px_rgba(239,68,68,0.55)]';

export function HiredBadge({ className = '' }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-0.5 text-[0.68rem] font-semibold text-emerald-300 ${className}`}
      title="Payment confirmed"
    >
      <BadgeCheck className="h-3 w-3" aria-hidden="true" />
      Hired
    </span>
  );
}

let cache = { at: 0, promise: null };

function loadHired() {
  if (cache.promise && Date.now() - cache.at < 30000) return cache.promise;
  cache = {
    at: Date.now(),
    // Members can read only their own workspaces (RLS); `hired` is computed by the database.
    promise: supabase
      .from('organizations')
      .select('id, hired')
      .then(({ data, error }) => (error ? [] : (data || []).filter((o) => o.hired).map((o) => o.id)))
      .catch(() => []),
  };
  return cache.promise;
}

// Returns helpers for the signed-in user's workspaces.
export function useHiredWorkspaces() {
  const [ids, setIds] = useState(() => new Set());
  useEffect(() => {
    let alive = true;
    loadHired().then((list) => alive && setIds(new Set(list)));
    const refresh = () => {
      cache.at = 0;
      loadHired().then((list) => alive && setIds(new Set(list)));
    };
    window.addEventListener('focus', refresh);
    return () => {
      alive = false;
      window.removeEventListener('focus', refresh);
    };
  }, []);
  return {
    isHired: (agent) => Boolean(agent?.organization_id && ids.has(agent.organization_id)),
    anyHired: ids.size > 0,
  };
}
