import type { Schemas } from '@bible/core/egw';
import { Effect, Option, Result } from 'effect';
import { type Component, createEffect, createMemo, createResource, For, Show } from 'solid-js';
import { runtime } from '../runtime.js';
import { EGWData } from '../services/egw-data.js';
import { parseParagraphContent } from '../services/paragraph-ast.js';
import { ReaderState, type ReaderSelection } from '../services/reader-state.js';
import { ParagraphView } from './paragraph-view.js';

// The reading region. Three states:
//   1. nothing selected → onboarding empty state ("pick a book")
//   2. book selected but no chapter → instruct user to pick a chapter
//   3. chapter selected → fetch + render. Prev/next derived from the TOC's
//      navigable items (those with a para_id).
//
// Each render-state subscribes to exactly the data it needs: ChapterContent
// runs createResource on [bookId, chapterParaId] and re-fetches when either
// changes. Adjacent-chapter lookup also runs the TOC fetch — that call is
// hot in the HttpClient response cache (TocSidebar already triggered it for
// this book) so we don't pay the round-trip twice.

export interface ReaderPaneProps {
  readonly selection: Option.Option<ReaderSelection>;
}

export const ReaderPane: Component<ReaderPaneProps> = (props) => (
  <main class="reader" role="main">
    <Show
      when={Option.isSome(props.selection) ? props.selection.value : null}
      fallback={
        <EmptyState title="EGW reader" sub="Pick a book from the library to start reading." />
      }
      keyed
    >
      {(sel) => (
        <Show
          when={Option.isSome(sel.chapterParaId) ? sel.chapterParaId.value : null}
          fallback={
            <EmptyState
              title={`Book ${String(sel.bookId)}`}
              sub="Pick a chapter from the contents panel."
            />
          }
          keyed
        >
          {(chapterParaId) => (
            <ChapterContent
              bookId={sel.bookId}
              chapterParaId={chapterParaId}
              highlightParaId={sel.highlightParaId}
            />
          )}
        </Show>
      )}
    </Show>
  </main>
);

interface EmptyStateProps {
  readonly title: string;
  readonly sub: string;
}

const EmptyState: Component<EmptyStateProps> = (props) => (
  <div class="empty-wrap">
    <div class="empty" role="status">
      <div class="empty-inner">
        <p class="empty-title">{props.title}</p>
        <p class="empty-sub">{props.sub}</p>
      </div>
    </div>
  </div>
);

interface ChapterContentProps {
  readonly bookId: number;
  readonly chapterParaId: string;
  readonly highlightParaId: Option.Option<string>;
}

const ChapterContent: Component<ChapterContentProps> = (props) => {
  const [chapter] = createResource(
    () => [props.bookId, props.chapterParaId] as const,
    ([bookId, paraId]) =>
      runtime.runPromise(
        Effect.gen(function* () {
          const data = yield* EGWData;
          return yield* data.getChapterByParaId(bookId, paraId);
        }).pipe(Effect.result),
      ),
  );

  // Scroll-to-highlight: whenever a chapter loads with a highlightParaId set
  // (search-result navigation), find the paragraph in the DOM and scroll it
  // into view, then ask ReaderState to clear the highlight so it doesn't fire
  // again if the user navigates back to this chapter manually.
  createEffect(() => {
    const result = chapter();
    if (result === undefined || Result.isFailure(result)) return;
    if (Option.isNone(props.highlightParaId)) return;
    const targetParaId = props.highlightParaId.value;
    // The For renders synchronously inside the parent Show, but the resource
    // signal can fire before the DOM is patched. A microtask defer is enough
    // — Solid flushes between the resource update and the next microtask.
    queueMicrotask(() => {
      const el = document.querySelector<HTMLElement>(
        `.paragraph[data-para-id="${CSS.escape(targetParaId)}"]`,
      );
      if (el !== null) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.classList.add('paragraph-flash');
        setTimeout(() => el.classList.remove('paragraph-flash'), 2000);
      }
      void runtime.runPromise(
        Effect.gen(function* () {
          const state = yield* ReaderState;
          yield* state.clearHighlight;
        }),
      );
    });
  });

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

  // Navigable items in TOC order — used to compute prev/next.
  const navItems = createMemo(() => {
    const t = toc();
    if (t === undefined) return [];
    if (Result.isFailure(t)) return [];
    return t.success.filter(
      (i): i is Schemas.TocItem & { para_id: string } =>
        i.para_id !== undefined && i.para_id !== null && i.para_id !== '',
    );
  });

  const currentIndex = createMemo(() =>
    navItems().findIndex((i) => i.para_id === props.chapterParaId),
  );

  const prev = () => {
    const i = currentIndex();
    return i > 0 ? navItems()[i - 1] : undefined;
  };

  const next = () => {
    const i = currentIndex();
    const items = navItems();
    return i >= 0 && i < items.length - 1 ? items[i + 1] : undefined;
  };

  const goto = (paraId: string) => {
    void runtime.runPromise(
      Effect.gen(function* () {
        const state = yield* ReaderState;
        yield* state.openChapter(props.bookId, paraId);
      }),
    );
  };

  return (
    <article class="chapter">
      <Show when={chapter.loading}>
        <p class="rail-status">Loading chapter…</p>
      </Show>
      <Show when={chapter()} keyed>
        {(result) =>
          Result.isFailure(result) ? (
            <p class="rail-status rail-error">Failed to load chapter.</p>
          ) : (
            <>
              <div class="chapter-body">
                <For each={result.success}>{(p) => <ParagraphBlock paragraph={p} />}</For>
              </div>
              <nav class="chapter-nav" aria-label="Chapter navigation">
                <button
                  type="button"
                  class="chapter-nav-btn"
                  disabled={prev() === undefined}
                  onClick={() => {
                    const p = prev();
                    if (p !== undefined) goto(p.para_id);
                  }}
                >
                  ← {prev()?.title ?? 'Previous'}
                </button>
                <button
                  type="button"
                  class="chapter-nav-btn"
                  disabled={next() === undefined}
                  onClick={() => {
                    const n = next();
                    if (n !== undefined) goto(n.para_id);
                  }}
                >
                  {next()?.title ?? 'Next'} →
                </button>
              </nav>
            </>
          )
        }
      </Show>
    </article>
  );
};

interface ParagraphBlockProps {
  readonly paragraph: Schemas.Paragraph;
}

const ParagraphBlock: Component<ParagraphBlockProps> = (props) => {
  const nodes = createMemo(() => parseParagraphContent(props.paragraph.content ?? ''));
  return (
    <p class="paragraph" data-para-id={props.paragraph.para_id ?? undefined}>
      <ParagraphView nodes={nodes()} />
    </p>
  );
};
