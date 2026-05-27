import { Suspense, useState, useCallback, useMemo, useTransition } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import { Search } from 'lucide-react';
import { useApp } from '@/providers/db-context';
import { useBible } from '@/providers/bible-context';
import { toBookSlug } from '@/data/bible';

// OT books: 1-39, NT books: 40-66
const OT_RANGE = Array.from({ length: 39 }, (_, i) => i + 1);
const NT_RANGE = Array.from({ length: 27 }, (_, i) => i + 40);

export default function SearchRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const bookParam = searchParams.get('book') ?? '';
  const page = parseInt(searchParams.get('page') ?? '0', 10);

  const [inputValue, setInputValue] = useState(q);
  const [isPending, startTransition] = useTransition();

  const bookFilter = useMemo(
    () => (bookParam ? bookParam.split(',').map(Number).filter(Boolean) : []),
    [bookParam],
  );

  const handleSearch = useCallback(
    (newQuery: string) => {
      startTransition(() => {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set('q', newQuery);
          next.delete('page');
          return next;
        });
      });
    },
    [setSearchParams],
  );

  const handleFilterChange = useCallback(
    (books: number[]) => {
      startTransition(() => {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          if (books.length > 0) {
            next.set('book', books.join(','));
          } else {
            next.delete('book');
          }
          next.delete('page');
          return next;
        });
      });
    },
    [setSearchParams],
  );

  const handleLoadMore = useCallback(() => {
    startTransition(() => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        const currentPage = parseInt(prev.get('page') ?? '0', 10);
        next.set('page', String(currentPage + 1));
        return next;
      });
    });
  }, [setSearchParams]);

  return (
    <div className="space-y-6">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSearch(inputValue);
          }}
          placeholder="Search the Bible…"
          className="w-full pl-10 pr-4 py-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          autoFocus
        />
      </div>

      {/* Filters */}
      <FilterBar bookFilter={bookFilter} onFilterChange={handleFilterChange} />

      {/* Results */}
      {q.trim().length >= 2 ? (
        <Suspense fallback={<p className="text-center text-muted-foreground py-12">Searching…</p>}>
          <SearchResults
            query={q}
            bookFilter={bookFilter}
            page={page}
            onLoadMore={handleLoadMore}
            isPending={isPending}
          />
        </Suspense>
      ) : (
        <p className="text-center text-muted-foreground py-12">
          {q.trim().length > 0
            ? 'Type at least 2 characters to search'
            : 'Enter a search term to find verses'}
        </p>
      )}
    </div>
  );
}

function FilterBar({
  bookFilter,
  onFilterChange,
}: {
  bookFilter: number[];
  onFilterChange: (books: number[]) => void;
}) {
  const isOT = bookFilter.length > 0 && bookFilter.every((b) => b >= 1 && b <= 39);
  const isNT = bookFilter.length > 0 && bookFilter.every((b) => b >= 40 && b <= 66);

  return (
    <div className="flex gap-2 flex-wrap">
      <button
        className={`px-3 py-1 text-xs rounded-full border transition-colors ${
          bookFilter.length === 0
            ? 'border-primary bg-primary/10 text-foreground'
            : 'border-border text-muted-foreground hover:text-foreground'
        }`}
        onClick={() => onFilterChange([])}
      >
        All
      </button>
      <button
        className={`px-3 py-1 text-xs rounded-full border transition-colors ${
          isOT
            ? 'border-primary bg-primary/10 text-foreground'
            : 'border-border text-muted-foreground hover:text-foreground'
        }`}
        onClick={() => onFilterChange(OT_RANGE)}
      >
        Old Testament
      </button>
      <button
        className={`px-3 py-1 text-xs rounded-full border transition-colors ${
          isNT
            ? 'border-primary bg-primary/10 text-foreground'
            : 'border-border text-muted-foreground hover:text-foreground'
        }`}
        onClick={() => onFilterChange(NT_RANGE)}
      >
        New Testament
      </button>
    </div>
  );
}

const PAGE_SIZE = 20;

function SearchResults({
  query,
  bookFilter,
  page,
  onLoadMore,
  isPending,
}: {
  query: string;
  bookFilter: number[];
  page: number;
  onLoadMore: () => void;
  isPending: boolean;
}) {
  const app = useApp();
  const bible = useBible();
  const navigate = useNavigate();

  const limit = (page + 1) * PAGE_SIZE;
  const { results, total } = app.searchVersesWithCount(query, {
    bookFilter: bookFilter.length > 0 ? bookFilter : undefined,
    limit,
    offset: 0,
  });

  if (results.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-12">
        No results for &ldquo;{query}&rdquo;
      </p>
    );
  }

  const hasMore = results.length < total;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {total} result{total !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
      </p>

      <div className="space-y-2">
        {results.map((result) => {
          const book = bible.getBook(result.book);
          return (
            <button
              key={`${result.book}-${result.chapter}-${result.verse}`}
              className="w-full text-left px-4 py-3 rounded-lg border border-border hover:bg-accent transition-colors"
              onClick={() => {
                if (book) {
                  navigate(`/bible/${toBookSlug(book.name)}/${result.chapter}/${result.verse}`);
                }
              }}
            >
              <div className="text-xs font-medium text-muted-foreground mb-1">
                {book?.name ?? `Book ${result.book}`} {result.chapter}:{result.verse}
              </div>
              <div
                className="text-sm text-foreground line-clamp-2 [&_mark]:bg-yellow-200/60 [&_mark]:dark:bg-yellow-500/30 [&_mark]:rounded [&_mark]:px-0.5"
                dangerouslySetInnerHTML={{ __html: result.text }}
              />
            </button>
          );
        })}
      </div>

      {hasMore && (
        <div className="flex justify-center py-4">
          <button
            className="px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-50"
            onClick={onLoadMore}
            disabled={isPending}
          >
            {isPending ? 'Loading…' : `Load more (${results.length} of ${total})`}
          </button>
        </div>
      )}
    </div>
  );
}
