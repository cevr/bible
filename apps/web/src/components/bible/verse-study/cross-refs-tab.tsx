import { Reference as BibleReference } from '@bible/core/bible';
import { Suspense, useEffect, useMemo, useState, useTransition } from 'react';
import { useNavigate } from 'react-router';

import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { VerseRenderer } from '@/components/bible/verse-renderer';
import {
  CROSS_REF_ABBREVIATIONS,
  CROSS_REF_TYPES,
  type ClassifiedCrossReference,
  type CrossRefType,
} from '@/data/cross-references/types';
import { toBookSlug } from '@/data/bible';
import { useBible } from '@/providers/bible-context';
import { useApp } from '@/providers/db-context';

const TYPE_BADGE_COLORS: Record<CrossRefType, string> = {
  quotation: 'bg-blue-500/20 text-blue-700 dark:text-blue-300',
  allusion: 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300',
  parallel: 'bg-green-500/20 text-green-700 dark:text-green-300',
  typological: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
  prophecy: 'bg-purple-500/20 text-purple-700 dark:text-purple-300',
  sanctuary: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300',
  recapitulation: 'bg-pink-500/20 text-pink-700 dark:text-pink-300',
  thematic: 'bg-gray-500/20 text-gray-700 dark:text-gray-300',
};

const TYPE_BADGES: Record<CrossRefType, { abbr: string; color: string }> = {
  quotation: { abbr: CROSS_REF_ABBREVIATIONS.quotation, color: TYPE_BADGE_COLORS.quotation },
  allusion: { abbr: CROSS_REF_ABBREVIATIONS.allusion, color: TYPE_BADGE_COLORS.allusion },
  parallel: { abbr: CROSS_REF_ABBREVIATIONS.parallel, color: TYPE_BADGE_COLORS.parallel },
  typological: {
    abbr: CROSS_REF_ABBREVIATIONS.typological,
    color: TYPE_BADGE_COLORS.typological,
  },
  prophecy: { abbr: CROSS_REF_ABBREVIATIONS.prophecy, color: TYPE_BADGE_COLORS.prophecy },
  sanctuary: { abbr: CROSS_REF_ABBREVIATIONS.sanctuary, color: TYPE_BADGE_COLORS.sanctuary },
  recapitulation: {
    abbr: CROSS_REF_ABBREVIATIONS.recapitulation,
    color: TYPE_BADGE_COLORS.recapitulation,
  },
  thematic: { abbr: CROSS_REF_ABBREVIATIONS.thematic, color: TYPE_BADGE_COLORS.thematic },
};

const ALL_TYPES: readonly CrossRefType[] = CROSS_REF_TYPES;

type GroupedRefs = {
  type: CrossRefType | null;
  count: number;
  byBook: [number, ClassifiedCrossReference[]][];
}[];

const refKey = (ref: ClassifiedCrossReference, idx: number) =>
  `${ref.source}-${ref.book}-${ref.chapter}-${ref.verse}-${idx}`;

function PopoverVersePeek({
  book,
  chapter,
  verse,
  verseEnd,
}: {
  book: number;
  chapter: number;
  verse: number | null;
  verseEnd: number | null;
}) {
  const app = useApp();
  const verses = app.bible.chapter(BibleReference.chapter(book, chapter)).verses;

  if (verse == null) {
    return <p className="text-xs text-muted-foreground italic">Chapter-level reference</p>;
  }

  const end = verseEnd ?? verse;
  const matched = verses.filter((v) => v.reference.verse >= verse && v.reference.verse <= end);
  if (matched.length === 0) {
    return <p className="text-xs text-muted-foreground italic">Verse not found</p>;
  }

  const MAX_PEEK = 2;
  const clamped = matched.slice(0, MAX_PEEK);
  const remaining = matched.length - clamped.length;

  return (
    <div className="reading-text text-sm flex flex-col gap-1.5">
      {clamped.map((v) => (
        <p key={v.reference.verse}>
          <span className="font-sans text-[0.65em] font-semibold text-muted-foreground align-super mr-[0.25em] select-none">
            {v.reference.verse}
          </span>
          <VerseRenderer text={v.text} />
        </p>
      ))}
      {remaining > 0 && (
        <p className="text-xs text-muted-foreground italic">
          +{remaining} more verse{remaining > 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}

function VersePeekSkeleton() {
  return (
    <div className="flex flex-col gap-2 animate-pulse">
      <div className="h-3 bg-muted rounded w-full" />
      <div className="h-3 bg-muted rounded w-4/5" />
      <div className="h-3 bg-muted rounded w-3/5" />
    </div>
  );
}

export function CrossRefsTab({
  book,
  chapter,
  verse,
  onClose,
  onOpenSecondPane,
}: {
  book: number;
  chapter: number;
  verse: number;
  onClose: () => void;
  onOpenSecondPane?: (ref: ClassifiedCrossReference) => void;
}) {
  const navigate = useNavigate();
  const bible = useBible();
  const app = useApp();

  const crossRefs = app.crossReferences.crossRefs(book, chapter, verse);

  const [editingRefKey, setEditingRefKey] = useState<string | null>(null);
  const [addRefInput, setAddRefInput] = useState('');
  const [, startTransition] = useTransition();

  // Preload first ~10 unique cross-ref chapters so popover feels instant
  useEffect(() => {
    const seen = new Set<string>();
    for (const ref of crossRefs) {
      if (seen.size >= 10) break;
      const key = `${ref.book}-${ref.chapter}`;
      if (!seen.has(key)) {
        seen.add(key);
        app.bible.chapter.preload(BibleReference.chapter(ref.book, ref.chapter));
      }
    }
  }, [crossRefs, app]);

  const navigateToRef = (ref: ClassifiedCrossReference) => {
    const refBook = bible.getBook(ref.book);
    if (refBook) {
      const versePart = ref.verse ? `/${ref.verse}` : '';
      navigate(`/bible/${toBookSlug(refBook.name)}/${ref.chapter}${versePart}`);
      onClose();
    }
  };

  const formatRef = (ref: ClassifiedCrossReference) => {
    const refBook = bible.getBook(ref.book);
    if (!refBook) return `${ref.book}:${ref.chapter}:${ref.verse ?? ''}`;
    const versePart = ref.verse
      ? ref.verseEnd
        ? `:${ref.verse}-${ref.verseEnd}`
        : `:${ref.verse}`
      : '';
    return `${refBook.name} ${ref.chapter}${versePart}`;
  };

  const handleSetType = (ref: ClassifiedCrossReference, type: CrossRefType) => {
    setEditingRefKey(null);
    startTransition(async () => {
      await app.crossReferences.setRefType(
        { book, chapter, verse },
        { book: ref.book, chapter: ref.chapter, verse: ref.verse },
        type,
      );
      app.crossReferences.crossRefs.invalidate(book, chapter, verse);
    });
  };

  const handleAddUserRef = () => {
    if (!addRefInput.trim()) return;
    const parsed = bible.parseReference(addRefInput);
    if (!parsed) return;
    startTransition(async () => {
      await app.crossReferences.addUserCrossRef(
        { book, chapter, verse },
        { book: parsed.book, chapter: parsed.chapter, verse: parsed.verse },
      );
      app.crossReferences.crossRefs.invalidate(book, chapter, verse);
    });
    setAddRefInput('');
  };

  const handleRemoveUserRef = (id: string) => {
    startTransition(async () => {
      await app.crossReferences.removeUserCrossRef(id);
      app.crossReferences.crossRefs.invalidate(book, chapter, verse);
    });
  };

  const grouped = useMemo((): GroupedRefs => {
    const byType = new Map<CrossRefType | null, Map<number, ClassifiedCrossReference[]>>();
    for (const ref of crossRefs) {
      let typeMap = byType.get(ref.classification);
      if (!typeMap) {
        typeMap = new Map();
        byType.set(ref.classification, typeMap);
      }
      let bookList = typeMap.get(ref.book);
      if (!bookList) {
        bookList = [];
        typeMap.set(ref.book, bookList);
      }
      bookList.push(ref);
    }
    // Sort refs within each book by chapter:verse
    for (const [, typeMap] of byType) {
      for (const [, refs] of typeMap) {
        refs.sort((a, b) => a.chapter - b.chapter || (a.verse ?? 0) - (b.verse ?? 0));
      }
    }
    const result: GroupedRefs = [];
    for (const type of ALL_TYPES) {
      const bookMap = byType.get(type);
      if (bookMap) {
        let count = 0;
        for (const [, refs] of bookMap) count += refs.length;
        result.push({ type, count, byBook: [...bookMap] });
      }
    }
    const unclassified = byType.get(null);
    if (unclassified) {
      let count = 0;
      for (const [, refs] of unclassified) count += refs.length;
      result.push({ type: null, count, byBook: [...unclassified] });
    }
    return result;
  }, [crossRefs]);

  const showTypeHeaders = grouped.length > 1;

  const renderRef = (ref: ClassifiedCrossReference, idx: number) => {
    const key = refKey(ref, idx);
    return (
      <div
        key={key}
        className="flex items-start gap-2 p-2 rounded-lg hover:bg-accent transition-colors group relative"
      >
        {/* Type badge */}
        {ref.classification ? (
          <button
            className={`shrink-0 px-1.5 py-0.5 text-[10px] font-mono rounded ${TYPE_BADGES[ref.classification].color} hover:opacity-80 transition-opacity`}
            onClick={() => setEditingRefKey(key)}
            title={ref.classification}
          >
            {TYPE_BADGES[ref.classification].abbr}
          </button>
        ) : (
          <button
            className="shrink-0 px-1.5 py-0.5 text-[10px] font-mono rounded bg-gray-200/50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            onClick={() => setEditingRefKey(key)}
            title="Set type"
          >
            ???
          </button>
        )}

        {/* Reference with verse peek popover */}
        <Popover>
          <PopoverTrigger className="flex-1 text-left min-w-0 cursor-pointer flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">
              {ref.source === 'user' ? '* ' : ''}
              {formatRef(ref)}
            </span>
            {ref.previewText && (
              <p className="text-xs text-muted-foreground line-clamp-1">{ref.previewText}</p>
            )}
            {ref.source === 'user' && ref.userNote && (
              <p className="text-xs italic text-muted-foreground">{ref.userNote}</p>
            )}
          </PopoverTrigger>
          <PopoverContent side="left" className="w-80 gap-2">
            <PopoverHeader>
              <PopoverTitle>{formatRef(ref)}</PopoverTitle>
            </PopoverHeader>
            <Suspense fallback={<VersePeekSkeleton />}>
              <PopoverVersePeek
                book={ref.book}
                chapter={ref.chapter}
                verse={ref.verse}
                verseEnd={ref.verseEnd}
              />
            </Suspense>
            <button
              className="w-full text-left text-sm font-medium text-primary hover:underline cursor-pointer"
              onClick={() => (onOpenSecondPane ? onOpenSecondPane(ref) : navigateToRef(ref))}
            >
              Go to {formatRef(ref)} &rarr;
            </button>
          </PopoverContent>
        </Popover>

        {/* Delete button for user refs */}
        {ref.source === 'user' && (
          <button
            className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-red-500 hover:text-red-700 dark:hover:text-red-300 transition-opacity text-xs px-1"
            onClick={() => handleRemoveUserRef(ref.userRefId)}
            aria-label="Remove cross reference"
          >
            x
          </button>
        )}

        {/* Type picker dropdown */}
        {editingRefKey === key && (
          <div className="absolute right-4 mt-6 z-10 bg-background border border-border rounded-lg shadow-lg p-1 flex flex-col gap-0.5">
            {ALL_TYPES.map((type) => {
              const badge = TYPE_BADGES[type];
              return (
                <button
                  key={type}
                  className="w-full text-left px-2 py-1 text-xs rounded hover:bg-accent flex items-center gap-2"
                  onClick={() => handleSetType(ref, type)}
                >
                  <span className={`px-1 py-0.5 rounded text-[10px] font-mono ${badge.color}`}>
                    {badge.abbr}
                  </span>
                  <span className="text-foreground capitalize">{type}</span>
                </button>
              );
            })}
            <button
              className="w-full text-left px-2 py-1 text-xs rounded hover:bg-accent text-muted-foreground"
              onClick={() => setEditingRefKey(null)}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 px-4 py-3">
          {crossRefs.length > 0 ? (
            <div className="flex flex-col gap-3">
              {grouped.map((group) => (
                <div key={group.type ?? 'unclassified'} className="flex flex-col gap-1.5">
                  {/* Type section header */}
                  {showTypeHeaders && (
                    <div className="flex items-center gap-2">
                      {group.type ? (
                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-mono rounded ${TYPE_BADGES[group.type].color}`}
                        >
                          {TYPE_BADGES[group.type].abbr}
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-gray-200/50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400">
                          ???
                        </span>
                      )}
                      <span className="text-xs font-medium text-muted-foreground capitalize">
                        {group.type ?? 'Unclassified'}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{group.count}</span>
                    </div>
                  )}

                  {/* Books within type */}
                  <div className="flex flex-col gap-2">
                    {group.byBook.map(([bookNum, refs]) => {
                      const bookInfo = bible.getBook(bookNum);
                      return (
                        <div key={bookNum} className="flex flex-col gap-0.5">
                          <h4 className="text-xs font-medium text-muted-foreground px-2">
                            {bookInfo?.name ?? `Book ${bookNum}`}
                          </h4>
                          <div className="flex flex-col gap-0.5">{refs.map(renderRef)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No cross-references found.</p>
          )}

          {/* Add user cross-ref */}
          <div className="pt-3 border-t border-border">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                handleAddUserRef();
              }}
            >
              <input
                type="text"
                placeholder="Add cross-ref (e.g. John 3:16)"
                className="flex-1 px-2 py-1.5 text-sm rounded-lg border border-border bg-transparent text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                value={addRefInput}
                onChange={(e) => setAddRefInput(e.target.value)}
              />
              <button
                type="submit"
                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                disabled={!addRefInput.trim()}
              >
                Add
              </button>
            </form>
          </div>
        </div>
      </ScrollArea>

      <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground shrink-0">
        {crossRefs.length > 0 && <span>{crossRefs.length} cross-references</span>}
      </div>
    </div>
  );
}
