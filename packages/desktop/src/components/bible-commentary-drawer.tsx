import { Effect, Fiber, Option, Stream } from 'effect';
import {
  type Accessor,
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
import { ReaderShell } from './ui/reader-shell.js';

const COMMENTARY_WIDTH_PX = 360;

// Right-side dismissable sheet for Bible mode. Mirrors the EGW reader's
// BibleDrawer chrome — both now compose `ReaderShell.*` primitives so the
// header padding / border-treatment / button affordances stay aligned by
// construction instead of by copy-paste.
//
// Width parity with the existing BibleDrawer is intentional — both share the
// `bibleDrawerWidth` persistence key so a user who resizes one gets the same
// width in either mode.

type Load =
  | { readonly _tag: 'idle' }
  | { readonly _tag: 'loading'; readonly verse: number }
  | { readonly _tag: 'ready'; readonly verse: number; readonly hits: readonly EgwCommentaryHit[] }
  | { readonly _tag: 'error'; readonly message: string };

export interface BibleCommentaryDrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
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
    // Only query when the drawer is actually open — a closed sheet doesn't
    // need to chew the IPC channel every time the user clicks a verse for
    // some other reason (e.g. just highlighting).
    if (!props.open || Option.isNone(sel) || verse === null) {
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
        <Show when={focusedVerse()}>
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
        <Switch>
          <Match when={focusedVerse() === null}>
            <ReaderShell.EmptyState
              title="Spirit of Prophecy"
              body={
                <>
                  Click the <sup class="text-accent">e</sup> marker next to a verse to load EGW
                  commentary on it.
                </>
              }
            />
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
      </ReaderShell.Body>
    </ReaderShell.Frame>
  );
};
