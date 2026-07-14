import {
  formatBibleReference,
  getBibleBook,
  parseBibleQuery,
  Reference,
  type ParsedBibleQuery,
} from '@bible/core/bible';
import { Effect, Fiber, Option } from 'effect';
import {
  type Component,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  Show,
  untrack,
} from 'solid-js';
import { runtime } from '../runtime.js';
import { BibleReaderState, type BibleReaderSelection } from '../services/bible-reader-state.js';
import { commandPaletteMemory, type PaletteSnapshot } from '../services/command-palette-memory.js';
import {
  type PaletteAction,
  type PaletteView,
  resolveAction,
  type Row,
  rowsForPalette,
} from './command-palette/model.js';
import { PaletteFooter, PaletteInput, PaletteList, PaletteModal } from './command-palette/view.js';
import { VerseRowsFetcher } from './command-palette/verse-rows-fetcher.js';

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

// One state object instead of three independent signals. activeIdx is
// scoped to (view, query) — setView and setQuery both reset it to 0
// implicitly via withView / withQuery helpers, so a stale activeIdx after
// drill or keystroke is unrepresentable.
interface PaletteState {
  readonly view: PaletteView;
  readonly query: string;
  readonly activeIdx: number;
}

export interface CommandPaletteProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Current Bible selection — used to seed the view (root vs book vs
   *  chapter) so the palette opens in context. */
  readonly currentSelection: () => Option.Option<BibleReaderSelection>;
}

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

  const rows = createMemo<readonly Row[]>(() =>
    rowsForPalette(view(), query().trim().toLowerCase(), parsed(), chapterVerses()),
  );

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
    return `${formatBibleReference(Reference.chapter(v.book, v.chapter))} — pick a verse`;
  };

  return (
    <PaletteModal open={props.open} onClose={close} onOverlayKeyCapture={onOverlayKeyCapture}>
      <div class="flex items-center gap-2 border-b border-rule px-4 py-3">
        <span class="text-ui-xs uppercase tracking-[0.08em] text-muted">{viewLabel()}</span>
      </div>
      <PaletteInput
        value={query()}
        onInput={setQuery}
        onKeyDown={onInputKey}
        inputRef={(el) => {
          inputEl = el;
        }}
      />
      <PaletteList
        listRef={(el) => {
          listEl = el;
        }}
        rows={rows()}
        activeIdx={activeIdx()}
        onActivate={activate}
        onHover={setActiveIdx}
      />
      <PaletteFooter view={view()} />
      <Show when={chapterView()} keyed>
        {(ctx) => (
          <VerseRowsFetcher book={ctx.book} chapter={ctx.chapter} onVerses={setChapterVerses} />
        )}
      </Show>
    </PaletteModal>
  );
};
