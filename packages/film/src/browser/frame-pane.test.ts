// A compare pane over decoded frames, driven as the review drives a
// `<video>`: a seek shows the frame holding its time and is done once it is
// drawn (or once a later seek takes its place); while one seek decodes, the
// next shows its key frame at once (a scrub's preview) and then its exact
// frame; playing, each frame is drawn as the shared clock passes it, so two
// panes on one clock never drift; hidden, its decoder is let go and comes
// back at the clock's time; its sound is heard only unmuted at 1×.

import { describe, expect, it } from 'effect-bun-test';
import { Array as Arr, Deferred, Effect, Exit, Fiber, Option } from 'effect';
import { type AudioOut, type Frame, type FrameSource, lockstep, paneOver } from './frame-pane.ts';
import { makeClock } from './media-clock.ts';

const FPS = 30;
/** A frame's start, from its number. */
const at = (n: number) => n / FPS;

/**
 * A source of `count` frames at 30 fps, a key frame every `gop`, recording
 * what was drawn, closed, opened and let go. `hold` holds each decode until
 * `release`; `lag` makes each decode take that many turns of the scheduler
 * (a slow decoder).
 */
const fakeSource = (count = 90, gop = 30, lag = 0) => {
  const drawn: Array<number> = [];
  const closed: Array<number> = [];
  const opened: Array<number> = [];
  const returned: Array<number> = [];
  let gate = Option.none<Deferred.Deferred<void>>();
  const decoded = Effect.andThen(
    Effect.repeat(Effect.yieldNow, { times: lag }),
    Effect.suspend(() => Option.match(gate, { onNone: () => Effect.void, onSome: Deferred.await })),
  );
  const frame = (n: number): Frame => ({
    timestamp: at(n),
    duration: 1 / FPS,
    draw: () => drawn.push(n),
    close: () => closed.push(n),
  });
  const source: FrameSource = {
    duration: Effect.succeed(count / FPS),
    frames: (t) => {
      let n = Math.max(0, Math.floor(t * FPS + 1e-9));
      opened.push(n);
      const first = n;
      return {
        next: Effect.andThen(
          decoded,
          Effect.sync(() => {
            if (n >= count) return Option.none<Frame>();
            n += 1;
            return Option.some(frame(n - 1));
          }),
        ),
        close: Effect.sync(() => returned.push(first)),
      };
    },
    keyFrame: (t) => Effect.succeedSome(frame(Math.floor(Math.floor(t * FPS + 1e-9) / gop) * gop)),
  };
  return {
    source,
    drawn,
    closed,
    opened,
    returned,
    hold: Effect.map(Deferred.make<void>(), (d) => {
      gate = Option.some(d);
    }),
    release: Effect.suspend(() => {
      const held = gate;
      gate = Option.none();
      return Option.match(held, {
        onNone: () => Effect.void,
        onSome: (d) => Effect.asVoid(Deferred.done(d, Exit.void)),
      });
    }),
  };
};

/** A clock moved by hand, and a frame loop stepped by hand. */
const rig = () => {
  let now = 0;
  const clock = makeClock(() => now);
  const steps = new Set<() => boolean>();
  const loop = (step: () => boolean) => {
    steps.add(step);
    return () => steps.delete(step);
  };
  const frame = (s = 0) => {
    now += s;
    for (const step of [...steps]) if (!step()) steps.delete(step);
  };
  return { clock, together: lockstep(loop, clock), frame, looping: () => steps.size };
};

/** Let every decode already answered land. */
const settle = Effect.repeat(Effect.yieldNow, { times: 8 });

/** `n` frames of `s` seconds each, every decode they ask landing between them. */
const frames = (frame: (s: number) => void, n: number, s: number) =>
  Effect.forEach(
    Array.from({ length: n }),
    () =>
      Effect.andThen(
        Effect.sync(() => frame(s)),
        settle,
      ),
    {
      discard: true,
    },
  );

describe('a frame pane', () => {
  it.effect('a seek shows the frame holding its time, done once drawn; then it can play on', () =>
    Effect.gen(function* () {
      const { source, drawn } = fakeSource();
      const { clock, together } = rig();
      const pane = paneOver({ source, clock, together, audio: Option.none() });
      yield* pane.seek(at(10) + 0.01);
      expect(drawn).toEqual([10]);
      expect(pane.time()).toBeCloseTo(at(10) + 0.01, 9);
      yield* settle;
      expect(pane.ready()).toBe(true);
      expect(pane.seeking()).toBe(false);
    }),
  );

  it.effect('it is measured once the source knows its length, and says so', () =>
    Effect.gen(function* () {
      const { source } = fakeSource(60);
      const { clock, together } = rig();
      const held = yield* Deferred.make<void>();
      const pane = paneOver({
        source: { ...source, duration: Effect.andThen(Deferred.await(held), source.duration) },
        clock,
        together,
        audio: Option.none(),
      });
      let measured = 0;
      pane.on('measured', () => (measured += 1), new AbortController().signal);
      expect(Number.isNaN(pane.duration())).toBe(true);
      yield* Deferred.done(held, Exit.void);
      yield* settle;
      expect(pane.duration()).toBe(2);
      expect(measured).toBe(1);
    }),
  );

  it.effect(
    'playing, each frame is drawn as the clock passes it, and it ends once at the end',
    () =>
      Effect.gen(function* () {
        const { source, drawn, closed } = fakeSource(6);
        const { clock, together, frame, looping } = rig();
        const pane = paneOver({ source, clock, together, audio: Option.none() });
        let ended = 0;
        pane.on('ended', () => (ended += 1), new AbortController().signal);
        yield* pane.seek(0);
        yield* settle;
        yield* pane.play;
        expect(pane.playing()).toBe(true);
        yield* frames(frame, 7, 1 / FPS);
        expect(drawn).toEqual([0, 1, 2, 3, 4, 5]);
        // Every frame drawn over is let go.
        expect(closed).toEqual([0, 1, 2, 3, 4]);
        expect(ended).toBe(1);
        expect(pane.ended()).toBe(true);
        yield* pane.pause;
        expect(looping()).toBe(0);
      }),
  );

  it.effect('two panes on one clock show the same frame at every frame drawn', () =>
    Effect.gen(function* () {
      const a = fakeSource();
      const b = fakeSource();
      const { clock, together, frame } = rig();
      const one = paneOver({ source: a.source, clock, together, audio: Option.none() });
      const two = paneOver({ source: b.source, clock, together, audio: Option.none() });
      yield* Effect.all([one.seek(1), two.seek(1)]);
      yield* settle;
      yield* Effect.all([one.play, two.play]);
      yield* frames(frame, 10, 0.021);
      expect(a.drawn.length).toBeGreaterThan(5);
      expect(a.drawn).toEqual(b.drawn);
      expect(one.time()).toBe(two.time());
    }),
  );

  it.effect(
    'two panes show corresponding frames though one decodes slower: the slow one holds the set',
    () =>
      Effect.gen(function* () {
        const fast = fakeSource();
        // Each of its decodes takes about three of the frames drawn below.
        const slow = fakeSource(90, 30, 20);
        const { clock, together, frame } = rig();
        const one = paneOver({ source: fast.source, clock, together, audio: Option.none() });
        const two = paneOver({ source: slow.source, clock, together, audio: Option.none() });
        yield* Effect.all([one.seek(1), two.seek(1)], { concurrency: 2 });
        yield* settle;
        yield* Effect.all([one.play, two.play]);
        const shown: Array<readonly [number, number]> = [];
        const last = (drawn: ReadonlyArray<number>) => Option.getOrElse(Arr.last(drawn), () => -1);
        yield* Effect.forEach(
          Array.from({ length: 12 }),
          () =>
            Effect.andThen(
              Effect.andThen(
                Effect.sync(() => frame(1 / FPS)),
                settle,
              ),
              Effect.sync(() => shown.push([last(fast.drawn), last(slow.drawn)])),
            ),
          { discard: true },
        );
        // The slow one moved on (so this is no stand-still), and at every frame drawn both show the same frame.
        expect(slow.drawn.length).toBeGreaterThan(2);
        expect(shown.filter(([a, b]) => a !== b)).toEqual([]);
      }),
  );

  it.effect(
    'a seek of a playing pair waits for the slower: neither shows the new moment alone, the clock and the sound hold until both have it',
    () =>
      Effect.gen(function* () {
        const said: Array<string> = [];
        const audio: AudioOut = {
          start: (t, rate) => said.push(`start ${t.toFixed(2)} @${rate}`),
          stop: () => said.push('stop'),
        };
        const fast = fakeSource();
        const slow = fakeSource();
        const { clock, together, frame } = rig();
        const one = paneOver({ source: fast.source, clock, together, audio: Option.some(audio) });
        const two = paneOver({ source: slow.source, clock, together, audio: Option.none() });
        one.mute(false);
        yield* Effect.all([one.seek(0), two.seek(0)], { concurrency: 2 });
        yield* settle;
        yield* Effect.all([one.play, two.play]);
        yield* frames(frame, 3, 1 / FPS);
        const last = (drawn: ReadonlyArray<number>) => Option.getOrElse(Arr.last(drawn), () => -1);
        // The slow one's decodes held: a seek to 1 s asked of both while they play.
        yield* slow.hold;
        said.length = 0;
        const seeking = yield* Effect.forkChild(
          Effect.all([one.seek(1), two.seek(1)], { concurrency: 2 }),
        );
        yield* settle;
        yield* frames(frame, 5, 1 / FPS);
        expect(last(fast.drawn)).toBe(last(slow.drawn));
        expect(one.time()).toBeCloseTo(1, 9);
        expect(said).toEqual(['stop']);
        // Both have it: the new moment shows on both, and the pair plays on from it with its sound.
        yield* slow.release;
        yield* Fiber.join(seeking);
        yield* settle;
        expect([last(fast.drawn), last(slow.drawn)]).toEqual([30, 30]);
        expect(said).toEqual(['stop', 'start 1.00 @1']);
        yield* frames(frame, 3, 1 / FPS);
        expect(one.time()).toBeGreaterThan(1);
        expect(last(fast.drawn)).toBe(last(slow.drawn));
      }),
  );

  it.effect('a scrub across a pair shows its preview on both or on neither', () =>
    Effect.gen(function* () {
      const a = fakeSource();
      const b = fakeSource();
      const { clock, together } = rig();
      const one = paneOver({ source: a.source, clock, together, audio: Option.none() });
      const two = paneOver({ source: b.source, clock, together, audio: Option.none() });
      yield* Effect.all([one.seek(0), two.seek(0)], { concurrency: 2 });
      yield* settle;
      // Both decodes held, so the next seek finds the last still in flight: a scrub.
      yield* Effect.all([a.hold, b.hold]);
      const first = yield* Effect.forkChild(
        Effect.all([one.seek(at(40)), two.seek(at(40))], { concurrency: 2 }),
      );
      yield* settle;
      const scrub = yield* Effect.forkChild(
        Effect.all([one.seek(at(50)), two.seek(at(50))], { concurrency: 2 }),
      );
      yield* settle;
      expect([a.drawn, b.drawn]).toEqual([
        [0, 30],
        [0, 30],
      ]);
      // One has its frame, the other not yet: neither moves on alone.
      yield* a.release;
      yield* settle;
      expect(a.drawn).toEqual([0, 30]);
      yield* b.release;
      yield* Fiber.joinAll([first, scrub]);
      yield* settle;
      expect([a.drawn, b.drawn]).toEqual([
        [0, 30, 50],
        [0, 30, 50],
      ]);
    }),
  );

  it.effect(
    "a later seek takes an earlier one's place: both done, only the later frame shown",
    () =>
      Effect.gen(function* () {
        const { source, drawn, returned, hold, release } = fakeSource();
        const { clock, together } = rig();
        const pane = paneOver({ source, clock, together, audio: Option.none() });
        yield* pane.seek(0);
        drawn.length = 0;
        yield* hold;
        const first = yield* Effect.forkChild(pane.seek(at(40)));
        const second = yield* Effect.forkChild(pane.seek(at(50)));
        yield* settle;
        expect(pane.seeking()).toBe(true);
        yield* release;
        yield* Fiber.joinAll([first, second]);
        yield* settle;
        // The second shows its key frame while the first decodes, then its own frame; never the first's.
        expect(drawn).toEqual([30, 50]);
        expect(returned).toContain(40);
      }),
  );

  it.effect(
    "hidden, it lets its decoder go and opens nothing though played; shown, it opens at the clock's time",
    () =>
      Effect.gen(function* () {
        const { source, opened, returned } = fakeSource();
        const { clock, together } = rig();
        const pane = paneOver({ source, clock, together, audio: Option.none() });
        yield* pane.seek(at(12));
        yield* settle;
        pane.hide();
        yield* settle;
        expect(returned).toEqual([12]);
        clock.seek(at(20));
        yield* pane.play;
        yield* settle;
        expect(opened).toEqual([12]);
        pane.show();
        yield* settle;
        expect(opened).toEqual([12, 20]);
        expect(pane.playing()).toBe(true);
      }),
  );

  it.effect(
    'hidden while playing, its sound stops, its clock stands and a decode in flight is never drawn; shown, it draws afresh and plays on',
    () =>
      Effect.gen(function* () {
        const said: Array<string> = [];
        const audio: AudioOut = {
          start: (t, rate) => said.push(`start ${t.toFixed(2)} @${rate}`),
          stop: () => said.push('stop'),
        };
        const { source, drawn, opened, hold, release } = fakeSource();
        const { clock, together, frame, looping } = rig();
        const pane = paneOver({ source, clock, together, audio: Option.some(audio) });
        pane.mute(false);
        yield* pane.seek(1);
        yield* settle;
        yield* pane.play;
        yield* frames(frame, 3, 1 / FPS);
        // A decode still in flight when the page hides.
        yield* hold;
        yield* frames(frame, 2, 1 / FPS);
        const before = [...drawn];
        said.length = 0;
        pane.hide();
        yield* release;
        yield* settle;
        expect(said).toEqual(['stop']);
        expect(drawn).toEqual(before);
        expect(looping()).toBe(0);
        // Hidden a while: its clock stands.
        const stood = pane.time();
        yield* frames(frame, 30, 1 / FPS);
        expect(pane.time()).toBe(stood);
        // Shown again: a fresh frame at its time, and playing on with its sound, as the driver left it.
        const at0 = drawn.length;
        pane.show();
        yield* settle;
        expect(opened.at(-1)).toBe(Math.floor(stood * FPS + 1e-9));
        expect(drawn.length).toBe(at0 + 1);
        expect(pane.playing()).toBe(true);
        expect(said).toEqual(['stop', `start ${stood.toFixed(2)} @1`]);
        yield* frames(frame, 3, 1 / FPS);
        expect(pane.time()).toBeGreaterThan(stood);
        expect(drawn.length).toBeGreaterThan(at0 + 1);
      }),
  );

  it.effect('hidden while paused, shown it draws its frame afresh and stays paused', () =>
    Effect.gen(function* () {
      const { source, drawn } = fakeSource();
      const { clock, together, looping } = rig();
      const pane = paneOver({ source, clock, together, audio: Option.none() });
      yield* pane.seek(at(12));
      yield* settle;
      pane.hide();
      yield* settle;
      const at0 = drawn.length;
      pane.show();
      yield* settle;
      expect(drawn.slice(at0)).toEqual([12]);
      expect(pane.playing()).toBe(false);
      expect(looping()).toBe(0);
    }),
  );

  it.effect('its sound is heard only unmuted, playing, at 1×', () =>
    Effect.gen(function* () {
      const said: Array<string> = [];
      const audio: AudioOut = {
        start: (t, rate) => said.push(`start ${t.toFixed(2)} @${rate}`),
        stop: () => said.push('stop'),
      };
      const { source } = fakeSource();
      const { clock, together } = rig();
      const pane = paneOver({ source, clock, together, audio: Option.some(audio) });
      pane.mute(false);
      yield* pane.seek(1);
      yield* settle;
      yield* pane.play;
      pane.rate(2);
      pane.rate(1);
      pane.mute(true);
      expect(said).toEqual(['start 1.00 @1', 'stop', 'start 1.00 @1', 'stop']);
    }),
  );
});
