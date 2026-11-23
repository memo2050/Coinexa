import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, LayoutGrid, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import Nav from '@/components/site/Nav';
import Footer from '@/components/site/Footer';
import Reveal from '@/components/site/Reveal';
import SectionHeading from '@/components/site/SectionHeading';
import TaskColumn from '@/components/tasks/TaskColumn';
import { TASK_COLUMNS, columnKeyFor } from '@/components/tasks/taskColumns';

const COLUMN_LIMIT = 30;

export default function TaskBoard() {
  const [tasks, setTasks] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    // One page and one total per column: the board never counts loaded records.
    const results = await Promise.all(
      TASK_COLUMNS.map(async (column) => {
        const [page, count] = await Promise.all([
          base44.entities.AgentTask.filter(
            { status: { $in: column.statuses } },
            { sort: '-created_date', limit: COLUMN_LIMIT }
          ),
          base44.entities.AgentTask.count({ status: { $in: column.statuses } }),
        ]);
        return { key: column.key, items: page.items || [], count };
      })
    );

    setTasks(results.flatMap((result) => result.items));
    setCounts(Object.fromEntries(results.map((result) => [result.key, result.count])));
  };

  useEffect(() => {
    let cancelled = false;
    load()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Live board: a run moves column the moment the engine writes its new status.
  useEffect(() => {
    const unsubscribe = base44.entities.AgentTask.subscribe((event) => {
      const data = event?.data;
      if (!data?.id) return;

      if (event.type === 'delete') {
        setTasks((prev) => prev.filter((task) => task.id !== data.id));
        return;
      }

      setTasks((prev) => {
        if (!prev.some((task) => task.id === data.id)) {
          return [data, ...prev].slice(0, COLUMN_LIMIT * TASK_COLUMNS.length);
        }
        return prev.map((task) => (task.id === data.id ? { ...task, ...data } : task));
      });
    });
    return unsubscribe;
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const byColumn = TASK_COLUMNS.reduce((acc, column) => {
    acc[column.key] = tasks.filter((task) => columnKeyFor(task.status) === column.key);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-[#05070a] text-white">
      <Nav />

      <main className="relative pb-20 pt-28 sm:pb-28">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[26rem] overflow-hidden"
        >
          <div className="absolute left-1/2 top-0 h-[24rem] w-[48rem] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(37,99,235,0.16),transparent_68%)]" />
        </div>

        <div className="relative mx-auto w-full max-w-6xl px-5 sm:px-8">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <Reveal>
              <SectionHeading
                eyebrow="Task board"
                title="Every agent run,"
                highlight="at a glance"
                description="What is waiting, what is executing right now, and what has finished — updated live as your agents work."
              />
            </Reveal>

            <Reveal delay={0.1}>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={refresh}
                  disabled={refreshing}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:border-white/25 hover:text-white disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
                <Link
                  to="/agents"
                  className="group inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_-14px_rgba(34,211,238,0.9)] transition-transform duration-300 hover:-translate-y-0.5"
                >
                  <LayoutGrid className="h-4 w-4" />
                  Your agents
                </Link>
              </div>
            </Reveal>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {TASK_COLUMNS.map((column) => (
              <TaskColumn
                key={column.key}
                column={column}
                tasks={byColumn[column.key]}
                count={counts[column.key] || 0}
                loading={loading}
              />
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
            <p>
              Runs move between columns automatically. Approvals are decided on the agent that raised
              them.
            </p>
            <Link
              to="/agents"
              className="inline-flex items-center gap-1.5 text-slate-400 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to agents
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}