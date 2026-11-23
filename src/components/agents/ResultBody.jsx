import ReactMarkdown from 'react-markdown';

export default function ResultBody({ content, className = '' }) {
  if (!content) return null;
  return (
    <div
      className={`break-words text-sm leading-relaxed text-slate-300 [overflow-wrap:anywhere] [&_a]:break-all [&_a]:text-sky-300 [&_code]:break-all [&_code]:rounded [&_code]:bg-white/[0.06] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.8rem] [&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:font-heading [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-white [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:font-heading [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:uppercase [&_h2]:tracking-[0.12em] [&_h2]:text-sky-200/90 [&_h3]:mb-1.5 [&_h3]:mt-3 [&_h3]:font-semibold [&_h3]:text-white [&_li]:mb-1 [&_li]:ml-5 [&_li]:list-disc [&_ol_li]:list-decimal [&_p]:mb-2.5 [&_strong]:text-white [&_table]:mb-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-white/10 [&_td]:px-2 [&_td]:py-1.5 [&_td]:text-left [&_th]:border [&_th]:border-white/10 [&_th]:bg-white/[0.04] [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left ${className}`}
    >
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}