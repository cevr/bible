import { ClipboardIcon, HashIcon, LinkIcon } from 'lucide-react';

import { MARKER_DOT_COLORS } from '@/components/bible/study-constants';
import { VerseRenderer } from '@/components/bible/verse-renderer';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import type { VerseMarker } from '@/data/annotations/types';
import type { Verse } from '@/data/bible';
import type { MarginNote } from '@/data/concordance/types';

export interface VerseDisplayProps {
  readonly verse: Verse;
  readonly isSelected: boolean;
  readonly marginNotes?: MarginNote[];
  readonly markers?: VerseMarker[];
  readonly searchQuery?: string;
  readonly bookName: string;
  readonly bookSlug: string;
  readonly chapter: number;
  readonly onClick: () => void;
}

// ---------------------------------------------------------------------------
// Copy helpers
// ---------------------------------------------------------------------------

function stripVerseMarkup(text: string): string {
  // Remove KJV markup tags like [add], [ital], etc.
  return text
    .replace(/\[(?:add|ital|divine|paragraph|colophon|inscription|selah)\]/g, '')
    .replace(/\[\/(add|ital|divine|paragraph|colophon|inscription|selah)\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function copyAsText(text: string, ref: string) {
  const clean = stripVerseMarkup(text);
  void navigator.clipboard.writeText(`"${clean}" \u2014 ${ref} KJV`);
}

function copyAsMarkdown(text: string, ref: string) {
  const clean = stripVerseMarkup(text);
  void navigator.clipboard.writeText(`> ${clean}\n> \u2014 *${ref} KJV*`);
}

function copyShareLink(bookSlug: string, chapter: number, verse: number) {
  const url = `${window.location.origin}/bible/${bookSlug}/${chapter}/${verse}`;
  void navigator.clipboard.writeText(url);
}

/**
 * Individual verse display with rich text rendering and context menu.
 */
export function VerseDisplay({
  verse,
  isSelected,
  marginNotes,
  markers,
  searchQuery,
  bookName,
  bookSlug,
  chapter,
  onClick,
}: VerseDisplayProps) {
  const verseNumber = verse.reference.verse;
  const ref = `${bookName} ${chapter}:${verseNumber}`;

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <p
            data-verse={verseNumber}
            className={`cursor-pointer rounded px-2 py-1 transition-colors duration-100 flex items-start gap-1 ${
              isSelected ? 'bg-accent' : 'hover:bg-accent/50'
            }`}
            onClick={onClick}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }}
          />
        }
      >
        {markers && markers.length > 0 && (
          <span className="flex flex-col gap-0.5 mt-1.5 shrink-0">
            {markers.map((m) => (
              <span key={m.id} className={`size-2 rounded-full ${MARKER_DOT_COLORS[m.color]}`} />
            ))}
          </span>
        )}
        <span>
          <span className="font-sans text-[0.65em] font-semibold text-muted-foreground align-super mr-[0.25em] select-none">
            {verseNumber}
          </span>
          <VerseRenderer text={verse.text} marginNotes={marginNotes} searchQuery={searchQuery} />
        </span>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => copyAsText(verse.text, ref)}>
          <ClipboardIcon />
          Copy as text
        </ContextMenuItem>
        <ContextMenuItem onClick={() => copyAsMarkdown(verse.text, ref)}>
          <HashIcon />
          Copy as markdown
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => copyShareLink(bookSlug, chapter, verseNumber)}>
          <LinkIcon />
          Copy share link
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
