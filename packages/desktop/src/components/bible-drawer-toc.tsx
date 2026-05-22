import { BIBLE_BOOKS, getBibleBook } from '@bible/core/bible-reader';
import { type Component, createMemo, For, Show } from 'solid-js';
import type { BibleDrawerState } from '../services/bible-drawer-state.js';

// TOC views for the drawer body. Render in-place where the chapter pane
// usually lives — same width, same scroll container — so the user always
// stays inside the drawer chrome (header / study pane). The state machine
// in BibleDrawerState owns which view is active; these components only
// render and dispatch back via state.openBookToc / state.navigate.

const OT_COUNT = 39;

/** Top-level: every book of the Bible, split into OT (39) and NT (27). The
 *  currently-loaded book is highlighted so `g` round-trips feel anchored. */
export const BooksToc: Component<{ readonly state: BibleDrawerState }> = (props) => {
  const currentBook = createMemo(() => {
    const s = props.state.status();
    return s._tag === 'ready' ? s.chapter.book : null;
  });
  const oldTestament = createMemo(() => BIBLE_BOOKS.slice(0, OT_COUNT));
  const newTestament = createMemo(() => BIBLE_BOOKS.slice(OT_COUNT));

  return (
    <div class="flex flex-col gap-5">
      <BookGroup
        label="Old Testament"
        books={oldTestament()}
        currentBook={currentBook()}
        onPick={(book) => props.state.openBookToc(book)}
      />
      <BookGroup
        label="New Testament"
        books={newTestament()}
        currentBook={currentBook()}
        onPick={(book) => props.state.openBookToc(book)}
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

/** Chapter grid for one book. Includes a back link to the books TOC so the
 *  user doesn't have to reach for `g` again to climb back up. */
export const ChaptersToc: Component<{
  readonly state: BibleDrawerState;
  readonly book: number;
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
    const s = props.state.status();
    if (s._tag !== 'ready') return null;
    return s.chapter.book === props.book ? s.chapter.chapter : null;
  });

  return (
    <Show
      when={book()}
      fallback={
        <div class="flex flex-col gap-2">
          <p class="text-ui-sm text-muted">Unknown book.</p>
          <BackToBooksLink onClick={() => props.state.openBooksToc()} />
        </div>
      }
    >
      {(b) => (
        <div class="flex flex-col gap-3">
          <div class="flex items-baseline justify-between gap-2">
            <h3 class="text-ui-base font-medium text-fg">{b().name}</h3>
            <BackToBooksLink onClick={() => props.state.openBooksToc()} />
          </div>
          <div class="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-1">
            <For each={chapters()}>
              {(ch) => (
                <button
                  type="button"
                  class="flex h-9 items-center justify-center rounded text-ui-sm text-fg [font-variant-numeric:tabular-nums] hover:bg-rule/30 data-[current=true]:bg-accent-soft data-[current=true]:text-accent"
                  data-current={ch === currentChapter() ? 'true' : undefined}
                  onClick={() => props.state.navigate(props.book, ch)}
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

const BackToBooksLink: Component<{ readonly onClick: () => void }> = (props) => (
  <button type="button" class="text-ui-xs text-muted hover:text-fg" onClick={props.onClick}>
    {'‹ All books'}
  </button>
);
