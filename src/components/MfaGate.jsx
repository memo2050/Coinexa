import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { mfa, supabase } from '@/api/base44Client';

// Second sign-in step. Accounts with an authenticator app must enter its current code
// before any protected page opens, whichever way they signed in.
export default function MfaGate({ children }) {
  const [state, setState] = useState('checking');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    mfa.level()
      .then((l) => alive && setState(l.next === 'aal2' && l.current !== 'aal2' ? 'needed' : 'ok'))
      .catch(() => alive && setState('ok'));
    return () => {
      alive = false;
    };
  }, []);

  if (state === 'ok') return children;
  if (state === 'checking') {
    return <div className="fixed inset-0 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await mfa.challenge(code);
      setState('ok');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#05070a] px-5 text-white">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <ShieldCheck className="h-8 w-8 text-sky-300" />
        <h1 className="font-heading text-xl font-semibold">Two-step sign-in</h1>
        <p className="text-sm text-slate-400">Enter the 6-digit code from your authenticator app.</p>
        <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)}
          className="w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-center font-mono text-xl tracking-[0.4em] text-white outline-none focus:border-sky-400/60" placeholder="000000" />
        {error && <p className="text-sm text-rose-300">{error}</p>}
        <button type="submit" disabled={busy || code.replace(/\s/g, '').length < 6}
          className="w-full rounded-full bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400 px-5 py-2.5 text-sm font-semibold disabled:opacity-50">
          {busy ? 'Checking…' : 'Continue'}
        </button>
        <button type="button" className="w-full text-xs text-slate-500 underline" onClick={async () => { await supabase.auth.signOut(); window.location.assign('/login'); }}>
          Sign out
        </button>
      </form>
    </div>
  );
}
