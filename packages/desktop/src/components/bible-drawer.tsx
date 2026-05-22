import {
  formatBibleReference,
  getBibleBook,
  type ParsedBibleQuery,
} from '@bible/core/bible-reader';
import { Effect, Option } from 'effect';
import {
  type Accessor,
  type Component,
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  onCleanup,
  Show,
  Switch,
} from 'solid-js';
import { runtime } from '../runtime.js';
import type { BibleDrawerState, BibleStudyTab } from '../services/bible-drawer-state.js';
import {
  KjvBible,
  type KjvChapter,
  type KjvStrongsChapter,
  type KjvStrongsWord,
  type StrongsLexiconEntry,
} from '../services/kjv-bible.js';
import { VerseRenderer } from './bible/verse-renderer.js';
import { BooksToc, ChaptersToc } from './bible-drawer-toc.js';
import { Drawer } from './ui/drawer.js';

// Right-side scripture drawer. Mounted at the app shell level so any click on
// a ScriptureRef anywhere in the reader can open it. The Drawer primitive
// (components/ui/drawer.tsx) handles Esc, click-outside, focus trap, scroll
// lock, inert background, and focus restoration. This component owns the
// chapter render + prev/next + strongs toggle.

export interface BibleDrawerProps {
  readonly state: BibleDrawerState;
  /** Collapsed-mode width (chapter pane only) in px. Owned by app shell so
   *  it can persist via ReaderSettings. */
  readonly widthPx: Accessor<number>;
  readonly onWidthChange: (px: number) => void;
  readonly widthBounds: { readonly min: number; readonly max: number };
  /** Expanded-mode width (chapter + study pane) in px. Tracked separately so
   *  each mode remembers its own last-used width across collapse/expand. */
  readonly wideWidthPx: Accessor<number>;
  readonly onWideWidthChange: (px: number) => void;
  readonly wideWidthBounds: { readonly min: number; readonly max: number };
}

export const BibleDrawer: Component<BibleDrawerProps> = (props) => {
  // Keyboard nav: [ and ] step through chapters; \ toggles expand/collapse.
  // Listening on `document` (not the panel) lets the keys work even when focus
  // is on the resize handle or any other internal control without us having
  // to thread the handler through each focusable descendant.
  createEffect(() => {
    if (!props.state.isOpen()) return;
    const onKey = (e: KeyboardEvent): void => {
      // Don't fight text inputs — if the user is typing somewhere, leave them
      // alone. (The drawer body currently has none, but the toggle button +
      // future Strong's search would.)
      const tgt = e.target;
      if (tgt instanceof HTMLInputElement || tgt instanceof HTMLTextAreaElement) return;
      if (tgt instanceof HTMLElement && tgt.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '\\') {
        e.preventDefault();
        props.state.setExpanded(!props.state.isExpanded());
        return;
      }
      const v = props.state.view();
      // `g` toggles between reader and the books TOC. Pressed from inside a
      // book-toc, it climbs back up to books-toc rather than swapping straight
      // to reader — feels like the natural "up a level" gesture.
      if (e.key === 'g') {
        e.preventDefault();
        if (v._tag === 'reader') props.state.openBooksToc();
        else if (v._tag === 'book-toc') props.state.openBooksToc();
        else props.state.backToReader();
        return;
      }
      // Esc inside a TOC view exits to reader instead of closing the drawer.
      // The Drawer primitive's own Esc handler still fires when we're already
      // in reader.
      if (e.key === 'Escape' && v._tag !== 'reader') {
        e.preventDefault();
        e.stopPropagation();
        props.state.backToReader();
        return;
      }
      // 1-4 swap study tabs when the drawer is expanded. Order matches the
      // STUDY_TABS array (notes / strongs / xrefs / egw).
      if (props.state.isExpanded() && !e.shiftKey) {
        const tabIdx = { '1': 0, '2': 1, '3': 2, '4': 3 }[e.key];
        if (tabIdx !== undefined) {
          e.preventDefault();
          const tab = STUDY_TABS[tabIdx];
          if (tab) props.state.setActiveStudyTab(tab.key);
          return;
        }
      }
      // Chapter / cursor nav only makes sense in reader view.
      if (v._tag !== 'reader') return;
      const s = props.state.status();
      if (s._tag !== 'ready') return;
      const nav = navFor(s.chapter);
      // Shift+[ / Shift+] jump to the previous/next book's chapter 1.
      if (e.shiftKey && (e.key === '{' || e.key === '[')) {
        const target = prevBookTarget(s.chapter.book);
        if (target) {
          e.preventDefault();
          props.state.navigate(target.book, target.chapter);
        }
        return;
      }
      if (e.shiftKey && (e.key === '}' || e.key === ']')) {
        const target = nextBookTarget(s.chapter.book);
        if (target) {
          e.preventDefault();
          props.state.navigate(target.book, target.chapter);
        }
        return;
      }
      if (e.key === '[' && nav.prev) {
        e.preventDefault();
        props.state.navigate(nav.prev.book, nav.prev.chapter);
        return;
      }
      if (e.key === ']' && nav.next) {
        e.preventDefault();
        props.state.navigate(nav.next.book, nav.next.chapter);
        return;
      }
      if (e.key === 'j') {
        e.preventDefault();
        props.state.moveCursor(1);
        return;
      }
      if (e.key === 'k') {
        e.preventDefault();
        props.state.moveCursor(-1);
        return;
      }
    };
    document.addEventListener('keydown', onKey);
    onCleanup(() => {
      document.removeEventListener('keydown', onKey);
    });
  });

  // Width + resize plumbing follows the expanded state — the drawer presents
  // a wider drag handle / target range when the study pane is visible, and
  // the parent persists each mode's width independently.
  const activeWidth = (): Accessor<number> =>
    props.state.isExpanded() ? props.wideWidthPx : props.widthPx;
  const onActiveResize = (px: number): void => {
    if (props.state.isExpanded()) props.onWideWidthChange(px);
    else props.onWidthChange(px);
  };
  const activeBounds = (): { readonly min: number; readonly max: number } =>
    props.state.isExpanded() ? props.wideWidthBounds : props.widthBounds;

  return (
    <Drawer
      open={props.state.isOpen()}
      onOpenChange={(open) => {
        if (!open) props.state.close();
      }}
      side="right"
      widthPx={activeWidth()}
      label="Bible reference"
      resize={{
        onResize: onActiveResize,
        minPx: activeBounds().min,
        maxPx: activeBounds().max,
      }}
    >
      <BibleDrawerHeader state={props.state} />
      <div class="flex-1 min-h-0 flex">
        <div
          class="flex-1 min-h-0 min-w-0 overflow-y-auto px-5 py-4"
          classList={{
            'border-r border-rule': props.state.isExpanded(),
          }}
        >
          <Switch>
            <Match when={props.state.view()._tag === 'reader'}>
              <BibleDrawerBody state={props.state} />
            </Match>
            <Match when={props.state.view()._tag === 'books-toc'}>
              <BooksToc state={props.state} />
            </Match>
            <Match
              when={(() => {
                const v = props.state.view();
                return v._tag === 'book-toc' ? v : null;
              })()}
            >
              {(v) => <ChaptersToc state={props.state} book={v().book} />}
            </Match>
          </Switch>
        </div>
        <Show when={props.state.isExpanded()}>
          <div class="flex-1 min-h-0 min-w-0 flex flex-col">
            <StudyPane state={props.state} />
          </div>
        </Show>
      </div>
    </Drawer>
  );
};

const BibleDrawerHeader: Component<{ readonly state: BibleDrawerState }> = (props) => {
  const title = createMemo(() => {
    const v = props.state.view();
    if (v._tag === 'books-toc') return 'Books';
    if (v._tag === 'book-toc') {
      const b = getBibleBook(v.book);
      return b ? b.name : 'Book';
    }
    const s = props.state.status();
    if (s._tag === 'ready') return titleForStatus(s.parsed, s.chapter);
    if (s._tag === 'loading') return s.query;
    if (s._tag === 'not-found' || s._tag === 'error') return s.query;
    return 'Bible';
  });

  const navTargets = createMemo<{
    readonly prev: { readonly book: number; readonly chapter: number } | null;
    readonly next: { readonly book: number; readonly chapter: number } | null;
  }>(() => {
    if (props.state.view()._tag !== 'reader') return { prev: null, next: null };
    const s = props.state.status();
    if (s._tag !== 'ready') return { prev: null, next: null };
    return navFor(s.chapter);
  });

  return (
    <div class="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-rule">
      <button
        type="button"
        class="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-rule/30 hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent"
        onClick={() => {
          const t = navTargets().prev;
          if (t) props.state.navigate(t.book, t.chapter);
        }}
        disabled={navTargets().prev === null}
        aria-label="Previous chapter"
        title="Previous chapter ([ key — Shift for previous book)"
      >
        {'‹'}
      </button>
      <div class="flex-1 min-w-0 text-ui-base font-medium text-fg truncate" title={title()}>
        {title()}
      </div>
      <button
        type="button"
        class="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-rule/30 hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent"
        onClick={() => {
          const t = navTargets().next;
          if (t) props.state.navigate(t.book, t.chapter);
        }}
        disabled={navTargets().next === null}
        aria-label="Next chapter"
        title="Next chapter (] key — Shift for next book)"
      >
        {'›'}
      </button>
      <button
        type="button"
        class="ml-1 flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-rule/30 hover:text-fg data-[on=true]:bg-accent-soft data-[on=true]:text-accent"
        onClick={() => {
          const v = props.state.view();
          if (v._tag === 'reader') props.state.openBooksToc();
          else props.state.backToReader();
        }}
        aria-pressed={props.state.view()._tag !== 'reader'}
        data-on={props.state.view()._tag !== 'reader' ? 'true' : undefined}
        aria-label={
          props.state.view()._tag === 'reader' ? 'Open table of contents' : 'Back to chapter'
        }
        title={
          props.state.view()._tag === 'reader'
            ? 'Table of contents (g key)'
            : 'Back to chapter (g or Esc)'
        }
      >
        {'☰'}
      </button>
      <button
        type="button"
        class="ml-1 flex h-7 items-center px-1.5 rounded text-[0.7rem] font-medium tracking-[0.06em] uppercase text-muted hover:bg-rule/30 hover:text-fg data-[on=true]:bg-accent-soft data-[on=true]:text-accent"
        onClick={() => props.state.setStrongsEnabled(!props.state.strongsEnabled())}
        aria-pressed={props.state.strongsEnabled()}
        data-on={props.state.strongsEnabled() ? 'true' : undefined}
        aria-label="Toggle Strong's numbers"
        title="Toggle Strong's numbers"
      >
        H/G
      </button>
      <button
        type="button"
        class="ml-1 flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-rule/30 hover:text-fg data-[on=true]:bg-accent-soft data-[on=true]:text-accent"
        onClick={() => props.state.setExpanded(!props.state.isExpanded())}
        aria-pressed={props.state.isExpanded()}
        data-on={props.state.isExpanded() ? 'true' : undefined}
        aria-label={props.state.isExpanded() ? 'Collapse study pane' : 'Expand study pane'}
        title={
          props.state.isExpanded() ? 'Collapse study pane (\\ key)' : 'Expand study pane (\\ key)'
        }
      >
        {props.state.isExpanded() ? '⇥' : '⇤'}
      </button>
      <button
        type="button"
        class="ml-1 flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-rule/30 hover:text-fg"
        onClick={() => props.state.close()}
        aria-label="Close"
        title="Close (Esc)"
      >
        {'×'}
      </button>
    </div>
  );
};

const BibleDrawerBody: Component<{ readonly state: BibleDrawerState }> = (props) => (
  <Switch>
    <Match when={props.state.status()._tag === 'idle'}>
      <p class="text-ui-sm text-muted">Click a scripture reference to open it here.</p>
    </Match>
    <Match when={props.state.status()._tag === 'loading'}>
      <p class="text-ui-sm text-muted">Loading…</p>
    </Match>
    <Match
      when={(() => {
        const s = props.state.status();
        return s._tag === 'not-found' ? s : null;
      })()}
    >
      {(s) => (
        <div class="flex flex-col gap-2">
          <p class="text-ui-sm font-medium text-fg">Not found</p>
          <p class="text-ui-sm text-muted">{s().reason}</p>
        </div>
      )}
    </Match>
    <Match
      when={(() => {
        const s = props.state.status();
        return s._tag === 'error' ? s : null;
      })()}
    >
      {(s) => (
        <div class="flex flex-col gap-2">
          <p class="text-ui-sm font-medium text-[#b3261e]">Failed to load chapter</p>
          <p class="text-ui-sm text-muted">{s().message}</p>
        </div>
      )}
    </Match>
    <Match
      when={(() => {
        const s = props.state.status();
        return s._tag === 'ready' ? s : null;
      })()}
    >
      {(s) => (
        <ChapterView
          chapter={s().chapter}
          strongs={Option.getOrNull(s().strongs)}
          highlight={s().highlight}
          cursorVerse={props.state.cursorVerse()}
          onStrongsClick={(verse, code) =>
            props.state.openStudyTab('strongs', { _tag: 'strongs', verse, code })
          }
        />
      )}
    </Match>
  </Switch>
);

const ChapterView: Component<{
  readonly chapter: KjvChapter;
  readonly strongs: KjvStrongsChapter | null;
  readonly highlight: readonly number[];
  readonly cursorVerse: number | null;
  readonly onStrongsClick: (verse: number, code: string) => void;
}> = (props) => {
  // Both the parsed-query highlight set AND the user's keyboard cursor get
  // rendered with the same highlight chip — visually one focus indicator,
  // semantically two sources so they don't overwrite each other.
  const highlightSet = createMemo(() => {
    const set = new Set(props.highlight);
    if (props.cursorVerse !== null) set.add(props.cursorVerse);
    return set;
  });
  // Strong's render is verse-keyed for O(1) lookup as we render the plain KJV
  // verse list — we render plain text whenever a verse is missing strongs
  // (shouldn't happen in practice but keeps the UI resilient).
  const strongsByVerse = createMemo(() => {
    const s = props.strongs;
    if (s === null) return null;
    const m = new Map<number, readonly KjvStrongsWord[]>();
    for (const v of s.verses) m.set(v.verse, v.words);
    return m;
  });

  // Per-verse refs let us scroll precisely — to the parsed-query target on
  // chapter load, and to the cursor as j/k drives it.
  const verseRefs = new Map<number, HTMLElement>();

  createEffect(() => {
    void props.chapter;
    void props.highlight;
    // Reset between chapter loads — stale element references would still
    // exist in the map even after the For has unmounted the old rows.
    verseRefs.clear();
    queueMicrotask(() => {
      const target = props.highlight[0] ?? props.cursorVerse;
      if (target === null || target === undefined) return;
      verseRefs.get(target)?.scrollIntoView({ block: 'center', behavior: 'auto' });
    });
  });

  createEffect(() => {
    // Cursor-only effect: scroll smoothly so keyboard navigation feels
    // continuous. Skipped on the initial chapter load (the effect above
    // already handles that, and uses 'auto' to avoid a smooth jump).
    const v = props.cursorVerse;
    if (v === null) return;
    queueMicrotask(() => {
      verseRefs.get(v)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  });

  return (
    <div class="flex flex-col gap-3 font-[family-name:var(--reader-font-family,var(--font-serif))] text-[length:var(--reader-font-size,18px)] leading-[var(--reader-line-height,1.55)] text-fg">
      <For each={props.chapter.verses}>
        {(v) => {
          const isHi = (): boolean => highlightSet().has(v.verse);
          const strongsWords = (): readonly KjvStrongsWord[] | null => {
            const map = strongsByVerse();
            return map === null ? null : (map.get(v.verse) ?? null);
          };
          return (
            <p
              class="m-0 px-2 py-1 -mx-2 rounded data-[hi=true]:bg-accent-soft"
              data-hi={isHi() ? 'true' : undefined}
              ref={(el) => {
                verseRefs.set(v.verse, el);
              }}
            >
              <span class="mr-2 text-[0.78em] text-muted [font-variant-numeric:tabular-nums] select-none">
                {v.verse}
              </span>
              <Show when={strongsWords()} fallback={<VerseRenderer text={v.text} />}>
                {(words) => (
                  <StrongsVerse
                    words={words()}
                    onCodeClick={(code) => props.onStrongsClick(v.verse, code)}
                  />
                )}
              </Show>
            </p>
          );
        }}
      </For>
    </div>
  );
};

const StrongsVerse: Component<{
  readonly words: readonly KjvStrongsWord[];
  readonly onCodeClick: (code: string) => void;
}> = (props) => (
  <>
    <For each={props.words}>
      {(w, i) => {
        // Render one button per code so a word annotated with multiple
        // strongs (e.g. "H1234,H5678") sends the user to the specific one
        // they clicked instead of a comma-joined token the lexicon can't
        // resolve.
        const codes = (): readonly string[] => w.strongs ?? [];
        return (
          <>
            <Show when={i() > 0}> </Show>
            <Show when={codes().length > 0} fallback={w.text}>
              <span class="group/strong relative inline">
                {w.text}
                <For each={codes()}>
                  {(code, ci) => (
                    <>
                      <Show when={ci() > 0}>
                        <span class="text-[0.62em] text-accent opacity-70 select-none">,</span>
                      </Show>
                      <button
                        type="button"
                        class="ml-px cursor-pointer bg-transparent border-0 p-0 align-baseline text-[0.62em] font-medium text-accent opacity-70 group-hover/strong:opacity-100 hover:underline [font-variant-numeric:tabular-nums] select-none"
                        title={`Open ${code}`}
                        onClick={() => props.onCodeClick(code)}
                      >
                        <sup>{code}</sup>
                      </button>
                    </>
                  )}
                </For>
              </span>
            </Show>
          </>
        );
      }}
    </For>
  </>
);

// ─── Study pane ────────────────────────────────────────────────────────────
// Tabbed sidecar that shows up when the drawer is expanded. The chapter pane
// stays on the left; this is the right column. Tabs map to fixed routes
// today (notes/strongs/xrefs/egw) — most are placeholder empty states until
// their data sources land, but the shell is ready to receive content.

const STUDY_TABS: readonly { readonly key: BibleStudyTab; readonly label: string }[] = [
  { key: 'notes', label: 'Notes' },
  { key: 'strongs', label: "Strong's" },
  { key: 'xrefs', label: 'Cross-refs' },
  { key: 'egw', label: 'EGW' },
];

const StudyPane: Component<{ readonly state: BibleDrawerState }> = (props) => (
  <>
    <div class="flex items-center gap-0 px-4 pt-3 pb-0 border-b border-rule" role="tablist">
      <For each={STUDY_TABS}>
        {(tab) => {
          const isActive = (): boolean => props.state.activeStudyTab() === tab.key;
          return (
            <button
              type="button"
              role="tab"
              aria-selected={isActive()}
              data-on={isActive() ? 'true' : undefined}
              class="flex h-7 items-center px-2.5 text-ui-sm font-medium text-muted hover:text-fg border-b-2 border-transparent -mb-px data-[on=true]:border-accent data-[on=true]:text-fg"
              onClick={() => props.state.setActiveStudyTab(tab.key)}
            >
              {tab.label}
            </button>
          );
        }}
      </For>
    </div>
    <div class="flex-1 min-h-0 overflow-y-auto px-5 py-4">
      <StudyPaneBody state={props.state} />
    </div>
  </>
);

const StudyPaneBody: Component<{ readonly state: BibleDrawerState }> = (props) => (
  <Switch>
    <Match when={props.state.activeStudyTab() === 'notes'}>
      <StudyTabEmpty
        title="Margin notes"
        body="Click a margin-note anchor (the superscript letter next to a verse) to open it here."
      />
    </Match>
    <Match when={props.state.activeStudyTab() === 'strongs'}>
      <StrongsTab state={props.state} />
    </Match>
    <Match when={props.state.activeStudyTab() === 'xrefs'}>
      <StudyTabEmpty title="Cross references" body="Cross-reference lookups are coming soon." />
    </Match>
    <Match when={props.state.activeStudyTab() === 'egw'}>
      <StudyTabEmpty
        title="Spirit of Prophecy"
        body="Ellen G. White commentary on the active verse will appear here."
      />
    </Match>
  </Switch>
);

const StudyTabEmpty: Component<{ readonly title: string; readonly body: string }> = (props) => (
  <div class="flex flex-col gap-1">
    <p class="text-ui-sm font-medium text-fg">{props.title}</p>
    <p class="text-ui-sm text-muted">{props.body}</p>
  </div>
);

// Strong's tab: shows the last-clicked code (focus.code) and fetches the
// lexicon entry through the KjvBible service. The lookup is cached per-code
// inside the service, so flipping back and forth between codes is instant
// after the first fetch.
type LexiconLoad =
  | { readonly _tag: 'idle' }
  | { readonly _tag: 'loading'; readonly code: string }
  | { readonly _tag: 'ready'; readonly entry: StrongsLexiconEntry }
  | { readonly _tag: 'missing'; readonly code: string }
  | { readonly _tag: 'error'; readonly message: string };

const StrongsTab: Component<{ readonly state: BibleDrawerState }> = (props) => {
  const focus = createMemo(() => {
    const f = props.state.studyFocus();
    return f._tag === 'strongs' ? f : null;
  });
  const [load, setLoad] = createSignal<LexiconLoad>({ _tag: 'idle' });

  // Refresh sequence guards against a stale lookup resolving after the user
  // has clicked a different superscript.
  let seq = 0;
  createEffect(() => {
    const f = focus();
    if (!f) {
      setLoad({ _tag: 'idle' });
      return;
    }
    const mine = ++seq;
    setLoad({ _tag: 'loading', code: f.code });
    runtime
      .runPromise(
        Effect.gen(function* () {
          const svc = yield* KjvBible;
          return yield* svc.strongsLookup(f.code);
        }),
      )
      .then((entry) => {
        if (mine !== seq) return;
        if (Option.isNone(entry)) {
          setLoad({ _tag: 'missing', code: f.code });
          return;
        }
        setLoad({ _tag: 'ready', entry: entry.value });
      })
      .catch((err: unknown) => {
        if (mine !== seq) return;
        setLoad({
          _tag: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      });
  });

  return (
    <Show
      when={focus()}
      fallback={
        <StudyTabEmpty
          title="Strong's"
          body="Click a Strong's number on any verse to look it up here."
        />
      }
    >
      {(f) => (
        <div class="flex flex-col gap-3">
          <div class="flex items-baseline gap-2">
            <p class="text-ui-base font-medium text-fg [font-variant-numeric:tabular-nums]">
              {f().code}
            </p>
            <p class="text-ui-xs text-muted">from verse {f().verse}</p>
          </div>
          <Switch>
            <Match when={load()._tag === 'loading'}>
              <p class="text-ui-sm text-muted">Loading lexicon…</p>
            </Match>
            <Match when={load()._tag === 'missing'}>
              <p class="text-ui-sm text-muted">No lexicon entry for this code.</p>
            </Match>
            <Match
              when={(() => {
                const l = load();
                return l._tag === 'error' ? l : null;
              })()}
            >
              {(err) => <p class="text-ui-sm text-danger">Lookup failed: {err().message}</p>}
            </Match>
            <Match
              when={(() => {
                const l = load();
                return l._tag === 'ready' ? l : null;
              })()}
            >
              {(ready) => (
                <div class="flex flex-col gap-2">
                  <div class="flex flex-wrap items-baseline gap-x-2">
                    <span
                      class="text-ui-lg text-fg"
                      lang={ready().entry.language === 'hebrew' ? 'he' : 'el'}
                    >
                      {ready().entry.lemma}
                    </span>
                    <span class="text-ui-sm text-muted italic">
                      {ready().entry.transliteration}
                    </span>
                    <span class="text-ui-xs text-muted uppercase tracking-wide">
                      {ready().entry.language}
                    </span>
                  </div>
                  <p class="text-ui-sm text-fg whitespace-pre-wrap">{ready().entry.definition}</p>
                </div>
              )}
            </Match>
          </Switch>
        </div>
      )}
    </Show>
  );
};

const titleForStatus = (parsed: ParsedBibleQuery, chapter: KjvChapter): string => {
  if (parsed._tag === 'single') {
    return formatBibleReference({
      book: parsed.ref.book,
      chapter: parsed.ref.chapter,
      verse: parsed.ref.verse,
    });
  }
  if (parsed._tag === 'verseRange') {
    return formatBibleReference({
      book: parsed.book,
      chapter: parsed.chapter,
      verse: parsed.startVerse,
      verseEnd: parsed.endVerse,
    });
  }
  return `${chapter.bookName} ${String(chapter.chapter)}`;
};

const navFor = (
  chapter: KjvChapter,
): {
  readonly prev: { readonly book: number; readonly chapter: number } | null;
  readonly next: { readonly book: number; readonly chapter: number } | null;
} => {
  const cur = getBibleBook(chapter.book);
  if (!cur) return { prev: null, next: null };
  const prev =
    chapter.chapter > 1
      ? { book: chapter.book, chapter: chapter.chapter - 1 }
      : (() => {
          const prevBook = getBibleBook(chapter.book - 1);
          return prevBook ? { book: prevBook.number, chapter: prevBook.chapters } : null;
        })();
  const next =
    chapter.chapter < cur.chapters
      ? { book: chapter.book, chapter: chapter.chapter + 1 }
      : (() => {
          const nextBook = getBibleBook(chapter.book + 1);
          return nextBook ? { book: nextBook.number, chapter: 1 } : null;
        })();
  return { prev, next };
};

const prevBookTarget = (
  bookNumber: number,
): { readonly book: number; readonly chapter: number } | null => {
  const prev = getBibleBook(bookNumber - 1);
  return prev ? { book: prev.number, chapter: 1 } : null;
};

const nextBookTarget = (
  bookNumber: number,
): { readonly book: number; readonly chapter: number } | null => {
  const next = getBibleBook(bookNumber + 1);
  return next ? { book: next.number, chapter: 1 } : null;
};
