import { Option } from 'effect';
import { type Component, createMemo, For, Show, Suspense } from 'solid-js';
import { ipc } from '../../runtime.js';
import type { BibleDrawerState } from '../../services/bible-drawer-state.js';
import { ReaderShell } from '../ui/reader-shell.js';

// Lists every cached EGW paragraph that references the active verse.
export const EgwTab: Component<{ readonly state: BibleDrawerState }> = (props) => (
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
