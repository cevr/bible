import { BIBLE_BOOKS, formatBibleReference, getBibleBook } from '@bible/core/bible-reader';
import { Effect, Option } from 'effect';
import {
  type Component,
  createMemo,
  createSignal,
  For,
  Match,
  Show,
  Suspense,
  Switch,
} from 'solid-js';
import { ipc, runtime } from '../runtime.js';
import { BibleReaderState } from '../services/bible-reader-state.js';
import { LastChapterMemory } from '../services/last-chapter-memory.js';

// Left-rail TOC for Bible mode. Symmetric to TocSidebar (the EGW reader's
// chapter list) but indexed by (book, chapter, verse). Three views:
//   - 'books'    list every Bible book (OT/NT split)
//   - 'chapters' chapter grid for a picked book
//   - 'verses'   verse grid for a picked chapter
//
// Picking a chapter advances to the verse grid (you can still tap "Whole
// chapter" to jump to verse 1 without a specific anchor). Picking a verse
// drives BibleReaderState.openChapterAt, which the Bible canvas honours by
// scrolling + flashing.

const OT_COUNT = 39;

type View =
  | { readonly _tag: 'books' }
  | { readonly _tag: 'chapters'; readonly book: number }
  | { readonly _tag: 'verses'; readonly book: number; readonly chapter: number };

export const BibleTocSidebar: Component<{
  /** Current Bible selection, threaded in from the shell. Used to highlight
   *  the active book/chapter so the TOC always shows the user where they are. */
  readonly currentSelection: () => Option.Option<{
    readonly book: number;
    readonly chapter: number;
  }>;
  /** Called after a verse/chapter is picked so the shell can dismiss the drawer. */
  readonly onPickChapter?: () => void;
}> = (props) => {
  const [view, setView] = createSignal<View>({ _tag: 'books' });

  const openWholeChapter = (book: number, chapter: number): void => {
    void runtime.runPromise(
      Effect.gen(function* () {
        const state = yield* BibleReaderState;
        yield* state.openChapter(book, chapter);
      }),
    );
    props.onPickChapter?.();
  };

  const openVerse = (book: number, chapter: number, verse: number): void => {
    void runtime.runPromise(
      Effect.gen(function* () {
        const state = yield* BibleReaderState;
        yield* state.openChapterAt(book, chapter, verse);
      }),
    );
    props.onPickChapter?.();
  };

  // Chapter click drills into the verse picker instead of jumping straight to
  // the chapter — the user can still tap "Whole chapter" inside the verse
  // view to land at verse 1 (no scroll anchor). Symmetric with EGW where the
  // chapter row drills into paragraphs.
  const onPickChapterCell = (book: number, chapter: number): void => {
    setView({ _tag: 'verses', book, chapter });
  };

  // Book click: if we've been in this book this session, jump straight to the
  // verse picker for the remembered chapter — saves a tap for the user who
  // toggles back-and-forth between Bible and EGW on the same chapter. First
  // visit falls through to the chapter grid.
  const onPickBook = (book: number): void => {
    void runtime
      .runPromise(
        Effect.gen(function* () {
          const memory = yield* LastChapterMemory;
          return yield* memory.getBible(book);
        }),
      )
      .then((remembered) => {
        if (Option.isSome(remembered)) {
          setView({ _tag: 'verses', book, chapter: remembered.value });
        } else {
          setView({ _tag: 'chapters', book });
        }
      });
  };

  // Narrowing via discriminant memos lets the Match arms render with concrete
  // typed view objects, no type assertions needed.
  const chaptersView = createMemo(() => {
    const v = view();
    return v._tag === 'chapters' ? v : null;
  });
  const versesView = createMemo(() => {
    const v = view();
    return v._tag === 'verses' ? v : null;
  });

  return (
    <Switch
      fallback={
        <BibleBooksToc
          currentBook={Option.map(props.currentSelection(), (s) => s.book)}
          onPickBook={onPickBook}
        />
      }
    >
      <Match when={versesView()} keyed>
        {(v) => (
          <BibleVersesToc
            book={v.book}
            chapter={v.chapter}
            onBack={() => setView({ _tag: 'chapters', book: v.book })}
            onOpenChapter={() => openWholeChapter(v.book, v.chapter)}
            onPickVerse={(verse) => openVerse(v.book, v.chapter, verse)}
          />
        )}
      </Match>
      <Match when={chaptersView()} keyed>
        {(v) => (
          <BibleChaptersToc
            book={v.book}
            currentSelection={props.currentSelection()}
            onBack={() => setView({ _tag: 'books' })}
            onPickChapter={onPickChapterCell}
          />
        )}
      </Match>
    </Switch>
  );
};

const BibleBooksToc: Component<{
  readonly currentBook: Option.Option<number>;
  readonly onPickBook: (book: number) => void;
}> = (props) => {
  const oldTestament = createMemo(() => BIBLE_BOOKS.slice(0, OT_COUNT));
  const newTestament = createMemo(() => BIBLE_BOOKS.slice(OT_COUNT));
  const currentBook = createMemo(() => Option.getOrNull(props.currentBook));

  return (
    <div class="flex flex-col gap-5 px-4 py-3">
      <BookGroup
        label="Old Testament"
        books={oldTestament()}
        currentBook={currentBook()}
        onPick={props.onPickBook}
      />
      <BookGroup
        label="New Testament"
        books={newTestament()}
        currentBook={currentBook()}
        onPick={props.onPickBook}
      />
    </div>
  );
};

const BookGroup: Component<{
  readonly label: string;
  readonly books: readonly { readonly number: number; readonly name: string }[];
  readonly currentBook: number | null;
  readonly onPick: (book: number) => void;
}> = (props) => (
  <section class="flex flex-col gap-2">
    <h3 class="text-ui-xs uppercase tracking-[0.08em] text-muted">{props.label}</h3>
    <div class="grid grid-cols-2 gap-x-3 gap-y-1">
      <For each={props.books}>
        {(book) => (
          <button
            type="button"
            class="flex items-center justify-between gap-2 rounded px-2 py-1 text-left text-ui-sm text-fg hover:bg-rule/30 data-[current=true]:bg-accent-soft data-[current=true]:text-accent"
            data-current={book.number === props.currentBook ? 'true' : undefined}
            onClick={() => props.onPick(book.number)}
          >
            <span class="truncate">{book.name}</span>
          </button>
        )}
      </For>
    </div>
  </section>
);

const BibleChaptersToc: Component<{
  readonly book: number;
  readonly currentSelection: Option.Option<{ readonly book: number; readonly chapter: number }>;
  readonly onBack: () => void;
  readonly onPickChapter: (book: number, chapter: number) => void;
}> = (props) => {
  const book = createMemo(() => getBibleBook(props.book));
  const chapters = createMemo(() => {
    const b = book();
    if (!b) return [];
    const out: number[] = [];
    for (let i = 1; i <= b.chapters; i++) out.push(i);
    return out;
  });
  const currentChapter = createMemo(() => {
    const sel = Option.getOrNull(props.currentSelection);
    if (sel === null) return null;
    return sel.book === props.book ? sel.chapter : null;
  });

  return (
    <Show
      when={book()}
      fallback={
        <div class="flex flex-col gap-2 px-4 py-3">
          <p class="text-ui-sm text-muted">Unknown book.</p>
          <BackLink onClick={props.onBack} label="‹ All books" />
        </div>
      }
    >
      {(b) => (
        <div class="flex flex-col gap-3 px-4 py-3">
          <div class="flex items-baseline justify-between gap-2">
            <h3 class="text-ui-base font-medium text-fg">{b().name}</h3>
            <BackLink onClick={props.onBack} label="‹ All books" />
          </div>
          <div class="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-1">
            <For each={chapters()}>
              {(ch) => (
                <button
                  type="button"
                  class="flex h-9 items-center justify-center rounded text-ui-sm text-fg [font-variant-numeric:tabular-nums] hover:bg-rule/30 data-[current=true]:bg-accent-soft data-[current=true]:text-accent"
                  data-current={ch === currentChapter() ? 'true' : undefined}
                  onClick={() => props.onPickChapter(props.book, ch)}
                >
                  {ch}
                </button>
              )}
            </For>
          </div>
        </div>
      )}
    </Show>
  );
};

const BibleVersesToc: Component<{
  readonly book: number;
  readonly chapter: number;
  readonly onBack: () => void;
  readonly onOpenChapter: () => void;
  readonly onPickVerse: (verse: number) => void;
}> = (props) => {
  const title = (): string => formatBibleReference({ book: props.book, chapter: props.chapter });

  return (
    <div class="flex flex-col gap-3 px-4 py-3">
      <div class="flex items-baseline justify-between gap-2">
        <h3 class="text-ui-base font-medium text-fg">{title()}</h3>
        <BackLink onClick={props.onBack} label="‹ Chapters" />
      </div>
      <button
        type="button"
        class="self-start text-ui-xs text-accent hover:underline"
        onClick={props.onOpenChapter}
      >
        Open whole chapter →
      </button>
      <Suspense fallback={<p class="text-ui-xs text-muted">Loading verses…</p>}>
        <BibleVersesGrid
          book={props.book}
          chapter={props.chapter}
          onPickVerse={props.onPickVerse}
        />
      </Suspense>
    </div>
  );
};

const BibleVersesGrid: Component<{
  readonly book: number;
  readonly chapter: number;
  readonly onPickVerse: (verse: number) => void;
}> = (props) => {
  const chapterRes = ipc.bible.getChapter.query(() => ({
    book: props.book,
    chapter: props.chapter,
  }));
  const verses = createMemo<readonly number[]>(() => {
    const c = chapterRes();
    if (c === undefined || c === null) return [];
    return c.verses.map((v) => v.verse);
  });

  return (
    <Show
      when={verses().length > 0}
      fallback={<p class="text-ui-xs text-muted">No verses available for this chapter.</p>}
    >
      <div class="grid grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] gap-1">
        <For each={verses()}>
          {(v) => (
            <button
              type="button"
              class="flex h-9 items-center justify-center rounded text-ui-sm text-fg [font-variant-numeric:tabular-nums] hover:bg-rule/30"
              onClick={() => props.onPickVerse(v)}
            >
              {v}
            </button>
          )}
        </For>
      </div>
    </Show>
  );
};

const BackLink: Component<{ readonly onClick: () => void; readonly label: string }> = (props) => (
  <button type="button" class="text-ui-xs text-muted hover:text-fg" onClick={props.onClick}>
    {props.label}
  </button>
);
