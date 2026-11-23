import { Loader2 } from 'lucide-react';
import TaskCard from '@/components/tasks/TaskCard';

export default function TaskColumn({ column, tasks = [], count = 0, loading = false }) {
  return (
    <section
      aria-label={`${column.label} tasks`}
      className="flex min-h-[17rem] flex-col rounded-2xl border border-white/[0.07] bg-[#0a0f19] p-3"
    >
      <header className="flex items-center justify-between gap-2 px-1 pb-3">
        <div className="min-w-0">
          <p className={`flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.16em] ${column.accent}`}>
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${column.dot}`} />
            {column.label}
          </p>
          <p className="mt-0.5 text-[0.62rem] text-slate-500">{column.hint}</p>
        </div>
        <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[0.68rem] text-slate-400">
          {count}
        </span>
      </header>

      <div className="flex flex-1 flex-col gap-2.5">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}

        {!tasks.length && (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-white/10 px-3 py-8 text-center text-[0.7rem] leading-relaxed text-slate-500">
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading runs…
              </span>
            ) : (
              column.empty
            )}
          </div>
        )}
      </div>
    </section>
  );
}