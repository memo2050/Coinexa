import { AlertTriangle } from 'lucide-react';

export default function LegalReviewNote({ children }) {
  return (
    <div className="mt-3 flex gap-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-4">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
      <p className="text-xs leading-relaxed text-amber-200/90">
        <span className="font-semibold uppercase tracking-[0.12em]">Requires legal review — </span>
        {children}
      </p>
    </div>
  );
}