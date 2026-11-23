export default function EmptyState({ title, description, action }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/[0.1] bg-white/[0.015] px-5 py-8 text-center">
      <p className="font-heading text-sm font-semibold text-slate-300">{title}</p>
      {description && (
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-500">{description}</p>
      )}
      {action}
    </div>
  );
}