/**
 * EGW Study Panel — floating aside for paragraph-level study tools.
 *
 * Same pattern as VerseStudyPanel: fixed right-side panel that slides in.
 * Tabs: Notes (user notes + markers), References (Bible refs), Details (paragraph metadata).
 */
import { useMemo, useState, useTransition, Suspense } from 'react';
import { XIcon, Trash2 } from 'lucide-react';
import { extractBibleReferences, formatBibleReference } from '@bible/core/bible-reader';
import { nodesToText } from '@bible/core/egw';
import type { EGWParagraph } from '@/data/egw/api';
import type { MarkerColor } from '@/data/study/service';
import { useApp } from '@/providers/db-context';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const MARKER_COLORS: MarkerColor[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
const MARKER_COLOR_MAP: Record<MarkerColor, string> = {
  red: 'bg-red-400',
  orange: 'bg-orange-400',
  yellow: 'bg-yellow-400',
  green: 'bg-green-400',
  blue: 'bg-blue-400',
  purple: 'bg-purple-400',
};

export interface EgwStudyPanelProps {
  paragraph: EGWParagraph | null;
  bookCode?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefClick: (ref: { book: number; chapter: number; verse?: number }) => void;
}

export function EgwStudyPanel({
  paragraph,
  bookCode,
  open,
  onOpenChange,
  onRefClick,
}: EgwStudyPanelProps) {
  const refs = useMemo(() => {
    if (!paragraph) return [];
    return extractBibleReferences(nodesToText(paragraph.nodes));
  }, [paragraph]);

  const title = paragraph?.refcodeShort ?? 'Study';

  return (
    <aside
      className={`fixed top-0 right-0 h-dvh sm:w-[28rem] w-[85vw] bg-background border-l border-border shadow-lg flex flex-col z-40 transition-transform duration-200 ease-in-out ${
        open ? 'translate-x-0' : 'translate-x-full pointer-events-none'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <Button variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)}>
          <XIcon />
          <span className="sr-only">Close</span>
        </Button>
      </div>

      <Tabs defaultValue="notes" className="flex-1 flex flex-col min-h-0">
        <TabsList variant="line" className="px-4 pt-2 w-full shrink-0">
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="references">References</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="notes" className="flex flex-col flex-1 min-h-0">
          {paragraph && bookCode ? (
            <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading…</div>}>
              <EgwNotesTab
                key={`${bookCode}-${paragraph.puborder}`}
                bookCode={bookCode}
                puborder={paragraph.puborder}
              />
            </Suspense>
          ) : (
            <div className="p-4 text-sm text-muted-foreground italic">No paragraph selected.</div>
          )}
        </TabsContent>

        <TabsContent value="references" className="flex flex-col flex-1 min-h-0">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-1">
              {refs.length > 0 ? (
                refs.map((extracted, i) => (
                  <button
                    key={i}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors hover:bg-accent text-primary font-medium"
                    onClick={() => onRefClick(extracted.ref)}
                  >
                    {formatBibleReference(extracted.ref)}
                  </button>
                ))
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No Bible references found in this paragraph.
                </p>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="details" className="flex flex-col flex-1 min-h-0">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              {paragraph ? (
                <dl className="space-y-4">
                  {paragraph.refcodeShort && (
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Refcode
                      </dt>
                      <dd className="mt-1 text-sm text-foreground">{paragraph.refcodeShort}</dd>
                    </div>
                  )}
                  {paragraph.elementType && (
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Element Type
                      </dt>
                      <dd className="mt-1 text-sm text-foreground">{paragraph.elementType}</dd>
                    </div>
                  )}
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground italic">No paragraph selected.</p>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </aside>
  );
}

function EgwNotesTab({ bookCode, puborder }: { bookCode: string; puborder: number }) {
  const app = useApp();
  const [isPending, startTransition] = useTransition();
  const [noteText, setNoteText] = useState('');

  const notes = app.egwNotes(bookCode, puborder);

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    const text = noteText.trim();
    setNoteText('');
    startTransition(async () => {
      await app.addEgwNote(bookCode, puborder, text);
      app.egwNotes.invalidate(bookCode, puborder);
    });
  };

  const handleRemoveNote = (id: string) => {
    startTransition(async () => {
      await app.removeEgwNote(id);
      app.egwNotes.invalidate(bookCode, puborder);
    });
  };

  const handleToggleMarker = (color: MarkerColor) => {
    startTransition(async () => {
      // We don't have markers loaded here directly — just add
      await app.addEgwMarker(bookCode, puborder, color);
    });
  };

  return (
    <ScrollArea className="flex-1">
      <div className="p-4 space-y-4">
        {/* Marker picker */}
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Highlight
          </label>
          <div className="flex gap-2 mt-1.5">
            {MARKER_COLORS.map((color) => (
              <button
                key={color}
                className={`size-6 rounded-full ${MARKER_COLOR_MAP[color]} hover:ring-2 hover:ring-offset-2 hover:ring-offset-background hover:ring-${color}-400 transition-shadow`}
                onClick={() => handleToggleMarker(color)}
                aria-label={`Highlight ${color}`}
              />
            ))}
          </div>
        </div>

        {/* Add note form */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Notes
          </label>
          <div className="flex gap-2">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add a note…"
              className="flex-1 min-h-16 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.metaKey) {
                  e.preventDefault();
                  handleAddNote();
                }
              }}
            />
          </div>
          <button
            className="px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded transition-colors disabled:opacity-50"
            onClick={handleAddNote}
            disabled={!noteText.trim() || isPending}
          >
            Add Note
          </button>
        </div>

        {/* Note list */}
        {notes.length > 0 && (
          <div className="space-y-2">
            {notes.map((note) => (
              <div
                key={note.id}
                className="flex items-start gap-2 px-3 py-2 rounded-lg border border-border"
              >
                <p className="flex-1 text-sm text-foreground whitespace-pre-wrap">{note.content}</p>
                <button
                  className="p-1 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  onClick={() => handleRemoveNote(note.id)}
                  aria-label="Delete note"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
