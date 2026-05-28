import { Effect } from 'effect';
import {
  type Accessor,
  type Component,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  type JSX,
  onCleanup,
  type Setter,
  Show,
  useContext,
} from 'solid-js';
import { ipc, signalFromStream } from '../../runtime.js';
import { type KjvStrongsWord } from '../../services/kjv-bible.js';
import { INITIAL_READER_SETTINGS, ReaderSettings } from '../../services/reader-settings.js';

export interface VerseMarginNote {
  readonly idx: number;
  readonly phrase: string;
}

interface VerseOverlaysApi {
  readonly strongsWords: (verse: number) => readonly KjvStrongsWord[] | null;
  readonly marginNotes: (verse: number) => readonly VerseMarginNote[];
  readonly hasXref: (verse: number) => boolean;
  readonly setStrongsByVerse: Setter<ReadonlyMap<number, readonly KjvStrongsWord[]>>;
  readonly setMarginNotesByVerse: Setter<ReadonlyMap<number, readonly VerseMarginNote[]>>;
  readonly setXrefVerses: Setter<ReadonlySet<number>>;
}

const VerseOverlaysContext = createContext<VerseOverlaysApi>();

// Holds the three overlay slots — Strong's, margin notes, cross-refs — and
// hands verse rows a `useVerseOverlays()` reader keyed by verse number. The
// overlay components below own their own IPC + toggle gating and push their
// per-verse data into the provider via the exposed setters. Toggle off →
// component unmounts → its cleanup clears the slot so the reader returns
// the empty/null baseline. This decouples adding a new overlay from editing
// the canvas's prop graph.
export const VerseOverlaysProvider: Component<{ readonly children: JSX.Element }> = (props) => {
  const [strongsByVerse, setStrongsByVerse] = createSignal<
    ReadonlyMap<number, readonly KjvStrongsWord[]>
  >(new Map());
  const [marginNotesByVerse, setMarginNotesByVerse] = createSignal<
    ReadonlyMap<number, readonly VerseMarginNote[]>
  >(new Map());
  const [xrefVerses, setXrefVerses] = createSignal<ReadonlySet<number>>(new Set());

  const api: VerseOverlaysApi = {
    strongsWords: (verse) => strongsByVerse().get(verse) ?? null,
    marginNotes: (verse) => marginNotesByVerse().get(verse) ?? [],
    hasXref: (verse) => xrefVerses().has(verse),
    setStrongsByVerse,
    setMarginNotesByVerse,
    setXrefVerses,
  };
  return (
    <VerseOverlaysContext.Provider value={api}>{props.children}</VerseOverlaysContext.Provider>
  );
};

export const useVerseOverlays = (): VerseOverlaysApi => {
  const ctx = useContext(VerseOverlaysContext);
  if (ctx === undefined) {
    throw new Error('useVerseOverlays must be used inside <VerseOverlaysProvider>');
  }
  return ctx;
};

// Single shared ReaderSettings subscription per provider — the three overlays
// all read flags off this memo bundle rather than each opening an independent
// signalFromStream subscription against the same SubscriptionRef.
const useReaderFlags = (): {
  readonly inlineStrongs: Accessor<boolean>;
  readonly inlineMarginNotes: Accessor<boolean>;
  readonly inlineCrossRefs: Accessor<boolean>;
} => {
  const settings = signalFromStream(
    Effect.gen(function* () {
      const s = yield* ReaderSettings;
      return s.changes;
    }),
    INITIAL_READER_SETTINGS,
  );
  return {
    inlineStrongs: createMemo(() => settings().inlineStrongs),
    inlineMarginNotes: createMemo(() => settings().inlineMarginNotes),
    inlineCrossRefs: createMemo(() => settings().inlineCrossRefs),
  };
};

export interface OverlayLoaderProps {
  readonly book: Accessor<number>;
  readonly chapter: Accessor<number>;
}

// Strong's lexicon overlay. Heavy IPC payload — runs only when the toggle is
// on. `.latest` lets verse rows render immediately while words flicker in.
export const StrongsOverlay: Component<OverlayLoaderProps> = (props) => {
  const { inlineStrongs } = useReaderFlags();
  return (
    <Show when={inlineStrongs()}>
      <StrongsOverlayInner book={props.book} chapter={props.chapter} />
    </Show>
  );
};

const StrongsOverlayInner: Component<OverlayLoaderProps> = (props) => {
  const { setStrongsByVerse } = useVerseOverlays();
  const strongsRes = ipc.bible.getChapterStrongs.query(() => ({
    book: props.book(),
    chapter: props.chapter(),
  }));
  createEffect(() => {
    const s = strongsRes.latest;
    if (s === undefined || s === null) {
      setStrongsByVerse(() => new Map());
      return;
    }
    const m = new Map<number, readonly KjvStrongsWord[]>();
    for (const v of s.verses) m.set(v.verse, v.words);
    setStrongsByVerse(() => m);
  });
  onCleanup(() => {
    setStrongsByVerse(() => new Map());
  });
  return null;
};

// Margin-note overlay. Lightweight per-chapter IPC; pushes anchor metadata so
// VerseRenderer can place inline a/b/c superscripts next to the matched phrase.
export const MarginNotesOverlay: Component<OverlayLoaderProps> = (props) => {
  const { inlineMarginNotes } = useReaderFlags();
  return (
    <Show when={inlineMarginNotes()}>
      <MarginNotesOverlayInner book={props.book} chapter={props.chapter} />
    </Show>
  );
};

const MarginNotesOverlayInner: Component<OverlayLoaderProps> = (props) => {
  const { setMarginNotesByVerse } = useVerseOverlays();
  const marginNotesRes = ipc.bible.getChapterMarginNotes.query(() => ({
    book: props.book(),
    chapter: props.chapter(),
  }));
  createEffect(() => {
    const s = marginNotesRes.latest;
    if (s === undefined || s === null) {
      setMarginNotesByVerse(() => new Map());
      return;
    }
    const m = new Map<number, readonly VerseMarginNote[]>();
    for (const row of s) {
      m.set(
        row.verse,
        row.notes.map((n) => ({ idx: n.idx, phrase: n.phrase })),
      );
    }
    setMarginNotesByVerse(() => m);
  });
  onCleanup(() => {
    setMarginNotesByVerse(() => new Map());
  });
  return null;
};

// Cross-reference overlay. Shares the lightweight chapter-markers IPC with
// any future "has notes" / "has highlights" sibling overlays — that bundle
// resolves in one round-trip so co-mounting siblings don't multiply queries.
export const XrefOverlay: Component<OverlayLoaderProps> = (props) => {
  const { inlineCrossRefs } = useReaderFlags();
  return (
    <Show when={inlineCrossRefs()}>
      <XrefOverlayInner book={props.book} chapter={props.chapter} />
    </Show>
  );
};

const XrefOverlayInner: Component<OverlayLoaderProps> = (props) => {
  const { setXrefVerses } = useVerseOverlays();
  const markersRes = ipc.bible.getChapterMarkers.query(() => ({
    book: props.book(),
    chapter: props.chapter(),
  }));
  createEffect(() => {
    const m = markersRes();
    if (m === undefined) {
      setXrefVerses(() => new Set<number>());
      return;
    }
    setXrefVerses(() => new Set(m.xrefVerses));
  });
  onCleanup(() => {
    setXrefVerses(() => new Set<number>());
  });
  return null;
};
