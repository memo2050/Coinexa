import { useEffect, useState } from 'react';
import moment from 'moment';
import { AlertCircle, Download, FileSpreadsheet, Loader2, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ResearchProductCard from '@/components/research/ResearchProductCard';
import VerificationBadge from '@/components/research/VerificationBadge';

const ASSUMPTION_FIELDS = [
  { key: 'shipping_cost', label: 'Shipping', suffix: 'EGP' },
  { key: 'advertising_cost', label: 'Ad spend', suffix: 'EGP' },
  { key: 'payment_fee_percent', label: 'Payment fee', suffix: '%' },
  { key: 'packaging_cost', label: 'Packaging', suffix: 'EGP' },
  { key: 'return_rate_percent', label: 'Return rate', suffix: '%' },
  { key: 'other_cost', label: 'Other', suffix: 'EGP' },
];

export default function ResearchReportView({ report }) {
  const [products, setProducts] = useState(report.products || []);
  const [assumptions, setAssumptions] = useState({ currency: 'EGP', ...(report.assumptions || {}) });
  const [recalculating, setRecalculating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setProducts(report.products || []);
    setAssumptions({ currency: 'EGP', ...(report.assumptions || {}) });
    setFile(report.xlsx_file_uri ? { name: 'Previously generated export', url: '' } : null);
    setError('');
  }, [report.id, report.products, report.assumptions, report.xlsx_file_uri]);

  const recalculate = async () => {
    if (!products.length || recalculating) return;
    setRecalculating(true);
    setError('');
    try {
      const results = await Promise.all(
        products.map((product) =>
          base44.functions.invoke('recalcResearch', {
            product,
            selling_price: product.selling_price,
            supplier_cost: product.supplier_price,
            cost_status: product.supplier_price_status,
            assumptions,
          })
        )
      );
      setProducts((prev) =>
        prev.map((product, index) => ({
          ...product,
          profit: results[index]?.data?.profit || product.profit,
          score: results[index]?.data?.score || product.score,
        }))
      );
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'The recalculation failed.');
    } finally {
      setRecalculating(false);
    }
  };

  const exportExcel = async () => {
    if (exporting) return;
    setExporting(true);
    setError('');
    try {
      const response = await base44.functions.invoke('exportResearchXlsx', { report_id: report.id });
      const data = response.data || {};
      if (!data.signed_url) throw new Error(data.error || 'The Excel file could not be generated.');
      setFile({ name: data.file_name, url: data.signed_url });
      try {
        const blob = await (await fetch(data.signed_url)).blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = data.file_name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);
      } catch {
        /* the download link below stays available if the browser blocks the blob */
      }
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'The Excel export failed.');
      setFile(null);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mt-5 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-t border-white/[0.07] pt-4">
        <div className="min-w-0">
          <h3 className="break-words font-heading text-base font-semibold text-white [overflow-wrap:anywhere]">
            {report.query}
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            {report.market} · {(report.suppliers || []).join(', ')} ·{' '}
            {report.researched_at ? moment(report.researched_at).format('D MMM YYYY, HH:mm') : 'just now'} ·{' '}
            {report.product_count} verified product{report.product_count === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[0.6rem] uppercase tracking-[0.14em] text-slate-500">Confidence</span>
          <VerificationBadge status={report.overall_confidence} />
        </div>
      </div>

      {report.limitations?.length > 0 && (
        <ul className="mt-3 space-y-1.5 rounded-xl border border-amber-400/25 bg-amber-500/[0.07] px-3 py-2.5 text-xs leading-relaxed text-amber-100">
          {report.limitations.map((item) => (
            <li key={item} className="flex gap-1.5 break-words [overflow-wrap:anywhere]">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 min-w-0 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Expense assumptions
          </p>
          <button
            type="button"
            onClick={recalculate}
            disabled={recalculating || !products.length}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-white/25 hover:text-white disabled:opacity-50"
          >
            {recalculating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {recalculating ? 'Recalculating…' : 'Recalculate'}
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {ASSUMPTION_FIELDS.map((field) => (
            <label key={field.key} className="min-w-0 text-[0.62rem] uppercase tracking-[0.1em] text-slate-500">
              {field.label}
              <div className="mt-1 flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={assumptions[field.key] ?? ''}
                  onChange={(event) =>
                    setAssumptions((prev) => ({
                      ...prev,
                      [field.key]: event.target.value === '' ? '' : Number(event.target.value),
                    }))
                  }
                  className="w-full rounded-lg border border-white/10 bg-[#05070a]/70 px-2 py-1.5 font-mono text-xs text-white focus:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                />
                <span className="shrink-0 text-[0.6rem] text-slate-600">{field.suffix}</span>
              </div>
            </label>
          ))}
        </div>
        <p className="mt-2 text-[0.68rem] leading-relaxed text-slate-500">
          Gross profit, expenses, net profit, break-even price and every score point are calculated on the server from
          these numbers — the model never does the math. Blank values fall back to the defaults.
        </p>
      </div>

      {error && (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-200">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="break-words [overflow-wrap:anywhere]">{error}</span>
        </p>
      )}

      <div className="mt-4 space-y-4">
        {products.length ? (
          products.map((product) => <ResearchProductCard key={`${product.name}-${product.supplier_url}`} product={product} />)
        ) : (
          <p className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3.5 py-3 text-sm leading-relaxed text-slate-400">
            No product met the evidence standard for this request. Nothing was invented to fill the report — try a more
            specific product name, or connect a supplier account so its catalogue can be read.
          </p>
        )}
      </div>

      {report.sources?.length > 0 && (
        <details className="mt-4 min-w-0 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3.5 py-3">
          <summary className="cursor-pointer text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Evidence sources ({report.sources.length})
          </summary>
          <ul className="mt-2.5 space-y-1.5">
            {report.sources.map((source) => (
              <li key={source.url} className="min-w-0 text-xs">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="break-all text-sky-300 underline decoration-sky-400/30 underline-offset-2 hover:decoration-sky-300"
                >
                  {source.label}
                </a>
                <span className="ml-1.5 text-[0.6rem] uppercase tracking-[0.1em] text-slate-600">{source.kind}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3.5 py-3">
        <button
          type="button"
          onClick={exportExcel}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400 px-4 py-2 text-xs font-semibold text-white transition-transform duration-300 hover:-translate-y-0.5 disabled:opacity-60"
        >
          {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
          {exporting ? 'Generating Excel…' : 'Generate Excel report'}
        </button>
        {file?.url && (
          <a
            href={file.url}
            download={file.name}
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-200 transition-colors hover:border-emerald-300/50"
          >
            <Download className="h-3.5 w-3.5" />
            Download {file.name}
          </a>
        )}
        <span className="text-[0.68rem] text-slate-500">
          {file?.url
            ? 'The workbook is generated on the server and stored privately; this link is signed and expires in an hour.'
            : 'Six sheets: overview, supplier comparison, competitors, profit formulas, demand research, evidence links.'}
        </span>
      </div>
    </div>
  );
}