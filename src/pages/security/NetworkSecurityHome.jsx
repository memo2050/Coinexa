import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Copy, Download, KeyRound, Laptop, Loader2, RefreshCw, ShieldCheck, Unlink } from 'lucide-react';
import Nav from '@/components/site/Nav';
import Footer from '@/components/site/Footer';
import SectionHeading from '@/components/site/SectionHeading';
import { securityScan, errorText } from '@/api/securityScan';
import { ErrorNote, Loading, Panel, Stat, ghostBtn, primaryBtn, when } from '@/components/recruitment/ui';
import { useAgentBranding } from '@/components/agents/brandIcons';

// The Windows scanner is published to /downloads only after it passes the Windows tests.
function ScannerDownload() {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    fetch(`/downloads/scanner.json?t=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setInfo(j && j.sha256 ? j : false))
      .catch(() => setInfo(false));
  }, []);
  if (info === null) return null;
  if (!info) return <p className="text-xs text-slate-500">The Windows scanner download is not available yet.</p>;
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <a href="/downloads/coinexa-network-scanner-staging.exe" download className={primaryBtn}><Download className="h-4 w-4" /> Download for Windows</a>
      <p className="mt-2 text-xs text-slate-400">Version {info.version} · {(info.size / 1048576).toFixed(1)} MB · Windows 10 and 11 (64-bit) · no installation or admin rights needed</p>
      <p className="mt-1 break-all font-mono text-[0.65rem] text-slate-500">SHA-256 {info.sha256}</p>
      <p className="mt-2 text-xs text-amber-200/90">Staging test build, not yet code-signed: Windows may show “Windows protected your PC”. Choose More info → Run anyway only if the SHA-256 above matches your download.</p>
      <p className="mt-2 text-xs text-slate-400">Double-click the downloaded file to open it. Some browsers ask you to confirm keeping an unsigned file: choose Keep.</p>
    </div>
  );
}

export default function NetworkSecurityHome() {
  const featuredName = useAgentBranding().featured('cyber-scan').name;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [code, setCode] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await securityScan('overview'));
      setError('');
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load]);

  const run = async (key, fn) => {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy('');
    }
  };

  const createCode = () => run('code', async () => setCode(await securityScan('createPairingCode')));
  const revoke = (d) => {
    if (!window.confirm(`Unlink ${d.name}? It will no longer be able to upload scans. Existing scans are kept.`)) return;
    run(`revoke-${d.id}`, async () => {
      await securityScan('revokeDevice', { device_id: d.id });
      setNotice(`${d.name} was unlinked.`);
    });
  };

  const t = data?.totals;

  return (
    <div className="min-h-screen bg-[#05070a] text-white">
      <Nav />
      <main className="relative pb-20 pt-28 sm:pb-28">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[26rem] overflow-hidden">
          <div className="absolute left-1/2 top-0 h-[24rem] w-[48rem] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(37,99,235,0.16),transparent_68%)]" />
        </div>
        <div className="relative mx-auto w-full max-w-6xl space-y-6 px-5 sm:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <SectionHeading
              eyebrow={featuredName || 'Cyber Security Scan Agent'}
              title="Network"
              highlight="security"
              description="Scan your own local network from a linked Windows PC, see every device and open port, and get a clear, prioritised security report."
            />
            <button type="button" className={ghostBtn} onClick={load}><RefreshCw className="h-4 w-4" /> Refresh</button>
          </div>

          <ErrorNote>{error}</ErrorNote>
          {notice && <p className="rounded-xl border border-sky-400/25 bg-sky-500/10 px-4 py-2.5 text-sm text-sky-100">{notice}</p>}
          {!data && !error && <Loading label="Loading…" />}

          {data && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Linked PCs" value={t.linked} />
                <Stat label="Scans" value={t.scans} />
                <Stat label="Devices (latest scan)" value={t.devices_found} />
                <Stat label="Open ports (latest scan)" value={t.open_ports} tone={t.open_ports ? 'text-amber-300' : 'text-white'} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Panel title="Link a Windows PC" description="The Coinexa Network Scanner runs on a Windows PC inside the network you want to check. Linking gives that PC its own key; it can only upload scans to this workspace.">
                  {data.can_manage ? (
                    <div className="space-y-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-300">Step 1 · Download the scanner</p>
                      <ScannerDownload />
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-300">Step 2 · Create a linking code, then enter it in the scanner</p>
                      {code && (
                        <div className="rounded-xl border border-sky-400/30 bg-sky-500/10 p-4">
                          <p className="text-xs text-slate-400">Linking code — valid until {when(code.expires_at)}, single use</p>
                          <div className="mt-1 flex items-center gap-2">
                            <p className="font-heading text-2xl font-semibold tracking-[0.2em] text-white">{code.code}</p>
                            <button type="button" aria-label="Copy code" className="text-slate-400 hover:text-white" onClick={() => navigator.clipboard.writeText(code.code).catch(() => {})}><Copy className="h-4 w-4" /></button>
                          </div>
                          <p className="mt-2 text-xs text-slate-400">Enter it in the scanner on the PC. It is shown only once.</p>
                        </div>
                      )}
                      <button type="button" className={primaryBtn} onClick={createCode} disabled={!!busy}>
                        {busy === 'code' ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} {code ? 'New linking code' : 'Create linking code'}
                      </button>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-300">Step 3 · Scan</p>
                      <p className="text-xs text-slate-400">In the scanner choose 2 (Scan my network), pick your network, type your full name and YES. The result appears under Scans below within a few seconds of finishing.</p>
                    </div>
                  ) : <p className="text-sm text-slate-400">Only workspace owners and admins can link PCs.</p>}
                </Panel>

                <Panel title="Authorised scanning only" description="Before every scan, the person running it confirms:">
                  <p className="flex gap-2 rounded-xl bg-white/[0.03] p-3 text-sm text-slate-300"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />“{data.authorization_statement}”</p>
                  <ul className="mt-3 space-y-1 text-xs text-slate-400">
                    <li>• Only private local addresses (10.x, 172.16–31.x, 192.168.x) are accepted — never internet addresses.</li>
                    <li>• Scans start only from the PC; Coinexa cannot start or direct a scan.</li>
                    <li>• Every upload is signed by the PC and checked; copies and altered uploads are refused.</li>
                    <li>• Device addresses are stored encrypted and visible only to owners and admins.</li>
                  </ul>
                </Panel>
              </div>

              <Panel title="Linked PCs">
                {data.devices.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-400">No PCs linked yet.</p>
                ) : (
                  <ul className="divide-y divide-white/[0.05]">
                    {data.devices.map((d) => (
                      <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <div className="flex items-center gap-3">
                          <Laptop className={`h-5 w-5 ${d.status === 'active' ? 'text-sky-300' : 'text-slate-600'}`} />
                          <div>
                            <p className="text-sm font-semibold text-white">{d.name} {d.status === 'revoked' && <span className="ml-1 text-xs font-normal text-rose-300">unlinked</span>}</p>
                            <p className="text-xs text-slate-500">
                              Linked {when(d.paired_at)} · last seen {when(d.last_seen_at)}{d.app_version ? ` · scanner ${d.app_version}` : ''}
                              {d.revoked_at ? ` · unlinked ${when(d.revoked_at)} by ${d.revoked_by}` : ''}
                            </p>
                          </div>
                        </div>
                        {data.can_manage && d.status === 'active' && (
                          <button type="button" className={ghostBtn} onClick={() => revoke(d)} disabled={!!busy}>
                            {busy === `revoke-${d.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />} Unlink
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel title="Scans" description="Each scan as received from a linked PC. Analysis and PDF reports come in a later phase.">
                {data.scans.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-400">No scans yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead className="text-[0.66rem] uppercase tracking-[0.14em] text-slate-500">
                        <tr><th className="py-2">Finished</th><th>PC</th><th>Network</th><th>Devices</th><th>Open ports</th><th>Authorised by</th><th /></tr>
                      </thead>
                      <tbody>
                        {data.scans.map((s) => (
                          <tr key={s.id} className="border-t border-white/[0.05]">
                            <td className="py-2.5 text-xs text-slate-300">{when(s.finished_at)}</td>
                            <td className="text-xs text-slate-300">{s.device_name}</td>
                            <td className="text-xs text-slate-400">{s.network_summary}</td>
                            <td className="text-xs">{s.host_count}</td>
                            <td className="text-xs">{s.open_port_count}</td>
                            <td className="text-xs text-slate-400">{s.authorized_by}</td>
                            <td className="text-right"><Link to={`/network-security/scans/${s.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-sky-300">Open <ArrowRight className="h-3.5 w-3.5" /></Link></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
