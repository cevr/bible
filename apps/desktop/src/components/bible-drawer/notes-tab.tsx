import { type Component, createMemo, For, Show, Suspense } from 'solid-js';
import { ipc } from '../../runtime.js';
import type { BibleDrawerState } from '../../services/bible-drawer-state.js';
import type { MarginNoteType } from '../../services/bible-margin-notes.js';
import { ReaderShell } from '../ui/reader-shell.js';

const NOTE_TYPE_LABEL: Readonly<Record<MarginNoteType, string>> = {
  hebrew: 'Heb.',
  greek: 'Gk.',
  alternate: 'Or',
  name: 'Name',
  other: 'Note',
};

export const NotesTab: Component<{ readonly state: BibleDrawerState }> = (props) => (
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
