import { BIBLE_BOOKS, getBibleBook } from '@bible/core/bible-reader';
import { Effect } from 'effect';
import { type Component, createMemo, createSignal, For, Show } from 'solid-js';
import { runtime } from '../runtime.js';
import { BibleReaderState } from '../services/bible-reader-state.js';

// Full-canvas books/chapters picker. Mounted as the empty state of the Bible
// main canvas: when no chapter has ever been opened (or after the user closes
// a chapter), we show the same two-step machine as the left-rail TOC, but
// rendered as a roomy grid of book cards (OT/NT split). Picking a book swaps
// to a chapter grid; picking a chapter calls openChapter and the canvas swaps
// itself out for the reader.

const OT_COUNT = 39;

type View = { readonly _tag: 'books' } | { readonly _tag: 'chapters'; readonly book: number };

export const BibleBooksGrid: Component = () => {
  const [view, setView] = createSignal<View>({ _tag: 'books' });

  const onPickChapter = (book: number, chapter: number): void => {
    void runtime.runPromise(
      Effect.gen(function* () {
        const state = yield* BibleReaderState;
        yield* state.openChapter(book, chapter);
      }),
    );
  };

  const chaptersBook = (): number | null => {
    const v = view();
    return v._tag === 'chapters' ? v.book : null;
  };

  return (
    <div class="mx-auto max-w-[var(--reader-width,68ch)] px-6 py-10">
      <Show
        when={chaptersBook()}
        fallback={<BooksGrid onPickBook={(book) => setView({ _tag: 'chapters', book })} />}
        keyed
      >
        {(book) => (
          <ChaptersGrid
            book={book}
            onBack={() => setView({ _tag: 'books' })}
            onPickChapter={onPickChapter}
          />
        )}
      </Show>
    </div>
  );
};

const BooksGrid: Component<{ readonly onPickBook: (book: number) => void }> = (props) => {
  const oldTestament = createMemo(() => BIBLE_BOOKS.slice(0, OT_COUNT));
  const newTestament = createMemo(() => BIBLE_BOOKS.slice(OT_COUNT));
  return (
    <div class="flex flex-col gap-10">
      <BookSection label="Old Testament" books={oldTestament()} onPick={props.onPickBook} />
      <BookSection label="New Testament" books={newTestament()} onPick={props.onPickBook} />
    </div>
  );
};

const BookSection: Component<{
  readonly label: string;
  readonly books: readonly {
    readonly number: number;
    readonly name: string;
    readonly chapters: number;
  }[];
  readonly onPick: (book: number) => void;
}> = (props) => (
  <section class="flex flex-col gap-4">
    <h2 class="m-0 text-ui-sm font-semibold tracking-[0.08em] uppercase text-muted">
      {props.label}
    </h2>
    <div class="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
      <For each={props.books}>
        {(book) => (
          <button
            type="button"
            class="flex flex-col items-start gap-0.5 rounded-md border border-rule bg-bg px-3 py-3 text-left text-fg cursor-pointer transition-[background,border-color] duration-[0.12s] ease-in-out hover:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] hover:border-accent focus-visible:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] focus-visible:border-accent focus-visible:outline-none"
            onClick={() => props.onPick(book.number)}
          >
            <span class="text-ui-base font-medium truncate w-full">{book.name}</span>
            <span class="text-ui-xs text-muted [font-variant-numeric:tabular-nums]">
              {book.chapters} ch
            </span>
          </button>
        )}
      </For>
    </div>
  </section>
);

const ChaptersGrid: Component<{
  readonly book: number;
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

  return (
    <Show
      when={book()}
      fallback={
        <div class="flex flex-col gap-3">
          <p class="text-ui-sm text-muted">Unknown book.</p>
          <BackLink onClick={props.onBack} />
        </div>
      }
    >
      {(b) => (
        <div class="flex flex-col gap-5">
          <div class="flex items-baseline justify-between gap-3">
            <h1 class="m-0 text-ui-2xl font-semibold tracking-[-0.005em] text-fg">{b().name}</h1>
            <BackLink onClick={props.onBack} />
          </div>
          <div class="grid grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] gap-1.5">
            <For each={chapters()}>
              {(ch) => (
                <button
                  type="button"
                  class="flex h-11 items-center justify-center rounded-md border border-rule bg-bg text-ui-base text-fg [font-variant-numeric:tabular-nums] cursor-pointer transition-[background,border-color] duration-[0.12s] ease-in-out hover:bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] hover:border-accent focus-visible:bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] focus-visible:border-accent focus-visible:outline-none"
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
  <button
    type="button"
    class="text-ui-sm text-muted hover:text-fg cursor-pointer bg-transparent border-0 p-0"
    onClick={props.onClick}
  >
    {'‹ All books'}
  </button>
);
