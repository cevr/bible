import { getBibleBook } from '@bible/core/bible';
import { Option } from 'effect';
import { type Component, createMemo, For, Show, Suspense } from 'solid-js';
import { ipc } from '../../runtime.js';
import type { BibleDrawerState } from '../../services/bible-drawer-state.js';
import type { CrossRef } from '../../services/bible-xrefs.js';
import { ReaderShell } from '../ui/reader-shell.js';

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

export const XrefsTab: Component<{ readonly state: BibleDrawerState }> = (props) => (
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
