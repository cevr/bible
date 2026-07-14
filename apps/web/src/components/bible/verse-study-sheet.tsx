/**
 * Verse Study Panel — right-side panel for verse study tools.
 *
 * The panel owns verse-level actions and assembles independently suspending
 * Notes, Cross-Refs, Words, and EGW study domains.
 */
import { Suspense, useMemo, useRef, useState, useTransition } from 'react';
import { BookMarkedIcon, XIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { STUDY_PANEL_WIDTH } from '@/components/bible/study-constants';
import { CrossRefsTab } from '@/components/bible/verse-study/cross-refs-tab';
import { EgwTab } from '@/components/bible/verse-study/egw-tab';
import { NotesTab } from '@/components/bible/verse-study/notes-tab';
import { WordsTab } from '@/components/bible/verse-study/words-tab';
import type { MarkerColor, VerseMarker } from '@/data/annotations/types';
import type { ClassifiedCrossReference } from '@/data/cross-references/types';
import { useBible } from '@/providers/bible-context';
import { useApp } from '@/providers/db-context';

export type StudyTab = 'notes' | 'cross-refs' | 'words' | 'egw';

export interface VerseStudyPanelProps {
  book: number;
  chapter: number;
  verse: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTab?: StudyTab;
  onTabChange?: (tab: StudyTab) => void;
  onOpenSecondPane?: (ref: ClassifiedCrossReference) => void;
  verseMarkers?: VerseMarker[];
}

const EMPTY_MARKERS: VerseMarker[] = [];

const MARKER_COLORS: { color: MarkerColor; bg: string; ring: string }[] = [
  { color: 'red', bg: 'bg-red-500', ring: 'ring-red-500' },
  { color: 'orange', bg: 'bg-orange-500', ring: 'ring-orange-500' },
  { color: 'yellow', bg: 'bg-yellow-400', ring: 'ring-yellow-400' },
  { color: 'green', bg: 'bg-green-500', ring: 'ring-green-500' },
  { color: 'blue', bg: 'bg-blue-500', ring: 'ring-blue-500' },
  { color: 'purple', bg: 'bg-purple-500', ring: 'ring-purple-500' },
];

function MarkerPicker({
  activeColors,
  onToggle,
}: {
  activeColors: Set<MarkerColor>;
  onToggle: (color: MarkerColor) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {MARKER_COLORS.map(({ color, bg, ring }) => (
        <button
          key={color}
          className={`size-4 rounded-full transition-[opacity,transform,box-shadow] ${bg} ${
            activeColors.has(color)
              ? `ring-2 ${ring} ring-offset-1 ring-offset-background scale-110`
              : 'opacity-40 hover:opacity-70'
          }`}
          onClick={() => onToggle(color)}
          aria-label={`Toggle ${color} marker`}
        />
      ))}
    </div>
  );
}

function CollectionChips({
  book,
  chapter,
  verse,
}: {
  book: number;
  chapter: number;
  verse: number;
}) {
  const app = useApp();
  const verseCollections = app.collections.verseCollections(book, chapter, verse);
  const allCollections = app.collections.collections();
  const [showPicker, setShowPicker] = useState(false);
  const [newName, setNewName] = useState('');
  const [, startTransition] = useTransition();

  const verseCollectionIds = new Set(verseCollections.map((collection) => collection.id));
  const availableCollections = allCollections.filter(
    (collection) => !verseCollectionIds.has(collection.id),
  );

  const handleAdd = (collectionId: string) => {
    startTransition(async () => {
      await app.collections.addVerseToCollection(collectionId, book, chapter, verse);
      app.collections.verseCollections.invalidate(book, chapter, verse);
    });
    setShowPicker(false);
  };

  const handleRemove = (collectionId: string) => {
    startTransition(async () => {
      await app.collections.removeVerseFromCollection(collectionId, book, chapter, verse);
      app.collections.verseCollections.invalidate(book, chapter, verse);
    });
  };

  const handleCreateAndAdd = () => {
    const name = newName.trim();
    if (!name) return;
    startTransition(async () => {
      const collection = await app.collections.createCollection(name);
      await app.collections.addVerseToCollection(collection.id, book, chapter, verse);
      app.collections.collections.invalidateAll();
      app.collections.verseCollections.invalidate(book, chapter, verse);
    });
    setNewName('');
    setShowPicker(false);
  };

  if (verseCollections.length === 0 && !showPicker) {
    return (
      <div className="px-4 pb-2">
        <button
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setShowPicker(true)}
        >
          + Add to collection
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 pb-2 flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1">
        {verseCollections.map((collection) => (
          <span
            key={collection.id}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-accent text-foreground"
          >
            {collection.color && (
              <span
                className="size-2 rounded-full shrink-0"
                style={{ backgroundColor: collection.color }}
              />
            )}
            {collection.name}
            <button
              className="-mr-1 p-0.5 text-muted-foreground hover:text-red-500 transition-colors rounded-full"
              onClick={() => handleRemove(collection.id)}
              aria-label={`Remove from ${collection.name}`}
            >
              <XIcon className="size-3" />
            </button>
          </span>
        ))}
        <button
          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1"
          onClick={() => setShowPicker(!showPicker)}
        >
          +
        </button>
      </div>

      {showPicker && (
        <div className="flex flex-col gap-1 p-2 rounded-lg border border-border bg-background">
          {availableCollections.map((collection) => (
            <button
              key={collection.id}
              className="text-left text-xs px-2 py-1 rounded hover:bg-accent transition-colors"
              onClick={() => handleAdd(collection.id)}
            >
              {collection.name}
            </button>
          ))}
          <form
            className="flex gap-1 mt-1"
            onSubmit={(event) => {
              event.preventDefault();
              handleCreateAndAdd();
            }}
          >
            <input
              type="text"
              placeholder="New collection…"
              className="flex-1 px-2 py-1 text-xs rounded border border-border bg-transparent text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
            <button
              type="submit"
              className="px-2 py-1 text-xs rounded bg-primary text-primary-foreground disabled:opacity-50"
              disabled={!newName.trim()}
            >
              Create
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

const TabFallback = <p className="text-sm text-muted-foreground italic p-4">Loading…</p>;

export function VerseStudyPanel({
  book,
  chapter,
  verse,
  open,
  onOpenChange,
  activeTab = 'notes',
  onTabChange,
  onOpenSecondPane,
  verseMarkers = EMPTY_MARKERS,
}: VerseStudyPanelProps) {
  const bible = useBible();
  const app = useApp();
  const bookInfo = bible.getBook(book);
  const title = bookInfo ? `${bookInfo.name} ${chapter}:${verse}` : `${book} ${chapter}:${verse}`;
  const activeColors = useMemo(
    () => new Set(verseMarkers.map((marker) => marker.color)),
    [verseMarkers],
  );
  const [, startMarkerTransition] = useTransition();
  const [memoryAdded, setMemoryAdded] = useState(false);
  const memoryTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleToggleMarker = (color: MarkerColor) => {
    startMarkerTransition(async () => {
      const existing = verseMarkers.find((marker) => marker.color === color);
      if (existing) {
        await app.annotations.removeVerseMarker(existing.id);
      } else {
        await app.annotations.addVerseMarker(book, chapter, verse, color);
      }
      app.annotations.chapterMarkers.invalidate(book, chapter);
    });
  };

  const handleAddToMemory = () => {
    startMarkerTransition(async () => {
      await app.practice.addMemoryVerse(book, chapter, verse);
      app.practice.memoryVerses.invalidateAll();
      setMemoryAdded(true);
      clearTimeout(memoryTimerRef.current);
      memoryTimerRef.current = setTimeout(() => setMemoryAdded(false), 2000);
    });
  };

  return (
    <aside
      className={`fixed top-0 right-0 h-dvh ${STUDY_PANEL_WIDTH} w-[85vw] bg-background border-l border-border shadow-lg flex flex-col z-40 transition-transform duration-200 ease-in-out ${
        open ? 'translate-x-0' : 'translate-x-full pointer-events-none'
      }`}
    >
      <div className="flex flex-col border-b border-border shrink-0">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <MarkerPicker activeColors={activeColors} onToggle={handleToggleMarker} />
            <button
              className="p-1 text-muted-foreground hover:text-primary transition-colors"
              onClick={handleAddToMemory}
              aria-label="Add to memory verses"
              title="Add to memory verses"
            >
              <BookMarkedIcon className={`size-4 ${memoryAdded ? 'text-primary' : ''}`} />
            </button>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)}>
            <XIcon />
            <span className="sr-only">Close</span>
          </Button>
        </div>
        <Suspense fallback={null}>
          <CollectionChips book={book} chapter={chapter} verse={verse} />
        </Suspense>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => onTabChange?.(value as StudyTab)}
        className="flex-1 flex flex-col min-h-0"
      >
        <TabsList variant="line" className="px-4 pt-2 w-full shrink-0">
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="cross-refs">Cross-Refs</TabsTrigger>
          <TabsTrigger value="words">Words</TabsTrigger>
          <TabsTrigger value="egw">EGW</TabsTrigger>
        </TabsList>

        <TabsContent value="notes" className="flex flex-col flex-1 min-h-0">
          <Suspense fallback={TabFallback}>
            <NotesTab
              key={`${book}-${chapter}-${verse}`}
              book={book}
              chapter={chapter}
              verse={verse}
            />
          </Suspense>
        </TabsContent>

        <TabsContent value="cross-refs" className="flex flex-col flex-1 min-h-0">
          <Suspense fallback={TabFallback}>
            <CrossRefsTab
              key={`${book}-${chapter}-${verse}`}
              book={book}
              chapter={chapter}
              verse={verse}
              onClose={() => onOpenChange(false)}
              onOpenSecondPane={onOpenSecondPane}
            />
          </Suspense>
        </TabsContent>

        <TabsContent value="words" className="flex flex-col flex-1 min-h-0 p-4">
          <Suspense fallback={TabFallback}>
            <WordsTab
              key={`${book}-${chapter}-${verse}`}
              book={book}
              chapter={chapter}
              verse={verse}
              onClose={() => onOpenChange(false)}
            />
          </Suspense>
        </TabsContent>

        <TabsContent value="egw" className="flex flex-col flex-1 min-h-0">
          <Suspense fallback={TabFallback}>
            <EgwTab book={book} chapter={chapter} verse={verse} />
          </Suspense>
        </TabsContent>
      </Tabs>
    </aside>
  );
}
