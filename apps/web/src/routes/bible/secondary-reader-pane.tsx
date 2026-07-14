import { ArrowLeftIcon, XIcon } from 'lucide-react';

import { BibleChapterView } from '@/components/bible/chapter-view';
import { Button } from '@/components/ui/button';
import { useBible } from '@/providers/bible-context';

export type ReaderPaneEntry = {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number | null;
};

export interface SecondaryReaderPaneProps {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number | null;
  readonly paneStack: readonly ReaderPaneEntry[];
  readonly onClose: () => void;
  readonly onBack: () => void;
}

/**
 * Read-only secondary reader pane for cross-ref comparison.
 * Supports stack-based chain navigation with breadcrumbs.
 */
export function SecondaryReaderPane({
  book,
  chapter,
  verse,
  paneStack,
  onClose,
  onBack,
}: SecondaryReaderPaneProps) {
  const bible = useBible();
  const bookInfo = bible.getBook(book);

  const formatBreadcrumb = (entry: ReaderPaneEntry) => {
    const b = bible.getBook(entry.book);
    const name = b?.name ?? `${entry.book}`;
    return entry.verse ? `${name} ${entry.chapter}:${entry.verse}` : `${name} ${entry.chapter}`;
  };

  const header = (
    <header className="flex flex-col border-b border-border px-4 pb-3 pt-4 sm:pt-0 sm:px-0 gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {paneStack.length > 1 && (
            <Button variant="ghost" size="icon-sm" onClick={onBack}>
              <ArrowLeftIcon />
              <span className="sr-only">Back</span>
            </Button>
          )}
          <h2 className="text-xl font-semibold text-foreground">
            {bookInfo?.name} {chapter}
          </h2>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <XIcon />
          <span className="sr-only">Close second pane</span>
        </Button>
      </div>

      {/* Breadcrumb trail */}
      {paneStack.length > 1 && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground overflow-x-auto">
          {paneStack.map((entry, i) => (
            <span key={i} className="flex items-center gap-1 shrink-0">
              {i > 0 && <span className="text-muted-foreground/50">&rarr;</span>}
              <span className={i === paneStack.length - 1 ? 'text-foreground font-medium' : ''}>
                {formatBreadcrumb(entry)}
              </span>
            </span>
          ))}
        </div>
      )}
    </header>
  );

  return (
    <BibleChapterView
      book={book}
      chapter={chapter}
      highlightVerse={verse}
      header={header}
      className="fixed inset-0 z-50 bg-background sm:relative sm:inset-auto sm:z-auto sm:border-l sm:border-border sm:pl-6"
    />
  );
}
