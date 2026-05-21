import type { Schemas } from '@bible/core/egw';
import { Effect, Fiber, Option, Result, Stream } from 'effect';
import {
  type Component,
  createResource,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';
import { runtime } from '../runtime.js';
import { EGWData } from '../services/egw-data.js';
import { ReaderState } from '../services/reader-state.js';

// TOC sidebar — middle pane. Shows the table of contents for the currently
// open book and lets the user navigate between chapters.
//
// TocItem.level is the hierarchy depth (front matter sections, parts, chapters,
// subsections). Items without a para_id are pure headings — no chapter to
// open, so they render as labels. Items with a para_id become click targets
// that call ReaderState.openChapter(bookId, para_id).
//
// Active-chapter highlighting subscribes to ReaderState.changes the same way
// app.tsx does — keeps the sidebar in sync when navigation comes from any
// source (prev/next buttons, deep links, etc.) without prop drilling.

export interface TocSidebarProps {
  readonly bookId: number;
}

const INDENT_PER_LEVEL_PX = 16;

export const TocSidebar: Component<TocSidebarProps> = (props) => {
  const [toc] = createResource(
    () => props.bookId,
    (bookId) =>
      runtime.runPromise(
        Effect.gen(function* () {
          const data = yield* EGWData;
          return yield* data.getToc(bookId);
        }).pipe(Effect.result),
      ),
  );

  const [activeParaId, setActiveParaId] = createSignal<string | null>(null);

  onMount(() => {
    const fiber = runtime.runFork(
      Effect.gen(function* () {
        const state = yield* ReaderState;
        yield* state.changes.pipe(
          Stream.runForEach((sel) =>
            Effect.sync(() => {
              if (Option.isNone(sel)) {
                setActiveParaId(null);
                return;
              }
              const para = sel.value.chapterParaId;
              setActiveParaId(Option.isSome(para) ? para.value : null);
            }),
          ),
        );
      }),
    );
    onCleanup(() => {
      void runtime.runPromise(Fiber.interrupt(fiber));
    });
  });

  const openChapter = (paraId: string) => {
    void runtime.runPromise(
      Effect.gen(function* () {
        const state = yield* ReaderState;
        yield* state.openChapter(props.bookId, paraId);
      }),
    );
  };

  return (
    <div class="flex flex-col h-full min-h-0">
      <Show when={toc.loading}>
        <p class="m-0 p-4 text-ui-sm text-muted">Loading…</p>
      </Show>
      <Show when={toc()} keyed>
        {(result) =>
          Result.isFailure(result) ? (
            <p class="m-0 p-4 text-ui-sm text-[#c53030]">Failed to load TOC.</p>
          ) : (
            <ul class="list-none m-0 px-2 pt-2 pb-6 flex flex-col gap-px">
              <For each={result.success}>
                {(item) => (
                  <TocRow
                    item={item}
                    active={activeParaId() === (item.para_id ?? null)}
                    onSelect={openChapter}
                  />
                )}
              </For>
            </ul>
          )
        }
      </Show>
    </div>
  );
};

interface TocRowProps {
  readonly item: Schemas.TocItem;
  readonly active: boolean;
  readonly onSelect: (paraId: string) => void;
}

const TocRow: Component<TocRowProps> = (props) => {
  const indent = () => ({ 'padding-left': `${String(props.item.level * INDENT_PER_LEVEL_PX)}px` });
  const label = () => props.item.title ?? props.item.refcode_short ?? '(untitled)';
  const paraId = () => props.item.para_id ?? null;

  return (
    // Headings = group labels with no chapter. Visually distinct from clickable
    // rows so the user knows they're not interactive. Tight top spacer creates
    // group separation without a divider line. The first heading in the list
    // gets a tighter top padding via the [li:first-child_>_&]:pt-1 variant on
    // the heading div, mirroring the original `.toc-list > li:first-child .toc-heading`.
    <li>
      <Show
        when={paraId()}
        keyed
        fallback={
          <div
            class="w-full text-left block text-ui-xs leading-[1.4] text-muted rounded-md font-semibold tracking-[0.08em] uppercase pt-[14px] pr-3 pb-1 pl-3 [li:first-child_>_&]:pt-1"
            style={indent()}
          >
            {label()}
          </div>
        }
      >
        {(pid) => (
          <button
            type="button"
            class="w-full text-left block text-ui-base leading-[1.4] text-fg rounded-md bg-transparent border-none border-l-2 border-l-transparent cursor-pointer py-[7px] pr-3 pl-[14px] ml-0 transition-[background,border-color,color] duration-[0.12s] ease-in-out hover:bg-[color-mix(in_srgb,var(--color-accent)_7%,transparent)] hover:outline-none focus-visible:bg-[color-mix(in_srgb,var(--color-accent)_7%,transparent)] focus-visible:outline-none data-active:border-l-accent data-active:bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] data-active:text-accent data-active:font-medium"
            data-active={props.active ? '' : undefined}
            style={indent()}
            onClick={() => props.onSelect(pid)}
          >
            {label()}
          </button>
        )}
      </Show>
    </li>
  );
};
