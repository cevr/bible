/**
 * The web position bar under any run of the reader's input, in Chrome's
 * event order, against playback the test moves (`Tick`): a seeded generator
 * of presses (moved and let go, let go where they began, cancelled, their
 * capture lost, the browser's `change` sent or not), arrow and modifier
 * keys, and playback's ticks between any two events.
 *
 * A press is bounded by the pointer: it opens at `pointerdown` and ends at
 * the first of `pointerup`, `pointercancel` and `lostpointercapture`. In
 * every run:
 * - once no press is open, the bar is within 1 s of playback at each tick;
 * - a seek is sent only at a `pointerup` that moved the value (to that value),
 *   or on an arrow key (one step from where the bar was);
 * - no press stays open: each run ends with a tick, an arrow key and a tick.
 *
 * The test is Chrome where happy-dom is not: a range input fits each value
 * written to it to its step (`fitted`), and `change` comes after a press
 * only when the value differs from the one before the press's first move.
 * Chrome captures the pointer of a press: a touch's capture is let go at
 * its release, a mouse's after the release's `change` (both measured).
 */

import { describe, expect, test } from 'effect-bun-test';
import { Effect, Match, Option, Random } from 'effect';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { Scrubber } from './Scrubber';

type Pointer = 'mouse' | 'touch';

/** One event of the run, or a tick of playback. */
type Step =
  | { readonly _tag: 'Tick'; readonly seconds: number }
  | { readonly _tag: 'Play' }
  | { readonly _tag: 'Halt' }
  | { readonly _tag: 'Down'; readonly pointer: Pointer }
  /** The thumb to a second, or `back` to where the press's first move began. */
  | { readonly _tag: 'Move'; readonly to: number | 'back' }
  | { readonly _tag: 'Up' }
  | { readonly _tag: 'Cancel' }
  | { readonly _tag: 'Lost' }
  /** The browser's `change`, if Chrome owes one; `dropped` when this run skips it. */
  | { readonly _tag: 'Change'; readonly dropped: boolean }
  | { readonly _tag: 'Arrow'; readonly key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' }
  | { readonly _tag: 'Modifier'; readonly key: 'Shift' | 'Alt' | 'Meta' | 'Control' };

/** A run: where playback starts, whether it plays, and the steps. */
interface Run {
  readonly at: number;
  readonly playing: boolean;
  readonly steps: ReadonlyArray<Step>;
}

/** A step, in a line of a broken run. */
const said: (step: Step) => string = Match.type<Step>().pipe(
  Match.tagsExhaustive({
    Tick: ({ seconds }) => `tick ${seconds.toFixed(2)}`,
    Play: () => 'play',
    Halt: () => 'halt',
    Down: ({ pointer }) => `down ${pointer}`,
    Move: ({ to }) => `move ${to}`,
    Up: () => 'up',
    Cancel: () => 'cancel',
    Lost: () => 'lost capture',
    Change: ({ dropped }) =>
      `change${Option.match(Option.liftPredicate(dropped, Boolean), { onNone: () => '', onSome: () => ' dropped' })}`,
    Arrow: ({ key }) => key,
    Modifier: ({ key }) => key,
  }),
);

/** How far an arrow key steps the bar, in seconds. */
const steps = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 } as const;

/** Hymn 100's length: a fraction past a whole second, as the recording says it. */
const length = 239.82;

const valueOf = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

/** A value written to a range input of step 1, as Chrome keeps it: a whole second, inside its range. */
const fitted = (bar: HTMLInputElement, written: string) => {
  const max = Number(bar.max) || 0;
  const near = Math.round(Math.min(Math.max(Number(written), 0), max));
  // A step past the top falls back a step.
  return String(Math.min(near, Math.floor(max)));
};

/**
 * Chrome's range input in this document while the run lasts: React's writes
 * are fitted to the step, as the reader's are. React reads the setter when it
 * mounts the input, so this comes first.
 */
const chromeRanges = () => {
  Object.defineProperty(HTMLInputElement.prototype, 'value', {
    ...valueOf,
    set(this: HTMLInputElement, written: string) {
      valueOf?.set?.call(
        this,
        Option.match(
          Option.liftPredicate(this, (input) => input.type === 'range'),
          {
            onNone: () => written,
            onSome: (range) => fitted(range, written),
          },
        ),
      );
    },
  });
  return {
    [Symbol.dispose]: () => {
      if (valueOf) Object.defineProperty(HTMLInputElement.prototype, 'value', valueOf);
    },
  };
};

/** Chrome and playback, modelled apart from the bar: the seeks owed, and where playback is. */
interface Model {
  at: number;
  playing: boolean;
  pressed: Option.Option<Pointer>;
  /** The value before the press's first move, as Chrome keeps it for `change`. */
  before: Option.Option<number>;
  /** A `change` Chrome owes after the press ended. */
  owed: boolean;
  /** A mouse's capture, let go after the `change` its release owes. */
  held: Option.Option<Pointer>;
  readonly seeks: Array<number>;
}

/** The web bar at `model`'s playback, in the document until the `using` ends; each seek it sends kept. */
const mounted = (model: Model) => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const sent = new Array<number>();
  const draw = () =>
    act(() =>
      root.render(
        <Scrubber
          at={model.at}
          length={Option.some(length)}
          onSeek={(seconds) => {
            sent.push(seconds);
            // The device lands the seek; the bar hears of it at the next tick.
            model.at = seconds;
          }}
        />,
      ),
    );
  draw();
  return {
    bar: Option.getOrThrow(
      Option.liftPredicate(
        host.querySelector('input'),
        (found): found is HTMLInputElement => found instanceof HTMLInputElement,
      ),
    ),
    sent,
    draw,
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

/** Runs `run` against the web bar; a broken rule is said with the steps up to it. */
const play = (run: Run): Option.Option<string> => {
  using _chrome = chromeRanges();
  const model: Model = {
    at: run.at,
    playing: run.playing,
    pressed: Option.none(),
    before: Option.none(),
    owed: false,
    held: Option.none(),
    seeks: [],
  };
  using page = mounted(model);
  const { bar, sent } = page;
  const value = () => Number(bar.value);
  const fire = (event: Event) => act(() => void bar.dispatchEvent(event));
  const pointer = (type: string, kind: Pointer) =>
    fire(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerId: 1,
        pointerType: kind,
        isPrimary: true,
      }),
    );
  /** The reader moves the value: Chrome sets it and says `input`, if it changed. */
  const edit = (to: number) => {
    if (to === value()) return;
    // Chrome keeps the value before the press's first edit, to tell whether to send `change`.
    if (Option.isNone(model.before)) model.before = Option.some(value());
    valueOf?.set?.call(bar, fitted(bar, String(to)));
    fire(new Event('input', { bubbles: true }));
  };
  /** The press ends: Chrome owes a `change` when the value is not the one it began on. */
  const end = () => {
    model.owed = Option.exists(model.before, (before) => before !== value());
    model.pressed = Option.none();
    model.before = Option.none();
  };
  const broke = (rule: string, index: number) =>
    Option.some(
      [
        `${rule} at step ${index}: bar ${bar.value}, playback ${model.at.toFixed(2)},`,
        `seeks [${sent.join(', ')}], owed [${model.seeks.join(', ')}];`,
        `from ${run.at.toFixed(2)}, ${Option.match(Option.liftPredicate(run.playing, Boolean), { onNone: () => 'paused', onSome: () => 'playing' })}:`,
        run.steps
          .slice(0, index + 1)
          .map(said)
          .join(', '),
      ].join(' '),
    );
  const check = (index: number): Option.Option<string> => {
    if (sent.length !== model.seeks.length || sent.some((s, i) => s !== model.seeks[i]))
      return broke('a seek no release or key asked for, or one missing', index);
    if (Option.isNone(model.pressed) && Math.abs(value() - model.at) > 1)
      return broke('the bar is off playback with no press open', index);
    return Option.none();
  };
  const apply = Match.type<Step>().pipe(
    Match.tagsExhaustive({
      Tick: ({ seconds }) => {
        if (model.playing) model.at = Math.min(model.at + seconds, length);
        page.draw();
      },
      Play: () => void (model.playing = true),
      Halt: () => void (model.playing = false),
      Down: ({ pointer: kind }) => {
        model.pressed = Option.some(kind);
        pointer('pointerdown', kind);
      },
      Move: ({ to }) =>
        edit(
          Match.value(to).pipe(
            Match.when('back', () => Option.getOrElse(model.before, value)),
            Match.orElse((second) => second),
          ),
        ),
      Up: () => {
        const kind = Option.getOrElse(model.pressed, (): Pointer => 'mouse');
        if (Option.exists(model.before, (before) => before !== value())) model.seeks.push(value());
        end();
        pointer('pointerup', kind);
        if (kind === 'touch') pointer('lostpointercapture', kind);
        else model.held = Option.some(kind);
      },
      Cancel: () => {
        const kind = Option.getOrElse(model.pressed, (): Pointer => 'mouse');
        end();
        pointer('pointercancel', kind);
        if (kind === 'touch') pointer('lostpointercapture', kind);
      },
      Lost: () => {
        const kind = Option.getOrElse(model.pressed, (): Pointer => 'touch');
        end();
        pointer('lostpointercapture', kind);
      },
      Change: ({ dropped }) => {
        if (model.owed && !dropped) fire(new Event('change', { bubbles: true }));
        model.owed = false;
        if (Option.isSome(model.held)) pointer('lostpointercapture', model.held.value);
        model.held = Option.none();
      },
      Arrow: ({ key }) => {
        const to = Math.min(Math.max(value() + steps[key], 0), Math.floor(length));
        fire(new KeyboardEvent('keydown', { bubbles: true, key }));
        if (to !== value()) {
          model.seeks.push(to);
          valueOf?.set?.call(bar, String(to));
          fire(new Event('input', { bubbles: true }));
          fire(new Event('change', { bubbles: true }));
        }
        fire(new KeyboardEvent('keyup', { bubbles: true, key }));
      },
      Modifier: ({ key }) => {
        fire(new KeyboardEvent('keydown', { bubbles: true, key }));
        fire(new KeyboardEvent('keyup', { bubbles: true, key }));
      },
    }),
  );
  for (const [index, step] of run.steps.entries()) {
    apply(step);
    if (step._tag !== 'Tick') continue;
    const broken = check(index);
    if (Option.isSome(broken)) return broken;
  }
  return check(run.steps.length - 1);
};

/** Every run ends with a tick, an arrow key and a tick: a press left open shows there. */
const closing: ReadonlyArray<Step> = [
  { _tag: 'Tick', seconds: 0.25 },
  { _tag: 'Arrow', key: 'ArrowRight' },
  { _tag: 'Tick', seconds: 0.25 },
];

/** One of `choices`, each as likely as its weight. */
const weighted = <A,>(
  choices: readonly [readonly [number, A], ...ReadonlyArray<readonly [number, A]>],
) =>
  Effect.map(Random.nextBetween(0, 1), (drawn) => {
    const total = choices.reduce((sum, [weight]) => sum + weight, 0);
    let left = drawn * total;
    for (const [weight, choice] of choices) {
      if (left < weight) return choice;
      left -= weight;
    }
    // Only a rounding past the last weight comes here.
    return choices[0][1];
  });

const tick = Effect.map(Random.nextBetween(0.05, 0.5), (seconds): Step => ({
  _tag: 'Tick',
  seconds,
}));

/** Ticks of playback, none to two, between two events. */
const ticks = Effect.gen(function* () {
  const count = yield* Random.nextIntBetween(0, 2);
  return yield* Effect.forEach(Array.from({ length: count }), () => tick);
});

/** A press: down, some moves (the last one back to the start, at times), its end and its `change`. */
const press = Effect.gen(function* () {
  const pointer = yield* Random.choice(['mouse', 'touch'] as const);
  const moves = yield* Random.nextIntBetween(0, 4);
  const run: Array<Step> = [{ _tag: 'Down', pointer }, ...(yield* ticks)];
  for (const _ of Array.from({ length: moves })) {
    run.push({ _tag: 'Move', to: yield* Random.nextIntBetween(0, Math.floor(length)) });
    run.push(...(yield* ticks));
  }
  if (moves > 0 && (yield* Random.nextBetween(0, 1)) < 0.35)
    run.push({ _tag: 'Move', to: 'back' }, ...(yield* ticks));
  run.push(
    yield* weighted<Step>([
      [0.7, { _tag: 'Up' }],
      [0.15, { _tag: 'Cancel' }],
      [0.15, { _tag: 'Lost' }],
    ]),
  );
  run.push(...(yield* ticks));
  run.push({ _tag: 'Change', dropped: (yield* Random.nextBetween(0, 1)) < 0.2 });
  return run;
});

/** One gesture of the run, or a change of playback. */
const gesture = Effect.gen(function* () {
  const kind = yield* weighted([
    [0.5, 'press'],
    [0.15, 'arrow'],
    [0.1, 'modifier'],
    [0.1, 'play'],
    [0.05, 'halt'],
    [0.1, 'tick'],
  ] as const);
  return yield* Match.value(kind).pipe(
    Match.when('press', () => press),
    Match.when('arrow', () =>
      Effect.map(
        Random.choice(Object.keys(steps) as Array<keyof typeof steps>),
        (key): Array<Step> => [{ _tag: 'Arrow', key }],
      ),
    ),
    Match.when('modifier', () =>
      Effect.map(
        Random.choice(['Shift', 'Alt', 'Meta', 'Control'] as const),
        (key): Array<Step> => [{ _tag: 'Modifier', key }],
      ),
    ),
    Match.when('play', () => Effect.succeed<Array<Step>>([{ _tag: 'Play' }])),
    Match.when('halt', () => Effect.succeed<Array<Step>>([{ _tag: 'Halt' }])),
    Match.when('tick', () => Effect.map(tick, (step) => [step])),
    Match.exhaustive,
  );
});

/** The run seeded by `seed`. */
const runOf = (seed: number): Run =>
  Effect.runSync(
    Effect.gen(function* () {
      const at = yield* Random.nextBetween(0, length);
      const playing = yield* Random.nextBoolean;
      const count = yield* Random.nextIntBetween(1, 8);
      const run = new Array<Step>();
      for (const _ of Array.from({ length: count })) {
        run.push(...(yield* gesture), ...(yield* ticks));
      }
      return { at, playing, steps: [...run, ...closing] };
    }).pipe(Random.withSeed(seed)),
  );

/** How many seeded runs the property tries. */
const runs = 300;

describe('the web position bar under any run of input', () => {
  test('keeps its rules over seeded runs of presses, keys and ticks', () => {
    const broken = Array.from({ length: runs }, (_, seed) =>
      Option.map(play(runOf(seed)), (line) => `seed ${seed}: ${line}`),
    ).filter(Option.isSome);
    expect(broken.slice(0, 3).map((it) => it.value)).toEqual([]);
  });

  // Each defect found before, as a fixed run of steps that shows it.
  const drag = (to: ReadonlyArray<number>): Array<Step> =>
    to.map((second): Step => ({ _tag: 'Move', to: second }));
  const playFor = (seconds: number): Array<Step> =>
    Array.from({ length: Math.round(seconds / 0.25) }, (): Step => ({
      _tag: 'Tick',
      seconds: 0.25,
    }));

  test('r1 M1: a drag back from 2:31 to 0:05, a tick between the release and its change', () => {
    expect(
      play({
        at: 151.3,
        playing: true,
        steps: [
          { _tag: 'Down', pointer: 'mouse' },
          ...drag([120, 60, 5]),
          { _tag: 'Up' },
          { _tag: 'Tick', seconds: 0.25 },
          { _tag: 'Change', dropped: false },
          ...playFor(3),
          { _tag: 'Modifier', key: 'Shift' },
          ...playFor(1),
          ...closing,
        ],
      }),
    ).toEqual(Option.none());
  });

  test('r2 M1: paused at 0:34, a drag out to 1:20 and back, let go with no change, then play', () => {
    expect(
      play({
        at: 34.2,
        playing: false,
        steps: [
          { _tag: 'Down', pointer: 'mouse' },
          ...drag([35, 50, 80, 50]),
          { _tag: 'Move', to: 'back' },
          { _tag: 'Up' },
          { _tag: 'Change', dropped: false },
          { _tag: 'Play' },
          ...playFor(9),
          { _tag: 'Arrow', key: 'ArrowRight' },
          ...closing,
        ],
      }),
    ).toEqual(Option.none());
  });

  test('r2 M1: playing at 0:53, a nudge out and back, let go with no change', () => {
    expect(
      play({
        at: 53.4,
        playing: true,
        steps: [
          { _tag: 'Down', pointer: 'mouse' },
          ...drag([59]),
          { _tag: 'Move', to: 'back' },
          { _tag: 'Up' },
          { _tag: 'Change', dropped: false },
          ...playFor(6),
          ...closing,
        ],
      }),
    ).toEqual(Option.none());
  });

  test('a touch drag whose capture is lost before its release, then a change', () => {
    expect(
      play({
        at: 45,
        playing: true,
        steps: [
          { _tag: 'Down', pointer: 'touch' },
          ...drag([123, 210, 85]),
          { _tag: 'Lost' },
          { _tag: 'Change', dropped: false },
          ...playFor(2),
          ...closing,
        ],
      }),
    ).toEqual(Option.none());
  });
});
