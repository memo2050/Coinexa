import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { CheckCircle2, Loader2 } from 'lucide-react';

const PLAN_LABEL = {
  starter: 'Agent Sprint',
  growth: 'Studio Retainer',
  scale: 'Platform Partner',
};

export default function BillingSuccess() {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const hireSession = params.get('hire') === '1' ? params.get('session_id') : null;
  const [hire, setHire] = useState(null);

  useEffect(() => {
    let active = true;
    if (hireSession) {
      // Individual agent hire: the server checks the session with Stripe and records the hire.
      const check = (attempt) => base44.functions.invoke('agentBilling', { action: 'confirmCheckout', session_id: hireSession })
        .then((r) => {
          if (!active) return;
          if (r?.data?.hired || attempt >= 5) { setHire(r?.data || {}); setLoading(false); }
          else setTimeout(() => check(attempt + 1), 2000);
        })
        .catch(() => active && (setHire({ hired: false }), setLoading(false)));
      check(0);
      return () => { active = false; };
    }
    base44.functions
      .invoke('manageOrganization', { action: 'bootstrap' })
      .then((response) => {
        if (active) setPlan(response?.data?.organization?.plan || null);
      })
      .catch(() => null)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col items-center justify-center px-5 text-center">
      <CheckCircle2 className="h-12 w-12 text-cyan-300" />
      <h1 className="mt-6 font-heading text-3xl font-semibold tracking-[-0.02em] text-white">
        Payment received
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-400">
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Confirming your plan…
          </span>
        ) : hireSession ? (
          hire?.hired
            ? <>Your agent is hired. It shows <span className="font-semibold text-emerald-300">Hired</span> on your agents page. Receipts are emailed by Stripe.</>
            : <>Your payment went through. The agent activates as soon as Stripe confirms it, usually within a minute.</>
        ) : plan ? (
          <>
            Your workspace is on the{' '}
            <span className="font-semibold text-white">{PLAN_LABEL[plan] || plan}</span> plan.{' '}
            Receipts are emailed by Stripe to the address you paid with.
          </>
        ) : (
          <>Your payment went through. The plan activates as soon as Stripe confirms it.</>
        )}
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/agents"
          className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400 px-5 py-2.5 text-sm font-semibold text-white transition-transform duration-300 hover:-translate-y-0.5"
        >
          Go to my agents
        </Link>
        <Link
          to="/"
          className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-slate-200 transition-colors duration-300 hover:border-white/25 hover:text-white"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}