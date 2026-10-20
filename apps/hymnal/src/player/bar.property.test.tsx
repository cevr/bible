/**
 * The web position bar under any run of the reader's input, in Chrome's
 * event order, against playback the test moves (`Tick`): a seeded generator
 * of presses (moved and let go, let go where they began, cancelled, their
 * capture lost, the browser's `change` sent or not), and inside a press any
 * of: the eight keys Chrome steps a range with (the arrows, PageUp,
 * PageDown, Home, End), tapped, or held down across other events so that
 * they repeat, their `keyup` coming later or never (the focus moved, and it
 * lands elsewhere); modifier keys (tapped, or held across moves); a second
 * pointer that goes down and up, cancels or loses its capture; another
 * mouse button pressed and let go; playback started and halted. Between
 * presses: the same keys, a press of another button with keys and a screen
 * reader's steps inside it, a screen reader's step, and playback's ticks
 * between any two events. A run starts anywhere, and often at either end of
 * the bar, where a key may move nothing.
 *
 * A press belongs to the pointer that opened it with the main button: it
 * opens at that pointer's `pointerdown` and ends at the first of its
 * `pointerup`, `pointercancel` and `lostpointercapture`. In every run:
 * - a step key's step is sent at once, Chrome's step from where the bar
 *   was, inside a press or outside one, and a screen reader's step outside
 *   one; a key that moves nothing sends nothing, and changes nothing after it;
 * - only the pointer that opened a press ends it: a seek is sent at its
 *   `pointerup` when the value differs from where the bar was as the drag
 *   began, or from the last key's step in that drag, and at no other end;
 * - no step is lost and none is sent twice: the seeks sent are the seeks
 *   owed, in order, after every event;
 * - with no press open, the bar is within 1 s of playback at each tick;
 * - no press stays open: each run ends with a screen reader's step and
 *   three seconds of playback.
 *
 * The test is Chrome where happy-dom is not: a step key's `keydown`, unless
 * the page prevents its default, steps the value (`range_input_type.cc`: an
 * arrow a step, a page key a tenth of the range, Home and End its ends,
 * fitted to the step and the range) and says `input` and `change` when the
 * value moved, nothing when it did not, whatever modifier is down and
 * whether the `keydown` repeats a key held (`repeat: true`); every key and
 * pointer event says the modifiers down then; a range input fits each value
 * written to it to its step (`fitted`), and after a press `change` comes
 * only when the value differs from the one at the last `change` (the
 * press's start, or a key's step in it). Chrome captures the pointer of a
 * press: a touch's capture is let go at its release, a mouse's after the
 * release's `change` (both measured). Chrome moves no thumb while a second
 * touch is down (measured), and another mouse button pressed inside a press
 * is a `pointermove`, as Pointer Events chord buttons.
 */

import { describe, expect, test } from 'effect-bun-test';
import { Effect, Match, Option, Random } from 'effect';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { Scrubber } from './Scrubber';

type Pointer = 'mouse' | 'touch';

/** The keys Chrome steps a range input with. */
const stepKeys = [
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
] as const;
type StepKey = (typeof stepKeys)[number];
type Modifier = 'Shift' | 'Alt' | 'Meta' | 'Control';

/** One event of the run, or a tick of playback. */
type Step =
  | { readonly _tag: 'Tick'; readonly seconds: number }
  | { readonly _tag: 'Play' }
  | { readonly _tag: 'Halt' }
  /** The press's pointer goes down with the main button. */
  | { readonly _tag: 'Down'; readonly pointer: Pointer }
  /** The thumb to a second, or `back` to where the press's value was at its last `change`. */
  | { readonly _tag: 'Move'; readonly to: number | 'back' }
  | { readonly _tag: 'Up' }
  | { readonly _tag: 'Cancel' }
  | { readonly _tag: 'Lost' }
  /** The press's pointer lifts after its capture was lost. */
  | { readonly _tag: 'Late' }
  /** The browser's `change`, if Chrome owes one; `dropped` when this run skips it. */
  | { readonly _tag: 'Change'; readonly dropped: boolean }
  /** A step key goes down, or repeats while held. */
  | { readonly _tag: 'KeyDown'; readonly key: StepKey }
  /** A step key comes up on the bar, or `lost` elsewhere (the focus moved). */
  | { readonly _tag: 'KeyUp'; readonly key: StepKey; readonly lost: boolean }
  | { readonly _tag: 'Modifier'; readonly key: Modifier }
  /** A modifier key goes down and stays down. */
  | { readonly _tag: 'Hold'; readonly key: Modifier }
  /** A held modifier key comes up. */
  | { readonly _tag: 'Free'; readonly key: Modifier }
  /** A second pointer, a touch: down, up, cancelled or its capture lost. */
  | { readonly _tag: 'Second'; readonly phase: 'down' | 'up' | 'cancel' | 'lost' }
  /** Another mouse button inside a mouse press: a `pointermove` that says it. */
  | { readonly _tag: 'Chord'; readonly button: 1 | 2; readonly phase: 'down' | 'up' }
  /** Another mouse button's own press, with no press open. */
  | { readonly _tag: 'Other'; readonly button: 1 | 2; readonly phase: 'down' | 'up' }
  /** A screen reader steps the bar: `input` and `change`, with no key. */
  | { readonly _tag: 'Assist' };

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
    Late: () => 'late up',
    Change: ({ dropped }) =>
      `change${Option.match(Option.liftPredicate(dropped, Boolean), { onNone: () => '', onSome: () => ' dropped' })}`,
    KeyDown: ({ key }) => `${key} down`,
    KeyUp: ({ key, lost }) =>
      `${key} up${Option.match(Option.liftPredicate(lost, Boolean), { onNone: () => '', onSome: () => ' elsewhere' })}`,
    Modifier: ({ key }) => key,
    Hold: ({ key }) => `${key} down`,
    Free: ({ key }) => `${key} up`,
    Second: ({ phase }) => `second ${phase}`,
    Chord: ({ button, phase }) => `button ${button} ${phase} in press`,
    Other: ({ button, phase }) => `button ${button} ${phase}`,
    Assist: () => 'screen reader step',
  }),
);

const modifiers: ReadonlyArray<Modifier> = ['Shift', 'Alt', 'Meta', 'Control'];

/** Hymn 100's length: a fraction past a whole second, as the recording says it. */
const length = 239.82;
/** The bar's last second. */
const top = Math.floor(length);

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
  /** The value at the last `change` while a press moves it (its start, or a key's step), as Chrome keeps it. */
  before: Option.Option<number>;
  /** A `change` Chrome owes after the press ended. */
  owed: boolean;
  /** A mouse's capture, let go after the `change` its release owes. */
  held: Option.Option<Pointer>;
  /** A second pointer is down: Chrome moves no thumb. */
  second: boolean;
  readonly seeks: Array<number>;
}

/** The pointer that opens a press, and a second one. */
const first = 1;
const other = 2;

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
    second: false,
    seeks: [],
  };
  using page = mounted(model);
  const { bar, sent } = page;
  const value = () => Number(bar.value);
  /** Dispatches `event` on the bar, or on `at`; whether the page left its default to the browser. */
  const fire = (event: Event, at: EventTarget = bar) => {
    let open = true;
    act(() => {
      open = at.dispatchEvent(event);
    });
    return open;
  };
  /** The keys down now: Chrome says a key down again a repeat, and every event says the modifiers down. */
  const down = new Set<string>();
  const modified = () => ({
    shiftKey: down.has('Shift'),
    altKey: down.has('Alt'),
    ctrlKey: down.has('Control'),
    metaKey: down.has('Meta'),
  });
  const pointer = (
    type: string,
    kind: Pointer,
    {
      id = first,
      button = 0,
      buttons = 0,
    }: { id?: number; button?: number; buttons?: number } = {},
  ) =>
    fire(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        button,
        buttons,
        pointerId: id,
        pointerType: kind,
        isPrimary: id === first,
        ...modified(),
      }),
    );
  const key = (type: 'keydown' | 'keyup', name: string, at: EventTarget = bar) => {
    const repeat = type === 'keydown' && down.has(name);
    if (type === 'keydown') down.add(name);
    else down.delete(name);
    return fire(
      new KeyboardEvent(type, {
        bubbles: true,
        cancelable: true,
        key: name,
        repeat,
        ...modified(),
      }),
      at,
    );
  };
  /** The browser sets the value and says `input`. */
  const input = (to: number) => {
    valueOf?.set?.call(bar, fitted(bar, String(to)));
    fire(new Event('input', { bubbles: true }));
  };
  /** A step the reader asked for at once (a key, a screen reader) is owed: sent before the event is over. */
  const owe = (to: number) => {
    model.seeks.push(to);
    // Inside a drag, Chrome's `change` after the press now compares with this
    // value. Before the press's first move, the page's own writes (playback)
    // set the value it compares with, as at a press with no key.
    if (Option.isSome(model.before)) model.before = Option.some(to);
  };
  /** A step the browser makes: `input`, then `change`. */
  const step = (to: number) => {
    owe(to);
    input(to);
    fire(new Event('change', { bubbles: true }));
  };
  /**
   * Where Chrome steps the bar from `from` for `name` (`range_input_type.cc`):
   * an arrow a step, a page key a tenth of the range (or a step, if more),
   * Home and End its ends, fitted to the step inside the range.
   */
  const stepOf = (name: StepKey, from: number) => {
    const max = Number(bar.max) || 0;
    const page = Math.max(1, max / 10);
    const raw = Match.value(name).pipe(
      Match.when('ArrowRight', () => from + 1),
      Match.when('ArrowUp', () => from + 1),
      Match.when('ArrowLeft', () => from - 1),
      Match.when('ArrowDown', () => from - 1),
      Match.when('PageUp', () => from + page),
      Match.when('PageDown', () => from - page),
      Match.when('Home', () => 0),
      Match.when('End', () => max),
      Match.exhaustive,
    );
    return Number(fitted(bar, String(raw)));
  };
  /** The press's pointer moves the value: Chrome sets it and says `input`, if it changed. */
  const edit = (to: number) => {
    if (model.second || to === value()) return;
    if (Option.isNone(model.before)) model.before = Option.some(value());
    input(to);
  };
  /** The press ends: Chrome owes a `change` when the value is not the one at its last `change`. */
  const end = () => {
    model.owed = Option.exists(model.before, (before) => before !== value());
    model.pressed = Option.none();
    model.before = Option.none();
  };
  const kindOf = () => Option.getOrElse(model.pressed, (): Pointer => 'mouse');
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
  const seeksHold = (index: number): Option.Option<string> =>
    Option.liftPredicate(
      index,
      () => sent.length !== model.seeks.length || sent.some((s, i) => s !== model.seeks[i]),
    ).pipe(Option.flatMap(() => broke('a seek not owed, or one owed and not sent', index)));
  const follows = (index: number): Option.Option<string> =>
    Option.liftPredicate(
      index,
      () => Option.isNone(model.pressed) && Math.abs(value() - model.at) > 1,
    ).pipe(Option.flatMap(() => broke('the bar is off playback with no press open', index)));
  /** The `buttons` bit of a mouse button other than the main one (Pointer Events: right 2, middle 4). */
  const masks = { 1: 4, 2: 2 } as const;
  /** Whether a button is held after its phase. */
  const held = { down: 1, up: 0 } as const;
  const events = { down: 'pointerdown', up: 'pointerup' } as const;
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
        pointer('pointerdown', kind, { buttons: 1 });
      },
      Move: ({ to }) =>
        edit(
          Match.value(to).pipe(
            Match.when('back', () => Option.getOrElse(model.before, value)),
            Match.orElse((second) => second),
          ),
        ),
      Up: () => {
        const kind = kindOf();
        if (Option.exists(model.before, (before) => before !== value())) model.seeks.push(value());
        end();
        pointer('pointerup', kind);
        if (kind === 'touch') pointer('lostpointercapture', kind);
        else model.held = Option.some(kind);
      },
      Cancel: () => {
        const kind = kindOf();
        end();
        pointer('pointercancel', kind);
        if (kind === 'touch') pointer('lostpointercapture', kind);
      },
      Lost: () => {
        const kind = Option.getOrElse(model.pressed, (): Pointer => 'touch');
        end();
        pointer('lostpointercapture', kind);
      },
      Late: () => pointer('pointerup', 'touch'),
      Change: ({ dropped }) => {
        if (model.owed && !dropped) fire(new Event('change', { bubbles: true }));
        model.owed = false;
        if (Option.isSome(model.held)) pointer('lostpointercapture', model.held.value);
        model.held = Option.none();
      },
      KeyDown: ({ key: name }) => {
        const to = stepOf(name, value());
        const moves = to !== value();
        if (moves) owe(to);
        // Chrome steps in the keydown's default action, after the page's handlers.
        if (key('keydown', name) && moves) {
          input(to);
          fire(new Event('change', { bubbles: true }));
        }
      },
      KeyUp: ({ key: name, lost }) =>
        void Match.value(lost).pipe(
          Match.when(true, () => key('keyup', name, document.body)),
          Match.orElse(() => key('keyup', name)),
        ),
      Modifier: ({ key: name }) => {
        key('keydown', name);
        key('keyup', name);
      },
      Hold: ({ key: name }) => key('keydown', name),
      Free: ({ key: name }) => key('keyup', name),
      Second: ({ phase }) =>
        Match.value(phase).pipe(
          Match.when('down', () => {
            model.second = true;
            pointer('pointerdown', 'touch', { id: other, buttons: 1 });
          }),
          Match.when('up', () => {
            model.second = false;
            pointer('pointerup', 'touch', { id: other });
            pointer('lostpointercapture', 'touch', { id: other });
          }),
          Match.when('cancel', () => {
            model.second = false;
            pointer('pointercancel', 'touch', { id: other });
            pointer('lostpointercapture', 'touch', { id: other });
          }),
          Match.when('lost', () => {
            model.second = false;
            pointer('lostpointercapture', 'touch', { id: other });
          }),
          Match.exhaustive,
        ),
      Chord: ({ button, phase }) =>
        pointer('pointermove', 'mouse', { button, buttons: 1 | (held[phase] * masks[button]) }),
      Other: ({ button, phase }) =>
        pointer(events[phase], 'mouse', { button, buttons: held[phase] * masks[button] }),
      Assist: () => step(value() + 1 - 2 * Number(value() >= top)),
    }),
  );
  for (const [index, next] of run.steps.entries()) {
    apply(next);
    const broken = Option.orElse(seeksHold(index), () =>
      Option.liftPredicate(next, (step) => step._tag === 'Tick').pipe(
        Option.flatMap(() => follows(index)),
      ),
    );
    if (Option.isSome(broken)) return broken;
  }
  return Option.orElse(seeksHold(run.steps.length - 1), () => follows(run.steps.length - 1));
};

/**
 * Every run ends with a screen reader's step (a press left open takes it as
 * a drag, unsent) and three seconds of playback (a drag left open holds the
 * bar off it).
 */
const closing: ReadonlyArray<Step> = [
  { _tag: 'Tick', seconds: 0.25 },
  { _tag: 'Assist' },
  { _tag: 'Tick', seconds: 0.25 },
  { _tag: 'Play' },
  { _tag: 'Tick', seconds: 1 },
  { _tag: 'Tick', seconds: 1 },
  { _tag: 'Tick', seconds: 1 },
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

const chance = (p: number) => Effect.map(Random.nextBetween(0, 1), (drawn) => drawn < p);

const tick = Effect.map(Random.nextBetween(0.05, 0.5), (seconds): Step => ({
  _tag: 'Tick',
  seconds,
}));

/** Ticks of playback, none to two, between two events. */
const ticks = Effect.gen(function* () {
  const count = yield* Random.nextIntBetween(0, 2);
  return yield* Effect.forEach(Array.from({ length: count }), () => tick);
});

/** The step key the run holds down, if any: its `keyup` has not come yet. */
interface Keys {
  held: Option.Option<StepKey>;
}

/** A step key's `keyup`, on the bar or, a time in four, elsewhere (the focus moved). */
const keyUp = (key: StepKey) =>
  Effect.map(chance(0.25), (lost): Step => ({ _tag: 'KeyUp', key, lost }));

/**
 * A step key: with none held, a tap (down, repeated while held, then up)
 * or a key held down from now on; with one held, a repeat of it or its
 * `keyup`.
 */
const keyed = (keys: Keys) =>
  Option.match(keys.held, {
    onSome: (key) =>
      Effect.gen(function* () {
        if (yield* chance(0.5)) return [{ _tag: 'KeyDown', key }] satisfies Array<Step>;
        keys.held = Option.none();
        return [yield* keyUp(key)];
      }),
    onNone: () =>
      Effect.gen(function* () {
        const key = yield* Random.choice(stepKeys);
        const repeat = yield* Random.nextIntBetween(1, 3);
        const downs = Array.from({ length: repeat }, (): Step => ({ _tag: 'KeyDown', key }));
        if (yield* chance(0.35)) {
          keys.held = Option.some(key);
          return downs;
        }
        return [...downs, yield* keyUp(key)];
      }),
  });

const modifier = Effect.map(Random.choice(modifiers), (key): Step => ({ _tag: 'Modifier', key }));

/**
 * A press of the main button: down, then any of moves, keys, a second
 * pointer, another button, playback started or halted; then its end and
 * its `change`.
 */
const press = (keys: Keys) =>
  Effect.gen(function* () {
    const pointer = yield* Random.choice(['mouse', 'touch'] as const);
    const count = yield* Random.nextIntBetween(0, 7);
    const run: Array<Step> = [{ _tag: 'Down', pointer }, ...(yield* ticks)];
    let second = false;
    let chord = Option.none<1 | 2>();
    let held = Option.none<Modifier>();
    let moved = false;
    for (const _ of Array.from({ length: count })) {
      const kind = yield* weighted([
        [0.35, 'move'],
        [0.2, 'key'],
        [0.06, 'modifier'],
        [0.07, 'hold'],
        [0.1, 'second'],
        [0.08, 'chord'],
        [0.07, 'play'],
        [0.07, 'halt'],
      ] as const);
      yield* Match.value(kind).pipe(
        Match.when('move', () =>
          Effect.map(Random.nextIntBetween(0, top), (to) => {
            moved = true;
            run.push({ _tag: 'Move', to });
          }),
        ),
        Match.when('key', () => Effect.map(keyed(keys), (steps) => void run.push(...steps))),
        Match.when('modifier', () => Effect.map(modifier, (step) => void run.push(step))),
        Match.when('hold', () =>
          Option.match(held, {
            onSome: (key) =>
              Effect.sync(() => {
                run.push({ _tag: 'Free', key });
                held = Option.none();
              }),
            onNone: () =>
              Effect.map(Random.choice(modifiers), (key) => {
                run.push({ _tag: 'Hold', key });
                held = Option.some(key);
              }),
          }),
        ),
        Match.when('second', () =>
          Match.value(second).pipe(
            Match.when(false, () =>
              Effect.sync(() => {
                run.push({ _tag: 'Second', phase: 'down' });
                second = true;
              }),
            ),
            Match.orElse(() =>
              Effect.map(Random.choice(['up', 'cancel', 'lost'] as const), (phase) => {
                run.push({ _tag: 'Second', phase });
                second = false;
              }),
            ),
          ),
        ),
        Match.when('chord', () =>
          Match.value(pointer).pipe(
            Match.when('touch', () => Effect.void),
            Match.orElse(() =>
              Option.match(chord, {
                onSome: (button) =>
                  Effect.sync(() => {
                    run.push({ _tag: 'Chord', button, phase: 'up' });
                    chord = Option.none();
                  }),
                onNone: () =>
                  Effect.map(Random.choice([1, 2] as const), (button) => {
                    run.push({ _tag: 'Chord', button, phase: 'down' });
                    chord = Option.some(button);
                  }),
              }),
            ),
          ),
        ),
        Match.when('play', () => Effect.sync(() => void run.push({ _tag: 'Play' }))),
        Match.when('halt', () => Effect.sync(() => void run.push({ _tag: 'Halt' }))),
        Match.exhaustive,
      );
      run.push(...(yield* ticks));
    }
    if (Option.isSome(chord)) run.push({ _tag: 'Chord', button: chord.value, phase: 'up' });
    if (moved && (yield* chance(0.35))) run.push({ _tag: 'Move', to: 'back' }, ...(yield* ticks));
    // A second pointer still down lifts before the first one, or after it.
    const lastLifts = second && (yield* chance(0.5));
    if (second && !lastLifts) run.push({ _tag: 'Second', phase: 'up' });
    const ending = yield* weighted<Step>([
      [0.7, { _tag: 'Up' }],
      [0.15, { _tag: 'Cancel' }],
      [0.15, { _tag: 'Lost' }],
    ]);
    run.push(ending);
    if (ending._tag === 'Lost' && (yield* chance(0.5))) run.push({ _tag: 'Late' });
    if (lastLifts) run.push({ _tag: 'Second', phase: 'up' });
    if (Option.isSome(held)) run.push({ _tag: 'Free', key: held.value });
    run.push(...(yield* ticks));
    run.push({ _tag: 'Change', dropped: yield* chance(0.2) });
    return run;
  });

/** A press of another mouse button, with keys and a screen reader's steps inside it. */
const otherPress = (keys: Keys) =>
  Effect.gen(function* () {
    const button = yield* Random.choice([1, 2] as const);
    const run: Array<Step> = [{ _tag: 'Other', button, phase: 'down' }, ...(yield* ticks)];
    const count = yield* Random.nextIntBetween(0, 3);
    for (const _ of Array.from({ length: count })) {
      const kind = yield* weighted([
        [0.4, 'key'],
        [0.3, 'assist'],
        [0.3, 'modifier'],
      ] as const);
      run.push(
        ...(yield* Match.value(kind).pipe(
          Match.when('key', () => keyed(keys)),
          Match.when('assist', () => Effect.succeed<Array<Step>>([{ _tag: 'Assist' }])),
          Match.when('modifier', () => Effect.map(modifier, (step): Array<Step> => [step])),
          Match.exhaustive,
        )),
        ...(yield* ticks),
      );
    }
    // A right button's menu can take the release.
    if (button === 1 || (yield* chance(0.5))) run.push({ _tag: 'Other', button, phase: 'up' });
    return run;
  });

/** One gesture of the run, or a change of playback. */
const gesture = (keys: Keys) =>
  Effect.gen(function* () {
    const kind = yield* weighted([
      [0.42, 'press'],
      [0.1, 'other'],
      [0.15, 'key'],
      [0.06, 'assist'],
      [0.06, 'modifier'],
      [0.08, 'play'],
      [0.05, 'halt'],
      [0.08, 'tick'],
    ] as const);
    return yield* Match.value(kind).pipe(
      Match.when('press', () => press(keys)),
      Match.when('other', () => otherPress(keys)),
      Match.when('key', () => keyed(keys)),
      Match.when('assist', () => Effect.succeed<Array<Step>>([{ _tag: 'Assist' }])),
      Match.when('modifier', () => Effect.map(modifier, (step): Array<Step> => [step])),
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
      // At either end of the bar a key may move nothing.
      const at = yield* Effect.flatten(
        weighted([
          [0.5, Random.nextBetween(0, length)],
          [0.2, Effect.succeed(0)],
          [0.3, Random.nextBetween(top, length)],
        ]),
      );
      const playing = yield* Random.nextBoolean;
      const count = yield* Random.nextIntBetween(1, 8);
      const keys: Keys = { held: Option.none() };
      const run = new Array<Step>();
      for (const _ of Array.from({ length: count })) {
        run.push(...(yield* gesture(keys)), ...(yield* ticks));
      }
      // A key still held comes up, or its `keyup` lands elsewhere, or never comes.
      if (Option.isSome(keys.held) && (yield* chance(0.5))) run.push(yield* keyUp(keys.held.value));
      return { at, playing, steps: [...run, ...closing] };
    }).pipe(Random.withSeed(seed)),
  );

/** How many seeded runs the property tries, in cases of `slice` seeds each. */
const runs = 400;
const slice = 50;

describe('the web position bar under any run of input', () => {
  // Each case its own slice of the seeds: every seed runs, and each case
  // stays a small share of its timeout while the browser test runs beside it.
  for (const from of Array.from({ length: runs / slice }, (_, i) => i * slice)) {
    test(`keeps its rules over seeded runs ${from} to ${from + slice - 1} of presses, keys, pointers and ticks`, () => {
      const broken = Array.from({ length: slice }, (_, i) => from + i)
        .map((seed) => Option.map(play(runOf(seed)), (line) => `seed ${seed}: ${line}`))
        .filter(Option.isSome);
      expect(broken.slice(0, 3).map((it) => it.value)).toEqual([]);
    });
  }

  // Each defect found before, as a fixed run of steps that shows it.
  const drag = (to: ReadonlyArray<number>): Array<Step> =>
    to.map((second): Step => ({ _tag: 'Move', to: second }));
  const playFor = (seconds: number): Array<Step> =>
    Array.from({ length: Math.round(seconds / 0.25) }, (): Step => ({
      _tag: 'Tick',
      seconds: 0.25,
    }));
  /** A step key pressed and let go on the bar. */
  const tap = (key: StepKey): Array<Step> => [
    { _tag: 'KeyDown', key },
    { _tag: 'KeyUp', key, lost: false },
  ];

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
          ...tap('ArrowRight'),
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

  test('r3 M1: paused at 1:00, ArrowRight with the mouse held on the thumb seeks at once', () => {
    expect(
      play({
        at: 60,
        playing: false,
        steps: [
          { _tag: 'Down', pointer: 'mouse' },
          ...tap('ArrowRight'),
          { _tag: 'Tick', seconds: 0.25 },
          { _tag: 'Up' },
          { _tag: 'Change', dropped: false },
          ...closing,
        ],
      }),
    ).toEqual(Option.none());
  });

  test('r3 M1: a touch moved to 0:24, ArrowLeft, then its capture lost: the step is sent', () => {
    expect(
      play({
        at: 100,
        playing: true,
        steps: [
          { _tag: 'Down', pointer: 'touch' },
          { _tag: 'Move', to: 24 },
          { _tag: 'Tick', seconds: 0.38 },
          ...tap('ArrowLeft'),
          { _tag: 'Lost' },
          { _tag: 'Change', dropped: false },
          ...closing,
        ],
      }),
    ).toEqual(Option.none());
  });

  test('r3 m3: a second pointer down and up ends nothing; the first one’s release sends', () => {
    expect(
      play({
        at: 30,
        playing: false,
        steps: [
          { _tag: 'Down', pointer: 'touch' },
          { _tag: 'Move', to: 75 },
          { _tag: 'Second', phase: 'down' },
          { _tag: 'Second', phase: 'up' },
          { _tag: 'Move', to: 80 },
          { _tag: 'Tick', seconds: 0.25 },
          { _tag: 'Up' },
          { _tag: 'Change', dropped: false },
          ...closing,
        ],
      }),
    ).toEqual(Option.none());
  });

  test('a drag with Shift held is a drag: nothing is sent until the release', () => {
    expect(
      play({
        at: 30,
        playing: true,
        steps: [
          { _tag: 'Down', pointer: 'mouse' },
          { _tag: 'Hold', key: 'Shift' },
          ...drag([90, 120]),
          { _tag: 'Tick', seconds: 0.25 },
          { _tag: 'Up' },
          { _tag: 'Free', key: 'Shift' },
          { _tag: 'Change', dropped: false },
          ...closing,
        ],
      }),
    ).toEqual(Option.none());
  });

  test('playerfix r1 M3 (C3a): paused at the end, ArrowRight held while the mouse drags back to 1:40, then 1:30', () => {
    expect(
      play({
        at: 239.5,
        playing: false,
        steps: [
          { _tag: 'Down', pointer: 'mouse' },
          { _tag: 'KeyDown', key: 'ArrowRight' },
          ...drag([100, 90]),
          { _tag: 'KeyUp', key: 'ArrowRight', lost: false },
          { _tag: 'Up' },
          { _tag: 'Change', dropped: false },
          ...closing,
        ],
      }),
    ).toEqual(Option.none());
  });

  test('playerfix r1 M3 (C3b): End at the end, its keyup lost to a focus move; later a touch moves to 0:50 and cancels', () => {
    expect(
      play({
        at: 239.5,
        playing: false,
        steps: [
          { _tag: 'KeyDown', key: 'End' },
          { _tag: 'KeyUp', key: 'End', lost: true },
          { _tag: 'Tick', seconds: 0.25 },
          { _tag: 'Down', pointer: 'touch' },
          ...drag([50]),
          { _tag: 'Cancel' },
          { _tag: 'Change', dropped: false },
          ...closing,
        ],
      }),
    ).toEqual(Option.none());
  });

  test('playerfix r1 M3 (C3c): Home at 0:00 with no keyup; later a mouse drag to 2:00 and back to the start', () => {
    expect(
      play({
        at: 0,
        playing: false,
        steps: [
          { _tag: 'KeyDown', key: 'Home' },
          { _tag: 'Down', pointer: 'mouse' },
          ...drag([120, 0]),
          { _tag: 'Up' },
          { _tag: 'Change', dropped: false },
          ...closing,
        ],
      }),
    ).toEqual(Option.none());
  });

  test('playerfix r1 M3 (wide seed 86): End held across a touch press, repeated, then a move', () => {
    expect(
      play({
        at: 239.5,
        playing: true,
        steps: [
          { _tag: 'Down', pointer: 'touch' },
          { _tag: 'KeyDown', key: 'End' },
          { _tag: 'Tick', seconds: 0.18 },
          { _tag: 'KeyDown', key: 'End' },
          ...drag([23]),
          { _tag: 'Up' },
          { _tag: 'Change', dropped: false },
          ...closing,
        ],
      }),
    ).toEqual(Option.none());
  });

  test('playerfix r2 M3: ArrowRight held for three repeats inside a mouse press: three steps sent at once', () => {
    expect(
      play({
        at: 60,
        playing: false,
        steps: [
          { _tag: 'Down', pointer: 'mouse' },
          { _tag: 'KeyDown', key: 'ArrowRight' },
          { _tag: 'KeyDown', key: 'ArrowRight' },
          { _tag: 'KeyDown', key: 'ArrowRight' },
          { _tag: 'KeyUp', key: 'ArrowRight', lost: false },
          { _tag: 'Tick', seconds: 0.25 },
          { _tag: 'Up' },
          { _tag: 'Change', dropped: false },
          ...closing,
        ],
      }),
    ).toEqual(Option.none());
  });

  test('playerfix r2 M3: Shift held, then ArrowLeft inside a touch press: one step sent at once', () => {
    expect(
      play({
        at: 100,
        playing: true,
        steps: [
          { _tag: 'Down', pointer: 'touch' },
          { _tag: 'Hold', key: 'Shift' },
          ...tap('ArrowLeft'),
          { _tag: 'Tick', seconds: 0.25 },
          { _tag: 'Up' },
          { _tag: 'Free', key: 'Shift' },
          { _tag: 'Change', dropped: false },
          ...closing,
        ],
      }),
    ).toEqual(Option.none());
  });

  // Each step key inside a drag seeks at once, by its own step.
  for (const key of ['PageUp', 'PageDown', 'Home', 'End'] as const) {
    test(`playerfix r1 M3: ${key} inside a mouse drag at 1:40 seeks at once`, () => {
      expect(
        play({
          at: 60,
          playing: false,
          steps: [
            { _tag: 'Down', pointer: 'mouse' },
            ...drag([100]),
            ...tap(key),
            { _tag: 'Tick', seconds: 0.25 },
            { _tag: 'Up' },
            { _tag: 'Change', dropped: false },
            ...closing,
          ],
        }),
      ).toEqual(Option.none());
    });
  }
});
