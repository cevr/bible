// The Source view (the studio's "the code is part of the studio"): the
// scene's file as it stands, in the panel's monospace, a row to a line, with
// the cues playing at the frame lit where the code writes them (their literal
// in the `timeline`) and reads them (`f.at('lift')`), the cue or knob
// selected lit where it is written, the knobs the frame read lit where they
// are written and read, a meter on each playing literal's line, and the line
// `?code=<n>` holds. It is lit by the clock (`liveAt`), never by what ran, so
// a link with `#t=` lights what its sender saw. The text is painted through
// the page's highlights (`browser/highlights.ts`), so it stays selectable and
// copyable. A long line wraps under its number, on a phone and on a laptop
// alike: one layout.
//
// Closed at rest; opened by `?code=follow` (the view scrolls to what plays
// until a hand scrolls it; Play or Follow takes it back) or `?code=<line>`
// (held there). A tap on a line holds it and selects the cue or knob written
// there; a long press or a right-click on it opens the page's context menu
// (Note this line, Copy link). On a laptop it is a column beside the picture;
// on a phone it is a face of the selection's sheet (Inspect · Source) in Edit,
// or a sheet of its own in every other mode and while nothing is selected.

import { Toggle } from '@bible/ui/toggle';
import { ToggleGroup } from '@bible/ui/toggle-group';
import { For, type JSX, Portal, Show } from '@solidjs/web';
import { Array as Arr, Boolean as Bool, Effect, Match, Option, Result } from 'effect';
import { createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import { Highlights, type HighlightName } from '../../browser/highlights.ts';
import { type LabSelection, Selection } from '../../command/selection.ts';
import { sceneOf } from '../../core/layout.ts';
import type { CodeRange, SceneCode } from '../../core/schema.ts';
import { liveAt } from '../../core/timeline.ts';
import { Target } from '../command/context-menu.tsx';
import { useLabPage } from '../panel.tsx';
import { Sheet } from '../review/inspector.tsx';
import { useLab } from '../shell.tsx';
import { PHONE, useMatches } from '../viewport.ts';
import { CodeState, useSource } from './context.tsx';
import {
  type Lit,
  type Picks,
  followLine,
  lineStarts,
  litNow,
  metersOn,
  selectionAt,
} from './lit.ts';
import { FOLLOW } from './open.ts';

/** The name of the selection when it is a `tag` of `scene`. */
const pickedIn = (
  selection: Option.Option<LabSelection>,
  tag: LabSelection['_tag'],
  scene: string,
): Option.Option<string> =>
  Option.map(
    Option.filter(selection, (s) => s._tag === tag && s.scene === scene),
    (s) => s.name,
  );

/** What `code` lights at the frame shown: its cues playing now by the clock, the selection, and the knobs the frame read. */
const useLit = (code: () => SceneCode) => {
  const { state, meta } = useLab();
  return createMemo((): Lit => {
    const c = code();
    state.revision();
    state.drawn();
    const start = Option.getOrElse(
      Option.map(Result.getSuccess(sceneOf(meta.film.placed, c.scene)), (p) => p.start),
      () => 0,
    );
    const picks: Picks = {
      cue: pickedIn(state.selection(), 'Cue', c.scene),
      knob: pickedIn(state.selection(), 'Knob', c.scene),
      read: meta.player
        .knobReads()
        .filter((r) => r.scene === c.scene)
        .map((r) => r.name),
    };
    return litNow(c, liveAt(meta.stage.cuesOf(c.scene), state.T() - start, meta.film.fps), picks);
  });
};

/** One row of the file: its number, its text, and where the text starts in the whole. */
interface Row {
  readonly n: number;
  readonly from: number;
  readonly text: string;
}

const rowsOf = (text: string): ReadonlyArray<Row> => {
  const starts = lineStarts(text);
  return starts.map((from, i) => ({
    n: i + 1,
    from,
    text: text.slice(
      from,
      Option.getOrElse(Option.fromUndefinedOr(starts[i + 1]), () => text.length + 1) - 1,
    ),
  }));
};

/** The file's text, a row to a line, with its lit spans, meters and held line. */
const Text = (props: { readonly code: SceneCode }) => {
  const { state: lab, actions, meta } = useLab();
  const source = useSource();
  const lit = useLit(() => props.code);
  const rows = createMemo(() => rowsOf(props.code.text));
  const digits = createMemo(() => String(rows().length).length);
  let scroller = Option.none<HTMLElement>();
  let page = Option.none<HTMLElement>();
  let watching = Option.none<ResizeObserver>();
  // Where the view last put itself by script: a scroll that lands anywhere else was a hand's.
  let placed = Option.none<number>();

  // The ranges lit, painted on the rows' text; cleared when the view goes.
  const paint = (name: HighlightName, ranges: ReadonlyArray<CodeRange>) =>
    Option.map(page, (root) =>
      Effect.runSyncWith(meta.host)(Highlights.use((h) => h.paint(name, root, ranges))),
    );
  createEffect(
    () => lit(),
    (now) => {
      paint('lab-live', now.literals);
      paint('lab-read', now.reads);
      paint('lab-picked', now.picked);
    },
  );
  onCleanup(() =>
    Effect.runSyncWith(meta.host)(
      Highlights.use((h) =>
        Effect.andThen(
          Effect.andThen(h.clear('lab-live'), h.clear('lab-read')),
          h.clear('lab-picked'),
        ),
      ),
    ),
  );

  // Play takes the view back to following the frame.
  let wasPlaying = false;
  createEffect(
    () => lab.drawn(),
    () => {
      const playing = meta.player.playing();
      if (playing && !wasPlaying) source.resume();
      wasPlaying = playing;
    },
  );

  // The line the view looks at: the held line, else what plays while it follows.
  const held = createMemo(() =>
    Option.flatMap(source.open(), (o) =>
      Match.value(o).pipe(
        Match.tag('Follow', () => Option.none<number>()),
        Match.tag('Line', ({ line }) => Option.some(Math.min(line, rows().length))),
        Match.exhaustive,
      ),
    ),
  );
  // The projection is the line number, so the memo settles on a still target
  // (Option.some(n) is a new object every frame; n is not).
  const looking = createMemo(() =>
    Option.getOrElse(
      Option.orElse(held(), () =>
        Option.flatMap(
          Option.filter(Option.some(source.following()), (on) => on),
          () => followLine(props.code, lit()),
        ),
      ),
      () => 0,
    ),
  );
  // The scroller's size: a viewport that changes is measured again; a frame that does not move the target is not.
  const [size, setSize] = createSignal(0);
  onCleanup(() => Option.map(watching, (o) => o.disconnect()));
  createEffect(
    () => [looking(), size()] as const,
    ([target]) => {
      const line = Option.liftPredicate(target, (n) => n > 0);
      const found = Option.flatMap(Option.all({ line, box: scroller, root: page }), (at) =>
        Option.map(
          Option.fromNullishOr(
            at.root.querySelector<HTMLElement>(`.lab-source-line[data-line="${at.line}"]`),
          ),
          (row) => ({ box: at.box, row }),
        ),
      );
      Option.map(found, ({ box, row }) => {
        const lh = Number.parseFloat(getComputedStyle(row).lineHeight);
        if (Number.isNaN(lh) || lh === 0) return;
        const margin = 2 * lh;
        const inView =
          row.offsetTop >= box.scrollTop + margin &&
          row.offsetTop + row.offsetHeight <= box.scrollTop + box.clientHeight - margin;
        if (inView) return;
        box.scrollTo({ top: Math.max(0, row.offsetTop - box.clientHeight / 3) });
        placed = Option.some(box.scrollTop);
      });
    },
  );

  // A hand on the scroll takes the view off the frame; a tap on a line, unless it ends a text selection, holds it.
  const scrolled = () => {
    Option.map(scroller, (box) => {
      if (!source.following()) return;
      if (Option.exists(placed, (at) => Math.abs(box.scrollTop - at) < 2)) return;
      source.suspend();
    });
  };
  const tap = (n: number) => {
    if (!(window.getSelection()?.isCollapsed ?? true)) return;
    actions.holdLine(n, selectionAt(props.code, n));
  };
  return (
    <div
      class="lab-source-scroll"
      ref={(el: HTMLDivElement) => {
        scroller = Option.some(el);
        const o = new ResizeObserver(() => setSize(el.clientHeight));
        o.observe(el);
        watching = Option.some(o);
      }}
      onScroll={scrolled}
    >
      <div
        class="lab-source-page"
        style={{ '--digits': digits() }}
        data-live-lines={lit()
          .meters.map((m) => m.line)
          .join(' ')}
        role="region"
        tabindex="0"
        aria-label={`${props.code.file}, the scene's code`}
        ref={(el: HTMLDivElement) => {
          page = Option.some(el);
        }}
      >
        <For each={rows()}>
          {(row) => (
            <Target
              of={Selection.cases.Line.make({ scene: props.code.scene, line: row.n })}
              class="lab-source-line"
              data-line={row.n}
              onClick={() => tap(row.n)}
            >
              <span class="lab-source-n" aria-hidden="true">
                {row.n}
              </span>
              <span class="lab-source-t" data-from={row.from}>
                {row.text}
              </span>
              <Show when={Option.contains(held(), row.n)}>
                <i class="lab-source-held" data-line={row.n} />
              </Show>
              <For each={metersOn(lit().meters, row.n)}>
                {(m) => (
                  <i class="lab-source-meter" data-cue={m.name} style={{ '--done': m.progress }} />
                )}
              </For>
            </Target>
          )}
        </For>
      </div>
    </div>
  );
};

/** The view's head: the file it shows, the cues playing in it, and Follow. */
const Head = (props: { readonly code: SceneCode; readonly close: boolean }) => {
  const { actions } = useLab();
  const source = useSource();
  const lit = useLit(() => props.code);
  const follow = () => {
    source.resume();
    if (Option.exists(source.open(), (o) => o._tag === 'Line'))
      actions.showCode(Option.some(FOLLOW));
  };
  return (
    <header class="lab-source-head">
      <span class="lab-source-file">{props.code.file}</span>
      <span class="lab-source-live" data-empty={String(lit().names.length === 0)}>
        {Bool.match(lit().names.length === 0, {
          onTrue: () => 'nothing playing',
          onFalse: () => lit().names.join(' · '),
        })}
      </span>
      <button
        type="button"
        class="sh-btn lab-source-follow"
        data-act="follow-source"
        aria-pressed={`${source.following()}`}
        title="Scroll with the frame"
        onClick={follow}
      >
        Follow
      </button>
      <Show when={props.close}>
        <button
          type="button"
          class="sh-btn lab-source-close"
          data-act="close-source"
          onClick={() => actions.dismissCode()}
        >
          Close
        </button>
      </Show>
    </header>
  );
};

/** The scene's code with its head once the server has read it; while it reads, or when it refuses, the words and the way out. */
const Body = (props: { readonly close: boolean }) => {
  const { actions } = useLab();
  const source = useSource();
  return (
    <section class="lab-source" data-role="source" data-scene={source.scene()}>
      <Show
        when={Option.getOrUndefined(source.code())}
        fallback={
          <>
            <Show when={CodeState.$is('Refused')(source.state())}>
              <header class="lab-source-head">
                <span class="lab-source-file">{source.scene()}</span>
                <button
                  type="button"
                  class="sh-btn lab-source-retry"
                  data-act="retry-source"
                  onClick={() => source.retry()}
                >
                  Retry
                </button>
                <Show when={props.close}>
                  <button
                    type="button"
                    class="sh-btn lab-source-close"
                    data-act="close-source"
                    onClick={() => actions.dismissCode()}
                  >
                    Close
                  </button>
                </Show>
              </header>
            </Show>
            <p
              class="lab-source-note"
              role={Bool.match(CodeState.$is('Refused')(source.state()), {
                onTrue: () => 'alert',
                onFalse: () => 'status',
              })}
            >
              {CodeState.$match(source.state(), {
                Idle: () => `Reading ${source.scene()}…`,
                Reading: () => `Reading ${source.scene()}…`,
                Read: () => '',
                Refused: ({ reason }) => `Could not read ${source.scene()}: ${reason}`,
              })}
            </p>
          </>
        }
      >
        {(c) => (
          <>
            <Head code={c()} close={props.close} />
            <Text code={c()} />
          </>
        )}
      </Show>
    </section>
  );
};

/** On a laptop, the open view as a column beside the picture, at the window's edge. */
export const Column = () => {
  const { state, meta } = useLab();
  const phone = useMatches(meta.host, PHONE);
  return (
    <Show when={!phone() && Option.isSome(state.code())}>
      <Portal mount={document.body}>
        <aside class="lab-source-col" aria-label="Source">
          <Body close />
        </aside>
      </Portal>
    </Show>
  );
};

/**
 * On a phone, the open view in a sheet of its own: while nothing is selected,
 * and in every mode but Edit (the selection's sheet lives in Edit's section,
 * which the other modes hide; the view never goes with it).
 */
export const OwnSheet = () => {
  const { state, actions, meta } = useLab();
  const page = useLabPage();
  const phone = useMatches(meta.host, PHONE);
  const { scene } = useSource();
  const faceOfSelection = () => Option.isSome(state.selection()) && page.mode() === 'edit';
  return (
    <Show when={phone() && Option.isSome(state.code()) && !faceOfSelection()}>
      <Sheet
        host={meta.host}
        hub={meta.hub}
        role="source"
        class="lab-source-sheet"
        title={`Source · ${scene()}`}
        initialFocus={() => false}
        onClose={actions.dismissSheet}
      >
        <Body close={false} />
      </Sheet>
    </Show>
  );
};

type Face = 'inspect' | 'source';

/**
 * A phone's selection sheet with the Source view as its second face: the tabs
 * (Inspect · Source) are the view's open state in the URL, so Back, Close and a
 * reload each leave the face they left.
 */
export const Faces = (props: { readonly children: JSX.Element }) => {
  const { state, actions } = useLab();
  const page = useLabPage();
  const face = (): Face =>
    Bool.match(Option.isSome(state.code()), {
      onTrue: (): Face => 'source',
      onFalse: (): Face => 'inspect',
    });
  return (
    <>
      <ToggleGroup<Face>
        class="sh-seg lab-source-tabs"
        aria-label="Face"
        value={[face()]}
        onValueChange={(pressed) => {
          Option.map(Arr.head(pressed), (next) => {
            if (next === face()) return;
            if (next === 'source') actions.showCode(Option.some(FOLLOW));
            else actions.dismissCode();
          });
        }}
      >
        <Toggle<Face> value="inspect" data-face="inspect">
          Inspect
        </Toggle>
        <Toggle<Face> value="source" data-face="source">
          Source
        </Toggle>
      </ToggleGroup>
      <Show when={face() === 'source'} fallback={props.children}>
        {/* Out of Edit the view is the sheet of its own: one text mounted, one owner of the highlights. */}
        <Show when={page.mode() === 'edit'}>
          <Body close={false} />
        </Show>
      </Show>
    </>
  );
};
