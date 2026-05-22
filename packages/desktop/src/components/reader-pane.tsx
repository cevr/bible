import { Option } from 'effect';
import { type Accessor, type Component, createMemo, createSignal, Show } from 'solid-js';
import { type ReaderSelection } from '../services/reader-state.js';
import { BookFeed } from './book-feed.js';

// The reading region. Three states:
//   1. nothing selected → onboarding empty state ("pick a book")
//   2. book selected but no chapter → instruct user to pick a chapter
//   3. chapter selected → render the continuous BookFeed. The feed mounts a
//      sliding window of chapters around the current one and virtualizes
//      paragraphs; the prefetcher warms the rest of the book in the background.
//
// We capture the .reader element as a signal so BookFeed can hand it to its
// virtualizer (TanStack Virtual needs a real Element to attach scroll/resize
// observers to). The ref re-fires on hot reload, so re-capturing is fine.

export interface ReaderPaneProps {
  readonly selection: Option.Option<ReaderSelection>;
  /** Invoked after the feed has scrolled/flashed the highlighted paragraph
   *  so callers can clear ReaderState.highlightParaId. */
  readonly onHighlightApplied?: () => void;
  /** Paragraph paraId to silently scroll-restore on mount (from last
   *  persisted position). */
  readonly restoreParagraphId?: Accessor<Option.Option<string>>;
  /** Fired when the scroll-spy resolves a new (chapter, topmost-paragraph)
   *  pair. Forwarded from BookFeed. */
  readonly onPositionChange?: (chapterParaId: string, paragraphParaId: string) => void;
  /** Current reader font-family token, forwarded to BookFeed so it can
   *  re-sample paragraph metrics when the font changes. */
  readonly fontFamily?: Accessor<string>;
  /** Called with the title of a clicked scripture reference. The app shell
   *  routes this into the Bible drawer. */
  readonly onScriptureClick?: (title: string) => void;
}

export const ReaderPane: Component<ReaderPaneProps> = (props) => {
  const [scrollEl, setScrollEl] = createSignal<HTMLElement | undefined>(undefined);

  // Stable accessor for the highlighted paragraph, threaded through to the
  // feed. We compute it as a memo so identity is stable across selection
  // changes that don't touch the highlight (window-expansion churn, etc).
  const highlightParaId: Accessor<Option.Option<string>> = createMemo(() =>
    Option.flatMap(props.selection, (sel) => sel.highlightParaId),
  );

  return (
    <main
      class="absolute inset-0 flex justify-center overflow-y-auto pt-12 px-6 pb-[120px]"
      role="main"
      ref={(el) => {
        // Defer one frame so the browser has laid out <main> before
        // TanStack Virtual reads its rect. Without this, the ref fires while
        // <main> is still 0×0, the virtualizer's ResizeObserver caches that
        // zero rect, and `calculateRange` returns null forever — yielding a
        // blank reader on refresh.
        requestAnimationFrame(() => {
          setScrollEl(el);
        });
      }}
    >
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
              <BookFeed
                bookId={sel.bookId}
                chapterParaId={chapterParaId}
                scrollEl={scrollEl}
                highlightParaId={highlightParaId}
                onHighlightApplied={props.onHighlightApplied}
                restoreParagraphId={props.restoreParagraphId}
                onPositionChange={props.onPositionChange}
                fontFamily={props.fontFamily}
                onScriptureClick={props.onScriptureClick}
              />
            )}
          </Show>
        )}
      </Show>
    </main>
  );
};

interface EmptyStateProps {
  readonly title: string;
  readonly sub: string;
}

const EmptyState: Component<EmptyStateProps> = (props) => (
  <div class="m-auto flex w-[min(560px,100%)] flex-col gap-8">
    <div
      class="flex w-full min-h-60 items-center justify-center rounded-2xl border-2 border-dashed border-rule px-8 py-12 text-center text-muted"
      role="status"
    >
      <div class="flex flex-col gap-1.5">
        <p class="m-0 text-ui-lg font-medium">{props.title}</p>
        <p class="m-0 text-ui-base opacity-80">{props.sub}</p>
      </div>
    </div>
  </div>
);
