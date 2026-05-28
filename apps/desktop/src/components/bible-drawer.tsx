import { getBibleBook } from '@bible/core/bible-reader';
import { Effect, Fiber, Option, Stream } from 'effect';
import {
  type Accessor,
  type Component,
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  on,
  onCleanup,
  onMount,
  Show,
  Suspense,
  Switch,
} from 'solid-js';
import { ipc, runtime } from '../runtime.js';
import type {
  BibleDrawerState,
  BibleStudyTab,
  DrawerTarget,
} from '../services/bible-drawer-state.js';
import { type MarginNoteType } from '../services/bible-margin-notes.js';
import { BibleReaderState } from '../services/bible-reader-state.js';
import { type CrossRef } from '../services/bible-xrefs.js';
import { ReaderShell } from './ui/reader-shell.js';

// Right-side verse-pinned study drawer. Single component for both reader modes;
// the parent decides what fires `state.open` (Bible mode: gutter / margin-note
// / Strong's-super / `e` marker. EGW mode: ScriptureRef clicks). The drawer
// itself stays mode-agnostic: it just renders the four study tabs (Notes,
// Cross-refs, Words, EGW) against whatever verse the state is pinned to.
//
// In Bible mode the cursor in `BibleReaderState` drives `state.cursorMoved`
// while the drawer is open, so j/k on the canvas updates the drawer's verse
// without re-opening it. The opt-in subscription is started in `onMount` and
// the drawer only acts on changes when open (see `cursorMoved` in state).

const DRAWER_WIDTH_PX = 380;

export interface BibleDrawerProps {
  readonly state: BibleDrawerState;
}

export const BibleDrawer: Component<BibleDrawerProps> = (props) => {
  // Bible-mode cursor follow. Subscribes to BibleReaderState's changes stream
  // and forwards (book, chapter, verse) into the drawer's `cursorMoved`. This
  // is harmless in EGW mode — BibleReaderState's selection is None there, so
  // the stream simply doesn't carry anything to forward. Keeping the
  // subscription unconditional avoids re-arming it on mode swap.
  onMount(() => {
    const fiber = runtime.runFork(
      Effect.gen(function* () {
        const reader = yield* BibleReaderState;
        yield* reader.changes.pipe(
          Stream.runForEach((sel) =>
            Effect.sync(() => {
              if (Option.isNone(sel)) return;
              if (sel.value._tag !== 'verse') return;
              props.state.cursorMoved({
                book: sel.value.book,
                chapter: sel.value.chapter,
                verse: sel.value.verse,
              });
            }),
          ),
        );
      }),
    );
    onCleanup(() => {
      void runtime.runPromise(Fiber.interrupt(fiber));
    });
  });

  // Keyboard shortcuts while the drawer is open: 1-4 swap tabs.
  createEffect(() => {
    if (!props.state.isOpen()) return;
    const onKey = (e: KeyboardEvent): void => {
      const tgt = e.target;
      if (tgt instanceof HTMLInputElement || tgt instanceof HTMLTextAreaElement) return;
      if (tgt instanceof HTMLElement && tgt.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const idx = { '1': 0, '2': 1, '3': 2, '4': 3 }[e.key];
      if (idx === undefined) return;
      const tab = STUDY_TABS[idx];
      if (tab) {
        e.preventDefault();
        props.state.switchStudyTab(tab.key);
      }
    };
    document.addEventListener('keydown', onKey);
    onCleanup(() => {
      document.removeEventListener('keydown', onKey);
    });
  });

  const widthPx: Accessor<number> = () => DRAWER_WIDTH_PX;

  return (
    <ReaderShell.Frame
      open={props.state.isOpen()}
      onOpenChange={(open) => {
        if (!open) props.state.close();
      }}
      label="Bible study"
      widthPx={widthPx}
      overlay
    >
      <DrawerHeader state={props.state} />
      <DrawerTabs state={props.state} />
      <ReaderShell.TabPanel>
        <StudyPaneBody state={props.state} />
      </ReaderShell.TabPanel>
    </ReaderShell.Frame>
  );
};

const titleForTarget = (target: DrawerTarget): string => {
  const meta = getBibleBook(target.book);
  const name = meta?.name ?? `Book ${String(target.book)}`;
  return `${name} ${String(target.chapter)}:${String(target.verse)}`;
};

const DrawerHeader: Component<{ readonly state: BibleDrawerState }> = (props) => {
  const title = createMemo<string>(() => {
    const t = props.state.target();
    return t === null ? 'Bible' : titleForTarget(t);
  });
  return (
    <ReaderShell.Header>
      <ReaderShell.HeaderTitle title={title()}>{title()}</ReaderShell.HeaderTitle>
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

// ─── Tabs ──────────────────────────────────────────────────────────────────

// One registry per tab — label for the strip, body for the panel. Adding a
// tab is a one-line edit instead of three (array + Switch arm + tab strip).
const STUDY_TABS: readonly {
  readonly key: BibleStudyTab;
  readonly label: string;
  readonly body: Component<{ readonly state: BibleDrawerState }>;
}[] = [
  { key: 'notes', label: 'Notes', body: (p) => <NotesTab state={p.state} /> },
  { key: 'xrefs', label: 'Cross-refs', body: (p) => <XrefsTab state={p.state} /> },
  { key: 'words', label: 'Words', body: (p) => <WordsTab state={p.state} /> },
  { key: 'egw', label: 'EGW', body: (p) => <EgwTab state={p.state} /> },
];

const DrawerTabs: Component<{ readonly state: BibleDrawerState }> = (props) => (
  <ReaderShell.TabsList>
    <For each={STUDY_TABS}>
      {(tab) => (
        <ReaderShell.Tab
          active={props.state.activeStudyTab() === tab.key}
          onClick={() => props.state.switchStudyTab(tab.key)}
        >
          {tab.label}
        </ReaderShell.Tab>
      )}
    </For>
  </ReaderShell.TabsList>
);

const StudyPaneBody: Component<{ readonly state: BibleDrawerState }> = (props) => (
  <For each={STUDY_TABS}>
    {(tab) => (
      <Show when={props.state.activeStudyTab() === tab.key}>
        <tab.body state={props.state} />
      </Show>
    )}
  </For>
);

// ─── Notes tab ─────────────────────────────────────────────────────────────

const NOTE_TYPE_LABEL: Readonly<Record<MarginNoteType, string>> = {
  hebrew: 'Heb.',
  greek: 'Gk.',
  alternate: 'Or',
  name: 'Name',
  other: 'Note',
};

const NotesTab: Component<{ readonly state: BibleDrawerState }> = (props) => (
  <Show
    when={props.state.target()}
    keyed
    fallback={
      <ReaderShell.EmptyState
        title="Margin notes"
        body="Pick a verse to see the bundled margin notes here."
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

// ─── Cross-refs tab ────────────────────────────────────────────────────────

const formatXrefTitle = (ref: CrossRef): string => {
  const book = getBibleBook(ref.targetBook);
  const name = book?.name ?? `Book ${String(ref.targetBook)}`;
  const end = Option.getOrNull(ref.targetVerseEnd);
  const verses =
    end !== null && end > ref.targetVerse
      ? `${String(ref.targetVerse)}-${String(end)}`
      : String(ref.targetVerse);
  return `${name} ${String(ref.targetChapter)}:${verses}`;
};

const XrefsTab: Component<{ readonly state: BibleDrawerState }> = (props) => (
  <Show
    when={props.state.target()}
    keyed
    fallback={
      <ReaderShell.EmptyState
        title="Cross references"
        body="Pick a verse to see its cross references here."
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
            onNavigate={(book, chapter, verse) => props.state.open(book, chapter, verse, 'xrefs')}
          />
        </Suspense>
      </div>
    )}
  </Show>
);

const XrefsList: Component<{
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
  readonly onNavigate: (book: number, chapter: number, verse: number) => void;
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
        <For each={list()}>{(ref) => <XrefRow xref={ref} onNavigate={props.onNavigate} />}</For>
      </ul>
    </Show>
  );
};

const XrefRow: Component<{
  readonly xref: CrossRef;
  readonly onNavigate: (book: number, chapter: number, verse: number) => void;
}> = (props) => {
  const chapterRes = ipc.bible.getChapter.query(() => ({
    book: props.xref.targetBook,
    chapter: props.xref.targetChapter,
  }));
  const preview = createMemo(() => {
    const chap = chapterRes.latest;
    if (chap === undefined || chap === null) return null;
    const start = props.xref.targetVerse;
    const end = Option.getOrElse(props.xref.targetVerseEnd, () => props.xref.targetVerse);
    const texts = chap.verses.filter((v) => v.verse >= start && v.verse <= end).map((v) => v.text);
    return texts.length === 0 ? null : texts.join(' ');
  });
  const title = createMemo(() => formatXrefTitle(props.xref));
  return (
    <li class="flex flex-col gap-0.5">
      <div class="flex items-baseline gap-2">
        <button
          type="button"
          class="cursor-pointer bg-transparent border-0 p-0 text-ui-sm font-medium text-accent hover:underline text-left"
          title={`Open ${title()}`}
          onClick={() =>
            props.onNavigate(
              props.xref.targetBook,
              props.xref.targetChapter,
              props.xref.targetVerse,
            )
          }
        >
          {title()}
        </button>
        <span class="text-[0.62em] text-muted uppercase tracking-wide [font-variant-numeric:tabular-nums]">
          {props.xref.source === 'tske' ? 'TSK' : 'OB'}
        </span>
      </div>
      <Show when={preview()}>
        {(p) => <p class="text-ui-sm text-muted m-0 leading-snug">{p()}</p>}
      </Show>
    </li>
  );
};

// ─── Words tab (Strong's concordance + lexicon search) ─────────────────────
// Free-form Strong's search. The query routes itself:
//   - matches /^[HG]\d+$/i → look up every verse tagged with that code
//   - anything else → substring match across lemma / transliteration /
//     definition in the Strong's lexicon. Clicking a lexicon hit promotes
//     the query to the code so the verse list takes over.
// Verse clicks re-pin the drawer to that verse (the chapter view in the main
// canvas doesn't navigate — Words tab is a research surface, not navigation).

const STRONGS_CODE_RE = /^[HG]\d+$/i;

const WordsTab: Component<{ readonly state: BibleDrawerState }> = (props) => {
  const [rawQuery, setRawQuery] = createSignal('');
  // Seed (and re-seed) the query from the study focus. When the user clicks a
  // Strong's superscript anywhere, the focus carries the code and we drop it
  // straight into the search box so the verse list + lexicon header populate
  // without any typing. Not a pure memo because the input is free-form — the
  // user can type over the seeded value, so we only push on actual focus
  // changes via `on` with the explicit dep.
  createEffect(
    on(props.state.studyFocus, (f) => {
      if (f._tag === 'strongs') setRawQuery(f.code);
    }),
  );
  // Discriminated search mode — one memo, three exhaustive variants. Each
  // Switch arm narrows on `_tag` and reads the variant payload, instead of
  // recomputing the same booleans in each Match `when`.
  type SearchMode =
    | { readonly _tag: 'hint' }
    | { readonly _tag: 'strongs'; readonly code: string }
    | { readonly _tag: 'lexicon'; readonly query: string };
  const searchMode = createMemo<SearchMode>(() => {
    const q = rawQuery().trim();
    if (q.length < 2) return { _tag: 'hint' };
    if (STRONGS_CODE_RE.test(q)) return { _tag: 'strongs', code: q.toUpperCase() };
    return { _tag: 'lexicon', query: q };
  });
  const strongsMode = createMemo(() => {
    const m = searchMode();
    return m._tag === 'strongs' ? m : null;
  });
  const lexiconMode = createMemo(() => {
    const m = searchMode();
    return m._tag === 'lexicon' ? m : null;
  });

  return (
    <div class="flex flex-col gap-3">
      <input
        type="text"
        value={rawQuery()}
        onInput={(e) => setRawQuery(e.currentTarget.value)}
        placeholder="H1234, G5678, or English word…"
        spellcheck={false}
        autocapitalize="off"
        autocorrect="off"
        class="w-full bg-transparent border border-subtle rounded px-2 py-1 text-ui-sm text-fg placeholder:text-muted focus:outline-none focus:border-accent"
      />
      <Switch>
        <Match when={searchMode()._tag === 'hint'}>
          <p class="text-ui-sm text-muted">
            Type a Strong's number (H1234 / G5678) to list every verse it tags, or any English word
            to search the lexicon by definition.
          </p>
        </Match>
        <Match when={strongsMode()}>
          {(mode) => <WordsVerseResults state={props.state} code={mode().code} />}
        </Match>
        <Match when={lexiconMode()}>
          {(mode) => (
            <WordsLexiconResults query={mode().query} onPickCode={(code) => setRawQuery(code)} />
          )}
        </Match>
      </Switch>
    </div>
  );
};

const WordsVerseResults: Component<{
  readonly state: BibleDrawerState;
  readonly code: string;
}> = (props) => {
  const entryRes = ipc.bible.strongsLookup.query(() => ({ code: props.code }));
  const hitsRes = ipc.bible.searchVersesByStrongs.query(() => ({ code: props.code }));
  const countRes = ipc.bible.countStrongsHits.query(() => ({ code: props.code }));

  return (
    <div class="flex flex-col gap-3">
      <Suspense fallback={<p class="text-ui-sm text-muted">Loading lexicon…</p>}>
        <Show
          when={entryRes()}
          keyed
          fallback={
            <p class="text-ui-sm text-muted">
              No lexicon entry for{' '}
              <span class="[font-variant-numeric:tabular-nums]">{props.code}</span>.
            </p>
          }
        >
          {(entry) => (
            <div class="flex flex-col gap-1">
              <div class="flex flex-wrap items-baseline gap-x-2">
                <span class="text-ui-base font-medium text-fg [font-variant-numeric:tabular-nums]">
                  {props.code}
                </span>
                <span class="text-ui-base text-fg" lang={entry.language === 'hebrew' ? 'he' : 'el'}>
                  {entry.lemma}
                </span>
                <span class="text-ui-sm text-muted italic">{entry.transliteration}</span>
              </div>
              <p class="text-ui-sm text-fg whitespace-pre-wrap m-0">{entry.definition}</p>
            </div>
          )}
        </Show>
      </Suspense>
      <Suspense fallback={<p class="text-ui-sm text-muted">Counting occurrences…</p>}>
        <WordsHitCount hits={hitsRes() ?? []} total={countRes() ?? 0} />
      </Suspense>
      <Suspense fallback={<p class="text-ui-sm text-muted">Loading verses…</p>}>
        <WordsHitList
          hits={hitsRes() ?? []}
          onNavigate={(book, chapter, verse) =>
            props.state.open(book, chapter, verse, 'words', {
              _tag: 'strongs',
              verse,
              code: props.code,
            })
          }
        />
      </Suspense>
    </div>
  );
};

const WordsHitCount: Component<{
  readonly hits: readonly { readonly book: number }[];
  readonly total: number;
}> = (props) => (
  <Show when={props.total > 0}>
    <p class="text-ui-xs text-muted [font-variant-numeric:tabular-nums]">
      {props.hits.length < props.total
        ? `Showing ${String(props.hits.length)} of ${String(props.total)} occurrences`
        : `${String(props.total)} occurrence${props.total === 1 ? '' : 's'}`}
    </p>
  </Show>
);

const WordsHitList: Component<{
  readonly hits: readonly {
    readonly book: number;
    readonly bookName: string;
    readonly chapter: number;
    readonly verse: number;
    readonly text: string;
    readonly word: string;
  }[];
  readonly onNavigate: (book: number, chapter: number, verse: number) => void;
}> = (props) => (
  <Show
    when={props.hits.length > 0}
    fallback={<p class="text-ui-sm text-muted">No verses tag this code.</p>}
  >
    <ul class="flex flex-col gap-2 list-none p-0 m-0">
      <For each={props.hits}>
        {(hit) => (
          <li class="flex flex-col gap-0.5">
            <div class="flex items-baseline gap-2">
              <button
                type="button"
                class="cursor-pointer bg-transparent border-0 p-0 text-ui-sm font-medium text-accent hover:underline text-left [font-variant-numeric:tabular-nums]"
                title={`Open ${hit.bookName} ${String(hit.chapter)}:${String(hit.verse)}`}
                onClick={() => props.onNavigate(hit.book, hit.chapter, hit.verse)}
              >
                {hit.bookName} {hit.chapter}:{hit.verse}
              </button>
              <span class="text-[0.62em] text-muted uppercase tracking-wide">{hit.word}</span>
            </div>
            <p class="text-ui-sm text-muted m-0 leading-snug line-clamp-2">{hit.text}</p>
          </li>
        )}
      </For>
    </ul>
  </Show>
);

const WordsLexiconResults: Component<{
  readonly query: string;
  readonly onPickCode: (code: string) => void;
}> = (props) => {
  const entries = ipc.bible.searchLexicon.query(() => ({ query: props.query }));
  return (
    <Suspense fallback={<p class="text-ui-sm text-muted">Searching lexicon…</p>}>
      <Show
        when={(entries() ?? []).length > 0}
        fallback={<p class="text-ui-sm text-muted">No lexicon entries match "{props.query}".</p>}
      >
        <ul class="flex flex-col gap-2 list-none p-0 m-0">
          <For each={entries() ?? []}>
            {(entry) => (
              <li class="flex flex-col gap-0.5">
                <div class="flex items-baseline gap-2">
                  <button
                    type="button"
                    class="cursor-pointer bg-transparent border-0 p-0 text-ui-sm font-medium text-accent hover:underline text-left [font-variant-numeric:tabular-nums]"
                    title={`Show verses tagged ${entry.code}`}
                    onClick={() => props.onPickCode(entry.code)}
                  >
                    {entry.code}
                  </button>
                  <span class="text-ui-sm text-fg" lang={entry.language === 'hebrew' ? 'he' : 'el'}>
                    {entry.lemma}
                  </span>
                  <span class="text-ui-xs text-muted italic">{entry.transliteration}</span>
                </div>
                <p class="text-ui-sm text-muted m-0 leading-snug line-clamp-2">
                  {entry.definition}
                </p>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </Suspense>
  );
};

// ─── EGW tab ───────────────────────────────────────────────────────────────
// Lists every cached EGW paragraph that references the active verse.

const EgwTab: Component<{ readonly state: BibleDrawerState }> = (props) => (
  <Show
    when={props.state.target()}
    keyed
    fallback={
      <ReaderShell.EmptyState
        title="Spirit of Prophecy"
        body="Pick a verse to load cached EGW commentary on it."
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
                  {Option.getOrElse(hit.refcodeShort, () => hit.bookCode)}
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
