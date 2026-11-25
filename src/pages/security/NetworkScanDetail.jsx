import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react';
import Nav from '@/components/site/Nav';
import Footer from '@/components/site/Footer';
import { securityScan, errorText } from '@/api/securityScan';
import { ErrorNote, Loading, Panel, Stat, ghostBtn, when } from '@/components/recruitment/ui';

export default function NetworkScanDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    securityScan('getScan', { scan_id: id }).then(setData).catch((e) => setError(errorText(e)));
  }, [id]);

  const remove = async () => {
    if (!window.confirm('Delete this scan and its device list? This cannot be undone.')) return;
    setBusy(true);
    try {
      await securityScan('deleteScan', { scan_id: id });
      navigate('/network-security');
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  const s = data?.scan;

  return (
    <div className="min-h-screen bg-[#05070a] text-white">
      <Nav />
      <main className="relative pb-20 pt-28 sm:pb-28">
        <div className="relative mx-auto w-full max-w-6xl space-y-6 px-5 sm:px-8">
          <Link to="/network-security" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Network security</Link>
          <ErrorNote>{error}</ErrorNote>
          {!data && !error && <Loading label="Loading scan…" />}
          {s && (
            <>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-sky-300/90">Network scan · {s.status}</p>
                  <h1 className="mt-2 font-heading text-3xl font-semibold">{s.device_name}</h1>
                  <p className="mt-2 text-sm text-slate-400">
                    {when(s.started_at)} – {when(s.finished_at)} · {s.networks.map((n) => n.cidr).join(', ')} · authorised by {s.authorized_by}
                    {s.scanner_version ? ` · scanner ${s.scanner_version}` : ''}
                  </p>
                </div>
                {data.can_manage && (
                  <button type="button" className={ghostBtn} onClick={remove} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete scan</button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat label="Devices" value={s.host_count} />
                <Stat label="Open ports" value={s.open_port_count} tone={s.open_port_count ? 'text-amber-300' : 'text-white'} />
                <Stat label="Upload" value="Signature verified" tone="text-emerald-300" />
              </div>

              <Panel title="Devices found" description={data.addresses_hidden ? 'Addresses, host names and MAC addresses are visible to owners and admins only.' : 'As reported by the scanner. Security analysis is added in a later phase.'}>
                {data.hosts.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-400">The scan found no devices.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead className="text-[0.66rem] uppercase tracking-[0.14em] text-slate-500">
                        <tr><th className="py-2">Address</th><th>Name</th><th>Maker</th><th>Type</th><th>Open ports</th></tr>
                      </thead>
                      <tbody>
                        {data.hosts.map((h) => (
                          <tr key={h.id} className="border-t border-white/[0.05] align-top">
                            <td className="py-2.5 font-mono text-xs text-white">{h.ip}{h.mac && <span className="block text-[0.65rem] text-slate-500">{h.mac}</span>}</td>
                            <td className="text-xs text-slate-300">{h.hostname || '—'}</td>
                            <td className="text-xs text-slate-300">{h.vendor || '—'}</td>
                            <td className="text-xs text-slate-400">{[h.device_type, h.os_guess].filter(Boolean).join(' · ') || '—'}</td>
                            <td className="text-xs text-slate-300">
                              {h.ports.length === 0 ? <span className="text-slate-500">none</span> : (
                                <div className="flex flex-wrap gap-1">
                                  {h.ports.map((p) => (
                                    <span key={p.port} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5" title={[p.product, p.version].filter(Boolean).join(' ')}>
                                      {p.port}{p.service ? `/${p.service}` : ''}{p.product ? ` · ${[p.product, p.version].filter(Boolean).join(' ')}` : ''}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
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
