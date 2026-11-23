import { useCallback, useEffect, useState } from 'react';
import { Loader2, Lock, MailOpen } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import InboxHeader from '@/components/inbox/InboxHeader';
import InboxStats from '@/components/inbox/InboxStats';
import InboxToolbar from '@/components/inbox/InboxToolbar';
import InquiryRow from '@/components/inbox/InquiryRow';
import InquiryDetail from '@/components/inbox/InquiryDetail';
import { SORT_OPTIONS } from '@/components/inbox/inboxUtils';

const PAGE_SIZE = 20;

export default function AdminInbox() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [statusFilter, setStatusFilter] = useState('all');
  const [sortValue, setSortValue] = useState('newest');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [counts, setCounts] = useState(null);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const sortSpec = SORT_OPTIONS.find((option) => option.value === sortValue)?.sort || '-created_date';

  const buildQuery = useCallback(() => {
    const query = {};
    if (statusFilter !== 'all') query.status = statusFilter;
    if (debouncedSearch) {
      query.$or = [
        { name: { $regex: debouncedSearch, $options: 'i' } },
        { email: { $regex: debouncedSearch, $options: 'i' } },
      ];
    }
    return query;
  }, [statusFilter, debouncedSearch]);

  const loadCounts = useCallback(async () => {
    try {
      const [all, newCount, review, contacted, closed] = await Promise.all([
        base44.entities.Inquiry.count(),
        base44.entities.Inquiry.count({ status: 'new' }),
        base44.entities.Inquiry.count({ status: 'in_review' }),
        base44.entities.Inquiry.count({ status: 'contacted' }),
        base44.entities.Inquiry.count({ status: 'closed' }),
      ]);
      setCounts({ all, new: newCount, in_review: review, contacted, closed });
    } catch (countError) {
      console.error('Could not load inquiry counts', countError);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return undefined;
    let active = true;
    setLoading(true);
    setError('');

    base44.entities.Inquiry.filter(buildQuery(), { sort: sortSpec, limit: PAGE_SIZE })
      .then((page) => {
        if (!active) return;
        setItems(page.items || []);
        setCursor(page.next_cursor ?? null);
        setHasMore(Boolean(page.has_more));
      })
      .catch((loadError) => {
        if (active) setError(loadError?.message || 'Could not load inquiries.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isAdmin, buildQuery, sortSpec]);

  useEffect(() => {
    if (isAdmin) loadCounts();
  }, [isAdmin, loadCounts]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await base44.entities.Inquiry.filter(buildQuery(), {
        sort: sortSpec,
        limit: PAGE_SIZE,
        cursor,
      });
      setItems((prev) => [...prev, ...(page.items || [])]);
      setCursor(page.next_cursor ?? null);
      setHasMore(Boolean(page.has_more));
    } catch (loadError) {
      setError(loadError?.message || 'Could not load more inquiries.');
    } finally {
      setLoadingMore(false);
    }
  };

  const changeStatus = async (inquiry, nextStatus) => {
    if (!inquiry || inquiry.status === nextStatus) return;
    setBusy(true);
    setError('');
    try {
      await base44.entities.Inquiry.update(inquiry.id, { status: nextStatus });
      const updated = { ...inquiry, status: nextStatus };
      setSelected((prev) => (prev && prev.id === inquiry.id ? updated : prev));
      setItems((prev) => {
        if (statusFilter !== 'all' && nextStatus !== statusFilter) {
          return prev.filter((item) => item.id !== inquiry.id);
        }
        return prev.map((item) => (item.id === inquiry.id ? updated : item));
      });
      loadCounts();
    } catch (updateError) {
      setError(updateError?.message || 'Could not update that inquiry.');
    } finally {
      setBusy(false);
    }
  };

  const deleteInquiry = async (inquiry) => {
    setBusy(true);
    setError('');
    try {
      await base44.entities.Inquiry.delete(inquiry.id);
      setItems((prev) => prev.filter((item) => item.id !== inquiry.id));
      setSelected(null);
      loadCounts();
    } catch (deleteError) {
      setError(deleteError?.message || 'Could not delete that inquiry.');
    } finally {
      setBusy(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background font-body text-foreground">
        <InboxHeader />
        <main className="mx-auto w-full max-w-lg px-5 py-24 text-center sm:px-8">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-slate-400">
            <Lock className="h-5 w-5" />
          </span>
          <h1 className="mt-5 font-heading text-2xl font-semibold text-white">Studio admins only</h1>
          <p className="mt-2 text-sm text-slate-400">
            Your account does not have access to the inquiry inbox. Ask a studio admin to grant you
            the admin role.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-body text-foreground">
      <InboxHeader />

      <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-sky-300">
          Studio inbox
        </p>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-[-0.02em] text-white sm:text-4xl">
          Project inquiries
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Every message sent through the contact form lands here.
        </p>

        <InboxStats counts={counts} />

        <InboxToolbar
          status={statusFilter}
          counts={counts}
          search={search}
          sort={sortValue}
          onStatusChange={setStatusFilter}
          onSearchChange={setSearch}
          onSortChange={setSortValue}
        />

        {error && (
          <p className="mt-4 rounded-xl border border-rose-400/25 bg-rose-400/[0.07] px-4 py-3 text-xs text-rose-300">
            {error}
          </p>
        )}

        <div className="mt-6 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center rounded-2xl border border-white/[0.08] bg-[#0a0f19] py-16">
              <Loader2 className="h-5 w-5 animate-spin text-sky-300" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-white/[0.08] bg-[#0a0f19] px-6 py-16 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-slate-500">
                <MailOpen className="h-5 w-5" />
              </span>
              <h2 className="mt-4 font-heading text-lg font-semibold text-white">
                Nothing here yet
              </h2>
              <p className="mt-1.5 max-w-sm text-sm text-slate-400">
                {debouncedSearch || statusFilter !== 'all'
                  ? 'No inquiries match these filters. Try clearing the search or choosing another status.'
                  : 'New inquiries will appear as soon as a visitor sends the contact form.'}
              </p>
            </div>
          ) : (
            items.map((inquiry) => (
              <InquiryRow key={inquiry.id} inquiry={inquiry} onOpen={setSelected} />
            ))
          )}
        </div>

        {hasMore && !loading && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-xs font-medium text-slate-300 transition-colors hover:border-white/25 hover:text-white disabled:opacity-60"
            >
              {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {loadingMore ? 'Loading' : 'Load more'}
            </button>
          </div>
        )}
      </main>

      <InquiryDetail
        inquiry={selected}
        busy={busy}
        onClose={() => setSelected(null)}
        onStatusChange={changeStatus}
        onDelete={deleteInquiry}
      />
    </div>
  );
}