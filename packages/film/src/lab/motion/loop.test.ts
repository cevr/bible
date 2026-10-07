// The loop machine, with no DOM: A and B mark a range, and once B lies after
// A it loops, played from A; a B before A (or no A) waits for one. The
// selected cue loops its span as the timeline shows it now (a cue under
// 0.2 s with 0.4 s either side), played from its start. Off stops looping.
// The link's range (`#loop=`) and the view's looped cue start the page in
// them without playing; the link landing on a range or none moves it.

import { Effect, Layer, Option } from 'effect';
import { describe, expect, it, test } from 'effect-bun-test';
import { assertPath, simulate } from 'effect-machine';
import { sceneIndexAt } from '../../core/layout.ts';
import type { LoopRange } from '../../player/main.ts';
import { Stage, type StageOps } from '../stage.ts';
import { sceneSpan } from './commands.ts';
import {
  LoopEvent,
  LoopState,
  linkedRange,
  loopAt,
  loopMachine,
  loopText,
  inOutOf,
  loopView,
  rangeOf,
} from './loop.ts';

/** A stage whose cues are `rise` (1–1.6 s) and `blip` (5–5.1 s), and which says what it played. */
const fakes = () => {
  const log: Array<string> = [];
  const spans = new Map<string, LoopRange>([
    ['rise', { from: 1, to: 1.6 }],
    ['blip', { from: 5, to: 5.1 }],
  ]);
  const stage: Pick<StageOps, 'cueSpan' | 'duration' | 'playFrom'> = {
    cueSpan: (_scene, name) => Option.fromUndefinedOr(spans.get(name)),
    duration: 20,
    playFrom: (T) => Effect.sync(() => log.push(`play ${T}`)),
  };
  const full: StageOps = {
    ...stage,
    preview: () => Effect.void,
    unpreview: () => Effect.void,
    timelineOf: () => ({}),
    knobsOf: () => ({}),
    cuesOf: () => new Map(),
    holdT: Effect.void,
    reload: Effect.die('not asked'),
    settle: Effect.void,
    pause: Effect.void,
    still: () => Effect.die('not asked'),
  };
  return { log, stage: full, layer: Layer.succeed(Stage, full) };
};

const off = loopMachine(LoopState.Off);

describe('A and B', () => {
  it.effect('A then a later B loops the range, played from A', () => {
    const { log, layer } = fakes();
    return Effect.gen(function* () {
      const result = yield* simulate(off, [LoopEvent.MarkA({ t: 1 }), LoopEvent.MarkB({ t: 3 })]);
      expect(result.states.map((s) => s._tag)).toEqual(['Off', 'Marked', 'Range']);
      expect(result.finalState).toEqual(LoopState.Range({ from: 1, to: 3 }));
      expect(log).toEqual(['play 1']);
    }).pipe(Effect.provide(layer));
  });

  it.effect('a B with no A before it waits for one, and plays nothing', () => {
    const { log, layer } = fakes();
    return Effect.gen(function* () {
      const result = yield* simulate(off, [LoopEvent.MarkB({ t: 2 })]);
      expect(result.finalState).toEqual(LoopState.Marked({ a: Option.none(), b: Option.some(2) }));
      const before = yield* simulate(off, [LoopEvent.MarkA({ t: 3 }), LoopEvent.MarkB({ t: 2 })]);
      expect(before.finalState._tag).toBe('Marked');
      expect(log).toEqual([]);
    }).pipe(Effect.provide(layer));
  });

  it.effect('an A before a B already marked loops the range', () => {
    const { log, layer } = fakes();
    return Effect.gen(function* () {
      yield* assertPath(
        off,
        [LoopEvent.MarkB({ t: 4 }), LoopEvent.MarkA({ t: 2 })],
        ['Off', 'Marked', 'Range'],
      );
      expect(log).toEqual(['play 2']);
    }).pipe(Effect.provide(layer));
  });

  it.effect('a new A or B moves a running range', () => {
    const { log, layer } = fakes();
    return Effect.gen(function* () {
      const result = yield* simulate(loopMachine(LoopState.Range({ from: 1, to: 3 })), [
        LoopEvent.MarkB({ t: 5 }),
        LoopEvent.MarkA({ t: 2 }),
      ]);
      expect(result.finalState).toEqual(LoopState.Range({ from: 2, to: 5 }));
      expect(log).toEqual(['play 1', 'play 2']);
    }).pipe(Effect.provide(layer));
  });
});

describe('the cue', () => {
  it.effect("loops the cue's span, played from its start", () => {
    const { log, layer } = fakes();
    return Effect.gen(function* () {
      const result = yield* simulate(off, [LoopEvent.LoopCue({ scene: 'one', name: 'rise' })]);
      expect(result.finalState).toEqual(LoopState.Cue({ scene: 'one', name: 'rise' }));
      expect(log).toEqual(['play 1']);
    }).pipe(Effect.provide(layer));
  });

  it.effect('a cue under 0.2 s loops with 0.4 s either side', () => {
    const { log, layer } = fakes();
    return Effect.gen(function* () {
      yield* simulate(off, [LoopEvent.LoopCue({ scene: 'one', name: 'blip' })]);
      expect(log.map((l) => Number(l.split(' ')[1]).toFixed(2))).toEqual(['4.60']);
    }).pipe(Effect.provide(layer));
  });

  it.effect(
    'a cue the timeline does not resolve is looped once it does, and plays nothing now',
    () => {
      const { log, layer } = fakes();
      return Effect.gen(function* () {
        const result = yield* simulate(off, [LoopEvent.LoopCue({ scene: 'one', name: 'gone' })]);
        expect(result.finalState._tag).toBe('Cue');
        expect(log).toEqual([]);
      }).pipe(Effect.provide(layer));
    },
  );

  it.effect('off stops any loop', () =>
    Effect.gen(function* () {
      yield* assertPath(
        off,
        [LoopEvent.LoopCue({ scene: 'one', name: 'rise' }), LoopEvent.Stop],
        ['Off', 'Cue', 'Off'],
      );
      yield* assertPath(
        loopMachine(LoopState.Range({ from: 1, to: 3 })),
        [LoopEvent.Stop],
        ['Range', 'Off'],
      );
    }).pipe(Effect.provide(fakes().layer)),
  );
});

describe('what a loop plays', () => {
  const { stage } = fakes();
  test('a range plays itself; a cue its span as shown now, padded when short', () => {
    expect(rangeOf(LoopState.Range({ from: 1, to: 3 }), stage)).toEqual(
      Option.some({ from: 1, to: 3 }),
    );
    expect(rangeOf(LoopState.Cue({ scene: 'one', name: 'rise' }), stage)).toEqual(
      Option.some({ from: 1, to: 1.6 }),
    );
    const blip = Option.getOrThrow(rangeOf(LoopState.Cue({ scene: 'one', name: 'blip' }), stage));
    expect(blip.from).toBeCloseTo(4.6);
    expect(blip.to).toBeCloseTo(5.5);
  });
  test('nothing loops while off or only marked', () => {
    expect(rangeOf(LoopState.Off, stage)).toEqual(Option.none());
    expect(rangeOf(LoopState.Marked({ a: Option.some(1), b: Option.none() }), stage)).toEqual(
      Option.none(),
    );
  });
  test('the in and out points are a range only once both are marked; a looped cue is none', () => {
    expect(inOutOf(LoopState.Range({ from: 1, to: 3 }))).toEqual(Option.some({ from: 1, to: 3 }));
    expect(inOutOf(LoopState.Marked({ a: Option.some(1), b: Option.none() }))).toEqual(
      Option.none(),
    );
    expect(inOutOf(LoopState.Cue({ scene: 'one', name: 'rise' }))).toEqual(Option.none());
  });
});

describe('what the panel says', () => {
  test('each state in words, each point in timecode', () => {
    const said = (state: LoopState) => loopText(state, 30);
    expect(said(LoopState.Off)).toBe('');
    expect(said(LoopState.Marked({ a: Option.some(1), b: Option.none() }))).toBe('in 00:00:01:00');
    expect(said(LoopState.Marked({ a: Option.none(), b: Option.some(2) }))).toBe(
      'out 00:00:02:00: set the in point before it',
    );
    expect(said(LoopState.Marked({ a: Option.some(3), b: Option.some(2.5) }))).toBe(
      'in 00:00:03:00 · out 00:00:02:15: set the out point after the in point',
    );
    expect(said(LoopState.Range({ from: 1, to: 3 }))).toBe(
      'looping in 00:00:01:00 – out 00:00:03:00',
    );
    expect(said(LoopState.Cue({ scene: 'one', name: 'rise' }))).toBe('looping rise');
  });
});

describe('the link and the view', () => {
  it.effect(
    'a link naming a range loops it without playing; one naming none ends a range only',
    () => {
      const { log, layer } = fakes();
      return Effect.gen(function* () {
        const linked = yield* simulate(off, [LoopEvent.Linked({ from: 2, to: 4 })]);
        expect(linked.finalState).toEqual(LoopState.Range({ from: 2, to: 4 }));
        expect(log).toEqual([]);
        yield* assertPath(
          loopMachine(LoopState.Range({ from: 2, to: 4 })),
          [LoopEvent.Unlinked],
          ['Range', 'Off'],
        );
        const cue = LoopState.Cue({ scene: 'one', name: 'rise' });
        expect((yield* simulate(loopMachine(cue), [LoopEvent.Unlinked])).finalState).toEqual(cue);
      }).pipe(Effect.provide(layer));
    },
  );

  it.effect(
    'marks are kept to the millisecond, as the link prints them, inside the times marked',
    () =>
      Effect.gen(function* () {
        const result = yield* simulate(off, [
          LoopEvent.MarkA({ t: 1 / 3 }),
          LoopEvent.MarkB({ t: 2 / 3 }),
        ]);
        expect(result.finalState).toEqual(LoopState.Range({ from: 0.334, to: 0.666 }));
      }).pipe(Effect.provide(fakes().layer)),
  );

  it.effect(
    'Loop this scene plays its first frame in that scene, when it starts off the millisecond',
    () => {
      const { log, layer } = fakes();
      // A scene's start is a sum of take lengths, lead and tail: off the ms grid.
      const placed = [
        { start: 0, dur: 3.4562 },
        { start: 3.4562, dur: 4 },
      ];
      return Effect.gen(function* () {
        const span = Option.getOrThrow(sceneSpan(placed, 5));
        const result = yield* simulate(off, [
          LoopEvent.MarkA({ t: span.from }),
          LoopEvent.MarkB({ t: span.to }),
        ]);
        const range = Option.getOrThrow(inOutOf(result.finalState));
        expect(sceneIndexAt(placed, range.from)).toBe(1);
        expect(range.to).toBeLessThanOrEqual(span.to);
        expect(log).toEqual([`play ${range.from}`]);
      }).pipe(Effect.provide(layer));
    },
  );

  test("a link's range is the part of it inside the film, none when nothing is", () => {
    expect(linkedRange(Option.some({ from: 1, to: 3 }), 20)).toEqual(
      Option.some({ from: 1, to: 3 }),
    );
    expect(linkedRange(Option.some({ from: 18, to: 25 }), 20)).toEqual(
      Option.some({ from: 18, to: 20 }),
    );
    expect(linkedRange(Option.some({ from: 21, to: 25 }), 20)).toEqual(Option.none());
    expect(linkedRange(Option.none(), 20)).toEqual(Option.none());
  });

  test("starts in the link's range, else the cue the view kept, else off; the view keeps a cue only", () => {
    const range = { from: 1, to: 3 };
    const cue = LoopState.Cue({ scene: 'one', name: 'rise' });
    expect(loopAt(Option.some(range), loopView(cue))).toEqual(LoopState.Range(range));
    expect(loopAt(Option.none(), loopView(cue))).toEqual(cue);
    expect(loopAt(Option.none(), Option.none())).toEqual(LoopState.Off);
    expect(loopView(LoopState.Range(range))).toEqual(Option.none());
    expect(loopView(LoopState.Marked({ a: Option.some(1), b: Option.none() }))).toEqual(
      Option.none(),
    );
  });
});
