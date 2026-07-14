import { Suspense, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { WordModeView } from '@/components/bible/word-mode-view';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toBookSlug } from '@/data/bible';
import { useBible } from '@/providers/bible-context';
import { useApp } from '@/providers/db-context';

export function WordsTab({
  book,
  chapter,
  verse,
  onClose,
}: {
  book: number;
  chapter: number;
  verse: number;
  onClose: () => void;
}) {
  const app = useApp();
  const words = app.concordance.verseWords(book, chapter, verse);

  const [selectedWordIndex, setSelectedWordIndex] = useState(0);
  const [selectedStrongs, setSelectedStrongs] = useState<string | null>(null);
  const [concordanceQuery, setConcordanceQuery] = useState('');

  // Derive Strong's number from concordance input
  const concordanceStrongs = (() => {
    const q = concordanceQuery.trim().toUpperCase();
    return /^[HG]\d+$/.test(q) ? q : null;
  })();

  // Use concordance input if active, otherwise word selection
  const activeStrongs = concordanceStrongs ?? selectedStrongs;

  return (
    <div className="flex flex-col gap-4 h-full">
      {words.length > 0 && (
        <div className="reading-text shrink-0">
          <WordModeView
            words={words}
            selectedIndex={selectedWordIndex}
            onSelectWord={setSelectedWordIndex}
            onOpenStrongs={(num) => {
              setSelectedStrongs(num);
              setConcordanceQuery('');
            }}
          />
        </div>
      )}

      {/* Concordance search */}
      <div className="shrink-0">
        <input
          type="text"
          value={concordanceQuery}
          onChange={(e) => {
            setConcordanceQuery(e.target.value);
            if (e.target.value.trim()) setSelectedStrongs(null);
          }}
          placeholder="Look up Strong's # (e.g. H157, G26)"
          className="w-full px-2 py-1.5 text-sm rounded-lg border border-border bg-transparent text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary font-mono"
        />
      </div>

      {activeStrongs && (
        <Suspense
          fallback={
            <div className="border-t border-border pt-3">
              <p className="text-sm text-muted-foreground italic">Loading…</p>
            </div>
          }
        >
          <StrongsDetail
            strongsNumber={activeStrongs}
            currentBook={book}
            currentChapter={chapter}
            currentVerse={verse}
            onClose={onClose}
          />
        </Suspense>
      )}

      {!activeStrongs && words.length === 0 && (
        <p className="text-sm text-muted-foreground">No word data available.</p>
      )}
    </div>
  );
}

function StrongsDetail({
  strongsNumber,
  currentBook,
  currentChapter,
  currentVerse,
  onClose,
}: {
  strongsNumber: string;
  currentBook: number;
  currentChapter: number;
  currentVerse: number;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const bible = useBible();
  const app = useApp();

  const entry = app.concordance.strongsEntry(strongsNumber);
  const usage = app.concordance.searchByStrongs(strongsNumber);

  const usageListRef = useRef<HTMLDivElement>(null);

  // Scroll current verse into view
  useEffect(() => {
    const viewport = usageListRef.current?.querySelector('[data-slot="scroll-area-viewport"]');
    const current = usageListRef.current?.querySelector('[data-current="true"]');
    if (!viewport || !current) return;
    const viewportRect = viewport.getBoundingClientRect();
    const currentRect = current.getBoundingClientRect();
    const offset =
      currentRect.top - viewportRect.top - viewportRect.height / 2 + currentRect.height / 2;
    viewport.scrollTop += offset;
  }, [strongsNumber]);

  if (!entry) return null;

  const navigateToVerse = (b: number, ch: number, v: number) => {
    const bookInfo = bible.getBook(b);
    if (bookInfo) {
      navigate(`/bible/${toBookSlug(bookInfo.name)}/${ch}/${v}`);
      onClose();
    }
  };

  const formatRef = (b: number, ch: number, v: number) => {
    const bookInfo = bible.getBook(b);
    return bookInfo ? `${bookInfo.name} ${ch}:${v}` : `${b}:${ch}:${v}`;
  };

  const languageColor =
    entry.language === 'hebrew' ? 'text-[--strongs-hebrew]' : 'text-[--strongs-greek]';

  return (
    <div className="border-t border-border pt-3 flex flex-col gap-3 flex-1 min-h-0">
      <div className="flex items-baseline gap-3">
        <span className={`font-mono text-lg font-bold ${languageColor}`}>{entry.number}</span>
        <span className="font-serif text-xl text-foreground">{entry.lemma}</span>
      </div>

      {(entry.transliteration || entry.pronunciation) && (
        <div className="text-sm text-muted-foreground">
          {entry.transliteration && (
            <span className="font-serif italic">{entry.transliteration}</span>
          )}
          {entry.pronunciation && <span className="ml-2">({entry.pronunciation})</span>}
        </div>
      )}

      <p className="text-sm text-foreground leading-relaxed">{entry.definition}</p>

      {entry.kjvDefinition && (
        <div className="text-xs text-muted-foreground">
          <span className="font-semibold">KJV:</span> {entry.kjvDefinition}
        </div>
      )}

      {/* Usage */}
      <div className="border-t border-border pt-3 flex flex-col gap-2 flex-1 min-h-0">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Usage
          {usage.length > 0 && (
            <span className="ml-1 normal-case tracking-normal font-normal">
              ({usage.length} verses)
            </span>
          )}
        </h4>
        {usage.length > 0 ? (
          <ScrollArea ref={usageListRef} className="flex-1 min-h-0">
            <div className="flex flex-col gap-0.5">
              {usage.map((result, i) => {
                const isCurrent =
                  result.book === currentBook &&
                  result.chapter === currentChapter &&
                  result.verse === currentVerse;
                return (
                  <button
                    key={`${result.book}-${result.chapter}-${result.verse}-${i}`}
                    data-current={isCurrent || undefined}
                    className={`w-full text-left px-2 py-1 rounded hover:bg-accent transition-colors flex items-baseline gap-2 ${
                      isCurrent ? 'bg-accent/50' : ''
                    }`}
                    onClick={() => navigateToVerse(result.book, result.chapter, result.verse)}
                  >
                    <span className="text-xs font-medium text-muted-foreground w-32 shrink-0">
                      {formatRef(result.book, result.chapter, result.verse)}
                    </span>
                    {result.wordText && (
                      <span className="text-xs text-foreground">{result.wordText}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        ) : (
          <p className="text-xs text-muted-foreground">No other uses found.</p>
        )}
      </div>
    </div>
  );
}
