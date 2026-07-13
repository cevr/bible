/**
 * BibleChapterView — shared read-only Bible chapter viewer.
 *
 * Renders verses with verse numbers, margin notes, highlight, and click.
 * Used by Bible route's SecondaryReaderPane and EGW route's Bible pane.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { Reference as BibleReference } from '@bible/core/bible';
import { useApp } from '@/providers/db-context';
import { ScrollArea } from '@/components/ui/scroll-area';
import { VerseRenderer } from '@/components/bible/verse-renderer';

export interface BibleChapterViewProps {
  book: number;
  chapter: number;
  highlightVerse?: number | null;
  onVerseClick?: (verse: number) => void;
  header?: ReactNode;
  className?: string;
}

export function BibleChapterView({
  book,
  chapter,
  highlightVerse: highlightVerseProp,
  onVerseClick,
  header,
  className,
}: BibleChapterViewProps) {
  const app = useApp();
  const verses = app.bible.chapter(BibleReference.chapter(book, chapter)).verses;
  const marginNotesByVerse = app.concordance.chapterMarginNotes(book, chapter);

  const highlightedVerse = highlightVerseProp ?? null;

  // Scroll target verse into view
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (highlightedVerse == null) return;
    const el = scrollRef.current?.querySelector(`[data-cv-verse="${highlightedVerse}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedVerse]);

  return (
    <div className={className}>
      {header}
      <ScrollArea className="h-[calc(100dvh-12rem)]">
        <div ref={scrollRef} className="reading-text flex flex-col gap-3 pt-4 px-4 sm:px-0">
          {verses.map((v) => (
            <p
              key={v.reference.verse}
              data-cv-verse={v.reference.verse}
              className={`rounded px-2 py-1 cursor-pointer transition-colors ${
                v.reference.verse === highlightedVerse ? 'bg-accent' : 'hover:bg-accent/50'
              }`}
              onClick={() => onVerseClick?.(v.reference.verse)}
            >
              <span className="font-sans text-[0.65em] font-semibold text-muted-foreground align-super mr-[0.25em] select-none">
                {v.reference.verse}
              </span>
              <VerseRenderer
                text={v.text}
                marginNotes={marginNotesByVerse.get(v.reference.verse)}
              />
            </p>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
