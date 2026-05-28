import {
  BIBLE_BOOKS,
  formatBibleReference,
  getBibleBook,
  parseBibleQuery,
  type ParsedBibleQuery,
} from '@bible/core/bible-reader';
import { Effect, Fiber, Option } from 'effect';
import {
  type Component,
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  on,
  onCleanup,
  Show,
  Switch,
  untrack,
} from 'solid-js';
import { defaultEase, Motion, Presence } from '../motion/index.js';
import { ipc, runtime } from '../runtime.js';
import { BibleReaderState, type BibleReaderSelection } from '../services/bible-reader-state.js';
import { commandPaletteMemory, type PaletteSnapshot } from '../services/command-palette-memory.js';

// Cmd+K palette for Bible navigation.
//
// Layered view model that mirrors where the user is:
//   - root        → all 66 books (or filtered by query)
//   - book        → chapters of that book
//   - chapter     → verses of that chapter (fetched via ipc.bible.getChapter)
//
// The search input runs `parseBibleQuery` against `@bible/core` on every
// keystroke. A successful parse short-circuits the drilldown UI: the rows
// become "preview" rows describing where Enter will jump. An unparseable
// query at the books view falls back to substring filtering on book names.
//
// Keyboard:
//   - ArrowDown/ArrowUp navigates the visible list (wraps)
//   - Enter activates the highlighted row
//   - Backspace on an empty query pops back up the view stack
//   - Escape closes (handled by parent onOpenChange)
//
// We don't use Portal — same convention as Drawer. Caller mounts at shell
// level; the overlay is fixed at z-[60] which sits above drawers (z-50).

// The view layer of the palette state union. `PaletteState` (below) carries
// activeIdx alongside view+query so transitions are atomic — no window where
// `view` has advanced but `activeIdx` is still pointing at the previous
// view's row count.
type PaletteView =
  | { readonly _tag: 'root' }
  | { readonly _tag: 'book'; readonly book: number }
  | { readonly _tag: 'chapter'; readonly book: number; readonly chapter: number };

// One state object instead of three independent signals. activeIdx is
// scoped to (view, query) — setView and setQuery both reset it to 0
// implicitly via withView / withQuery helpers, so a stale activeIdx after
// drill or keystroke is unrepresentable.
interface PaletteState {
  readonly view: PaletteView;
  readonly query: string;
  readonly activeIdx: number;
}

// Action emitted by `resolveAction` for a row activation. The palette JSX
// dispatches it (drilldown OR navigate-and-close). Pure shape keeps the
// resolution rules testable without a DOM or runtime.
type PaletteAction =
  | { readonly kind: 'openChapter'; readonly book: number; readonly chapter: number }
  | {
      readonly kind: 'openChapterAt';
      readonly book: number;
      readonly chapter: number;
      readonly verse: number;
    }
  | { readonly kind: 'drilldown'; readonly view: PaletteView };

// A row that the user can highlight + activate. Concrete shape depends on
// what the view is showing — discriminated so the renderer / activator can
// pick the right action.
export type Row =
  | { readonly kind: 'book'; readonly id: string; readonly book: number; readonly label: string }
  | {
      readonly kind: 'chapter';
      readonly id: string;
      readonly book: number;
      readonly chapter: number;
      readonly label: string;
    }
  | {
      readonly kind: 'verse';
      readonly id: string;
      readonly book: number;
      readonly chapter: number;
      readonly verse: number;
      readonly label: string;
    }
  | {
      readonly kind: 'parsed';
      readonly id: string;
      readonly parsed: ParsedBibleQuery;
      readonly label: string;
      readonly hint: string;
    };

export interface CommandPaletteProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Current Bible selection — used to seed the view (root vs book vs
   *  chapter) so the palette opens in context. */
  readonly currentSelection: () => Option.Option<BibleReaderSelection>;
}

const PARSED_ID = 'parsed';

export const CommandPalette: Component<CommandPaletteProps> = (props) => {
  // Single source of truth. Transitions that change view or query funnel
  // through `setView` / `setQuery` helpers below — both reset activeIdx so
  // a stale highlight cannot survive a drilldown or keystroke. Arrow keys
  // and the per-rows reset effect adjust activeIdx in isolation.
  const [paletteState, setPaletteState] = createSignal<PaletteState>({
    view: { _tag: 'root' },
    query: '',
    activeIdx: 0,
  });
  const view = (): PaletteView => paletteState().view;
  const query = (): string => paletteState().query;
  const activeIdx = (): number => paletteState().activeIdx;
  const setView = (next: PaletteView): void => {
    setPaletteState((s) => ({ ...s, view: next, activeIdx: 0 }));
  };
  const setQuery = (next: string): void => {
    setPaletteState((s) => ({ ...s, query: next, activeIdx: 0 }));
  };
  const setActiveIdx = (next: number | ((curr: number) => number)): void => {
    setPaletteState((s) => ({
      ...s,
      activeIdx: typeof next === 'function' ? next(s.activeIdx) : next,
    }));
  };
  let inputEl: HTMLInputElement | undefined;
  let listEl: HTMLDivElement | undefined;

  // Seed the view + query when the palette opens; write a snapshot back on
  // close. Memory takes precedence — if the user already had the palette
  // open this session, restore that exact view/query so a second Cmd+K feels
  // like resuming. Otherwise fall back to the deepest meaningful context
  // derived from `currentSelection`.
  //
  // `on(props.open, ...)` gives us the prev/next pair so we can detect open/
  // close edges without manual `wasOpen` bookkeeping. Memory get/record are
  // synchronous plain-Map ops, so no fiber juggling needed.
  createEffect(
    on(
      () => props.open,
      (isOpen, wasOpen) => {
        if (isOpen && wasOpen !== true) {
          const snapshot = commandPaletteMemory.get();
          // Seed view+query+activeIdx atomically — three separate setters
          // would create momentary intermediate states the renderer could
          // observe.
          if (snapshot !== null) {
            const seedView: PaletteView =
              snapshot._tag === 'chapter'
                ? { _tag: 'chapter', book: snapshot.book, chapter: snapshot.chapter }
                : snapshot._tag === 'book'
                  ? { _tag: 'book', book: snapshot.book }
                  : { _tag: 'root' };
            setPaletteState({ view: seedView, query: snapshot.query, activeIdx: 0 });
          } else {
            // untrack: currentSelection is read once to seed the view on
            // open; subsequent cursor moves while the palette is open
            // must not re-trigger this effect or it'd yank the user back.
            const sel = untrack(() => props.currentSelection());
            const seedView: PaletteView = Option.isSome(sel)
              ? { _tag: 'chapter', book: sel.value.book, chapter: sel.value.chapter }
              : { _tag: 'root' };
            setPaletteState({ view: seedView, query: '', activeIdx: 0 });
          }
          queueMicrotask(() => {
            inputEl?.focus();
            inputEl?.select();
          });
        } else if (!isOpen && wasOpen === true) {
          // untrack: this branch fires once on close; we want the final view/
          // query snapshot but the surrounding createEffect is driven by
          // props.open only — tracking view/query here would re-run the effect
          // on every keystroke while the palette is open.
          const v = untrack(view);
          const q = untrack(query);
          const snapshot: PaletteSnapshot =
            v._tag === 'chapter'
              ? { _tag: 'chapter', book: v.book, chapter: v.chapter, query: q }
              : v._tag === 'book'
                ? { _tag: 'book', book: v.book, query: q }
                : { _tag: 'root', query: q };
          commandPaletteMemory.record(snapshot);
        }
      },
    ),
  );

  const parsed = createMemo<ParsedBibleQuery | null>(() => {
    const q = query().trim();
    if (q === '') return null;
    const result = parseBibleQuery(q);
    return result._tag === 'search' ? null : result;
  });

  // Verse list for the chapter view — driven by a small child component
  // (mounted conditionally on chapter view) so the IPC accessor type stays
  // non-nullable. The child writes the latest verse numbers up to this
  // signal so `rows()` can fold them into the keyboard-navigable list.
  // Cleared here when the view leaves chapter mode so stale verse rows
  // don't peek through after popping back to book/root.
  const [chapterVerses, setChapterVerses] = createSignal<readonly number[]>([]);
  createEffect(
    on(
      view,
      (v) => {
        if (v._tag !== 'chapter') setChapterVerses([]);
      },
      { defer: true },
    ),
  );

  const rows = createMemo<readonly Row[]>(() => {
    const out: Row[] = [];

    // A parsed query always wins — it surfaces a "jump to N" row at the top
    // regardless of which view we're in, so the user can type past the
    // current drilldown.
    const p = parsed();
    if (p !== null) {
      const desc = describeParsed(p);
      if (desc !== null) {
        out.push({
          kind: 'parsed',
          id: PARSED_ID,
          parsed: p,
          label: desc.label,
          hint: desc.hint,
        });
      }
    }

    const v = view();
    const q = query().trim().toLowerCase();

    if (v._tag === 'root') {
      const filtered =
        q === '' ? BIBLE_BOOKS : BIBLE_BOOKS.filter((b) => b.name.toLowerCase().includes(q));
      for (const b of filtered) {
        out.push({
          kind: 'book',
          id: `book-${String(b.number)}`,
          book: b.number,
          label: b.name,
        });
      }
      return out;
    }

    if (v._tag === 'book') {
      const book = getBibleBook(v.book);
      if (!book) return out;
      for (let ch = 1; ch <= book.chapters; ch++) {
        const label = `${book.name} ${String(ch)}`;
        if (q === '' || label.toLowerCase().includes(q) || String(ch).includes(q)) {
          out.push({
            kind: 'chapter',
            id: `ch-${String(v.book)}-${String(ch)}`,
            book: v.book,
            chapter: ch,
            label,
          });
        }
      }
      return out;
    }

    // chapter view
    const verses = chapterVerses();
    const book = getBibleBook(v.book);
    const bookName = book?.name ?? `Book ${String(v.book)}`;
    for (const verseNum of verses) {
      const label = `${bookName} ${String(v.chapter)}:${String(verseNum)}`;
      if (q === '' || String(verseNum).includes(q) || label.toLowerCase().includes(q)) {
        out.push({
          kind: 'verse',
          id: `v-${String(v.book)}-${String(v.chapter)}-${String(verseNum)}`,
          book: v.book,
          chapter: v.chapter,
          verse: verseNum,
          label,
        });
      }
    }
    return out;
  });

  // Reset highlight whenever the visible row set changes shape. `on` makes
  // the dependency explicit (we only care about rows() identity, not the
  // active index it derives), and `defer: true` skips the initial run
  // since activeIdx is already 0 at mount.
  createEffect(on(rows, () => setActiveIdx(0), { defer: true }));

  // Re-derive whether we're in chapter view (used to mount the fetcher).
  const chapterView = createMemo<{ book: number; chapter: number } | null>(() => {
    const v = view();
    return v._tag === 'chapter' ? { book: v.book, chapter: v.chapter } : null;
  });

  // Scroll the highlighted row into view whenever the index changes.
  createEffect(() => {
    const idx = activeIdx();
    if (listEl === undefined) return;
    const child = listEl.querySelector<HTMLElement>(`[data-row-idx="${String(idx)}"]`);
    child?.scrollIntoView({ block: 'nearest' });
  });

  const close = () => props.onOpenChange(false);

  const activate = (row: Row): void => {
    const action = resolveAction(row);
    if (action === null) return;
    dispatchAction(action);
  };

  // Navigation fibers from dispatchAction. The palette closes synchronously,
  // but the navigation Effect keeps running; tracking each fiber lets
  // onCleanup interrupt any survivors so a stale openChapter cannot finish
  // applying after the palette unmounts.
  const navFibers = new Set<Fiber.Fiber<void>>();
  onCleanup(() => {
    for (const f of navFibers) {
      void runtime.runPromise(Fiber.interrupt(f));
    }
    navFibers.clear();
  });
  const forkNav = (eff: Effect.Effect<void, unknown, BibleReaderState>): void => {
    const fiber = runtime.runFork(
      eff.pipe(
        Effect.ignore,
        Effect.ensuring(
          Effect.sync(() => {
            navFibers.delete(fiber);
          }),
        ),
      ),
    );
    navFibers.add(fiber);
  };

  const dispatchAction = (action: PaletteAction): void => {
    switch (action.kind) {
      case 'openChapter': {
        forkNav(
          Effect.gen(function* () {
            const state = yield* BibleReaderState;
            yield* state.openChapter(action.book, action.chapter);
          }),
        );
        close();
        return;
      }
      case 'openChapterAt': {
        forkNav(
          Effect.gen(function* () {
            const state = yield* BibleReaderState;
            yield* state.openChapterAt(action.book, action.chapter, action.verse);
          }),
        );
        close();
        return;
      }
      case 'drilldown': {
        setPaletteState({ view: action.view, query: '', activeIdx: 0 });
        return;
      }
    }
  };

  const popView = (): boolean => {
    const v = view();
    if (v._tag === 'chapter') {
      setView({ _tag: 'book', book: v.book });
      return true;
    }
    if (v._tag === 'book') {
      setView({ _tag: 'root' });
      return true;
    }
    return false;
  };

  const onInputKey = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const list = rows();
      if (list.length === 0) return;
      setActiveIdx((i) => (i + 1) % list.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const list = rows();
      if (list.length === 0) return;
      setActiveIdx((i) => (i - 1 + list.length) % list.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const list = rows();
      const row = list[activeIdx()];
      if (row !== undefined) activate(row);
      return;
    }
    if (e.key === 'Backspace' && query() === '') {
      // Empty input + Backspace pops the view stack so the user can climb
      // back up without reaching for the mouse.
      if (popView()) e.preventDefault();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  // Body scroll lock + keep keystrokes from bubbling into the app-level
  // keydown listener (Cmd+T cycles theme, etc.). The keydown attached here
  // captures before the window listener fires because we stopPropagation in
  // every branch of onInputKey via preventDefault is not enough — also stop
  // propagation on the overlay so global shortcuts are paused while open.
  createEffect(() => {
    if (!props.open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    onCleanup(() => {
      document.body.style.overflow = prevOverflow;
    });
  });

  // Catch keys on the overlay (capture phase) so global shortcuts don't fire
  // while the palette is open — except Cmd+K, which the parent uses as a
  // toggle, and Escape which the parent's listener also handles.
  const onOverlayKeyCapture = (e: KeyboardEvent): void => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && (e.key === 'k' || e.key === 'K')) return;
    if (e.key === 'Escape') return;
    e.stopPropagation();
  };

  const viewLabel = (): string => {
    const v = view();
    if (v._tag === 'root') return 'Jump to a book, chapter or verse';
    if (v._tag === 'book') {
      const b = getBibleBook(v.book);
      return b ? `${b.name} — pick a chapter` : 'Pick a chapter';
    }
    return `${formatBibleReference({ book: v.book, chapter: v.chapter })} — pick a verse`;
  };

  return (
    <Presence>
      <Show when={props.open}>
        <Motion.div
          class="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12, ease: defaultEase }}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
          onKeyDown={onOverlayKeyCapture}
        >
          <Motion.div
            class="w-full max-w-[560px] overflow-hidden rounded-xl border border-rule bg-bg shadow-2xl"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.14, ease: defaultEase }}
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
          >
            <div class="flex items-center gap-2 border-b border-rule px-4 py-3">
              <span class="text-ui-xs uppercase tracking-[0.08em] text-muted">{viewLabel()}</span>
            </div>
            <input
              ref={(el) => {
                inputEl = el;
              }}
              type="text"
              class="w-full bg-transparent px-4 py-3 text-ui-base text-fg outline-none placeholder:text-muted"
              placeholder="Type a reference (e.g. john 3:16) or filter…"
              value={query()}
              onInput={(e) => setQuery(e.currentTarget.value)}
              onKeyDown={onInputKey}
              autocomplete="off"
              spellcheck={false}
            />
            <div
              ref={(el) => {
                listEl = el;
              }}
              class="max-h-[50vh] overflow-y-auto border-t border-rule"
              role="listbox"
            >
              <Show
                when={rows().length > 0}
                fallback={
                  <p class="px-4 py-6 text-center text-ui-sm text-muted">
                    No matches. Try a reference like "gen 1:1".
                  </p>
                }
              >
                <For each={rows()}>
                  {(row, idx) => (
                    <RowView
                      row={row}
                      active={idx() === activeIdx()}
                      idx={idx()}
                      onClick={() => activate(row)}
                      onHover={() => setActiveIdx(idx())}
                    />
                  )}
                </For>
              </Show>
            </div>
            <PaletteFooter view={view()} />
            <Show when={chapterView()} keyed>
              {(ctx) => (
                <VerseRowsFetcher
                  book={ctx.book}
                  chapter={ctx.chapter}
                  onVerses={setChapterVerses}
                />
              )}
            </Show>
          </Motion.div>
        </Motion.div>
      </Show>
    </Presence>
  );
};

const RowView: Component<{
  readonly row: Row;
  readonly active: boolean;
  readonly idx: number;
  readonly onClick: () => void;
  readonly onHover: () => void;
}> = (props) => (
  <button
    type="button"
    class="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-ui-sm text-fg data-[active=true]:bg-accent-soft data-[active=true]:text-accent"
    data-active={props.active ? 'true' : undefined}
    data-row-idx={String(props.idx)}
    onClick={props.onClick}
    onMouseMove={props.onHover}
  >
    <span class="flex min-w-0 items-center gap-3">
      <RowIcon row={props.row} />
      <span class="truncate">{props.row.label}</span>
    </span>
    <Switch>
      <Match when={props.row.kind === 'parsed' && props.row}>
        {(r) => <span class="shrink-0 text-ui-xs text-muted">{r().hint}</span>}
      </Match>
    </Switch>
  </button>
);

const RowIcon: Component<{ readonly row: Row }> = (props) => (
  <span
    class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-ui-xs uppercase text-muted"
    aria-hidden="true"
  >
    <Switch>
      <Match when={props.row.kind === 'book'}>B</Match>
      <Match when={props.row.kind === 'chapter'}>C</Match>
      <Match when={props.row.kind === 'verse'}>V</Match>
      <Match when={props.row.kind === 'parsed'}>↵</Match>
    </Switch>
  </span>
);

const PaletteFooter: Component<{ readonly view: PaletteView }> = (props) => (
  <div class="flex items-center justify-between gap-3 border-t border-rule bg-bg-soft px-4 py-2 text-ui-xs text-muted">
    <span>
      <Switch>
        <Match when={props.view._tag === 'root'}>All books</Match>
        <Match when={props.view._tag === 'book'}>Chapters</Match>
        <Match when={props.view._tag === 'chapter'}>Verses</Match>
      </Switch>
    </span>
    <span class="flex items-center gap-3">
      <Kbd>↑↓</Kbd>
      <Kbd>Enter</Kbd>
      <Kbd>Esc</Kbd>
    </span>
  </div>
);

const Kbd: Component<{ readonly children: string }> = (props) => (
  <kbd class="rounded border border-rule px-1.5 py-0.5 font-mono text-[10px] text-muted">
    {props.children}
  </kbd>
);

// Mounted only while the palette is in chapter view. Subscribes to the
// chapter IPC for a concrete (book, chapter) and lifts the verse number
// list up to the parent — keeps the IPC accessor signature happy while
// letting the parent's `rows()` memo own keyboard-navigable state.
const VerseRowsFetcher: Component<{
  readonly book: number;
  readonly chapter: number;
  readonly onVerses: (verses: readonly number[]) => void;
}> = (props) => {
  const chapterRes = ipc.bible.getChapter.query(() => ({
    book: props.book,
    chapter: props.chapter,
  }));
  createEffect(() => {
    const c = chapterRes();
    if (c === undefined || c === null) {
      props.onVerses([]);
      return;
    }
    props.onVerses(c.verses.map((v) => v.verse));
  });
  return null;
};

// Pure mapping from row → action. Returns null when the row is a parsed-
// preview with no actionable interpretation (e.g. `search` tag, which the
// rows() memo already filters out — kept for exhaustiveness). Exported so
// tests can lock the activation rules down without spinning up a DOM.
export const resolveAction = (row: Row): PaletteAction | null => {
  switch (row.kind) {
    case 'book':
      return { kind: 'drilldown', view: { _tag: 'book', book: row.book } };
    case 'chapter':
      return { kind: 'openChapter', book: row.book, chapter: row.chapter };
    case 'verse':
      return {
        kind: 'openChapterAt',
        book: row.book,
        chapter: row.chapter,
        verse: row.verse,
      };
    case 'parsed':
      return resolveParsedAction(row.parsed);
  }
};

export const resolveParsedAction = (p: ParsedBibleQuery): PaletteAction | null => {
  switch (p._tag) {
    case 'single': {
      const { book, chapter, verse } = p.ref;
      // `verse` is typed optional on BibleReference, but the parser only
      // emits `single` when it found one. Fall back to opening the chapter
      // for the off-chance the schema is loosened later.
      if (verse === undefined) return { kind: 'openChapter', book, chapter };
      return { kind: 'openChapterAt', book, chapter, verse };
    }
    case 'verseRange':
      // Verse ranges aren't a first-class concept in the reader yet — land
      // on the start verse.
      return { kind: 'openChapterAt', book: p.book, chapter: p.chapter, verse: p.startVerse };
    case 'chapter':
      return { kind: 'openChapter', book: p.book, chapter: p.chapter };
    case 'chapterRange':
      return { kind: 'openChapter', book: p.book, chapter: p.startChapter };
    case 'fullBook':
      // Drill into the book view rather than guessing a chapter — gives
      // the user a chapter picker.
      return { kind: 'drilldown', view: { _tag: 'book', book: p.book } };
    case 'search':
      return null;
  }
};

const describeParsed = (p: ParsedBibleQuery): { label: string; hint: string } | null => {
  switch (p._tag) {
    case 'single': {
      const book = getBibleBook(p.ref.book);
      if (!book) return null;
      return {
        label: `${book.name} ${String(p.ref.chapter)}:${String(p.ref.verse)}`,
        hint: 'Open verse',
      };
    }
    case 'verseRange': {
      const book = getBibleBook(p.book);
      if (!book) return null;
      return {
        label: `${book.name} ${String(p.chapter)}:${String(p.startVerse)}–${String(p.endVerse)}`,
        hint: 'Open at first verse',
      };
    }
    case 'chapter': {
      const book = getBibleBook(p.book);
      if (!book) return null;
      return { label: `${book.name} ${String(p.chapter)}`, hint: 'Open chapter' };
    }
    case 'chapterRange': {
      const book = getBibleBook(p.book);
      if (!book) return null;
      return {
        label: `${book.name} ${String(p.startChapter)}–${String(p.endChapter)}`,
        hint: 'Open at first chapter',
      };
    }
    case 'fullBook': {
      const book = getBibleBook(p.book);
      if (!book) return null;
      return { label: book.name, hint: 'Browse chapters' };
    }
    case 'search':
      return null;
  }
};
