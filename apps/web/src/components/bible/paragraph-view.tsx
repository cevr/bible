/**
 * Paragraph display mode for Bible reading.
 *
 * Renders all verses as continuous text with inline verse numbers,
 * like a printed Bible page. Selected verse gets a subtle highlight.
 */
import { segmentVerseText } from '@bible/core/bible-rendering';
import type { Verse } from '@/data/bible';
import type { MarginNote } from '@/data/concordance/types';
import { renderSegment } from './verse-renderer';

export interface ParagraphViewProps {
  verses: readonly Verse[];
  selectedVerse: number;
  marginNotesByVerse?: Map<number, MarginNote[]>;
  searchQuery?: string;
  onVerseClick: (verse: number) => void;
}

export function ParagraphView({
  verses,
  selectedVerse,
  marginNotesByVerse,
  searchQuery,
  onVerseClick,
}: ParagraphViewProps) {
  return (
    <div className="reading-text leading-[1.9]">
      {verses.map((verse, index) => {
        const verseNumber = verse.reference.verse;
        const notes = marginNotesByVerse?.get(verseNumber) ?? [];
        const segments = segmentVerseText(verse.text, notes, searchQuery);
        const isSelected = selectedVerse === verseNumber;

        return (
          <span key={verseNumber}>
            <sup
              className={`font-sans text-[0.65em] font-semibold text-muted-foreground align-super mr-[0.25em] select-none cursor-pointer tabular-nums ${
                isSelected ? 'text-primary font-bold' : ''
              }`}
              onClick={() => onVerseClick(verseNumber)}
            >
              {verseNumber}
            </sup>
            <span
              className={`cursor-pointer transition-colors duration-100 ${
                isSelected ? 'bg-accent rounded-sm' : ''
              }`}
              onClick={() => onVerseClick(verseNumber)}
              data-verse={verseNumber}
            >
              {'\u2009'}
              {segments.map((segment, i) => renderSegment(segment, notes, i))}
            </span>
            {index < verses.length - 1 ? ' ' : ''}
          </span>
        );
      })}
    </div>
  );
}
