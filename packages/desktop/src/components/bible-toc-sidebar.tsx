import { BIBLE_BOOKS, getBibleBook } from '@bible/core/bible-reader';
import { Effect, Option } from 'effect';
import { type Component, createMemo, createSignal, For, Show } from 'solid-js';
import { runtime } from '../runtime.js';
import { BibleReaderState } from '../services/bible-reader-state.js';
import { LastChapterMemory } from '../services/last-chapter-memory.js';

// Left-rail TOC for Bible mode. Symmetric to TocSidebar (the EGW reader's
// chapter list) but indexed by (book, chapter). Two views:
//   - 'books'    list every Bible book (OT/NT split)
//   - 'chapters' chapter grid for a picked book
//
// Selecting a chapter drives BibleReaderState.openChapter, which the Bible
// chapter canvas (F3.4) subscribes to.

const OT_COUNT = 39;

type View = { readonly _tag: 'books' } | { readonly _tag: 'chapters'; readonly book: number };

export const BibleTocSidebar: Component<{
  /** Current Bible selection, threaded in from the shell. Used to highlight
   *  the active book/chapter so the TOC always shows the user where they are. */
  readonly currentSelection: () => Option.Option<{
    readonly book: number;
    readonly chapter: number;
  }>;
  /** Called after a chapter is picked so the shell can dismiss the drawer. */
  readonly onPickChapter?: () => void;
}> = (props) => {
  const [view, setView] = createSignal<View>({ _tag: 'books' });

  const navigateToChapter = (book: number, chapter: number): void => {
    void runtime.runPromise(
      Effect.gen(function* () {
        const state = yield* BibleReaderState;
        yield* state.openChapter(book, chapter);
      }),
    );
    props.onPickChapter?.();
  };

  // Book click: if we've been in this book this session, jump straight to the
  // last chapter the user was on instead of forcing them through the chapter
  // grid again. First-time book picks fall through to the 2-step picker.
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
          navigateToChapter(book, remembered.value);
        } else {
          setView({ _tag: 'chapters', book });
        }
      });
  };

  const chaptersBook = (): number | null => {
    const v = view();
    return v._tag === 'chapters' ? v.book : null;
  };

  return (
    <Show
      when={chaptersBook()}
      fallback={
        <BibleBooksToc
          currentBook={Option.map(props.currentSelection(), (s) => s.book)}
          onPickBook={onPickBook}
        />
      }
      keyed
    >
      {(book) => (
        <BibleChaptersToc
          book={book}
          currentSelection={props.currentSelection()}
          onBack={() => setView({ _tag: 'books' })}
          onPickChapter={navigateToChapter}
        />
      )}
    </Show>
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
          <BackLink onClick={props.onBack} />
        </div>
      }
    >
      {(b) => (
        <div class="flex flex-col gap-3 px-4 py-3">
          <div class="flex items-baseline justify-between gap-2">
            <h3 class="text-ui-base font-medium text-fg">{b().name}</h3>
            <BackLink onClick={props.onBack} />
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

const BackLink: Component<{ readonly onClick: () => void }> = (props) => (
  <button type="button" class="text-ui-xs text-muted hover:text-fg" onClick={props.onClick}>
    {'‹ All books'}
  </button>
);
