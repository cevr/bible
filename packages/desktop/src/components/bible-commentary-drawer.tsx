import { Effect, Fiber, Option, Stream } from 'effect';
import {
  type Component,
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from 'solid-js';
import { runtime } from '../runtime.js';
import { BibleReaderState, type BibleReaderSelection } from '../services/bible-reader-state.js';
import { EgwCommentary, type EgwCommentaryHit } from '../services/egw-commentary.js';

// Right-side drawer for Bible mode. Symmetric to the EGW reader's Bible
// drawer: whatever the reader is focused on (here: a Bible verse) drives the
// drawer content (here: cached EGW commentary paragraphs that reference
// that verse). Empty state nudges the user to click a verse number.
//
// Width parity with the existing BibleDrawer is intentional — F3.6 will
// thread the persisted bibleDrawerWidth into both so a user who resizes one
// gets the same width in either mode.

type Load =
  | { readonly _tag: 'idle' }
  | { readonly _tag: 'loading'; readonly verse: number }
  | { readonly _tag: 'ready'; readonly verse: number; readonly hits: readonly EgwCommentaryHit[] }
  | { readonly _tag: 'error'; readonly message: string };

export interface BibleCommentaryDrawerProps {
  readonly widthPx: () => number;
}

export const BibleCommentaryDrawer: Component<BibleCommentaryDrawerProps> = (props) => {
  const [selection, setSelection] = createSignal<Option.Option<BibleReaderSelection>>(
    Option.none(),
  );
  const [load, setLoad] = createSignal<Load>({ _tag: 'idle' });

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

  const focusedVerse = createMemo(() => {
    const sel = selection();
    if (Option.isNone(sel)) return null;
    return Option.getOrNull(sel.value.verse);
  });

  let seq = 0;
  createEffect(() => {
    const sel = selection();
    const verse = focusedVerse();
    if (Option.isNone(sel) || verse === null) {
      setLoad({ _tag: 'idle' });
      return;
    }
    const { book, chapter } = sel.value;
    const mine = ++seq;
    setLoad({ _tag: 'loading', verse });
    runtime
      .runPromise(
        Effect.gen(function* () {
          const svc = yield* EgwCommentary;
          return yield* svc.getCommentary(book, chapter, verse);
        }),
      )
      .then((hits) => {
        if (mine !== seq) return;
        setLoad({ _tag: 'ready', verse, hits });
      })
      .catch((err: unknown) => {
        if (mine !== seq) return;
        setLoad({
          _tag: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      });
  });

  const errorLoad = (): { readonly message: string } | null => {
    const l = load();
    return l._tag === 'error' ? { message: l.message } : null;
  };
  const readyLoad = (): {
    readonly verse: number;
    readonly hits: readonly EgwCommentaryHit[];
  } | null => {
    const l = load();
    return l._tag === 'ready' ? { verse: l.verse, hits: l.hits } : null;
  };

  return (
    <aside
      class="fixed top-[calc(44px*var(--ui-scale))] bottom-0 right-0 bg-bg border-l border-rule z-20 flex flex-col"
      style={{ width: `${String(props.widthPx())}px` }}
      aria-label="EGW commentary"
    >
      <header class="flex items-center gap-2 px-4 py-3 border-b border-rule flex-[0_0_auto]">
        <h2 class="m-0 text-ui-sm font-semibold tracking-[0.08em] uppercase text-muted">
          EGW Commentary
        </h2>
        <Show when={focusedVerse()}>
          {(v) => (
            <span class="text-ui-xs text-muted [font-variant-numeric:tabular-nums]">v. {v()}</span>
          )}
        </Show>
      </header>
      <div class="flex-1 min-h-0 overflow-y-auto px-4 py-3">
        <Switch>
          <Match when={focusedVerse() === null}>
            <EmptyDrawer />
          </Match>
          <Match when={load()._tag === 'loading'}>
            <p class="text-ui-sm text-muted">Searching cached EGW…</p>
          </Match>
          <Match when={errorLoad()} keyed>
            {(err) => <p class="text-ui-sm text-danger">Lookup failed: {err.message}</p>}
          </Match>
          <Match when={readyLoad()} keyed>
            {(ready) => (
              <Show
                when={ready.hits.length > 0}
                fallback={
                  <p class="text-ui-sm text-muted">
                    No cached EGW paragraph mentions this verse yet. Read more chapters in the EGW
                    reader to fill the index.
                  </p>
                }
              >
                <ul class="flex flex-col gap-3 list-none p-0 m-0">
                  <For each={ready.hits}>
                    {(hit) => (
                      <li class="flex flex-col gap-0.5">
                        <div class="flex items-baseline gap-2">
                          <span class="text-[0.62em] text-muted uppercase tracking-wide [font-variant-numeric:tabular-nums]">
                            {hit.refcodeShort ?? hit.bookCode}
                          </span>
                          <span class="text-ui-sm font-medium text-fg">{hit.bookTitle}</span>
                        </div>
                        <p class="text-ui-sm text-muted m-0 leading-snug line-clamp-4">
                          {hit.snippet}
                        </p>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            )}
          </Match>
        </Switch>
      </div>
    </aside>
  );
};

const EmptyDrawer: Component = () => (
  <div class="flex flex-col gap-2">
    <p class="text-ui-sm text-muted">
      Click a verse number on the chapter to load EGW commentary on it.
    </p>
  </div>
);
