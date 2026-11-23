export default function SectionHeading({ eyebrow, title, highlight, description, align = 'left' }) {
  const centered = align === 'center';
  return (
    <div className={centered ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      <div
        className={`inline-flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-sky-300/90 ${
          centered ? 'justify-center' : ''
        }`}
      >
        <span className="h-1 w-1 rounded-full bg-sky-400" />
        {eyebrow}
      </div>
      <h2 className="mt-5 font-heading text-3xl font-semibold leading-[1.12] tracking-[-0.02em] text-white sm:text-4xl md:text-[2.85rem]">
        {title} {highlight && <span className="text-gradient">{highlight}</span>}
      </h2>
      {description && (
        <p className="mt-5 text-base leading-relaxed text-slate-400 sm:text-[1.05rem]">{description}</p>
      )}
    </div>
  );
}