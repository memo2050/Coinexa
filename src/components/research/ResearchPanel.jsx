import { useState } from 'react';
import { AlertCircle, Loader2, Search } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ResearchReportView from '@/components/research/ResearchReportView';

const SUPPLIERS = [
  { key: 'safqa', name: 'Safqa' },
  { key: 'taager', name: 'Taager' },
  { key: 'tagerly', name: 'Tagerly' },
];

const COUNTS = [1, 2, 3, 5];

export default function ResearchPanel({ agent, onTaskComplete }) {
  const [query, setQuery] = useState('');
  const [suppliers, setSuppliers] = useState(SUPPLIERS.map((supplier) => supplier.key));
  const [maxProducts, setMaxProducts] = useState(3);
  const [sellingPrice, setSellingPrice] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);

  const toggleSupplier = (key) =>
    setSuppliers((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));

  const run = async () => {
    const instruction = query.trim();
    if (instruction.length < 3 || running) return;
    setRunning(true);
    setError('');
    setReport(null);
    try {
      const response = await base44.functions.invoke('productResearch', {
        query: instruction,
        suppliers,
        max_products: Number(maxProducts),
        selling_price: sellingPrice === '' ? null : Number(sellingPrice),
        agent_id: agent?.id || '',
      });
      const created = response.data?.report;
      if (!created) throw new Error(response.data?.error || 'The research run returned no report.');
      setReport(created);
      onTaskComplete?.();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'The research run failed.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-w-0 rounded-2xl border border-white/[0.08] bg-[#0a0f19] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold text-white">Product research</h2>
        <span className="text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">Evidence first</span>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
        Runs live web research against the supplier platforms, checks every link against the sources it cites, and
        calculates profit and scores on the server. Unverified findings are labelled, never invented.
      </p>

      <label htmlFor="research-query" className="mt-5 block text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">
        Product or category
      </label>
      <input
        id="research-query"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') run();
        }}
        maxLength={300}
        placeholder="e.g. silicone food cover set"
        className="mt-2 w-full rounded-xl border border-white/10 bg-[#05070a]/70 px-3.5 py-3 text-sm text-white placeholder:text-slate-500 focus:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
      />

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">Suppliers</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SUPPLIERS.map((supplier) => {
              const active = suppliers.includes(supplier.key);
              return (
                <button
                  key={supplier.key}
                  type="button"
                  onClick={() => toggleSupplier(supplier.key)}
                  aria-pressed={active}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-300 ${
                    active
                      ? 'border-transparent bg-gradient-to-r from-blue-600 to-cyan-400 text-white'
                      : 'border-white/10 text-slate-400 hover:border-white/25 hover:text-white'
                  }`}
                >
                  {supplier.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <p className="text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">Max products</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {COUNTS.map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setMaxProducts(count)}
                  aria-pressed={maxProducts === count}
                  className={`h-8 w-8 rounded-lg border text-xs font-semibold transition-colors ${
                    maxProducts === count
                      ? 'border-sky-400/60 bg-sky-500/15 text-white'
                      : 'border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>
          <div className="min-w-0">
            <label htmlFor="research-selling" className="text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">
              Selling price (EGP)
            </label>
            <input
              id="research-selling"
              type="number"
              min="0"
              value={sellingPrice}
              onChange={(event) => setSellingPrice(event.target.value)}
              placeholder="optional"
              className="mt-2 w-full rounded-lg border border-white/10 bg-[#05070a]/70 px-2.5 py-1.5 font-mono text-xs text-white placeholder:text-slate-600 focus:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
            />
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={run}
        disabled={running || query.trim().length < 3 || !suppliers.length}
        className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_-14px_rgba(34,211,238,0.9)] transition-transform duration-300 hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50"
      >
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        {running ? 'Researching live sources…' : 'Run research'}
      </button>

      {error && (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="break-words [overflow-wrap:anywhere]">{error}</span>
        </p>
      )}

      {report && <ResearchReportView report={report} />}
    </div>
  );
}