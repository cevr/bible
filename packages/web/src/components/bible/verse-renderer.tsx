/**
 * Rich verse text renderer.
 *
 * Transforms raw verse text into styled JSX with:
 * - Red-letter text (single angle quotes -> curly quotes, colored spans)
 * - Italic translator additions ([brackets] -> <em>)
 * - Pilcrow removal (leading paragraph mark)
 * - Margin note superscripts with popover details
 * - Search term highlighting
 */
import { type ReactNode } from 'react';
import {
  type TextSegment,
  formatNoteType,
  noteLabel,
  segmentVerseText,
} from '@bible/core/bible-rendering';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import type { MarginNote } from '@/data/study/service';

// --- Components ---

export interface VerseRendererProps {
  text: string;
  marginNotes?: MarginNote[];
  searchQuery?: string;
}

/** Render a single text segment to JSX. */
export function renderSegment(
  segment: TextSegment,
  marginNotes: MarginNote[],
  key: string | number,
): ReactNode {
  switch (segment.type) {
    case 'margin': {
      const note = marginNotes.find((n) => n.noteIndex === segment.noteIndex);
      if (!note)
        return (
          <sup
            key={key}
            className="text-[0.75em] font-semibold text-muted-foreground align-super cursor-help mx-[0.05em] select-none font-[family-name:var(--reading-font-family,var(--font-serif))]"
          >
            {noteLabel(segment.noteIndex)}
          </sup>
        );
      return <MarginNoteSup key={key} note={note} />;
    }
    case 'highlight':
      return (
        <mark key={key} className="bg-accent text-foreground rounded-sm px-px font-semibold">
          {segment.text}
        </mark>
      );
    case 'italic':
      return (
        <em key={key} className="italic opacity-85">
          {segment.text}
        </em>
      );
    case 'redLetter':
      return (
        <span key={key} className="text-[var(--red-letter)]">
          {segment.text}
        </span>
      );
    case 'redLetterItalic':
      return (
        <em key={key} className="text-[var(--red-letter)] italic opacity-85">
          {segment.text}
        </em>
      );
    case 'redLetterQuote':
      return (
        <span key={key} className="text-[var(--red-letter)]">
          {segment.text}
        </span>
      );
    case 'text':
      return <span key={key}>{segment.text}</span>;
  }
}

/** Margin note superscript with popover. */
function MarginNoteSup({ note }: { note: MarginNote }) {
  return (
    <Popover>
      <PopoverTrigger
        className="text-[0.75em] font-semibold text-muted-foreground align-super cursor-pointer mx-[0.05em] select-none leading-none hover:text-primary transition-colors font-[family-name:var(--reading-font-family,var(--font-serif))]"
        aria-label={`Margin note ${noteLabel(note.noteIndex)}`}
      >
        {noteLabel(note.noteIndex)}
      </PopoverTrigger>
      <PopoverContent
        className="reading-text max-w-[280px] rounded-lg bg-background border border-border shadow-lg p-3"
        sideOffset={4}
      >
        <div className="space-y-1">
          <p>
            <span className="text-muted-foreground">{formatNoteType(note.noteType)}</span>
            <strong className="text-foreground">{note.phrase}</strong>
          </p>
          <p className="text-foreground">{note.noteText}</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function VerseRenderer({ text, marginNotes = [], searchQuery }: VerseRendererProps) {
  const segments = segmentVerseText(text, marginNotes, searchQuery);

  return <>{segments.map((segment, i) => renderSegment(segment, marginNotes, i))}</>;
}
