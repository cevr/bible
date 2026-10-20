// The studio's code view: a scene's file as it
// stands, a row to a line, numbered, a long line wrapped under its number,
// lit by the playhead as the staged film plays it (`code-lit.ts`): each of
// the scene's rows (`core/scene-steps.ts`, a cue's literal for a cue row) by
// its state, live with a meter under its line and its percent beside it,
// held brighter, waiting or released dim, the next to start saying when;
// and each call that reads the clock while it fires, its line glowing and
// fading after. The band over the code names the beat the frame is on, how
// many rows are live and the next to start, and sets
// the beat's line (the reader's words, `words/line.ts`) with a chip at each
// mark, the live one lit; a chip seeks to its mark. A tap on
// a line, its number or its text, seeks to where it next fires
// (`nextFiring`, over the scene's `firingsOf`); nothing selects. The
// view is read only: an agent writes the code, the owner reads it.
//
// Its inputs are props (`CodeView`): the scene's code, its clock at the
// playhead, why it is unlit, a seek. `StudioCode` gives them from the
// studio's context, in two places: the inspector's Code section (the
// selected beat's scene) and the Script pane (`ScriptPane`, the beat at the
// playhead's, the next beat's as the playhead crosses into it). The text is painted
// through the page's highlights (`browser/highlights.ts`), so it stays
// selectable and copyable. Every state is a pure function of the playhead,
// so a link with `#t=` lights what its sender saw.

import { useAtomValue } from '@bible/atom-solid';
import { For, Show } from '@solidjs/web';
import { Boolean as Bool, Option, Result } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { type Accessor, createEffect, createMemo, createSignal, untrack } from 'solid-js';
import type { Host } from '../../browser/host.ts';
import type { ClockReads, Film } from '../../canvas/film.ts';
import { type Placed, sceneClock, sceneOf } from '../../core/layout.ts';
import type { SceneCode } from '../../core/schema.ts';
import { stepRowsOf } from '../../core/scene-steps.ts';
import { LabApi } from '../api.ts';
import { hubKeys } from '../command/changes.ts';
import { pressed } from '../pressed.ts';
import { type FollowClock, type Following, createFollowing, useFollow } from '../follow.ts';
import { FollowButton } from '../follow-button.tsx';
import { usePainted } from '../transcript/words.ts';
import {
  type CodeClock,
  type Lit,
  type StagedScene,
  beatWords,
  firingsOf,
  followLine,
  litNow,
  liveMark,
  liveWords,
  metersOn,
  nextFiring,
  rowsOf,
  saidAt,
  statusOn,
} from './code-lit.ts';
import { LinePiece, piecesOf } from '../words/line.ts';
import { parse } from '../../core/narration.ts';
import { useStudio } from './context.tsx';
import { CODE_CSS } from './style.ts';
import { StudioIcon } from './icons.tsx';
import { hasScene, timecode } from './view-state.ts';
import { PlaceStyle } from '../place-style.tsx';

/**
 * A scene at the playhead: where the film places it (`start`, film seconds),
 * the scene as staged (one object for as long as the film is staged), and
 * its clock then.
 */
interface SceneLight {
  readonly start: number;
  readonly staged: StagedScene;
  readonly clock: CodeClock;
}

/** A scene placed in a staged film. */
interface Staging {
  readonly film: Film;
  readonly placed: Placed;
}

/** The same scene of the same staged film: a frame that moves only the playhead stages nothing new. */
const sameStaging = Option.makeEquivalence<Staging>(
  (a, b) => a.film === b.film && a.placed === b.placed,
);

/** Why the code is unlit where no staged film plays the version shown. */
const UNLIT = 'Lit for the open version';

/** The names scene `scene`'s frame read off its clock, of all `reads` heard (none for a scene the frame did not draw). */
const heardIn = (reads: ClockReads, scene: string): CodeClock['heard'] => {
  const of = (by: ReadonlyMap<string, ReadonlySet<string>>): ReadonlySet<string> =>
    Option.getOrElse(Option.fromUndefinedOr(by.get(scene)), () => new Set<string>());
  return { cues: of(reads.cues), marks: of(reads.marks) };
};

/**
 * Scene `scene` at the studio's playhead while `lit()` and the staged film
 * plays the version shown (none otherwise): its start, the scene as staged,
 * and its clock, the names each frame drawn read off it heard
 * (`Player.hearClock`) while the caller is mounted and lit.
 */
const useSceneLight = (
  scene: Accessor<string>,
  lit: Accessor<boolean>,
): Accessor<Option.Option<SceneLight>> => {
  const { state, meta } = useStudio();
  // Where the staged film places the scene while it is lit: it changes as a film is staged, never with a frame.
  const staging = createMemo(
    () => {
      const id = scene();
      return Option.flatMap(
        Option.filter(meta.drawn(), () => lit()),
        (film): Option.Option<Staging> =>
          Option.map(Result.getSuccess(sceneOf(film.placed, id)), (placed) => ({ film, placed })),
      );
    },
    { equals: sameStaging },
  );
  const staged = createMemo(() =>
    Option.map(staging(), ({ film, placed }) => ({
      start: placed.start,
      staged: {
        fps: film.fps,
        cues: placed.cues,
        rows: stepRowsOf(placed, film.fps),
        voice: sceneClock(placed),
      },
    })),
  );
  // The reads of the staged film's frames, heard while the view is lit; each frame drawn moves `drawn`.
  let hearing = Option.none<{ readonly reads: () => ClockReads }>();
  const [drawn, setDrawn] = createSignal(0, { ownedWrite: true });
  createEffect(
    () => Option.filter(meta.player(), () => Option.isSome(staging())),
    (staged) =>
      Option.match(staged, {
        onNone: () => {
          hearing = Option.none();
          return () => {};
        },
        onSome: ({ player }) => {
          // Heard before it hears: the frame shown now is drawn again as it starts hearing.
          const stopDrawn = player.onDraw(() => setDrawn((n) => n + 1));
          const heard = player.hearClock();
          hearing = Option.some(heard);
          return () => {
            hearing = Option.none();
            stopDrawn();
            heard.stop();
          };
        },
      }),
  );
  return createMemo(() => {
    drawn();
    const id = scene();
    return Option.map(staged(), ({ start, staged: s }) => ({
      start,
      staged: s,
      clock: {
        ...s,
        t: state.T() - start,
        heard: Option.match(hearing, {
          onNone: () => ({ cues: new Set<string>(), marks: new Set<string>() }),
          onSome: (h) => heardIn(h.reads(), id),
        }),
      },
    }));
  });
};

/**
 * The code's head: the scene, its file, and the time at the playhead while it
 * is lit; Follow while a reader has the box.
 */
const Head = (props: {
  readonly code: SceneCode;
  readonly at: Option.Option<number>;
  readonly following: Following;
}) => (
  <div class="st-code-head">
    <p class="st-code-where">
      {[
        props.code.scene,
        props.code.file,
        ...Option.toArray(Option.map(props.at, (T) => timecode(T))),
      ].join(' · ')}
    </p>
    <FollowButton following={props.following} />
  </div>
);

/**
 * The band over the code, the view's one line of now: the beat the frame is
 * on and the mark its voice last said (`beatWords`) left, what plays right
 * (`liveWords`); unlit, the scene and why.
 */
const Band = (props: {
  readonly code: SceneCode;
  readonly light: Option.Option<SceneLight>;
  readonly lit: Option.Option<Lit>;
  readonly unlit: Option.Option<string>;
  readonly said: ReadonlyArray<LinePiece>;
  readonly toMark: (name: string) => void;
}) => {
  const live = () => Option.flatMap(props.light, (l) => liveMark(l.clock.voice, l.clock.t));
  // A chip seeks while the view is lit: the mark's time is the staged film's.
  const seeks = (name: string) =>
    Option.exists(props.light, (l) => Option.isSome(saidAt(l.clock.voice, name)));
  // The line shows three rows at a time (`--said-row`, as tall as a chip's): the live chip's row is its top, so
  // the words said now are in sight.
  let line = Option.none<HTMLElement>();
  createEffect(
    () => Option.getOrElse(live(), () => ''),
    (name) => {
      Option.map(line, (box) =>
        Option.match(
          Option.fromNullishOr(box.querySelector<HTMLElement>(`[data-mark="${name}"]`)),
          {
            onNone: () => box.scrollTo({ top: 0 }),
            onSome: (chip) => {
              const row = Number.parseFloat(getComputedStyle(box).lineHeight) || 1;
              box.scrollTo({ top: Math.floor(chip.offsetTop / row) * row });
            },
          },
        ),
      );
    },
  );
  return (
    <div class="st-code-band">
      <div class="st-code-band-top">
        <span class="st-code-beat" data-role="beat">
          {Option.getOrElse(
            Option.map(props.light, (l) => beatWords(props.code.scene, l.clock.voice, l.clock.t)),
            () => props.code.scene,
          )}
        </span>
        <span
          class="st-code-live"
          data-empty={pressed(
            Option.match(props.lit, { onNone: () => true, onSome: (l) => l.live === 0 }),
          )}
        >
          {Option.getOrElse(
            Option.orElse(Option.map(props.lit, liveWords), () => props.unlit),
            () => '',
          )}
        </span>
      </div>
      <Show when={props.said.length > 0}>
        <p
          class="st-code-said"
          data-role="said"
          ref={(el: HTMLParagraphElement) => {
            line = Option.some(el);
          }}
        >
          <For each={props.said}>
            {(piece) =>
              LinePiece.$match(piece, {
                Said: (p) => <span>{p.text}</span>,
                Mark: (m) => (
                  <Show
                    when={seeks(m.name)}
                    fallback={
                      <span class="st-code-chip" data-mark={m.name}>
                        {m.name}
                      </span>
                    }
                  >
                    <button
                      type="button"
                      class="st-code-chip"
                      data-mark={m.name}
                      data-live={pressed(Option.contains(live(), m.name))}
                      aria-label={`To the mark ${m.name}`}
                      onClick={() => props.toMark(m.name)}
                    >
                      {m.name}
                    </button>
                  </Show>
                ),
              })
            }
          </For>
        </p>
      </Show>
    </div>
  );
};

/**
 * A scene's code, lit by `light` (none: unlit, `unlit` saying why when it is
 * the version's, not the playhead's); a tap on a line seeks (`seek`, film
 * seconds) to where it next fires.
 */
const CodeView = (props: {
  readonly host: Host;
  readonly code: SceneCode;
  readonly light: Accessor<Option.Option<SceneLight>>;
  readonly unlit: Accessor<Option.Option<string>>;
  /** The beat's line split at its marks (the reader's words), set in the band. */
  readonly said: Accessor<ReadonlyArray<LinePiece>>;
  readonly seek: (T: number) => void;
  /** The page's clock as Follow hears it. */
  readonly clock: FollowClock;
}) => {
  const lit = createMemo(() => Option.map(props.light(), (l) => litNow(props.code, l.clock)));
  const rows = createMemo(() => rowsOf(props.code));
  const digits = createMemo(() => String(rows().length).length);
  /** How brightly line `n` glows now: none for a line nothing fires on, nor has just fired on. */
  const glowOn = (n: number) =>
    Option.getOrUndefined(Option.flatMap(lit(), (l) => Option.fromUndefinedOr(l.glows.get(n))));
  const meters = (n: number) =>
    Option.getOrElse(
      Option.map(lit(), (l) => metersOn(l.meters, n)),
      () => [],
    );
  // Where each line plays, built once for the scene as staged: a frame moves the time, never the scene's firings.
  const staged = createMemo(() => Option.map(props.light(), (l) => l.staged), {
    equals: Option.makeEquivalence<StagedScene>((a, b) => a === b),
  });
  const firings = createMemo(() => Option.map(staged(), (s) => firingsOf(props.code, s)));
  /** Whether a tap on line `n` seeks: it reads or writes what the scene's clock plays, at any time. */
  const seeks = (n: number) => Option.exists(firings(), (f) => f.has(n));
  // Whether the view places its box: until a reader scrolls it; Play, Follow or a tap on a line gives it back.
  const following = createFollowing();
  /** Seek to where line `n` next fires, when it reads or writes the clock: the view follows it there. */
  const seekLine = (n: number) =>
    Option.map(untrack(props.light), (l) =>
      Option.map(
        Option.flatMap(untrack(firings), (f) => nextFiring(f, n, l.clock.t, l.clock.fps)),
        (at) => {
          following.resume();
          props.seek(l.start + at);
        },
      ),
    );

  /** Seek to mark `name`'s word, half a frame in, so the frame landed on is the one it is said on. */
  const toMark = (name: string) =>
    Option.map(untrack(props.light), (l) =>
      Option.map(saidAt(l.clock.voice, name), (at) => {
        following.resume();
        props.seek(l.start + at + 0.5 / l.clock.fps);
      }),
    );

  let page = Option.none<HTMLElement>();
  let scroller = Option.none<HTMLElement>();
  // The line the view looks at: what began last by the frame (`followLine`), so it moves only as a read or a cue
  // begins. The line number is the key, so a frame that moves nothing reads no layout.
  const looking = createMemo(() =>
    Option.getOrElse(
      Option.map(
        Option.flatMap(lit(), (l) => followLine(props.code, l)),
        String,
      ),
      () => '',
    ),
  );
  useFollow(
    {
      box: () => scroller,
      content: () => page,
      target: looking,
      span: (line) =>
        Option.map(
          Option.flatMap(page, (root) =>
            Option.fromNullishOr(root.querySelector<HTMLElement>(`[data-line="${line}"]`)),
          ),
          (row) => ({ first: row, last: row }),
        ),
      // Two lines clear of each edge, the top's under the band.
      clear: () =>
        Option.match(page, {
          onNone: () => ({ top: 0, bottom: 0 }),
          onSome: (root) => {
            const lh = Number.parseFloat(getComputedStyle(root).lineHeight) || 0;
            const band = Option.match(
              Option.fromNullishOr(root.querySelector<HTMLElement>('.st-code-band')),
              { onNone: () => 0, onSome: (b) => b.offsetHeight },
            );
            return { top: band + 2 * lh, bottom: 2 * lh };
          },
        }),
      following,
    },
    props.clock,
  );
  usePainted(
    props.host,
    () => page,
    () =>
      Option.match(lit(), {
        onNone: () => ({ 'code-live': [], 'code-held': [], 'code-dim': [] }),
        onSome: (l) => ({
          'code-live': [...l.literals, ...l.reads],
          'code-held': l.held,
          'code-dim': l.dim,
        }),
      }),
  );
  // A tap on a row seeks to where the line next fires: the one seek of a line, its number's (a button, so the
  // keys' too) and its text's alike, as a click on the number bubbles here. A tap on the text while text is
  // selected is the end of a drag that selected it, so it seeks nothing. The number selects no text and no drag
  // ends on it, so it seeks whatever the page has selected.
  const tapped = (event: MouseEvent) =>
    Option.map(
      Option.liftPredicate(event.target, (t): t is Element => t instanceof Element),
      (t) => {
        const onNumber = Option.isSome(Option.fromNullishOr(t.closest('button.st-code-n')));
        const selecting = !(window.getSelection()?.isCollapsed ?? true);
        if (selecting && !onNumber) return;
        Option.map(Option.fromNullishOr(t.closest('[data-line]')), (r) =>
          seekLine(Number(r.getAttribute('data-line'))),
        );
      },
    );
  return (
    <figure class="st-code" data-file={props.code.file} data-lit={pressed(Option.isSome(lit()))}>
      <PlaceStyle css={CODE_CSS} />
      <Head
        code={props.code}
        at={Option.map(props.light(), (l) => l.start + l.clock.t)}
        following={following}
      />
      <div
        class="st-code-scroll"
        ref={(el: HTMLDivElement) => {
          scroller = Option.some(el);
        }}
      >
        <div
          class="st-code-page"
          style={{ '--digits': digits() }}
          ref={(el: HTMLDivElement) => {
            page = Option.some(el);
            el.addEventListener('click', tapped);
          }}
        >
          <Band
            code={props.code}
            light={props.light()}
            lit={lit()}
            unlit={props.unlit()}
            said={props.said()}
            toMark={toMark}
          />
          <For each={rows()}>
            {(row) => (
              <div
                class="st-code-line"
                data-line={row.n}
                data-lit={pressed(
                  Option.exists(lit(), (l) => l.glows.has(row.n)) || meters(row.n).length > 0,
                )}
                data-seeks={pressed(seeks(row.n))}
                style={{ '--glow': glowOn(row.n) }}
              >
                <Show
                  when={seeks(row.n)}
                  fallback={
                    <span class="st-code-n" aria-hidden="true">
                      {row.n}
                    </span>
                  }
                >
                  <button
                    type="button"
                    class="st-code-n"
                    data-act="seek-line"
                    aria-label={`Line ${row.n}: to where it next plays`}
                  >
                    {row.n}
                  </button>
                </Show>
                <span class="st-code-t" data-from={row.from}>
                  {row.text}
                </span>
                <span class="st-code-st" data-role="status">
                  {Option.getOrElse(
                    Option.flatMap(lit(), (l) => statusOn(l, row.n)),
                    () => '',
                  )}
                </span>
                {/* A meter is its cue's: keyed by the name, its element stays as each frame moves its progress. */}
                <For each={meters(row.n)} keyed={(m) => m.name}>
                  {(m) => (
                    <i
                      class="st-code-meter"
                      data-cue={m().name}
                      style={{ '--done': m().progress }}
                    />
                  )}
                </For>
              </div>
            )}
          </For>
        </div>
      </div>
    </figure>
  );
};

/**
 * Scene `scene`'s code as the lab reads it now, in the studio: lit by the
 * playhead while `lit()` and the staged film plays the version shown; a tap
 * on a line moves the studio's playhead. While it reads, or when it cannot be
 * read, a quiet line says so.
 */
export const StudioCode = (props: { readonly scene: string; readonly lit: Accessor<boolean> }) => {
  const { state, actions, meta } = useStudio();
  // The view is the scene's alone, so the scene read is the one it opened on: a view of another scene is another view.
  const scene = untrack(() => props.scene);
  const read = meta.runtime.atom(LabApi.use((api) => api.code(scene)));
  const code = useAtomValue(() => read);
  const light = useSceneLight(() => scene, props.lit);
  // The beat's line as the script says it now, split at its marks: the reader's words, set over the code.
  const script = useAtomValue(() => meta.script);
  const said = createMemo((): ReadonlyArray<LinePiece> =>
    Option.getOrElse(
      Option.flatMap(AsyncResult.value(script()), (read) =>
        Option.flatMap(
          Option.flatMap(Option.fromUndefinedOr(read.beats.find((b) => b.id === scene)), (b) =>
            Option.fromUndefinedOr(b.say),
          ),
          (say) => Option.map(Result.getSuccess(parse(scene, say)), piecesOf),
        ),
      ),
      () => [],
    ),
  );
  return (
    <Show
      when={Option.getOrUndefined(AsyncResult.value(code()))}
      fallback={
        <p
          class="st-line"
          role={Bool.match(AsyncResult.isFailure(code()), {
            onTrue: () => 'alert',
            onFalse: () => 'status',
          })}
        >
          {AsyncResult.match(code(), {
            onInitial: () => 'Reading the scene…',
            onFailure: () => 'The scene could not be read.',
            onSuccess: () => '',
          })}
        </p>
      }
    >
      {(c) => (
        <CodeView
          host={meta.host}
          code={c()}
          light={light}
          unlit={() => Option.liftPredicate(UNLIT, () => Option.isNone(meta.drawn()))}
          said={said}
          seek={actions.seek}
          clock={{ drawn: state.T, playing: state.playing }}
        />
      )}
    </Show>
  );
};

/**
 * The Script pane: the code view of the beat at the playhead, in the
 * inspector's column while no selection's inspector covers it. It shows the
 * next beat's scene as the playhead crosses into it, and follows the line
 * the frame reads.
 */
export const ScriptPane = () => {
  const { state, actions, meta } = useStudio();
  const keys = hubKeys(meta.hub);
  // The beat at the playhead's scene, when the version draws one for it.
  const scene = createMemo(() =>
    Option.getOrUndefined(
      Option.flatMap(state.current(), (beat) =>
        Option.liftPredicate(beat.beat, (id) =>
          Option.exists(state.timeline(), (t) => hasScene(t, id)),
        ),
      ),
    ),
  );
  return (
    <section class="st-pane st-script" aria-label="Script" data-pane="script">
      <div class="st-pane-head">
        <div class="st-ttl">
          <h2>Script</h2>
          <span class="st-sub">
            {Option.getOrElse(
              Option.map(
                state.current(),
                (beat) =>
                  `${beat.beat} · ${timecode(beat.start)} – ${timecode(beat.start + beat.dur)}`,
              ),
              () => 'no beat at the playhead',
            )}
          </span>
        </div>
        <button
          type="button"
          class="st-close"
          data-act="close-script"
          aria-label="Close the Script pane"
          title={keys.titled('Close the Script pane', 'studio.script')}
          onClick={() => actions.pane(false)}
        >
          <StudioIcon of="close" />
        </button>
      </div>
      <Show
        when={scene()}
        keyed
        fallback={
          <p class="st-line" role="status">
            {Bool.match(Option.isSome(state.current()), {
              onTrue: () => 'This beat draws no scene.',
              onFalse: () => 'No beat at the playhead.',
            })}
          </p>
        }
      >
        {(id: string) => (
          <StudioCode
            scene={id}
            lit={() => Option.exists(state.current(), (beat) => beat.beat === id)}
          />
        )}
      </Show>
    </section>
  );
};
