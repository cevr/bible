import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';

import { categorizeBooks } from '@/components/shared/egw-categories';
import type { EGWBookInfo, WritingsSyncStatus } from '@/data/writings/types';
import { useApp } from '@/providers/db-context';

function BookCard({
  book,
  syncStatus,
  isSyncing,
  onSync,
  disabled,
}: {
  book: EGWBookInfo;
  syncStatus: WritingsSyncStatus | undefined;
  isSyncing: boolean;
  onSync: () => void;
  disabled: boolean;
}) {
  const isSynced = syncStatus?.status === 'success';

  return (
    <div className="group rounded-lg border border-border p-4 transition-colors hover:bg-accent">
      <div className="flex items-center justify-between">
        <Link
          to={`/egw/${book.bookCode}`}
          className="font-sans font-semibold text-foreground group-hover:text-primary"
        >
          {book.title}
        </Link>
        <div className="flex items-center gap-2">
          {isSynced ? (
            <span
              className="inline-block size-2 rounded-full bg-green-500"
              title={`Synced (${syncStatus.paragraphCount} paragraphs)`}
            />
          ) : (
            <button
              className="rounded px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-border hover:text-foreground disabled:opacity-50"
              onClick={onSync}
              disabled={isSyncing || disabled}
            >
              {isSyncing ? 'Syncing…' : 'Sync'}
            </button>
          )}
        </div>
      </div>
      <Link to={`/egw/${book.bookCode}`}>
        <div className="mt-1 text-sm text-muted-foreground">{book.bookCode}</div>
        <div className="mt-1 text-xs text-muted-foreground opacity-60">{book.author}</div>
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Book list view
// ---------------------------------------------------------------------------

export function BookListView() {
  const app = useApp();
  const { source, books } = app.writings.egwBooks();

  const [search, setSearch] = useState('');
  const [syncStatus, setSyncStatus] = useState<Map<string, WritingsSyncStatus>>(new Map());
  const [syncing, setSyncing] = useState<Set<string>>(new Set());
  const [fullSyncing, setFullSyncing] = useState(false);

  const filteredBooks = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return books;
    return books.filter(
      (b) =>
        b.bookCode.toLowerCase().includes(q) ||
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q),
    );
  }, [books, search]);

  const categories = useMemo(() => categorizeBooks(filteredBooks), [filteredBooks]);

  const refreshSyncStatus = () => {
    app.writings
      .getSyncStatus()
      .then((statuses) => {
        const map = new Map<string, WritingsSyncStatus>();
        for (const status of statuses) map.set(status.bookCode, status);
        setSyncStatus(map);
      })
      .catch((error) => console.error('Failed to read Writings sync status:', error));
  };

  // Fetch sync status on mount + subscribe to background completions
  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    refreshSyncStatus();
    app.writings
      .watchSyncCompletions(() => {
        refreshSyncStatus();
        app.writings.egwBooks.invalidateAll();
      })
      .then((cleanup) => {
        if (disposed) cleanup();
        else unsubscribe = cleanup;
      })
      .catch((error) => console.error('Failed to watch Writings sync:', error));
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [app]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSyncBook = async (bookCode: string) => {
    setSyncing((prev) => new Set(prev).add(bookCode));
    try {
      await app.writings.syncPublication(bookCode);
      refreshSyncStatus();
      app.writings.egwBooks.invalidateAll();
    } catch (err) {
      console.error(`Sync ${bookCode} failed:`, err);
    } finally {
      setSyncing((prev) => {
        const next = new Set(prev);
        next.delete(bookCode);
        return next;
      });
    }
  };

  const handleSyncAllBc = async () => {
    const bcCodes = ['1BC', '2BC', '3BC', '4BC', '5BC', '6BC', '7BC'];
    /* eslint-disable no-await-in-loop */
    for (const code of bcCodes) {
      if (syncStatus.get(code)?.status === 'success') continue;
      await handleSyncBook(code);
    }
    /* eslint-enable no-await-in-loop */
  };

  const handleFullSync = async () => {
    if (!confirm('This will download ~635MB. Continue?')) return;
    setFullSyncing(true);
    try {
      await app.writings.syncAll();
      app.writings.egwBooks.invalidateAll();
      refreshSyncStatus();
    } catch (err) {
      console.error('Full sync failed:', err);
    } finally {
      setFullSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="border-b border-border pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-sans text-2xl font-semibold text-foreground">
              Ellen G. White Writings
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Select a book to begin reading
              {source !== 'empty' && (
                <span className="ml-2 text-xs opacity-60">
                  ({source === 'local' ? 'offline' : 'server'})
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              onClick={handleSyncAllBc}
              disabled={fullSyncing}
            >
              Sync All BC
            </button>
            <button
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              onClick={handleFullSync}
              disabled={fullSyncing}
            >
              {fullSyncing ? 'Downloading…' : 'Full Sync (~635MB)'}
            </button>
          </div>
        </div>
      </header>

      {books.length > 0 && (
        <input
          type="search"
          placeholder="Filter books…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          spellCheck={false}
        />
      )}

      {books.length === 0 ? (
        <div className="rounded-lg border border-border bg-accent/30 p-4">
          <p className="text-sm text-muted-foreground">
            No books available yet. Use <strong>Full Sync</strong> to download the complete EGW
            database, or <strong>Sync All BC</strong> to fetch Bible Commentary volumes
            incrementally.
          </p>
        </div>
      ) : filteredBooks.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No books matching &ldquo;{search}&rdquo;
        </p>
      ) : (
        <div className="space-y-8">
          {categories.map((cat) => (
            <section key={cat.label}>
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
                {cat.label}
                <span className="ml-2 text-xs font-normal opacity-60">{cat.books.length}</span>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {cat.books.map((book) => (
                  <BookCard
                    key={book.bookId}
                    book={book}
                    syncStatus={syncStatus.get(book.bookCode)}
                    isSyncing={syncing.has(book.bookCode)}
                    onSync={() => handleSyncBook(book.bookCode)}
                    disabled={fullSyncing}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
