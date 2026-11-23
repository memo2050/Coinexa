import { ExternalLink, ImageOff } from 'lucide-react';
import { Image } from '@/components/ui/image';
import VerificationBadge from '@/components/research/VerificationBadge';
import ProfitBreakdown from '@/components/research/ProfitBreakdown';
import ScoreBreakdown from '@/components/research/ScoreBreakdown';
import { STOCK_LABELS, money } from '@/components/research/researchHelpers';
import moment from 'moment';

export default function ResearchProductCard({ product }) {
  const currency = product.currency || 'EGP';
  const linkVerified = product.supplier_url_status === 'VERIFIED';

  return (
    <article className="min-w-0 rounded-2xl border border-white/[0.08] bg-[#0a0f19] p-4 sm:p-5">
      <div className="flex min-w-0 items-start gap-3">
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
          {product.image_url ? (
            <Image src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <ImageOff className="h-5 w-5 text-slate-600" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="break-words font-heading text-base font-semibold leading-snug text-white [overflow-wrap:anywhere]">
            {product.name}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[0.62rem] uppercase tracking-[0.1em] text-slate-300">
              {product.supplier_name || 'Supplier unknown'}
            </span>
            <VerificationBadge status={product.confidence} />
            <span className="text-[0.62rem] uppercase tracking-[0.1em] text-slate-500">
              {STOCK_LABELS[product.stock_status] || 'Availability unknown'}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="min-w-0 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-2">
          <p className="text-[0.58rem] uppercase tracking-[0.12em] text-slate-500">Supplier price</p>
          <p className="mt-0.5 break-words font-mono text-slate-200">{money(product.supplier_price, currency)}</p>
          <VerificationBadge status={product.supplier_price_status} className="mt-1" />
        </div>
        <div className="min-w-0 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-2">
          <p className="text-[0.58rem] uppercase tracking-[0.12em] text-slate-500">Selling price</p>
          <p className="mt-0.5 break-words font-mono text-slate-200">{money(product.selling_price, currency)}</p>
          <VerificationBadge status={product.selling_price_status} className="mt-1" />
        </div>
        <div className="min-w-0 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-2">
          <p className="text-[0.58rem] uppercase tracking-[0.12em] text-slate-500">Net profit</p>
          <p className="mt-0.5 break-words font-mono text-emerald-300">{money(product.profit?.net_profit, currency)}</p>
          <p className="mt-0.5 text-[0.6rem] text-slate-500">
            {product.profit?.margin_percent === null || product.profit?.margin_percent === undefined
              ? 'margin unknown'
              : `${product.profit.margin_percent}% margin`}
          </p>
        </div>
        <div className="min-w-0 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-2">
          <p className="text-[0.58rem] uppercase tracking-[0.12em] text-slate-500">Verified</p>
          <p className="mt-0.5 break-words text-slate-200">
            {product.verified_at ? moment(product.verified_at).format('D MMM, HH:mm') : '—'}
          </p>
          <p className="mt-0.5 text-[0.6rem] text-slate-500">{product.supplier_name || 'supplier unknown'}</p>
        </div>
      </div>

      <div
        className={`mt-3 min-w-0 rounded-xl border px-3 py-2.5 text-xs ${
          linkVerified
            ? 'border-emerald-400/20 bg-emerald-500/[0.06] text-emerald-100'
            : 'border-rose-400/25 bg-rose-500/[0.07] text-rose-100'
        }`}
      >
        {linkVerified ? (
          <a
            href={product.supplier_url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex max-w-full items-center gap-1.5 break-all underline decoration-emerald-400/40 underline-offset-2 hover:decoration-emerald-300"
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            <span className="break-all">{product.supplier_url}</span>
          </a>
        ) : (
          <p className="break-words [overflow-wrap:anywhere]">
            <span className="font-semibold uppercase tracking-[0.1em]">Link unverified.</span>{' '}
            {product.supplier_url_reason || 'No supplier product page could be confirmed.'}
            {product.supplier_url ? (
              <a
                href={product.supplier_url}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-1 block break-all text-rose-200/80 underline decoration-rose-400/40"
              >
                {product.supplier_url} (unconfirmed)
              </a>
            ) : null}
          </p>
        )}
      </div>

      <ProfitBreakdown profit={product.profit} />
      <ScoreBreakdown score={product.score} />

      {product.competitors?.length > 0 && (
        <div className="mt-4 min-w-0">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Egyptian competitors observed
          </p>
          <ul className="mt-2 space-y-1.5">
            {product.competitors.map((competitor) => (
              <li key={`${competitor.name}-${competitor.url}`} className="flex min-w-0 items-baseline justify-between gap-3 text-xs">
                <span className="min-w-0 break-words text-slate-300">
                  {competitor.url ? (
                    <a
                      href={competitor.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="break-all text-sky-300 underline decoration-sky-400/30 underline-offset-2 hover:decoration-sky-300"
                    >
                      {competitor.name}
                    </a>
                  ) : (
                    competitor.name
                  )}
                </span>
                <span className="shrink-0 font-mono text-slate-400">
                  {money(competitor.price, currency)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Customer problem</p>
          <p className="mt-1.5 break-words text-xs leading-relaxed text-slate-300">
            {product.pain_point || 'Not established.'}
          </p>
          <p className="mt-2 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Target audience</p>
          <p className="mt-1.5 break-words text-xs leading-relaxed text-slate-300">
            {product.target_audience || 'Not established.'}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Demand evidence</p>
          {product.demand_evidence?.length ? (
            <ul className="mt-1.5 space-y-1.5">
              {product.demand_evidence.map((item, index) => (
                <li key={`${item.statement}-${index}`} className="break-words text-xs leading-relaxed text-slate-300">
                  {item.statement}{' '}
                  {item.source_url ? (
                    <a
                      href={item.source_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="break-all text-sky-300 underline decoration-sky-400/30 underline-offset-2"
                    >
                      source
                    </a>
                  ) : (
                    <span className="text-[0.6rem] uppercase tracking-[0.1em] text-rose-300/70">no source</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-xs text-slate-500">No sourced demand signal was found.</p>
          )}
        </div>
      </div>

      {(product.advantages?.length > 0 || product.disadvantages?.length > 0 || product.saturation) && (
        <div className="mt-3 space-y-2 text-xs leading-relaxed">
          {product.saturation && (
            <p className="break-words text-slate-400">
              <span className="text-slate-500">Saturation: </span>
              {product.saturation}
            </p>
          )}
          {product.advantages?.length > 0 && (
            <p className="break-words text-slate-400">
              <span className="text-slate-500">Advantages: </span>
              {product.advantages.join(' · ')}
            </p>
          )}
          {product.disadvantages?.length > 0 && (
            <p className="break-words text-slate-400">
              <span className="text-slate-500">Disadvantages: </span>
              {product.disadvantages.join(' · ')}
            </p>
          )}
        </div>
      )}

      <p className="mt-4 break-words rounded-xl border border-sky-400/20 bg-sky-500/[0.07] px-3 py-2.5 text-xs leading-relaxed text-sky-100">
        <span className="font-semibold uppercase tracking-[0.1em]">Recommendation: </span>
        {product.recommendation}
      </p>
    </article>
  );
}