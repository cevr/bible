import {
  formatBibleReference,
  getBibleBook,
  type ParsedBibleQuery,
} from '@bible/core/bible-reader';
import { Option } from 'effect';
import {
  type Accessor,
  type Component,
  createEffect,
  createMemo,
  For,
  Match,
  onCleanup,
  Show,
  Suspense,
  Switch,
} from 'solid-js';
import { ipc } from '../runtime.js';
import type { BibleDrawerState, BibleStudyTab } from '../services/bible-drawer-state.js';
import { type MarginNoteType } from '../services/bible-margin-notes.js';
import { type CrossRef } from '../services/bible-xrefs.js';
import {
  type KjvChapter,
  type KjvStrongsChapter,
  type KjvStrongsWord,
} from '../services/kjv-bible.js';
import { StrongsVerse } from './bible/strongs-verse.js';
import { VerseRenderer } from './bible/verse-renderer.js';
import { BooksToc, ChaptersToc } from './bible-drawer-toc.js';
import { ReaderShell } from './ui/reader-shell.js';

// Right-side scripture drawer. Mounted at the app shell level so any click on
// a ScriptureRef anywhere in the reader can open it. Composes `ReaderShell.*`
// primitives for the visual chrome (header / body / split / tabs) so this and
// the EGW commentary drawer share spacing + border + button affordances by
// construction. The underlying `ReaderPanel` primitive owns Esc, focus trap,
// scroll lock, sibling `inert`, and focus restoration. This component owns
// the chapter render + prev/next + strongs toggle.
//
// Width model: fixed 360→720 swap driven by `state.isExpanded()`. No drag
// handle — both widths are presets.

const COLLAPSED_WIDTH_PX = 360;
const EXPANDED_WIDTH_PX = 720;

export interface BibleDrawerProps {
  readonly state: BibleDrawerState;
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

  const widthPxAccessor: Accessor<number> = () => COLLAPSED_WIDTH_PX;

  return (
    <ReaderShell.Frame
      open={props.state.isOpen()}
      onOpenChange={(open) => {
        if (!open) props.state.close();
      }}
      label="Bible reference"
      widthPx={widthPxAccessor}
      expandedWidthPx={EXPANDED_WIDTH_PX}
      expanded={props.state.isExpanded()}
      overlay
    >
      <BibleDrawerHeader state={props.state} />
      <ReaderShell.SplitBody
        asideOpen={props.state.isExpanded()}
        primary={
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
        }
        aside={<StudyPane state={props.state} />}
      />
    </ReaderShell.Frame>
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
    <ReaderShell.Header>
      <ReaderShell.HeaderIconButton
        onClick={() => {
          const t = navTargets().prev;
          if (t) props.state.navigate(t.book, t.chapter);
        }}
        disabled={navTargets().prev === null}
        ariaLabel="Previous chapter"
        title="Previous chapter ([ key — Shift for previous book)"
      >
        {'‹'}
      </ReaderShell.HeaderIconButton>
      <ReaderShell.HeaderTitle title={title()}>{title()}</ReaderShell.HeaderTitle>
      <ReaderShell.HeaderIconButton
        onClick={() => {
          const t = navTargets().next;
          if (t) props.state.navigate(t.book, t.chapter);
        }}
        disabled={navTargets().next === null}
        ariaLabel="Next chapter"
        title="Next chapter (] key — Shift for next book)"
      >
        {'›'}
      </ReaderShell.HeaderIconButton>
      <ReaderShell.HeaderIconButton
        onClick={() => {
          const v = props.state.view();
          if (v._tag === 'reader') props.state.openBooksToc();
          else props.state.backToReader();
        }}
        pressed={props.state.view()._tag !== 'reader'}
        ariaLabel={
          props.state.view()._tag === 'reader' ? 'Open table of contents' : 'Back to chapter'
        }
        title={
          props.state.view()._tag === 'reader'
            ? 'Table of contents (g key)'
            : 'Back to chapter (g or Esc)'
        }
      >
        {'☰'}
      </ReaderShell.HeaderIconButton>
      <ReaderShell.HeaderIconButton
        onClick={() => props.state.setStrongsEnabled(!props.state.strongsEnabled())}
        pressed={props.state.strongsEnabled()}
        ariaLabel="Toggle Strong's numbers"
        title="Toggle Strong's numbers"
        variant="chip"
      >
        H/G
      </ReaderShell.HeaderIconButton>
      <ReaderShell.HeaderIconButton
        onClick={() => props.state.setExpanded(!props.state.isExpanded())}
        pressed={props.state.isExpanded()}
        ariaLabel={props.state.isExpanded() ? 'Collapse study pane' : 'Expand study pane'}
        title={
          props.state.isExpanded() ? 'Collapse study pane (\\ key)' : 'Expand study pane (\\ key)'
        }
      >
        {props.state.isExpanded() ? '⇥' : '⇤'}
      </ReaderShell.HeaderIconButton>
      <ReaderShell.HeaderIconButton
        onClick={() => props.state.close()}
        ariaLabel="Close"
        title="Close (Esc)"
      >
        {'×'}
      </ReaderShell.HeaderIconButton>
    </ReaderShell.Header>
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
          onVerseClick={(verse) => props.state.openStudyTab('xrefs', { _tag: 'xref', verse })}
          onNoteClick={(verse) =>
            props.state.openStudyTab('notes', { _tag: 'note', verse, noteIndex: 0 })
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
  /** Click on the verse-number gutter — opens the cross-refs tab focused on
   *  that verse. Kept distinct from `onStrongsClick` because the inline word
   *  decorations and the gutter are different affordances. */
  readonly onVerseClick: (verse: number) => void;
  /** Click on the margin-note superscript — opens the Notes tab focused on
   *  that verse. The anchor only renders when the verse has at least one
   *  note in the bundled catalog. */
  readonly onNoteClick: (verse: number) => void;
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

  // Per-chapter "which verses have margin notes" lookup. We piggyback on the
  // unified getChapterMarkers query so the drawer shares a cache entry with
  // the chapter canvas — flipping the overlay in the canvas means the
  // drawer's marker set is free to render. The anchors are non-load-bearing,
  // so we use `.latest` and the chapter still paints immediately while the
  // markers flicker in once IPC resolves.
  const markersRes = ipc.bible.getChapterMarkers.query(() => ({
    book: props.chapter.book,
    chapter: props.chapter.chapter,
  }));
  const notedVerseSet = createMemo<ReadonlySet<number>>(() => {
    const m = markersRes.latest;
    if (m === undefined) return new Set<number>();
    return new Set(m.notedVerses);
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
              <button
                type="button"
                class="mr-2 cursor-pointer bg-transparent border-0 p-0 text-[0.78em] text-muted hover:text-accent hover:underline [font-variant-numeric:tabular-nums] select-none"
                title={`Cross references for verse ${String(v.verse)}`}
                onClick={() => props.onVerseClick(v.verse)}
              >
                {v.verse}
              </button>
              <Show when={notedVerseSet().has(v.verse)}>
                {/* Superscript anchor — clicks open the Notes study tab on
                 *  this verse. Sized to match the strongs annotations so the
                 *  visual weight is consistent. */}
                <button
                  type="button"
                  class="mr-1 cursor-pointer bg-transparent border-0 p-0 align-baseline text-[0.62em] font-medium text-accent opacity-70 hover:opacity-100 hover:underline select-none"
                  title={`Margin notes for verse ${String(v.verse)}`}
                  onClick={() => props.onNoteClick(v.verse)}
                >
                  <sup>n</sup>
                </button>
              </Show>
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
    <ReaderShell.TabsList>
      <For each={STUDY_TABS}>
        {(tab) => (
          <ReaderShell.Tab
            active={props.state.activeStudyTab() === tab.key}
            onClick={() => props.state.setActiveStudyTab(tab.key)}
          >
            {tab.label}
          </ReaderShell.Tab>
        )}
      </For>
    </ReaderShell.TabsList>
    <ReaderShell.TabPanel>
      <StudyPaneBody state={props.state} />
    </ReaderShell.TabPanel>
  </>
);

const StudyPaneBody: Component<{ readonly state: BibleDrawerState }> = (props) => (
  <Switch>
    <Match when={props.state.activeStudyTab() === 'notes'}>
      <NotesTab state={props.state} />
    </Match>
    <Match when={props.state.activeStudyTab() === 'strongs'}>
      <StrongsTab state={props.state} />
    </Match>
    <Match when={props.state.activeStudyTab() === 'xrefs'}>
      <XrefsTab state={props.state} />
    </Match>
    <Match when={props.state.activeStudyTab() === 'egw'}>
      <EgwTab state={props.state} />
    </Match>
  </Switch>
);

const StudyTabEmpty: Component<{ readonly title: string; readonly body: string }> = (props) => (
  <ReaderShell.EmptyState title={props.title} body={props.body} />
);

// Notes tab: shows the margin notes for the verse the user clicked an anchor
// on. Notes are grouped visually by their `type` badge (hebrew / alternate /
// greek / name / other) but rendered in their original asset order so the
// reading flow matches the printed margin-note list.
const NOTE_TYPE_LABEL: Readonly<Record<MarginNoteType, string>> = {
  hebrew: 'Heb.',
  greek: 'Gk.',
  alternate: 'Or',
  name: 'Name',
  other: 'Note',
};

const NotesTab: Component<{ readonly state: BibleDrawerState }> = (props) => {
  const target = createMemo<{
    readonly book: number;
    readonly chapter: number;
    readonly verse: number;
  } | null>(() => {
    const f = props.state.studyFocus();
    if (f._tag !== 'note') return null;
    const s = props.state.status();
    if (s._tag !== 'ready') return null;
    return { book: s.chapter.book, chapter: s.chapter.chapter, verse: f.verse };
  });

  return (
    <Show
      when={target()}
      keyed
      fallback={
        <StudyTabEmpty
          title="Margin notes"
          body="Click the superscript n next to a verse to open its margin notes here."
        />
      }
    >
      {(t) => (
        <div class="flex flex-col gap-3">
          <p class="text-ui-xs text-muted">Verse {t.verse}</p>
          <Suspense fallback={<p class="text-ui-sm text-muted">Loading margin notes…</p>}>
            <NotesList book={t.book} chapter={t.chapter} verse={t.verse} />
          </Suspense>
        </div>
      )}
    </Show>
  );
};

const NotesList: Component<{
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
}> = (props) => {
  const notes = ipc.bible.getMarginNotes.query(() => ({
    book: props.book,
    chapter: props.chapter,
    verse: props.verse,
  }));
  const list = createMemo(() => notes() ?? []);
  return (
    <Show
      when={list().length > 0}
      fallback={<p class="text-ui-sm text-muted">No margin notes for this verse.</p>}
    >
      <ul class="flex flex-col gap-3 list-none p-0 m-0">
        <For each={list()}>
          {(note) => (
            <li class="flex flex-col gap-0.5">
              <div class="flex items-baseline gap-2">
                <span class="text-[0.62em] text-muted uppercase tracking-wide">
                  {NOTE_TYPE_LABEL[note.type]}
                </span>
                <span class="text-ui-sm font-medium text-fg">{note.phrase}</span>
              </div>
              <p class="text-ui-sm text-muted m-0 leading-snug">{note.text}</p>
            </li>
          )}
        </For>
      </ul>
    </Show>
  );
};

// EGW commentary tab: lists every cached EGW paragraph that references the
// active verse. The "active verse" is whatever the drawer is currently
// pointing at — last clicked margin-note / xref / Strong's anchor, or the
// keyboard cursor if the user hasn't touched an anchor. We deliberately
// don't expose an inline "open in EGW" decoration: there'd be one per verse
// per chapter, which is too noisy.
const verseFromFocusOrCursor = (state: BibleDrawerState): number | null => {
  const f = state.studyFocus();
  if (f._tag === 'note' || f._tag === 'strongs' || f._tag === 'xref' || f._tag === 'egw') {
    return f.verse;
  }
  return state.cursorVerse();
};

const EgwTab: Component<{ readonly state: BibleDrawerState }> = (props) => {
  const target = createMemo<{
    readonly book: number;
    readonly chapter: number;
    readonly verse: number;
  } | null>(() => {
    const v = verseFromFocusOrCursor(props.state);
    if (v === null) return null;
    const s = props.state.status();
    if (s._tag !== 'ready') return null;
    return { book: s.chapter.book, chapter: s.chapter.chapter, verse: v };
  });

  return (
    <Show
      when={target()}
      keyed
      fallback={
        <StudyTabEmpty
          title="Spirit of Prophecy"
          body="Move the cursor (j/k) or click a verse to load EGW commentary on it."
        />
      }
    >
      {(t) => (
        <div class="flex flex-col gap-3">
          <p class="text-ui-xs text-muted">Verse {t.verse}</p>
          <Suspense fallback={<p class="text-ui-sm text-muted">Searching cached EGW…</p>}>
            <EgwCommentaryList book={t.book} chapter={t.chapter} verse={t.verse} />
          </Suspense>
        </div>
      )}
    </Show>
  );
};

const EgwCommentaryList: Component<{
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
}> = (props) => {
  const hits = ipc.bible.getCommentary.query(() => ({
    book: props.book,
    chapter: props.chapter,
    verse: props.verse,
  }));
  const list = createMemo(() => hits() ?? []);
  return (
    <Show
      when={list().length > 0}
      fallback={
        <p class="text-ui-sm text-muted">
          No cached EGW paragraph mentions this verse yet. Read more chapters in the EGW reader to
          fill the index.
        </p>
      }
    >
      <ul class="flex flex-col gap-3 list-none p-0 m-0">
        <For each={list()}>
          {(hit) => (
            <li class="flex flex-col gap-0.5">
              <div class="flex items-baseline gap-2">
                <span class="text-[0.62em] text-muted uppercase tracking-wide [font-variant-numeric:tabular-nums]">
                  {hit.refcodeShort ?? hit.bookCode}
                </span>
                <span class="text-ui-sm font-medium text-fg">{hit.bookTitle}</span>
              </div>
              <p class="text-ui-sm text-muted m-0 leading-snug line-clamp-4">{hit.snippet}</p>
            </li>
          )}
        </For>
      </ul>
    </Show>
  );
};

// Strong's tab: shows the last-clicked code (focus.code) and fetches the
// lexicon entry through the ipc proxy. The procedure caches per-code so
// flipping back and forth between codes is instant after the first fetch.
const StrongsTab: Component<{ readonly state: BibleDrawerState }> = (props) => {
  const focus = createMemo(() => {
    const f = props.state.studyFocus();
    return f._tag === 'strongs' ? f : null;
  });

  return (
    <Show
      when={focus()}
      keyed
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
              {f.code}
            </p>
            <p class="text-ui-xs text-muted">from verse {f.verse}</p>
          </div>
          <Suspense fallback={<p class="text-ui-sm text-muted">Loading lexicon…</p>}>
            <StrongsEntry code={f.code} />
          </Suspense>
        </div>
      )}
    </Show>
  );
};

const StrongsEntry: Component<{ readonly code: string }> = (props) => {
  const entryRes = ipc.bible.strongsLookup.query(() => ({ code: props.code }));
  return (
    <Show
      when={entryRes()}
      keyed
      fallback={<p class="text-ui-sm text-muted">No lexicon entry for this code.</p>}
    >
      {(entry) => (
        <div class="flex flex-col gap-2">
          <div class="flex flex-wrap items-baseline gap-x-2">
            <span class="text-ui-lg text-fg" lang={entry.language === 'hebrew' ? 'he' : 'el'}>
              {entry.lemma}
            </span>
            <span class="text-ui-sm text-muted italic">{entry.transliteration}</span>
            <span class="text-ui-xs text-muted uppercase tracking-wide">{entry.language}</span>
          </div>
          <p class="text-ui-sm text-fg whitespace-pre-wrap">{entry.definition}</p>
        </div>
      )}
    </Show>
  );
};

// Cross-refs tab: shows entries from the bundled openbible / TSKE catalogs
// for the verse the user clicked. Each row renders the reference + a one-line
// preview pulled from the KJV chapter so the user can scan without navigating
// away. Verse-end ranges show their full text concatenated by a single space.
// Format a target ref as "Book C:V" or "Book C:V-V'". We use the bible-reader
// book registry so abbreviations + spelling match the rest of the UI.
const formatXrefTitle = (ref: CrossRef): string => {
  const book = getBibleBook(ref.targetBook);
  const name = book?.name ?? `Book ${String(ref.targetBook)}`;
  const verses =
    ref.targetVerseEnd !== null && ref.targetVerseEnd > ref.targetVerse
      ? `${String(ref.targetVerse)}-${String(ref.targetVerseEnd)}`
      : String(ref.targetVerse);
  return `${name} ${String(ref.targetChapter)}:${verses}`;
};

const XrefsTab: Component<{ readonly state: BibleDrawerState }> = (props) => {
  const target = createMemo<{
    readonly book: number;
    readonly chapter: number;
    readonly verse: number;
  } | null>(() => {
    const f = props.state.studyFocus();
    if (f._tag !== 'xref') return null;
    const s = props.state.status();
    if (s._tag !== 'ready') return null;
    return { book: s.chapter.book, chapter: s.chapter.chapter, verse: f.verse };
  });

  return (
    <Show
      when={target()}
      keyed
      fallback={
        <StudyTabEmpty
          title="Cross references"
          body="Click a verse number in the chapter to look up its cross references."
        />
      }
    >
      {(t) => (
        <div class="flex flex-col gap-3">
          <p class="text-ui-xs text-muted">Verse {t.verse}</p>
          <Suspense fallback={<p class="text-ui-sm text-muted">Loading cross references…</p>}>
            <XrefsList
              book={t.book}
              chapter={t.chapter}
              verse={t.verse}
              onNavigate={(book, chapter) => props.state.navigate(book, chapter)}
            />
          </Suspense>
        </div>
      )}
    </Show>
  );
};

const XrefsList: Component<{
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
  readonly onNavigate: (book: number, chapter: number) => void;
}> = (props) => {
  const refs = ipc.bible.getCrossRefs.query(() => ({
    book: props.book,
    chapter: props.chapter,
    verse: props.verse,
  }));
  const list = createMemo(() => refs() ?? []);
  return (
    <Show
      when={list().length > 0}
      fallback={
        <p class="text-ui-sm text-muted">
          No cross references for this verse in the bundled catalogs.
        </p>
      }
    >
      <ul class="flex flex-col gap-2 list-none p-0 m-0">
        <For each={list()}>{(ref) => <XrefRow ref={ref} onNavigate={props.onNavigate} />}</For>
      </ul>
    </Show>
  );
};

const XrefRow: Component<{
  readonly ref: CrossRef;
  readonly onNavigate: (book: number, chapter: number) => void;
}> = (props) => {
  // The per-row preview leans on the ipc cache: even N rows pointing at the
  // same chapter dedupe to a single query subscription, so the explicit
  // chapter grouping the old imperative path did is now handled by the cache.
  // Read `.latest` so previews don't gate the row render — show the ref + a
  // dash while loading rather than suspending the whole list.
  const chapterRes = ipc.bible.getChapter.query(() => ({
    book: props.ref.targetBook,
    chapter: props.ref.targetChapter,
  }));
  const preview = createMemo(() => {
    const chap = chapterRes.latest;
    if (chap === undefined || chap === null) return null;
    const start = props.ref.targetVerse;
    const end = props.ref.targetVerseEnd ?? props.ref.targetVerse;
    const texts = chap.verses.filter((v) => v.verse >= start && v.verse <= end).map((v) => v.text);
    return texts.length === 0 ? null : texts.join(' ');
  });
  const title = createMemo(() => formatXrefTitle(props.ref));
  return (
    <li class="flex flex-col gap-0.5">
      <div class="flex items-baseline gap-2">
        <button
          type="button"
          class="cursor-pointer bg-transparent border-0 p-0 text-ui-sm font-medium text-accent hover:underline text-left"
          title={`Open ${title()}`}
          onClick={() => props.onNavigate(props.ref.targetBook, props.ref.targetChapter)}
        >
          {title()}
        </button>
        <span class="text-[0.62em] text-muted uppercase tracking-wide [font-variant-numeric:tabular-nums]">
          {props.ref.source === 'tske' ? 'TSK' : 'OB'}
        </span>
      </div>
      <Show when={preview()}>
        {(p) => <p class="text-ui-sm text-muted m-0 leading-snug">{p()}</p>}
      </Show>
    </li>
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
