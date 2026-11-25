import { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import Nav from '@/components/site/Nav';
import Footer from '@/components/site/Footer';
import { mfa } from '@/api/base44Client';
import { ErrorNote, Panel, ghostBtn, inputCls, primaryBtn, when } from '@/components/recruitment/ui';

// Account → Security: turn two-step sign-in (authenticator app) on or off.
// Required for platform admins to open the admin console.
export default function AccountSecurity() {
  const [factors, setFactors] = useState(null);
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      setFactors(await mfa.factors());
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (key, fn) => {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="min-h-screen bg-[#05070a] text-white">
      <Nav />
      <main className="mx-auto w-full max-w-2xl space-y-6 px-5 pb-20 pt-28 sm:px-8">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-sky-300/90">Account</p>
          <h1 className="mt-2 font-heading text-3xl font-semibold">Security</h1>
        </div>
        <ErrorNote>{error}</ErrorNote>
        {notice && <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-100">{notice}</p>}
        <Panel title="Two-step sign-in" description="After your password, sign-in also asks for a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password and others). Required for platform admins.">
          {factors === null ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : factors.length ? (
            <ul className="space-y-2">
              {factors.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 text-emerald-200"><ShieldCheck className="h-4 w-4" /> On · {f.friendly_name || 'Authenticator app'} · added {when(f.created_at)}</span>
                  <button type="button" className={ghostBtn} disabled={!!busy}
                    onClick={() => window.confirm('Turn off two-step sign-in? Your account will be protected by your password only.') && run('remove', async () => { await mfa.remove(f.id); await load(); setNotice('Two-step sign-in is off.'); })}>
                    {busy === 'remove' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Turn off
                  </button>
                </li>
              ))}
            </ul>
          ) : setup ? (
            <div className="space-y-3 text-sm">
              <p className="text-slate-300">1. Scan this code with your authenticator app.</p>
              <img src={setup.qr} alt="QR code for your authenticator app" className="h-44 w-44 rounded-xl bg-white p-2" />
              <p className="text-xs text-slate-500">Can't scan? Enter this key: <span className="select-all font-mono text-slate-300">{setup.secret}</span></p>
              <p className="text-slate-300">2. Enter the 6-digit code it shows.</p>
              <div className="flex gap-2">
                <input className={`${inputCls} max-w-[10rem] text-center font-mono tracking-[0.3em]`} inputMode="numeric" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} placeholder="000000" />
                <button type="button" className={primaryBtn} disabled={!!busy || code.replace(/\s/g, '').length < 6}
                  onClick={() => run('verify', async () => { await mfa.verify(setup.factorId, code); setSetup(null); setCode(''); await load(); setNotice('Two-step sign-in is on.'); })}>
                  {busy === 'verify' && <Loader2 className="h-4 w-4 animate-spin" />} Turn on
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className={primaryBtn} disabled={!!busy} onClick={() => run('enroll', async () => setSetup(await mfa.enroll()))}>
              {busy === 'enroll' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Set up two-step sign-in
            </button>
          )}
        </Panel>
      </main>
      <Footer />
    </div>
  );
}
