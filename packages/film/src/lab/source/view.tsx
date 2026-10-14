// The Source view (the studio's "the code is part of the studio"): the
// scene's file as it stands, in the panel's monospace, a row to a line, with
// the cues playing at the frame lit where the code writes them (their literal
// in the `timeline`, by the clock alone, as the strip's lanes), each call
// that reads the clock lit while it fires (the frame read the name, heard
// through `Player.hearClock`, and the clock plays it: `f.at('lift')` while
// its cue plays, `f.mark('take')` on its word, `f.spoken('take')` as the
// voice says it), the cue or knob selected lit where it is written, the
// knobs the frame read lit where they are written and read, a meter on each
// playing literal's line, and the line `?code=<n>` holds. Each is a pure
// function of the frame (`lit.ts`), so a link with `#t=` lights what its
// sender saw. The text is painted through the page's highlights
// (`browser/highlights.ts`), so it stays selectable and copyable. A long line
// wraps under its number, on a phone and on a laptop alike: one layout.
//
// Closed at rest; opened by `?code=follow` (the view scrolls to the read that
// fires, the newest first, else to what plays, until a hand scrolls it; Play
// or Follow takes it back) or `?code=<line>` (held there, until a hand
// scrolls it; holding a line takes it back), by the lab's one Follow rule
// (`lab/follow.ts`). A band over the code names the beat the frame is on. A
// tap on a line holds it, selects the cue or knob written there and seeks to
// where the line next fires (`nextFiring`); a long press or a right-click on
// it opens the page's context menu (Note this line, Copy link). On a laptop
// it is a column beside the picture; on a phone it is a face of the
// selection's sheet (Inspect · Source) in Edit, held on the selection's line,
// or a sheet of its own in every other mode and while nothing is selected.

import { Toggle } from '@bible/ui/toggle';
import { ToggleGroup } from '@bible/ui/toggle-group';
import { For, type JSX, Portal, Show } from '@solidjs/web';
import { Array as Arr, Boolean as Bool, Effect, Equal, Option, Result } from 'effect';
import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onSettled,
} from 'solid-js';
import { Highlights, type HighlightName } from '../../browser/highlights.ts';
import type { ClockReads } from '../../canvas/film.ts';
import { type LabSelection, Selection } from '../../command/selection.ts';
import { sceneClock, sceneOf } from '../../core/layout.ts';
import type { CodeRange, SceneCode } from '../../core/schema.ts';
import { Target } from '../command/context-menu.tsx';
import { useLabPage } from '../panel.tsx';
import { pressed } from '../pressed.ts';
import { useFollow } from '../follow.ts';
import { useLab } from '../shell.tsx';
import { Sheet } from '../sheet.tsx';
import { PHONE, useMatches } from '../viewport.ts';
import { CodeState, useSource } from './context.tsx';
import {
  type Lit,
  type Picks,
  beatWords,
  followLine,
  litNow,
  liveWords,
  metersOn,
  nextFiring,
  rowsOf,
  selectionAt,
} from './lit.ts';
import { type Asked, FaceIntent, intentOf } from './intent.ts';
import { FOLLOW, LIVE, codeText, followsFrame, inSheet, isLive, lineOpen } from './open.ts';

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

/** The names scene `scene`'s frame read off its clock, of all `reads` heard (none for a scene the frame did not draw). */
const heardIn = (reads: ClockReads, scene: string) => {
  const of = (by: ReadonlyMap<string, ReadonlySet<string>>): ReadonlySet<string> =>
    Option.getOrElse(Option.fromUndefinedOr(by.get(scene)), () => new Set<string>());
  return { cues: of(reads.cues), marks: of(reads.marks) };
};

/**
 * The names each frame drawn reads off its scenes' clocks, heard from the
 * calling owner's first settle until it goes (`Player.hearClock`): nothing
 * before.
 */
const useHeard = (): ((scene: string) => ReturnType<typeof heardIn>) => {
  const { meta } = useLab();
  let hearing = Option.none<{ readonly reads: () => ClockReads }>();
  onSettled(() => {
    const heard = meta.player.hearClock();
    hearing = Option.some(heard);
    return () => {
      hearing = Option.none();
      heard.stop();
    };
  });
  return (scene) =>
    Option.match(hearing, {
      onNone: () => ({ cues: new Set<string>(), marks: new Set<string>() }),
      onSome: (h) => heardIn(h.reads(), scene),
    });
};

/** A scene the film does not have says nothing. */
const SILENT = { marks: new Map<string, number>(), speechStart: 0, speechEnd: 0 };

/**
 * A scene at the frame shown: where the film places it (`start`, film
 * seconds), and its clock then: the cues as the preview draws them, its
 * voice, and the names the frame read off it (`heard`).
 */
const useClock = (heard: ReturnType<typeof useHeard>) => {
  const { state, meta } = useLab();
  return (scene: string) => {
    const placed = Result.getSuccess(sceneOf(meta.film.placed, scene));
    const start = Option.getOrElse(
      Option.map(placed, (p) => p.start),
      () => 0,
    );
    return {
      start,
      clock: {
        t: state.T() - start,
        fps: meta.film.fps,
        cues: meta.stage.cuesOf(scene),
        voice: Option.match(placed, { onNone: () => SILENT, onSome: sceneClock }),
        heard: heard(scene),
      },
    };
  };
};

/** A scene's clock at the frame shown (`useClock`). */
type ClockOf = ReturnType<typeof useClock>;

/**
 * What `code` lights at the frame shown: its cues playing now by the clock,
 * the reads of the clock firing and the lines they glow on, the selection,
 * and the knobs the frame read.
 */
const useLit = (code: () => SceneCode, clockOf: ClockOf) => {
  const { state, meta } = useLab();
  return createMemo((): Lit => {
    const c = code();
    state.revision();
    state.drawn();
    const picks: Picks = {
      cue: pickedIn(state.selection(), 'Cue', c.scene),
      knob: pickedIn(state.selection(), 'Knob', c.scene),
      read: meta.player
        .knobReads()
        .filter((r) => r.scene === c.scene)
        .map((r) => r.name),
    };
    return litNow(c, clockOf(c.scene).clock, picks);
  });
};

/** The band over the code: the beat the frame is on, and the mark its voice last said (`beatWords`). */
const Beat = () => {
  const { state, meta } = useLab();
  const words = createMemo(() => {
    const scene = state.scene();
    return Option.match(Result.getSuccess(sceneOf(meta.film.placed, scene)), {
      onNone: () => scene,
      onSome: (p) => beatWords(scene, sceneClock(p), state.T() - p.start),
    });
  });
  return (
    <div class="lab-source-beat" data-role="beat">
      {words()}
    </div>
  );
};

/** The nearest ancestor of `el` that scrolls: the box a row moves in, in the column and in a sheet alike. */
const scrollContainerOf = (el: HTMLElement): Option.Option<HTMLElement> =>
  Option.flatMap(Option.fromNullishOr(el.parentElement), (up) => {
    const y = getComputedStyle(up).overflowY;
    return Bool.match(y === 'auto' || y === 'scroll', {
      onTrue: () => Option.some(up),
      onFalse: () => scrollContainerOf(up),
    });
  });

/** The file's text, a row to a line, under the beat it is on, with its lit spans, glowing lines, meters and held line. */
const Text = (props: {
  readonly code: SceneCode;
  readonly lit: Accessor<Lit>;
  readonly clockOf: ClockOf;
}) => {
  const { actions, meta } = useLab();
  const source = useSource();
  const lit = props.lit;
  /** How brightly line `n` glows now: none for a line nothing fires on, nor has just fired on. */
  const glowOn = (n: number) => Option.getOrUndefined(Option.fromUndefinedOr(lit().glows.get(n)));
  const rows = createMemo(() => rowsOf(props.code));
  const digits = createMemo(() => String(rows().length).length);
  let page = Option.none<HTMLElement>();
  // The box the rows scroll in: found from the rows (`scrollContainerOf`), once they stand, so the column and the
  // sheet scroll by one rule.
  let scroller = Option.none<HTMLElement>();
  const box = () => {
    if (Option.isNone(scroller)) scroller = Option.flatMap(page, scrollContainerOf);
    return scroller;
  };

  // The ranges lit, painted on the rows' text; cleared when the view goes.
  const paint = (name: HighlightName, ranges: ReadonlyArray<CodeRange>) =>
    Option.map(page, (root) =>
      Effect.runSyncWith(meta.host)(Highlights.use((h) => h.paint(name, root, ranges))),
    );
  createEffect(
    () => lit(),
    (now) => {
      paint('lab-live', now.literals);
      paint('lab-read', [...now.reads, ...now.knobs]);
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

  // The line the view looks at: the held line, else what plays while it follows. The projection is the line
  // number as a key, so the memo settles on a still target (Option.some(n) is a new object every frame; n is not).
  const looking = createMemo(() =>
    Option.match(
      Option.orElse(source.held(), () =>
        Option.flatMap(
          Option.filter(Option.some(source.following()), (on) => on),
          () => followLine(props.code, lit()),
        ),
      ),
      { onNone: () => '', onSome: String },
    ),
  );
  // The lab's one Follow rule (`lab/follow.ts`): a reader's scroll leaves the view where the hand put it until a
  // line is held, or, while it follows, until Follow or Play takes it back. Play leaves a held view where it is.
  // Its answer, whether a hand has the box, is the context's while this view stands.
  const handHas = useFollow({
    box,
    content: () => page,
    target: looking,
    span: (line) =>
      Option.map(
        Option.flatMap(page, (root) =>
          Option.fromNullishOr(
            root.querySelector<HTMLElement>(`.lab-source-line[data-line="${line}"]`),
          ),
        ),
        (row) => ({ first: row, last: row }),
      ),
    // Two lines clear of each edge, and of the beat's band, a line tall, at the top. A line's height is read off the
    // page the rows inherit it from, so the row is the span's one element, asked once for its place.
    clear: () => {
      const lh = Option.match(page, {
        onNone: () => 0,
        onSome: (root) => Number.parseFloat(getComputedStyle(root).lineHeight) || 0,
      });
      return { top: 3 * lh, bottom: 2 * lh };
    },
    placing: source.placing,
    reader: source.suspend,
    played: () => {
      if (Option.exists(source.open(), followsFrame)) source.resume();
    },
  });
  onCleanup(source.offerHand(handHas));

  /** Seek to where line `n` next fires, when it reads or writes the clock. */
  const seekTo = (n: number) => {
    const { start, clock } = props.clockOf(props.code.scene);
    Option.map(nextFiring(props.code, n, clock), (at) => meta.player.seek(start + at));
  };
  // A tap on a line, unless it ends a text selection, holds it (held again, the view places it again) and seeks to
  // where it next fires: held first, so Back finds the frame the tap left. Code mode holds and selects nothing: a
  // lit line (one that glows, or writes a playing cue) plays again from where it next fires, and the view follows it
  // there; any other line stays still.
  const tap = (n: number) => {
    if (!(window.getSelection()?.isCollapsed ?? true)) return;
    if (source.live()) {
      if (!lit().glows.has(n) && metersOn(lit().meters, n).length === 0) return;
      source.resume();
      seekTo(n);
      return;
    }
    source.resume();
    actions.holdLine(n, selectionAt(props.code, n));
    seekTo(n);
  };
  return (
    <div class="lab-source-scroll">
      <div
        class="lab-source-page"
        style={{ '--digits': digits() }}
        data-live-lines={lit()
          .meters.map((m) => m.line)
          .join(' ')}
        role="region"
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrolling region the keyboard reaches (arrows, Page keys) is WCAG 2.1.1; the rows are its content
        tabindex="0"
        aria-label={`${props.code.file}, the scene's code`}
        ref={(el: HTMLDivElement) => {
          page = Option.some(el);
        }}
      >
        <Beat />
        <For each={rows()}>
          {(row) => (
            <Target
              of={Selection.cases.Line.make({ scene: props.code.scene, line: row.n })}
              class="lab-source-line"
              data-line={row.n}
              style={{ '--glow': glowOn(row.n) }}
              onClick={() => tap(row.n)}
            >
              <span class="lab-source-n" aria-hidden="true">
                {row.n}
              </span>
              <span class="lab-source-t" data-from={row.from}>
                {row.text}
              </span>
              <Show when={Option.contains(source.held(), row.n)}>
                <i class="lab-source-held" data-line={row.n} />
              </Show>
              {/* A meter is its cue's: keyed by the name, its element stays as each frame moves its progress. */}
              <For each={metersOn(lit().meters, row.n)} keyed={(m) => m.name}>
                {(m) => (
                  <i
                    class="lab-source-meter"
                    data-cue={m().name}
                    style={{ '--done': m().progress }}
                  />
                )}
              </For>
            </Target>
          )}
        </For>
      </div>
    </div>
  );
};

/** The view's head: the file it shows, the cues playing in it, Follow, and Code mode. */
const Head = (props: {
  readonly code: SceneCode;
  readonly lit: Accessor<Lit>;
  readonly close: boolean;
}) => {
  const { actions } = useLab();
  const source = useSource();
  const lit = props.lit;
  const follow = () => {
    source.resume();
    if (Option.exists(source.open(), (o) => o._tag === 'Line'))
      actions.showCode(Option.some(FOLLOW));
  };
  // Code mode is a step Back walks (`?code=live`); pressed again it leaves to following.
  const mode = () =>
    actions.showCode(
      Option.some(Bool.match(source.live(), { onTrue: () => FOLLOW, onFalse: () => LIVE })),
    );
  return (
    <header class="lab-source-head">
      <span class="lab-source-file">{props.code.file}</span>
      <span class="lab-source-live" data-empty={pressed(lit().names.length === 0)}>
        {liveWords(props.code, lit())}
      </span>
      <button
        type="button"
        class="sh-btn lab-source-follow"
        data-act="follow-source"
        aria-pressed={pressed(source.following())}
        title="Scroll with the frame"
        onClick={follow}
      >
        Follow
      </button>
      <button
        type="button"
        class="sh-btn lab-source-mode"
        data-act="code-mode"
        aria-pressed={pressed(source.live())}
        title="The code beside the picture, lit as it plays"
        onClick={mode}
      >
        Code mode
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
        {(c) => {
          // What the code lights, once per frame for the head and the text alike, the frames heard while it stands.
          const clockOf = useClock(useHeard());
          const lit = useLit(c, clockOf);
          return (
            <>
              <Head code={c()} lit={lit} close={props.close} />
              <Text code={c()} lit={lit} clockOf={clockOf} />
            </>
          );
        }}
      </Show>
    </section>
  );
};

/**
 * The open view as a column: on a laptop beside the picture, at the window's
 * edge, or in Code mode half the window with the panel set aside; on a phone
 * in Code mode only, under the picture and its strip, as the Script's reader
 * stands (every other opening is a sheet's there).
 */
export const Column = () => {
  const { state, meta } = useLab();
  const phone = useMatches(meta.host, PHONE);
  return (
    <Show when={Option.isSome(state.code()) && (!phone() || isLive(state.code()))}>
      <Portal mount={document.body}>
        <aside class="lab-source-col" aria-label="Source" data-code={codeText(state.code())}>
          <Body close />
        </aside>
      </Portal>
    </Show>
  );
};

/**
 * On a phone, the open view in a sheet of its own: while nothing is selected,
 * and in every mode but Edit (the selection's sheet lives in Edit's section,
 * which the other modes hide; the view never goes with it). Never in Code
 * mode, whose view is the column under the picture.
 */
export const OwnSheet = () => {
  const { state, actions, meta } = useLab();
  const page = useLabPage();
  const phone = useMatches(meta.host, PHONE);
  const { scene } = useSource();
  const faceOfSelection = () => Option.isSome(state.selection()) && page.mode() === 'edit';
  return (
    <Show when={phone() && inSheet(state.code()) && !faceOfSelection()}>
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
 * reload each leave the face they left. The Source face is the selection's:
 * it opens held on the line that writes the cue or knob, as its `file:line`
 * does, and follows the frame only while that line is not known yet: once a
 * read names it, the view settles on it in place, unless the view or the
 * selection has moved on meanwhile. Code mode raises no selection sheet
 * (`PanelAside`): its view is the column under the picture.
 */
export const Faces = (props: { readonly children: JSX.Element }) => {
  const { state, actions } = useLab();
  const source = useSource();
  const page = useLabPage();
  /** The line that writes `s`, once a read names it. */
  const lineOf = (s: LabSelection): Option.Option<number> =>
    Option.map(
      { Cue: source.whereCue, Knob: source.whereKnob }[s._tag](s.scene, s.name),
      (w) => w.line,
    );
  // The selection the face was opened for before its line was known, and whether the view has been seen following
  // for it since: the intent the view settles once the line is known.
  const [asked, setAsked] = createSignal(Option.none<Asked>());
  const open = () => {
    const selection = state.selection();
    const line = Option.flatMap(selection, lineOf);
    actions.showCode(Option.some(Option.match(line, { onNone: () => FOLLOW, onSome: lineOpen })));
    setAsked(
      Option.map(
        Option.filter(selection, () => Option.isNone(line)),
        (s) => ({ selection: s, seen: false }),
      ),
    );
  };
  // Where the intent stands (`intent.ts`), settling only on a change of it.
  const intent = createMemo(
    () =>
      intentOf(asked(), {
        selection: state.selection(),
        following: source.following(),
        lineOf,
      }),
    { equals: Equal.equals },
  );
  createEffect(intent, (now) =>
    FaceIntent.$match(now, {
      Idle: () => {},
      Opening: () => {},
      Waiting: () => {
        setAsked((a) => Option.map(a, (x) => ({ ...x, seen: true })));
      },
      Gone: () => {
        setAsked(Option.none());
      },
      Ready: ({ line }) => {
        setAsked(Option.none());
        // A hand whose scroll is not heard yet has taken the view all the same: it moved on, as if heard.
        if (source.handHas()) return;
        actions.settleCode(lineOpen(line));
      },
    }),
  );
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
            if (next === 'source') open();
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
