import { useState, useEffect, Suspense } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Reference as BibleReference } from '@bible/core/bible';
import { useBible } from '@/providers/bible-context';
import { useOverlay, useOverlayData } from '@/providers/overlay-context';
import { useApp } from '@/providers/db-context';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HighlightMatch } from '@/components/shared/highlight-match';
import { BOOK_ALIASES, toBookSlug, type Reference } from '@/data/bible';

interface DisplayResult {
  reference: Reference;
  text: string;
}

export function SearchOverlay() {
  const { overlay, closeOverlay } = useOverlay();
  const searchData = useOverlayData('search');
  const navigate = useNavigate();
  const bible = useBible();

  const isOpen = overlay === 'search';

  const [query, setQuery] = useState('');
  const [searchScope, setSearchScope] = useState<'chapter' | 'global'>('chapter');

  // Pre-fill query on open
  useEffect(() => {
    if (isOpen && searchData?.query) {
      setQuery(searchData.query);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Current book/chapter from URL
  const params = useParams<{ book?: string; chapter?: string }>();
  const currentBookNumber = (() => {
    const bookParam = params.book?.toLowerCase();
    if (!bookParam) return 1;
    const spaced = bookParam.replace(/-/g, ' ');
    const aliasNum = BOOK_ALIASES[spaced] ?? BOOK_ALIASES[bookParam];
    if (aliasNum) return aliasNum;
    const book = bible.books.find((b) => b.name.toLowerCase() === spaced);
    if (book) return book.number;
    const num = parseInt(bookParam, 10);
    if (String(num) === bookParam && num >= 1 && num <= 66) return num;
    return 1;
  })();
  const currentChapter = parseInt(params.chapter ?? '1', 10) || 1;

  const handleClose = () => {
    searchData?.onSearch?.(query);
    closeOverlay();
  };

  const navigateToResult = (result: DisplayResult) => {
    const book = bible.getBook(result.reference.book);
    if (book) {
      navigate(
        `/bible/${toBookSlug(book.name)}/${result.reference.chapter}/${result.reference.verse}`,
      );
      searchData?.onSearch?.(query);
      closeOverlay();
    }
  };

  const q = query.toLowerCase().trim();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        className="top-1/4 translate-y-0 p-0 gap-0 w-full max-w-xl rounded-xl bg-background border border-border overflow-hidden"
        showCloseButton={false}
        initialFocus={false}
      >
        {/* Header with scope toggle */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <span className="text-sm font-medium text-muted-foreground">Search verses</span>
          <div className="flex gap-1 text-xs">
            <button
              className={`px-2 py-1 rounded transition-colors ${
                searchScope === 'chapter'
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setSearchScope('chapter')}
            >
              This chapter
            </button>
            <button
              className={`px-2 py-1 rounded transition-colors ${
                searchScope === 'global'
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setSearchScope('global')}
            >
              All Bible
            </button>
          </div>
        </div>

        {/* Search input */}
        <div className="px-4 pb-2">
          <input
            id="search-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            placeholder="Search for words or phrases…"
            className="w-full bg-transparent text-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded"
          />
        </div>

        <div className="border-t border-border" />

        {/* Results */}
        <ScrollArea className="max-h-80">
          {q.length < 2 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              Type at least 2 characters to search
            </p>
          ) : (
            <Suspense
              fallback={
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">Searching…</p>
              }
            >
              <SearchResults
                query={q}
                scope={searchScope}
                bookNumber={currentBookNumber}
                chapter={currentChapter}
                onSelect={navigateToResult}
              />
            </Suspense>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground flex items-center gap-4">
          <span>
            <kbd className="rounded bg-border px-1">↵</kbd> select
          </span>
          <span>
            <kbd className="rounded bg-border px-1">esc</kbd> close
          </span>
          {q.length >= 2 && (
            <button
              className="ml-auto text-primary hover:text-primary/80 transition-colors"
              onClick={() => {
                navigate(`/search?q=${encodeURIComponent(q)}`);
                closeOverlay();
              }}
            >
              See all results &rarr;
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SearchResults({
  query,
  scope,
  bookNumber,
  chapter,
  onSelect,
}: {
  query: string;
  scope: 'chapter' | 'global';
  bookNumber: number;
  chapter: number;
  onSelect: (result: DisplayResult) => void;
}) {
  const app = useApp();
  const bible = useBible();

  let results: DisplayResult[];

  if (scope === 'chapter') {
    const verses = app.bible.chapter(BibleReference.chapter(bookNumber, chapter)).verses;
    results = verses
      .filter((v) => v.text.toLowerCase().includes(query))
      .map((v) => ({
        reference: v.reference,
        text: v.text,
      }))
      .slice(0, 20);
  } else {
    const searchResults = app.bible.search(query, 20);
    results = searchResults.map((hit) => ({
      reference: hit.verse.reference,
      text: hit.verse.text,
    }));
  }

  if (results.length === 0) {
    return <p className="px-4 py-6 text-center text-sm text-muted-foreground">No results found</p>;
  }

  return (
    <div className="p-2 space-y-1">
      {results.map((result) => {
        const book = bible.getBook(result.reference.book);
        return (
          <button
            key={`${result.reference.book}-${result.reference.chapter}-${result.reference.verse}`}
            className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent transition-colors"
            onClick={() => onSelect(result)}
          >
            <div className="text-xs text-muted-foreground mb-0.5">
              {book?.name} {result.reference.chapter}:{result.reference.verse}
            </div>
            <div className="text-sm text-foreground line-clamp-2">
              <HighlightMatch text={result.text} query={query} />
            </div>
          </button>
        );
      })}
    </div>
  );
}
