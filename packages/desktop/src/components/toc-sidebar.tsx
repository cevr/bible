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
    <div class="toc-sidebar">
      <Show when={toc.loading}>
        <p class="toc-status">Loading…</p>
      </Show>
      <Show when={toc()} keyed>
        {(result) =>
          Result.isFailure(result) ? (
            <p class="toc-status toc-error">Failed to load TOC.</p>
          ) : (
            <ul class="toc-list">
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
    <li>
      <Show
        when={paraId()}
        keyed
        fallback={
          <div class="toc-heading" style={indent()}>
            {label()}
          </div>
        }
      >
        {(pid) => (
          <button
            type="button"
            class={`toc-item${props.active ? ' active' : ''}`}
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
