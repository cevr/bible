import { Effect, Fiber, Option, Stream } from 'effect';
import {
  type Accessor,
  type Component,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  Suspense,
} from 'solid-js';
import { ipc, runtime } from '../runtime.js';
import { BibleReaderState, type BibleReaderSelection } from '../services/bible-reader-state.js';
import { ReaderShell } from './ui/reader-shell.js';

const COMMENTARY_WIDTH_PX = 360;

// Right-side dismissable sheet for Bible mode. Mirrors the EGW reader's
// BibleDrawer chrome — both compose `ReaderShell.*` primitives so the
// header padding / border-treatment / button affordances stay aligned by
// construction instead of by copy-paste.
//
// Width parity with the existing BibleDrawer is intentional — both share the
// `bibleDrawerWidth` persistence key so a user who resizes one gets the same
// width in either mode.

export interface BibleCommentaryDrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export const BibleCommentaryDrawer: Component<BibleCommentaryDrawerProps> = (props) => {
  const [selection, setSelection] = createSignal<Option.Option<BibleReaderSelection>>(
    Option.none(),
  );

  onMount(() => {
    const fiber = runtime.runFork(
      Effect.gen(function* () {
        const state = yield* BibleReaderState;
        yield* state.changes.pipe(
          Stream.runForEach((next) => Effect.sync(() => setSelection(next))),
        );
      }),
    );
    onCleanup(() => {
      void runtime.runPromise(Fiber.interrupt(fiber));
    });
  });

  const focused = createMemo<{
    readonly book: number;
    readonly chapter: number;
    readonly verse: number;
  } | null>(() => {
    const sel = selection();
    if (Option.isNone(sel)) return null;
    const verse = Option.getOrNull(sel.value.verse);
    if (verse === null) return null;
    return { book: sel.value.book, chapter: sel.value.chapter, verse };
  });

  const widthPxAccessor: Accessor<number> = () => COMMENTARY_WIDTH_PX;

  return (
    <ReaderShell.Frame
      open={props.open}
      onOpenChange={props.onOpenChange}
      label="EGW commentary"
      widthPx={widthPxAccessor}
      overlay
    >
      <ReaderShell.Header>
        <ReaderShell.HeaderTitle>
          <span class="text-ui-sm font-semibold tracking-[0.08em] uppercase text-muted">
            EGW Commentary
          </span>
        </ReaderShell.HeaderTitle>
        <Show when={focused()?.verse}>
          {(v) => <ReaderShell.HeaderBadge>v. {v()}</ReaderShell.HeaderBadge>}
        </Show>
        <ReaderShell.HeaderIconButton
          onClick={() => props.onOpenChange(false)}
          ariaLabel="Close"
          title="Close (Esc)"
        >
          {'×'}
        </ReaderShell.HeaderIconButton>
      </ReaderShell.Header>
      <ReaderShell.Body>
        <Show
          when={props.open ? focused() : null}
          keyed
          fallback={
            <ReaderShell.EmptyState
              title="Spirit of Prophecy"
              body={
                <>
                  Click the <sup class="text-accent">e</sup> marker next to a verse to load EGW
                  commentary on it.
                </>
              }
            />
          }
        >
          {(target) => (
            <Suspense fallback={<p class="text-ui-sm text-muted">Searching cached EGW…</p>}>
              <CommentaryList book={target.book} chapter={target.chapter} verse={target.verse} />
            </Suspense>
          )}
        </Show>
      </ReaderShell.Body>
    </ReaderShell.Frame>
  );
};

const CommentaryList: Component<{
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
