/**
 * The player's stall rules, judged by the world (`src/test/world.ts`): the
 * player and its adapter run over One's `Audio` and `Network` as each
 * platform has them, and the world judges the page at each 50 ms step by
 * the rules O1 to O10 (the spec of the stall rules, "The oracle").
 *
 * The seeded cases draw the whole domain, D1 to D13, and fail when any item
 * of it went unreached. The fixed cases are each counterexample found
 * before, named by its census id, as a world written out.
 */

import { describe, expect, it } from 'effect-bun-test';
import { Array as Arr, Clock, Console, Effect, Option } from 'effect';
import { TestClock } from 'effect/testing';

import {
  allowance,
  cadence,
  drawnKnobs,
  fixedKnobs,
  type Knobs,
  makeWorld,
  morning,
  owed,
  type Platform,
  proving,
  reachable,
  rng,
  roam,
  span,
  step,
  type World,
} from '../test/world';
import { Command, Player, type Status } from './player';

/** The seeds of each seeded case: 24, or `WORLD_SEEDS` for a deep sweep, from `WORLD_FROM`. */
// oxlint-disable-next-line effect/noGlobals -- the deep sweep's size comes from its shell, outside any Effect.
const seeds = Number(process.env['WORLD_SEEDS'] ?? 24);
// oxlint-disable-next-line effect/noGlobals -- as above, the sweep's first seed.
const firstSeed = Number(process.env['WORLD_FROM'] ?? 1);
const seconds = 90;

/** Every rule a seed broke: the first time each, and how many steps after. */
const report = (seed: number, w: World) => {
  const first = new Map<string, { t: number; detail: string; n: number }>();
  for (const it of w.breaches) {
    const seen = first.get(it.rule);
    if (seen) seen.n += 1;
    else first.set(it.rule, { t: it.t, detail: it.detail, n: 1 });
  }
  return [...first].map(
    ([rule, it]) => `${w.platform} seed ${seed}: ${rule} at ${it.t} (${it.n} steps) ${it.detail}`,
  );
};

/** One platform's seeds, each 90 s of the world drawn from its seed. */
const seeded = (platform: Platform, from = 1, count = seeds) =>
  Effect.gen(function* () {
    const clock = yield* TestClock.testClockWith(Effect.succeed);
    const broken = new Array<string>();
    const counts = new Map<string, number>();
    let readGap = 0;
    for (let seed = from; seed < from + count; seed++) {
      const r = rng(seed * 7919 + platform.length);
      const w = makeWorld(platform, clock, drawnKnobs(r), yield* Clock.currentTimeMillis);
      w.send(Command.Start({ track: morning }));
      for (let i = 0; i < (seconds * 1000) / step; i++) {
        roam(w, r);
        yield* w.tick;
      }
      w.dispose();
      broken.push(...report(seed, w));
      for (const [item, n] of w.counts) counts.set(item, (counts.get(item) ?? 0) + n);
      readGap = Math.max(readGap, w.readGap);
    }
    return { broken, counts, readGap };
  });

describe('the player by the world: seeded', () => {
  for (const platform of ['ios', 'android', 'web'] as const)
    it.effect(
      `${platform}: ${seeds} seeds of ${seconds} s break no rule and reach every item`,
      () =>
        Effect.gen(function* () {
          const { broken, counts, readGap } = yield* seeded(platform, firstSeed);
          const unreached = reachable(platform).filter((item) => !counts.get(item));
          yield* Console.log(
            `${platform} reached: ${reachable(platform)
              .map((item) => `${item}=${counts.get(item) ?? 0}`)
              .join(', ')}; largest read gap: ${readGap} ms (bound ${cadence})`,
          );
          if (broken.length > 0) yield* Console.log(broken.join('\n'));
          // The bounds B and P assume the page samples the device at least once a cadence
          // (Decided 11): checked here, never assumed.
          expect({ unreached, broken, readGap: readGap <= cadence }).toEqual({
            unreached: [],
            broken: [],
            readGap: true,
          });
        }),
    );
});

/** A fixed world on `platform`: `body` drives it; it ends with no rule broken unless `breaks`. */
const fixed = (
  name: string,
  platform: Platform,
  knobs: Partial<Knobs>,
  body: (w: World) => Effect.Effect<void>,
  options: { readonly outOfOrder?: boolean; readonly judged?: boolean } = {},
) =>
  it.effect(name, () =>
    Effect.gen(function* () {
      const clock = yield* TestClock.testClockWith(Effect.succeed);
      const w = makeWorld(
        platform,
        clock,
        { ...fixedKnobs, ...knobs },
        yield* Clock.currentTimeMillis,
        options,
      );
      yield* body(w);
      w.dispose();
      if (options.judged ?? true) expect(report(0, w)).toEqual([]);
    }),
  );

const sound = (w: World) => w.phase === 'sound';
/** A first load as the fixed worlds draw it, then loads of `ms` each. */
const loadsThen = (ms: number) => {
  let loads = 0;
  return () => {
    loads += 1;
    if (loads === 1) return fixedKnobs.loadFor();
    return ms;
  };
};
/** Whether the device has sounded since the world began. */
const sounded = (w: World) => w.lastSound > Number.NEGATIVE_INFINITY;
const tag = (w: World) => w.page();
/** Start a hymn and play until the page shows Playing. */
const playing = (w: World) =>
  Effect.gen(function* () {
    w.send(Command.Start({ track: morning }));
    expect(yield* w.until(() => tag(w) === 'Playing', 10_000)).toBe(true);
  });
/** Seek to `to` seconds and play there until the page shows Playing. */
const playingAt = (w: World, to: number) =>
  Effect.gen(function* () {
    yield* playing(w);
    w.send(Command.Seek({ seconds: to }));
    yield* w.run(2000);
    expect(tag(w)).toBe('Playing');
  });
const atOf = (player: Player) =>
  Player.$match(player, {
    Failed: ({ at }) => at,
    Stopped: ({ at }) => at,
    Idle: () => Option.none(),
    Loading: () => Option.none(),
    Playing: ({ at }) => Option.some(at),
    Buffering: ({ at }) => Option.some(at),
    Paused: ({ at }) => Option.some(at),
    Ended: () => Option.none(),
  });
const retry = (w: World) => {
  const shown = w.state();
  return shown._tag === 'Buffering' && shown.retry;
};

/** A seek asked of the world's device directly; what One answered, as it stands. */
const asked = (w: World, positionMs: number) => {
  const answer = {
    settled: 'no' as 'no' | 'resolved' | 'rejected',
    at: Number.NaN,
    status: Option.none<Status>(),
  };
  w.audio.seek(positionMs).then(
    (status) =>
      Object.assign(answer, { settled: 'resolved', at: w.t, status: Option.some(status) }),
    () => Object.assign(answer, { settled: 'rejected', at: w.t }),
  );
  return answer;
};
/** The world's device with a recording loaded and ready, the player never asked. */
const readied = (w: World) =>
  Effect.gen(function* () {
    void w.audio.play('https://hymns.test/1.mp3');
    expect(yield* w.until(() => w.ready, 10_000)).toBe(true);
  });

// One's completion order (`rewrite/r3/premise-choice.md`): a phone's seek answers at its
// completion, never before it lands.
describe("the world draws One's seek completion order (rw r2 M8)", () => {
  // iOS resolves a seek only when AVPlayer finished it, on the same player
  // (HybridOneAudio.swift:198-207).
  fixed(
    'ios: a page seek answers only after it lands',
    'ios',
    { landAfter: () => 800 },
    (w) =>
      Effect.gen(function* () {
        yield* readied(w);
        const from = w.t;
        const answer = asked(w, 30_000);
        yield* w.run(700);
        expect(answer.settled).toBe('no');
        expect(yield* w.until(() => answer.settled !== 'no', 3000)).toBe(true);
        expect(answer.settled).toBe('resolved');
        expect(answer.at - from).toBeGreaterThanOrEqual(800);
        expect(Option.map(answer.status, (it) => Math.abs(it.positionMs - 30_000) <= 2)).toEqual(
          Option.some(true),
        );
      }),
    { judged: false },
  );
  // A later AVPlayer seek, the lock screen's included (:713-719), calls the earlier one's
  // completion with `finished == false`: rejected (:199-203).
  fixed(
    "ios: a page seek a lock-screen seek supersedes is rejected, and the lock screen's answers nothing",
    'ios',
    { landAfter: () => 800, remoteLand: () => 300 },
    (w) =>
      Effect.gen(function* () {
        yield* readied(w);
        const answer = asked(w, 30_000);
        yield* w.run(100);
        w.press('seek', 90_000);
        yield* w.run(3000);
        expect(answer.settled).toBe('rejected');
        expect(w.place).toBeGreaterThanOrEqual(90_000 - 2);
      }),
    { judged: false },
  );
  // Android: a later page seek bumps the generation and replaces the listener, so the earlier
  // promise never settles (HybridOneAudio.kt:293-300).
  fixed(
    'android: a page seek a later page seek supersedes never answers',
    'android',
    { landAfter: () => 800 },
    (w) =>
      Effect.gen(function* () {
        yield* readied(w);
        const first = asked(w, 30_000);
        yield* w.run(100);
        const second = asked(w, 60_000);
        yield* w.run(5000);
        expect(first.settled).toBe('no');
        expect(second.settled).toBe('resolved');
      }),
    { judged: false },
  );
  // The lock screen's `seekTo` bumps no generation (:995-1001): its completion resolves the
  // page's latest seek, with the status there.
  fixed(
    "android: a lock-screen seek's completion answers the page's seek on its way",
    'android',
    { landAfter: () => 2000 },
    (w) =>
      Effect.gen(function* () {
        yield* readied(w);
        const answer = asked(w, 30_000);
        yield* w.run(100);
        w.press('seek', 90_000);
        expect(yield* w.until(() => answer.settled !== 'no', 1500)).toBe(true);
        expect(Option.map(answer.status, (it) => Math.abs(it.positionMs - 90_000) <= 100)).toEqual(
          Option.some(true),
        );
      }),
    { judged: false },
  );
  // Until MediaPlayer is prepared, One says `loading` at 0 with no length (:1018-1031).
  fixed(
    'android: loading at 0 with no length until prepared, paused or not',
    'android',
    { loadFor: () => 3000 },
    (w) =>
      Effect.gen(function* () {
        void w.audio.play('https://hymns.test/1.mp3');
        yield* w.run(500);
        void w.audio.pause();
        yield* w.run(100);
        let status = Option.none<Status>();
        void w.audio.getPlaybackStatus().then((it) => (status = Option.some(it)));
        yield* w.run(1000);
        expect(status).toEqual(Option.some({ state: 'loading', positionMs: 0 }));
      }),
    { judged: false },
  );
  // The web resolves a seek at the element's `seeked` event, never before (One 2.8.1,
  // `src/platform/audio/index.ts:246-278`).
  fixed(
    'web: a page seek answers only after it lands',
    'web',
    { landAfter: () => 800 },
    (w) =>
      Effect.gen(function* () {
        yield* readied(w);
        const from = w.t;
        const answer = asked(w, 30_000);
        yield* w.run(700);
        expect(answer.settled).toBe('no');
        expect(yield* w.until(() => answer.settled !== 'no', 3000)).toBe(true);
        expect(answer.settled).toBe('resolved');
        expect(answer.at - from).toBeGreaterThanOrEqual(800);
        expect(Option.map(answer.status, (it) => Math.abs(it.positionMs - 30_000) <= 2)).toEqual(
          Option.some(true),
        );
      }),
    { judged: false },
  );
  // Each seek adds its own `seeked` listener and none is removed by a later seek (:256-277): a
  // superseded seek resolves at the next completion, with the status there.
  fixed(
    'web: a page seek a later page seek supersedes answers at the later one’s completion',
    'web',
    { landAfter: () => 800 },
    (w) =>
      Effect.gen(function* () {
        yield* readied(w);
        const first = asked(w, 30_000);
        yield* w.run(100);
        const second = asked(w, 60_000);
        yield* w.run(700);
        expect(first.settled).toBe('no');
        expect(yield* w.until(() => second.settled !== 'no', 3000)).toBe(true);
        expect(first.settled).toBe('resolved');
        expect(first.status).toEqual(second.status);
        expect(Option.map(first.status, (it) => Math.abs(it.positionMs - 60_000) <= 2)).toEqual(
          Option.some(true),
        );
      }),
    { judged: false },
  );
  // A play or a stop empties the element: the seek on its way is rejected at `emptied`
  // (:256-277), never resolved.
  fixed(
    'web: a stop rejects a page seek on its way',
    'web',
    { landAfter: () => 800 },
    (w) =>
      Effect.gen(function* () {
        yield* readied(w);
        const answer = asked(w, 30_000);
        yield* w.run(100);
        void w.audio.stop();
        yield* w.run(3000);
        expect(answer.settled).toBe('rejected');
      }),
    { judged: false },
  );
});

// Android's pause before MediaPlayer is prepared holds nothing (orchestrator, decision (a)): the
// prepare listener starts the player whatever `playbackPaused` says (HybridOneAudio.kt:199-204),
// and the status then says `paused` over the sound (:1034-1036).
describe("the world draws Android's pause before prepare (rw r3 decision (a))", () => {
  /** What One says of the device now, as the adapter would read it. */
  const status = (w: World) =>
    Effect.gen(function* () {
      let seen = Option.none<Status>();
      void w.audio.getPlaybackStatus().then((it) => (seen = Option.some(it)));
      yield* w.run(100);
      return Option.getOrThrow(seen);
    });
  const early = (name: string, pause: (w: World) => void) =>
    fixed(
      `android: ${name} before prepare: the load goes on, and at prepare the device sounds saying paused`,
      'android',
      { loadFor: () => 2000 },
      (w) =>
        Effect.gen(function* () {
          void w.audio.play('https://hymns.test/1.mp3');
          yield* w.run(500);
          pause(w);
          expect(yield* status(w)).toEqual({ state: 'loading', positionMs: 0 });
          expect(yield* w.until(() => w.ready, 5000)).toBe(true);
          yield* w.run(1000);
          const after = yield* status(w);
          expect(after.state).toBe('paused');
          expect(after.positionMs).toBeGreaterThan(0);
          expect(sound(w)).toBe(true);
          // A resume clears the pause, and the device says what it does (:263-272).
          void w.audio.resume();
          yield* w.run(200);
          expect((yield* status(w)).state).toBe('playing');
        }),
      { judged: false },
    );
  // `pause` sets `playbackPaused` and pauses only a player that plays (:240-251).
  early('a pause', (w) => void w.audio.pause());
  // An interruption (audio focus lost) does the same (:922-935).
  early('an interruption', (w) => w.interrupt());
  // The lock screen's pause too (:992-995).
  early("the lock screen's pause", (w) => w.press('pause'));

  // The page cannot see the interruption (the seam carries none, and One says `loading 0` until
  // prepared), so it learns of it at the first read after prepare that says `paused`. A device
  // that sounds there while the page shows Paused is one the reader hears and cannot stop: the
  // page asks the pause again, and the device holds it.
  fixed(
    'android: an interruption before prepare: the page shows Paused, and the device is silent within a cadence of it',
    'android',
    { loadFor: () => 2000 },
    (w) =>
      Effect.gen(function* () {
        w.send(Command.Start({ track: morning }));
        yield* w.run(500);
        w.interrupt();
        expect(yield* w.until(() => tag(w) === 'Paused', 5000)).toBe(true);
        yield* w.run(cadence);
        expect(sound(w)).toBe(false);
        expect(w.phase).toBe('paused');
        // The reader's Resume plays on from where the device stood.
        const stood = w.place;
        w.send(Command.Resume());
        expect(yield* w.until(() => tag(w) === 'Playing', 5000)).toBe(true);
        expect(w.plays.length).toBe(1);
        expect(Math.abs(w.place - stood)).toBeLessThan(5000);
      }),
  );
});

describe('the player by the world: each earlier counterexample', () => {
  fixed(
    'r1 F1 A: a 20 s hold, offline from 1 s, the buffer plays on: Playing, then Failed once it runs out',
    'ios',
    {},
    (w) =>
      Effect.gen(function* () {
        yield* playingAt(w, 60);
        w.ahead = 25_000;
        w.hold(20_000);
        yield* w.run(1000);
        w.connect(false);
        yield* w.run(19_000);
        const back = w.t;
        expect(yield* w.until(() => tag(w) === 'Playing', 2000)).toBe(true);
        expect(w.shownSince(back)).not.toContain('Failed');
        expect(w.stops).toBe(0);
        yield* w.until(() => w.phase === 'dry', 10_000);
        const dry = w.t;
        expect(yield* w.until(() => tag(w) === 'Failed', 20_000)).toBe(true);
        expect(w.t - dry).toBeGreaterThanOrEqual(15_000 - span);
        expect(w.stops).toBe(1);
      }),
  );

  fixed('r1 F1 B: a 20 s hold online while it plays: Playing after it', 'android', {}, (w) =>
    Effect.gen(function* () {
      yield* playingAt(w, 60);
      w.hold(20_000);
      yield* w.run(20_000);
      const back = w.t;
      expect(yield* w.until(() => tag(w) === 'Playing', 2000)).toBe(true);
      expect(w.shownSince(back)).not.toContain('Buffering');
    }),
  );

  fixed(
    'r1 F1 C: a first load held 20 s, sounding from 3 s, offline from 5 s: Playing, no Failed',
    'web',
    { loadFor: () => 3000 },
    (w) =>
      Effect.gen(function* () {
        w.send(Command.Start({ track: morning }));
        yield* w.run(100);
        w.hold(20_000);
        yield* w.until(() => w.ready, 5000);
        w.ahead = 30_000;
        yield* w.run(5000 - (w.t % 5000));
        w.connect(false);
        yield* w.until(() => w.running(), 20_000);
        expect(yield* w.until(() => tag(w) === 'Playing', 2000)).toBe(true);
        expect(w.history.map((it) => it.tag)).not.toContain('Failed');
        expect(w.stops).toBe(0);
      }),
  );

  fixed(
    'r1 F1 D: the F1 A hold run dry offline, then a lock-screen seek to 1:40 it holds: Playing, no Failed',
    'ios',
    {},
    (w) =>
      Effect.gen(function* () {
        yield* playingAt(w, 60);
        w.ahead = 5000;
        w.hold(20_000);
        yield* w.run(1000);
        w.connect(false);
        yield* w.run(18_950);
        w.press('seek', 100_000);
        w.ahead = 10_000;
        yield* w.run(50);
        const back = w.t;
        expect(yield* w.until(() => tag(w) === 'Playing', 3000)).toBe(true);
        expect(w.shownSince(back)).not.toContain('Failed');
        expect(w.place).toBeGreaterThanOrEqual(100_000);
        expect(w.stops).toBe(0);
      }),
  );

  fixed(
    'r1 F1 (emulator): reads 3.3 s apart that each move show Playing at each',
    'android',
    {},
    (w) =>
      Effect.gen(function* () {
        yield* playing(w);
        for (let i = 0; i < 5; i++) {
          w.hold(3000);
          yield* w.run(3300);
          expect(tag(w)).toBe('Playing');
        }
      }),
  );

  fixed(
    'r1 F2: offline after the first sound, the buffer run out, then 16 s: Failed at the place; the lock screen plays from it',
    'android',
    {},
    (w) =>
      Effect.gen(function* () {
        yield* playing(w);
        w.ahead = 1000;
        w.connect(false);
        yield* w.until(() => w.phase === 'dry', 5000);
        const place = w.place;
        expect(yield* w.until(() => tag(w) === 'Failed', owed + 1000)).toBe(true);
        const shown = w.state();
        expect(shown._tag === 'Failed' && shown.offline).toBe(true);
        expect(Option.map(atOf(shown), (at) => Math.round(at * 1000))).toEqual(Option.some(place));
        expect(w.stops).toBe(1);
        w.connect(true);
        yield* w.run(500);
        w.press('play');
        yield* w.run(500);
        expect(w.plays.at(-1)?.from).toBe(place);
      }),
  );

  fixed(
    'r1 F4: a refused seek, the item ready before the read: the play from a place lands, no failure',
    'ios',
    { loadFor: () => 1000 },
    (w) =>
      Effect.gen(function* () {
        yield* playingAt(w, 45);
        yield* w.run(1000);
        w.fail();
        expect(yield* w.until(() => tag(w) === 'Failed', 2000)).toBe(true);
        const at = Option.getOrThrow(atOf(w.state()));
        w.send(Command.Resume());
        expect(yield* w.until(() => tag(w) === 'Playing', 5000)).toBe(true);
        expect(Math.abs(w.place - at * 1000)).toBeLessThan(1500);
        expect(w.history.at(-1)?.tag).toBe('Playing');
      }),
  );

  fixed('r1 F6: the device says loading mid-recording: never Ended', 'ios', {}, (w) =>
    Effect.gen(function* () {
      yield* playing(w);
      const from = w.t;
      w.stall(10_000);
      yield* w.run(10_000);
      expect(w.shownSince(from)).not.toContain('Ended');
      expect(tag(w)).toBe('Buffering');
    }),
  );

  fixed(
    'r1 F7: the iOS silent start of 2 s: Loading throughout, then Playing at the first moving read',
    'ios',
    { silentFor: () => 2000 },
    (w) =>
      Effect.gen(function* () {
        w.send(Command.Start({ track: morning }));
        expect(yield* w.until(() => sound(w), 5000)).toBe(true);
        // The first sound's step: the read that shows it may answer in that step.
        const firstSound = w.lastSound - step;
        const early = w.history.filter((it) => it.tag === 'Playing' && it.t < firstSound);
        expect(early).toEqual([]);
        expect(yield* w.until(() => tag(w) === 'Playing', 2 * span)).toBe(true);
      }),
  );

  fixed(
    'r1 F8: a forward seek of 0.3 s during a stall keeps Buffering, and the wait starts again',
    'android',
    {},
    (w) =>
      Effect.gen(function* () {
        yield* playing(w);
        w.stall(60_000);
        yield* w.run(10_000);
        expect(tag(w)).toBe('Buffering');
        const sought = w.t;
        w.send(Command.Seek({ seconds: (w.place + 300) / 1000 }));
        yield* w.run(14_000);
        expect(w.shownSince(sought)).not.toContain('Playing');
        expect(retry(w)).toBe(false);
        expect(yield* w.until(() => retry(w), owed)).toBe(true);
      }),
  );

  fixed(
    'r1 F9: a seek lands where the reader asked, and nothing asks the old place again',
    'web',
    { landAfter: () => 400 },
    (w) =>
      Effect.gen(function* () {
        yield* playing(w);
        w.send(Command.Seek({ seconds: 100 }));
        yield* w.run(3000);
        expect(w.place).toBeGreaterThanOrEqual(100_000);
        expect(w.sought.every((to) => Math.abs(to - 100_000) <= 2)).toBe(true);
      }),
  );

  fixed(
    'r1 F10: online and silent 15 s after sound: Buffering with Retry, the device kept; Resume plays from the place',
    'ios',
    {},
    (w) =>
      Effect.gen(function* () {
        yield* playing(w);
        w.stall(60_000);
        yield* w.until(() => w.phase === 'dry', 5000);
        const place = w.place;
        expect(yield* w.until(() => retry(w), owed + 1000)).toBe(true);
        expect(w.stops).toBe(0);
        w.send(Command.Resume());
        yield* w.run(500);
        expect(w.plays.at(-1)?.from).toBe(place);
      }),
  );

  for (const platform of ['ios', 'android', 'web'] as const)
    fixed(
      `rw r2 A3: silent past the wait online, then offline on ${platform}: Failed no sooner than 15 s after the change`,
      platform,
      {},
      (w) =>
        Effect.gen(function* () {
          yield* playingAt(w, 60);
          w.stall(60_000);
          yield* w.until(() => w.phase === 'dry', 5000);
          yield* w.run(16_000);
          w.connect(false);
          const offline = w.t;
          expect(yield* w.until(() => tag(w) === 'Failed', owed + 2000)).toBe(true);
          expect(w.t - offline).toBeGreaterThanOrEqual(15_000);
        }),
    );

  fixed('rw r1 M5: Retry, then a Seek: no Retry until the new wait runs out', 'ios', {}, (w) =>
    Effect.gen(function* () {
      yield* playingAt(w, 60);
      w.stall(60_000);
      yield* w.until(() => w.phase === 'dry', 5000);
      expect(yield* w.until(() => retry(w), owed + 1000)).toBe(true);
      w.send(Command.Seek({ seconds: 61 }));
      const sought = w.t;
      yield* w.until(() => retry(w), owed + 1000);
      expect(w.t - sought).toBeGreaterThanOrEqual(15_000 - span);
    }),
  );

  // P8 and P7: a Resume from Ended plays from 0:00, unless a seek came after the end; then
  // from that seek's place, even when no read came between.
  for (const platform of ['ios', 'android', 'web'] as const)
    for (const seekTo of [Option.none<number>(), Option.some(30)])
      fixed(
        `rw r1 m5: Ended, then ${Option.match(seekTo, { onNone: () => 'no seek', onSome: (to) => `a seek to ${to} s` })}, then Resume before a read on ${platform}: plays from ${Option.getOrElse(seekTo, () => 0)} s`,
        platform,
        {},
        (w) =>
          Effect.gen(function* () {
            yield* playingAt(w, 236);
            expect(yield* w.until(() => tag(w) === 'Ended', 10_000)).toBe(true);
            yield* w.run(1000);
            Option.map(seekTo, (to) => w.send(Command.Seek({ seconds: to })));
            w.send(Command.Resume());
            expect(yield* w.until(() => tag(w) === 'Playing', 10_000)).toBe(true);
            const from = Option.getOrElse(seekTo, () => 0) * 1000;
            const at = Option.getOrThrow(atOf(w.state())) * 1000;
            expect(Math.abs(at - from)).toBeLessThan(3000);
            expect(Math.abs(w.place - from)).toBeLessThan(3000);
          }),
      );

  // One's seek is refused before the item is ready (HybridOneAudio.swift:194-196), but the lock
  // screen's runs `player.seek` with no such guard (:713-719), so AVPlayer lands it after the
  // page's later, refused one.
  for (const remoteLand of [300, 1200])
    fixed(
      `rw r1 M4 (ios 59): a told lock-screen seek far on lands ${remoteLand} ms after its tell, after the page's later seek was refused before ready: the page's place`,
      'ios',
      { loadFor: () => 3000, remoteLand: () => remoteLand },
      (w) =>
        Effect.gen(function* () {
          w.send(Command.Start({ track: morning }));
          yield* w.run(500);
          const pressedAt = w.t;
          w.press('seek', 218_900);
          expect(yield* w.until(() => w.toldAt > pressedAt, 2000)).toBe(true);
          w.send(Command.Seek({ seconds: 0 }));
          yield* w.run(8000);
          expect(tag(w)).toBe('Playing');
          w.fail();
          yield* w.run(2000);
          const at = Option.getOrThrow(atOf(w.state())) * 1000;
          expect(at).toBeLessThan(20_000);
          expect(Math.abs(at - w.place)).toBeLessThan(1000);
        }),
    );

  for (const holdFor of [600, 650, 700])
    fixed(
      `rw r1 M3: a seek back 750 ms, read before it lands, then at the old place after a ${holdFor} ms hold: Playing, the place recovered`,
      'ios',
      { landAfter: () => 100 },
      (w) =>
        Effect.gen(function* () {
          yield* playingAt(w, 10);
          w.send(Command.Seek({ seconds: (w.place - 750) / 1000 }));
          yield* w.run(50);
          w.hold(holdFor);
          yield* w.run(6000);
          expect(tag(w)).toBe('Playing');
          const at = Option.getOrThrow(atOf(w.state())) * 1000;
          expect(Math.abs(at - w.place)).toBeLessThan(1000);
        }),
    );

  /** Each sweep seed traced and cleared: run alone, it breaks no rule. */
  const traced: Record<Platform, ReadonlyArray<number>> = {
    // The end class (a place past the end the page kept after a read saw it ended), and
    // ios 289: a Resume from Ended that followed a replaying phone kept a refused seek.
    // ios 144 and android 90: a refused seek taken as landed at a read that said `loading` at
    // the place the device stood at before (O7 never landed).
    // ios 143: sound through a superseded seek's place taken as that seek landing (M4's repair).
    // ios 2776: a play's place taken as a superseded seek's.
    // android 42: an interruption before prepare, then 23 s offline with no sound: Failed is right.
    ios: [119, 120, 278, 289, 144, 143, 2776],
    android: [235, 255, 90, 42],
    web: [201, 320],
  };
  it.effect('rw r1 M8: each traced sweep seed breaks no rule', () =>
    Effect.gen(function* () {
      const broken = new Array<string>();
      for (const platform of ['ios', 'android', 'web'] as const)
        for (const seed of traced[platform])
          broken.push(...(yield* seeded(platform, seed, 1)).broken);
      expect(broken).toEqual([]);
    }),
  );

  fixed(
    'rw r1 M7: Android sounds, fails saying 0: Failed keeps the place, and Resume plays from it',
    'android',
    {},
    (w) =>
      Effect.gen(function* () {
        yield* playingAt(w, 60);
        w.fail();
        expect(yield* w.until(() => tag(w) === 'Failed', 2000)).toBe(true);
        const kept = Option.getOrThrow(atOf(w.state()));
        expect(Math.abs(kept - 62)).toBeLessThan(2);
        w.send(Command.Resume());
        yield* w.run(500);
        expect(Math.abs((w.plays.at(-1)?.from ?? 0) - kept * 1000)).toBeLessThan(2);
      }),
  );

  fixed(
    'r1 F11: Failed at 1:00, Resume, the lock screen pauses while it loads: Stopped at 1:00; Resume plays from 1:00',
    'ios',
    {},
    (w) =>
      Effect.gen(function* () {
        yield* playingAt(w, 60);
        w.fail();
        expect(yield* w.until(() => tag(w) === 'Failed', 2000)).toBe(true);
        const at = Option.getOrThrow(atOf(w.state()));
        w.send(Command.Resume());
        yield* w.run(200);
        w.press('pause');
        expect(yield* w.until(() => tag(w) === 'Stopped', 2000)).toBe(true);
        expect(atOf(w.state())).toEqual(Option.some(at));
        w.send(Command.Resume());
        yield* w.run(200);
        expect(w.plays.at(-1)?.from).toBe(at * 1000);
      }),
  );

  fixed(
    'r2 M1 P1: a silent start, a lock-screen seek to 0:30 inside it: Loading throughout',
    'ios',
    { silentFor: () => 3000 },
    (w) =>
      Effect.gen(function* () {
        w.send(Command.Start({ track: morning }));
        yield* w.until(() => w.phase === 'silent', 2000);
        yield* w.run(1000);
        w.press('seek', 30_000);
        yield* w.until(() => sound(w), 5000);
        expect(w.history.map((it) => it.tag)).toEqual(['Loading']);
        expect(yield* w.until(() => tag(w) === 'Playing', 2 * span)).toBe(true);
      }),
  );

  fixed(
    'r2 M1 P2: Failed at 0:46, Resume, a read at 0:00 before the landing: Loading, the place kept',
    'android',
    { landAfter: () => 300 },
    (w) =>
      Effect.gen(function* () {
        yield* playingAt(w, 46);
        w.fail();
        expect(yield* w.until(() => tag(w) === 'Failed', 2000)).toBe(true);
        const at = Option.getOrThrow(atOf(w.state()));
        const resumed = w.t;
        w.send(Command.Resume());
        yield* w.until(() => w.ready, 2000);
        yield* w.run(200);
        expect(w.shownSince(resumed)).not.toContain('Playing');
        w.send(Command.Pause());
        expect(yield* w.until(() => tag(w) === 'Stopped' || tag(w) === 'Paused', 1000)).toBe(true);
        expect(Option.map(atOf(w.state()), Math.round)).toEqual(Option.some(Math.round(at)));
        w.send(Command.Resume());
        yield* w.run(200);
        expect(Math.abs((w.plays.at(-1)?.from ?? 0) - at * 1000)).toBeLessThan(1000);
      }),
  );

  fixed(
    'r2 M1 P4: a seek back that lags and lands past the asked number, with no sound: no Playing',
    'web',
    { landAfter: () => 800, seekDry: () => true },
    (w) =>
      Effect.gen(function* () {
        yield* playingAt(w, 20);
        w.stall(60_000);
        yield* w.run(4000);
        expect(tag(w)).toBe('Buffering');
        const sought = w.t;
        w.send(Command.Seek({ seconds: 10 }));
        yield* w.run(400);
        // The device lands 120 ms past the asked number, and answers the seek there.
        expect(Option.map(w.landing, (it) => it.to)).toEqual(Option.some(10_000));
        w.landing = Option.map(w.landing, (it) => ({ ...it, to: it.to + 120 }));
        yield* w.run(5000);
        expect(w.shownSince(sought)).not.toContain('Playing');
      }),
    { judged: false },
  );

  fixed(
    'r2 M2 P3: plays 1:00, reads held to 23 s, offline at 4 s, dry at 22.5 s: no Failed before 15 s of silence after the read back',
    'ios',
    {},
    (w) =>
      Effect.gen(function* () {
        yield* playingAt(w, 60);
        w.ahead = 22_500;
        w.hold(23_000);
        yield* w.run(4000);
        w.connect(false);
        yield* w.run(19_000);
        const back = w.t;
        yield* w.run(14_000);
        expect(w.shownSince(back)).not.toContain('Failed');
        expect(w.stops).toBe(0);
        expect(yield* w.until(() => tag(w) === 'Failed', 2 * owed)).toBe(true);
      }),
  );

  fixed(
    'r2 M2 (first load): a first load sounds in a hold and runs dry: the wait dates from the read back',
    'android',
    {},
    (w) =>
      Effect.gen(function* () {
        w.send(Command.Start({ track: morning }));
        yield* w.run(100);
        w.hold(20_000);
        yield* w.run(2000);
        w.connect(false);
        yield* w.run(18_000);
        const back = w.t;
        yield* w.run(14_000);
        expect(w.shownSince(back)).not.toContain('Failed');
        expect(yield* w.until(() => tag(w) === 'Failed', 2 * owed)).toBe(true);
      }),
  );

  fixed(
    'r2 M3, A6 (c): the iOS closed socket: Buffering through the 30 s, Retry by 15 s and two spans, never Failed, then Playing',
    'ios',
    {},
    (w) =>
      Effect.gen(function* () {
        yield* playing(w);
        w.close();
        const closed = w.t;
        yield* w.until(() => w.phase === 'closed', 1000);
        const dry = w.t;
        expect(yield* w.until(() => retry(w), owed)).toBe(true);
        expect(w.t - dry).toBeLessThanOrEqual(owed);
        expect(yield* w.until(() => sound(w), 40_000)).toBe(true);
        expect(yield* w.until(() => tag(w) === 'Playing', 2 * span)).toBe(true);
        expect(w.shownSince(closed)).not.toContain('Failed');
      }),
  );

  fixed(
    'r2 m1: a Resume while the server stops, online: never Failed by a limit in the adapter',
    'android',
    { loadFor: loadsThen(150_000) },
    (w) =>
      Effect.gen(function* () {
        yield* playingAt(w, 30);
        w.fail();
        expect(yield* w.until(() => tag(w) === 'Failed', 2000)).toBe(true);
        yield* w.run(step);
        const resumed = w.t;
        w.send(Command.Resume());
        yield* w.run(140_000);
        expect(w.shownSince(resumed)).not.toContain('Failed');
        expect(w.stops).toBe(0);
        expect(yield* w.until(() => tag(w) === 'Playing', 20_000)).toBe(true);
        expect(w.place).toBeGreaterThanOrEqual(29_000);
      }),
  );

  fixed(
    'r3 M1 A (in order): a silent start, a lock-screen seek +300 told 800 ms later: Loading until a sound pair',
    'ios',
    { silentFor: () => 3000, tellAfter: () => 800, remoteLand: () => 100 },
    (w) =>
      Effect.gen(function* () {
        w.send(Command.Start({ track: morning }));
        yield* w.until(() => w.phase === 'silent', 2000);
        yield* w.run(600);
        w.press('seek', w.place + 300);
        yield* w.until(() => sounded(w), 5000);
        // A read across the first sound's step closes a sound pair at that step.
        const first = w.t;
        expect(w.history.filter((it) => it.t < first).map((it) => it.tag)).toEqual(['Loading']);
      }),
  );

  fixed(
    'r3 M1 C (in order): a 500 ms hold with a lock-screen seek +300 inside it: Loading until a sound pair',
    'ios',
    { silentFor: () => 3000 },
    (w) =>
      Effect.gen(function* () {
        w.send(Command.Start({ track: morning }));
        yield* w.until(() => w.phase === 'silent', 2000);
        w.hold(500);
        yield* w.run(200);
        w.press('seek', w.place + 300);
        yield* w.until(() => sounded(w), 5000);
        // A read across the first sound's step closes a sound pair at that step.
        const first = w.t;
        expect(w.history.filter((it) => it.t < first).map((it) => it.tag)).toEqual(['Loading']);
      }),
  );

  fixed(
    'r3 M1 A, B (out of order, outside One): Playing at most the allowance, never Failed',
    'ios',
    { silentFor: () => 3000, tellAfter: () => 800 },
    (w) =>
      Effect.gen(function* () {
        w.send(Command.Start({ track: morning }));
        yield* w.until(() => w.phase === 'silent', 2000);
        yield* w.run(600);
        w.press('seek', w.place + 300);
        yield* w.until(() => sound(w), 5000);
        const silentPlaying = w.history
          .map((it, i) => ({ ...it, until: w.history[i + 1]?.t ?? w.t }))
          .filter((it) => it.tag === 'Playing')
          .reduce((sum, it) => sum + it.until - it.t, 0);
        expect(silentPlaying).toBeLessThanOrEqual(allowance);
        expect(w.history.map((it) => it.tag)).not.toContain('Failed');
      }),
    { outOfOrder: true, judged: false },
  );

  fixed(
    'r3 M1 B (in order): sound proved, dry saying playing 4 s, a lock-screen seek +300: Buffering until a sound pair',
    'android',
    {},
    (w) =>
      Effect.gen(function* () {
        yield* playing(w);
        w.stall(60_000);
        yield* w.run(4000);
        expect(tag(w)).toBe('Buffering');
        const sought = w.t;
        w.press('seek', w.place + 300);
        yield* w.run(5000);
        expect(w.shownSince(sought)).not.toContain('Playing');
      }),
  );

  fixed(
    'r3 M4: a play from 0:46 offline, a 20 s hold: the adapter stops nothing by its own clock',
    'ios',
    {},
    (w) =>
      Effect.gen(function* () {
        yield* playingAt(w, 46);
        w.fail();
        expect(yield* w.until(() => tag(w) === 'Failed', 2000)).toBe(true);
        w.connect(false);
        yield* w.run(500);
        w.send(Command.Resume());
        yield* w.run(500);
        w.hold(20_000);
        yield* w.run(20_000);
        expect(w.stops).toBe(0);
        yield* w.run(2000);
        expect(w.stops).toBeLessThanOrEqual(1);
      }),
  );

  it.effect('r3 m3: seeds 73, 78 and 94 break no rule', () =>
    Effect.gen(function* () {
      const broken = new Array<string>();
      for (const platform of ['ios', 'android', 'web'] as const)
        for (const seed of [73, 78, 94]) broken.push(...(yield* seeded(platform, seed, 1)).broken);
      expect(broken).toEqual([]);
    }),
  );

  fixed(
    'playerfix r3 M4: the web dry at readyState 2, saying playing: Buffering by the stand',
    'web',
    {},
    (w) =>
      Effect.gen(function* () {
        yield* playing(w);
        w.stall(20_000);
        yield* w.until(() => w.phase === 'dry', 5000);
        yield* w.run(2000 + 2 * span + step);
        expect(tag(w)).toBe('Buffering');
      }),
  );
});

// The sweep classes of round 3 part 5, each seed's world as the sweep drew it.
describe('the player by the world: the part 5 sweep (rw r3 part 6)', () => {
  /** One seed of `platform`, 90 s as the seeded case draws it: the rules it broke. */
  const seed = (name: string, platform: Platform, at: number) =>
    it.effect(`${name} (${platform} ${at}) breaks no rule`, () =>
      Effect.gen(function* () {
        expect((yield* seeded(platform, at, 1)).broken).toEqual([]);
      }),
    );

  // A command sent while a play or a seek still asks the device: the act lands at its answer.
  seed('a lock-screen play while the first load asks', 'ios', 843);
  seed('a lock-screen play while the first load asks', 'android', 414);
  seed('a press of play while the first load asks', 'web', 179);
  seed('a seek and a play told together after an end', 'web', 607);
  seed('a Resume while a play from a place asks its seek', 'web', 316);

  fixed(
    'rw r3 part 6 (ios 843): a lock-screen play while the first load asks: Playing once it sounds',
    'ios',
    { loadFor: () => 3000, lag: () => 300 },
    (w) =>
      Effect.gen(function* () {
        w.send(Command.Start({ track: morning }));
        yield* w.run(100);
        w.press('play');
        expect(yield* w.until(() => sound(w), 10_000)).toBe(true);
        yield* w.run(proving + span + step);
        expect(tag(w)).toBe('Playing');
      }),
  );

  fixed(
    'rw r3 part 6 (web 316): a Resume while a play from a place asks its seek: no place asked again',
    'web',
    { loadFor: () => 1000, lag: () => 300 },
    (w) =>
      Effect.gen(function* () {
        yield* playingAt(w, 25);
        w.fail();
        expect(yield* w.until(() => tag(w) === 'Failed', 2000)).toBe(true);
        w.send(Command.Resume());
        yield* w.run(100);
        w.interrupt();
        expect(yield* w.until(() => tag(w) === 'Paused', 3000)).toBe(true);
        const sought = w.sought.length;
        w.send(Command.Resume());
        yield* w.run(3000);
        expect(w.sought.slice(sought)).toEqual([]);
      }),
  );

  // The end (orchestrator, after part 5): a seek the device clamps to the end lands at the end
  // at its answer, and the next Resume plays from 0:00 (P8).
  seed('a seek past the end, then a failure at the end', 'ios', 304);
  seed('a lock-screen seek past the end, then a play', 'ios', 381);
  seed('a lock-screen seek past the end, a play, then a pause', 'ios', 400);

  // O1: a read asked before a seek's answer lands it, answered after, may show the place before
  // the landing, so it pairs with nothing: with the next read at the new place it would look
  // like sound.
  seed('a read in flight across a landing, in the D2 silence after an ended reload', 'ios', 641);
  seed('Playing with no sound, the part 5 O1 class', 'ios', 178);
  seed('Playing with no sound, the part 5 O1 class', 'android', 72);
  seed('Playing with no sound, the part 5 O1 class', 'web', 122);
  // A read asked before a landing's answer still shows the device's state: here Paused after a
  // lock-screen seek took an ended recording to a place.
  seed('Ended, a lock-screen seek, a read asked before its answer says paused', 'web', 381);

  // O2 (orchestrator, after part 5): a landing restarts P4's wait, also at the place the device
  // already stood at.
  seed('offline, a seek refused while loading lands again at the place stood', 'ios', 889);

  /** Lags drawn in order, then 50 ms: the answers they time come in the order the test wants. */
  const lags = (first: ReadonlyArray<number>) => {
    const queue = [...first];
    return {
      set: (next: ReadonlyArray<number>) => queue.splice(0, queue.length, ...next),
      lag: () => queue.shift() ?? 50,
    };
  };
  const ending = lags([]);
  fixed(
    'rw r3 part 6 (ios 381): Ended, a seek past the end answered ended before any read, then Resume: from 0:00',
    'ios',
    { lag: ending.lag, sample: () => 1 },
    (w) =>
      Effect.gen(function* () {
        yield* playingAt(w, 236);
        expect(yield* w.until(() => tag(w) === 'Ended', 10_000)).toBe(true);
        yield* w.run(1000);
        // The seek's answer in 20 ms, the read beside it sampled at 600 ms.
        ending.set([20, 600]);
        w.send(Command.Seek({ seconds: 245 }));
        yield* w.run(100);
        w.send(Command.Resume());
        yield* w.run(1000);
        expect(w.plays.at(-1)?.from).toBe(0);
      }),
  );

  fixed(
    'rw r3 part 6 (ios 304): Ended, the device fails at its end: Failed keeps no place, and Resume plays from 0:00',
    'ios',
    {},
    (w) =>
      Effect.gen(function* () {
        yield* playingAt(w, 236);
        expect(yield* w.until(() => tag(w) === 'Ended', 10_000)).toBe(true);
        yield* w.run(1000);
        w.fail();
        w.send(Command.Pause());
        expect(yield* w.until(() => tag(w) === 'Failed', 2000)).toBe(true);
        expect(atOf(w.state())).toEqual(Option.none());
        w.send(Command.Resume());
        yield* w.run(1000);
        expect(w.plays.at(-1)?.from).toBe(0);
      }),
  );
});

describe('the player by the world: the part 6 sweep (rw r3 part 7)', () => {
  /** One seed of `platform`, 90 s as the seeded case draws it: the rules it broke. */
  const seed = (name: string, platform: Platform, at: number) =>
    it.effect(`${name} (${platform} ${at}) breaks no rule`, () =>
      Effect.gen(function* () {
        expect((yield* seeded(platform, at, 1)).broken).toEqual([]);
      }),
    );

  // One read in flight: a command takes the read it finds in flight, and none cuts a fresh
  // read's answer off, so an end the device gave reaches the page.
  seed('a command while a read that says ended is in flight', 'ios', 668);
  seed('a command while a read that says ended is in flight', 'ios', 1359);
  // A seek past the end while Ended: the play goes from 0:00, not from beyond the end.
  seed('a seek past the end, then Resume', 'ios', 539);
  // A lock-screen seek told while a Resume from Ended still reads: the play goes to the seek.
  seed('a lock-screen seek while a Resume from Ended reads', 'ios', 222);
  seed('a lock-screen seek while a Resume from Ended reads', 'ios', 1341);
  seed('a Resume with a place the page kept', 'ios', 911);
  seed('a Resume with a place the page kept', 'ios', 1441);
  seed('a Resume with a place the page kept', 'android', 1259);
  seed('a Resume with a place the page kept', 'android', 1454);
  seed('a play from a place past the end', 'web', 711);
  // A lock-screen pause while Loading takes the read in flight for its last look (26.3 s), and
  // the world goes on from there: this seed no longer reaches its old O6 line at 43.2 s.
  seed('a lock-screen pause while Loading takes the read in flight', 'android', 496);

  // O6 by what the page could know of an end: a seek after it is the reader's place, and an
  // answer in the ms the page let the recording go may come after the let-go.
  seed('Ended, a lock-screen seek offline, then Resume', 'web', 322);
  seed('Ended, a lock-screen seek offline, then Resume', 'web', 671);
  seed('Ended, a seek to the end, then Resume', 'android', 62);
  seed(
    'a seek past the end while loading, a pause in the ms of its answer, then Resume',
    'ios',
    1177,
  );
  seed(
    'a seek past the end while loading, a pause in the ms of its answer, then Resume',
    'web',
    1045,
  );
  seed(
    'a seek past the end while loading, a pause in the ms of its answer, then Resume',
    'web',
    1412,
  );

  // An end read while a seek short of the end is pending: the end lands the seek, whose place
  // stays the reader's (P7), so a Resume after a failure plays from it.
  seed('an end read before a lock-screen seek landed', 'ios', 631);
  seed('an end read before a lock-screen seek landed', 'ios', 733);
  seed('an end read before a lock-screen seek landed', 'web', 688);
});

describe('the player by the world: the part 7 sweep (rw r3 part 8)', () => {
  /** One seed of `platform`, 90 s as the seeded case draws it: the rules it broke. */
  const seed = (name: string, platform: Platform, at: number) =>
    it.effect(`${name} (${platform} ${at}) breaks no rule`, () =>
      Effect.gen(function* () {
        expect((yield* seeded(platform, at, 1)).broken).toEqual([]);
      }),
    );

  // A seek's own answer that says `ended`, asked since the latest act, is the device saying it
  // ended: the page shows Ended by it, and a failure after is no act (O8).
  seed('a seek past the end answered ended, then a failure', 'ios', 949);
  // Two `ended` reads before a lock-screen seek landed: each shows the device before the
  // landing, and the seek's place stays the reader's (P7).
  seed('two end reads before a lock-screen seek landed', 'ios', 1258);
  // A read asked before a seek's answer landed, at another place: it may follow the landing
  // answer, so a later read pairs with neither (O1).
  seed('a read in flight across a landing, then a hold', 'android', 911);
  // A press told after unseen sound in a hold: the place the device reached before the press
  // is one the page may resume from (O6).
  seed('an untold lock-screen seek after unseen sound in a hold', 'android', 1449);
  // An end read with no length before a seek landed: the device stands at its end then, so the
  // read is before the landing and the seek's place stays the reader's (P7).
  seed('an end read with no length before a lock-screen seek landed', 'web', 228);
});

// A sound pair the page finishes after it lets go sets the reader's place, for Stopped and the
// next Resume (orchestrator, round 2 review: web 360; P7).
describe('a pair finished after the let-go sets the place (rw r3 web 360)', () => {
  /** The lags as drawn: 50 ms, then those `after` gives once the pause is pressed. */
  const lags = (after: number[]) => () => after.shift() ?? 50;
  const after = new Array<number>();
  fixed(
    'a load that sounds unseen in a hold, a follow and a pause told after it: Stopped and the Resume keep the place the reader heard',
    'web',
    { loadFor: () => 8000, lag: lags(after) },
    (w) =>
      Effect.gen(function* () {
        w.send(Command.Start({ track: morning }));
        yield* w.run(1000);
        w.hold(12_000);
        yield* w.run(500);
        w.press('follow');
        yield* w.run(11_000);
        after.push(300, 150);
        w.press('pause');
        expect(yield* w.until(() => tag(w) === 'Stopped' && w.stops > 0, 3000)).toBe(true);
        const heard = Option.getOrElse(w.readerPlace, () => 0);
        expect(heard).toBeGreaterThan(5000);
        const at = Option.getOrElse(atOf(w.state()), () => 0) * 1000;
        expect(Math.abs(at - heard)).toBeLessThanOrEqual(1000);
        yield* w.run(2000);
        w.send(Command.Resume());
        yield* w.run(100);
        const from = w.plays.at(-1)?.from ?? 0;
        expect(Math.abs(from - heard)).toBeLessThanOrEqual(1000);
      }),
  );
});

// O2 judges the page's give-up by what the page was told (orchestrator, after r3 part 6): a
// phone's press restarts the offline run at its tell, in the order told, never at the press.
describe('O2 by the acts the page was told (rw r3 part 7)', () => {
  const rules = (w: World) => w.breaches.map((it) => it.rule);
  // ios 227 and 818: a lock-screen play pressed in the same moment as the page's Pause, told
  // after it. The page plays at the tell (a Resume), offline, and gives up 15 s on.
  fixed(
    'rw r3 part 7 (ios 227): a lock-screen play told after the page Pause, offline: Failed 15 s on is legal',
    'ios',
    { loadFor: () => 60_000, tellAfter: () => 300 },
    (w) =>
      Effect.gen(function* () {
        w.connect(false);
        w.send(Command.Start({ track: morning }));
        yield* w.run(3000);
        w.press('play');
        w.send(Command.Pause());
        yield* w.run(1000);
        // The page took the play's tell after its Pause: it waits on the load again.
        expect(tag(w)).toBe('Loading');
        // The world's reader paused after the press: the page cannot know it.
        expect(w.wants).toBe(false);
        expect(yield* w.until(() => tag(w) === 'Failed', 25_000)).toBe(true);
      }),
  );
  // The attack on the change: a press the page was told of still restarts the run. Here the
  // page is not handed the tell, so it gives up 15 s after the load, 5 s after the tell.
  fixed(
    'rw r3 part 7: a lock-screen play told 10 s into an offline load, unseen by the page: Failed 5 s on breaks O2',
    'ios',
    { loadFor: () => 60_000 },
    (w) =>
      Effect.gen(function* () {
        w.connect(false);
        w.send(Command.Start({ track: morning }));
        yield* w.run(10_000);
        const listeners = w.remoteListeners.splice(0);
        const pressed = w.t;
        w.press('play');
        yield* w.run(step);
        w.remoteListeners.push(...listeners);
        expect(yield* w.until(() => tag(w) === 'Failed', 10_000)).toBe(true);
        expect(w.t - pressed).toBeLessThan(15_000 - span);
        expect(rules(w)).toContain('O2 Failed with no cause');
      }),
    { judged: false },
  );
});

// The oracle's repairs of round 2 (rw r2 M1 to M7): each world breaks the rule only by the
// oracle's own fault, or the test body asks the device what a wrong page would.
describe('the oracle judges by the world alone (rw r2 M1 to M7)', () => {
  const rules = (w: World) => w.breaches.map((it) => it.rule);
  // A page seek retires a play's place: asked again, it is a place the reader did not ask.
  fixed(
    'rw r2 M5: Resume from 1:00, a seek to 2:00 lands, then 1:00 asked again: O7',
    'ios',
    {},
    (w) =>
      Effect.gen(function* () {
        yield* playingAt(w, 60);
        w.fail();
        expect(yield* w.until(() => tag(w) === 'Failed', 2000)).toBe(true);
        const kept = Option.getOrThrow(atOf(w.state()));
        w.send(Command.Resume());
        expect(yield* w.until(() => tag(w) === 'Playing', 10_000)).toBe(true);
        w.send(Command.Seek({ seconds: 120 }));
        yield* w.run(3000);
        expect(tag(w)).toBe('Playing');
        expect(rules(w)).toEqual([]);
        void w.audio.seek(kept * 1000);
        yield* w.run(500);
        expect(rules(w)).toContain('O7 the device was asked a place the reader did not ask');
      }),
    { judged: false },
  );
  // A lock-screen seek after an end is the reader's place: the end's 0:00 no longer holds.
  fixed(
    'rw r2 M6: ended, Failed, a lock-screen seek, Resume: plays from the seek',
    'ios',
    {},
    (w) =>
      Effect.gen(function* () {
        yield* playingAt(w, w.length / 1000 - 5);
        expect(yield* w.until(() => tag(w) === 'Ended', 15_000)).toBe(true);
        w.fail();
        yield* w.run(1000);
        w.press('seek', 200_000);
        expect(yield* w.until(() => tag(w) === 'Failed', 3000)).toBe(true);
        yield* w.run(1000);
        w.send(Command.Resume());
        yield* w.run(1000);
        expect(Math.abs((w.plays.at(-1)?.from ?? 0) - 200_000)).toBeLessThan(2);
      }),
  );
  // A backward seek lands, sound carries the device back to where it stood, and it runs dry
  // there: the seek landed at its answer (Decided 12), so the page proves sound after the stall.
  for (const landAfter of [200, 300, 400])
    fixed(
      `rw r2 M3: a seek back 0.75 s lands after ${landAfter} ms, sound back to the place a read saw before it, dry there: Playing after`,
      'ios',
      { landAfter: () => landAfter },
      (w) =>
        Effect.gen(function* () {
          yield* playing(w);
          expect(yield* w.until(() => w.place >= 10_750, 15_000)).toBe(true);
          const from = w.t;
          const count = w.answered.length;
          w.send(Command.Seek({ seconds: (w.place - 750) / 1000 }));
          // The first read after the ask sees the device sounding on, outside the window.
          expect(yield* w.until(() => w.answered.length > count, 1000)).toBe(true);
          const seen = Option.getOrThrow(Option.fromNullishOr(w.answered.at(-1)));
          expect(seen.sampleAt).toBeGreaterThanOrEqual(from);
          const stood = w.place - (w.t - seen.sampleAt);
          // No read sees the landing or the sound back: a host hold covers both.
          w.hold(landAfter + 750 + 300);
          expect(yield* w.until(() => w.place < stood, 2000)).toBe(true);
          expect(yield* w.until(() => w.place >= stood, 2000)).toBe(true);
          w.stall(3000);
          yield* w.run(3000);
          expect(yield* w.until(() => tag(w) === 'Playing', 8000)).toBe(true);
        }),
    );
  // The oracle builds no sound pair (r1 M1, r2 M1): O5's first sound is O3's world bound. Here
  // the page's one read answers 40 s late, so no sample brackets the sound: the load sounds
  // 3.5 s with no act, then runs dry online. A page that stops reading cannot empty O5
  // (Decided 11), so Retry is owed by world time; an oracle that waits for a read pair owes
  // nothing.
  fixed(
    'rw r2 M1: sound for the proof that no read samples, then a dry spell online: Retry owed',
    'ios',
    { lag: () => 40_000, sample: () => 0.9 },
    (w) =>
      Effect.gen(function* () {
        w.send(Command.Start({ track: morning }));
        yield* w.run(4000);
        expect(w.t - w.lastSound).toBeLessThanOrEqual(step);
        w.stall(60_000);
        yield* w.run(25_000);
        expect(w.answered).toEqual([]);
        expect(w.reads.every((read) => read.sampleAt > w.t)).toBe(true);
        expect(rules(w)).toContain('O5 Retry owed');
      }),
    { judged: false },
  );
  // O10 excuses a turn from Playing by a silence of the stand only when that silence began by
  // the turning read's sample: a silence in a host hold after it is not what the read saw.
  // Under mutant `stand-1s` this world breaks O10.
  fixed(
    'rw r2 M2: a 1.1 s dry spell, a read at its end held 3 s, a 2.2 s dry spell inside the hold: no Buffering',
    'ios',
    {},
    (w) =>
      Effect.gen(function* () {
        yield* playing(w);
        yield* w.run(2000);
        w.stall(1100);
        expect(
          yield* w.until(
            () => w.t - w.lastSound >= 1000 && w.reads.some((read) => read.asked === w.t),
            3000,
          ),
        ).toBe(true);
        w.hold(3500);
        expect(yield* w.until(() => w.phase === 'sound', 2000)).toBe(true);
        yield* w.run(200);
        w.stall(2200);
        yield* w.run(300);
        expect(yield* w.until(() => w.phase === 'sound', 3000)).toBe(true);
        yield* w.run(3000);
      }),
  );
  // Chained holds do not put O1 off (r2 m1): once a read sampled in the silence has answered,
  // it and the first read after each later hold prove the silence across that hold (Decided
  // 5), so O1 owes the turn a cadence after the hold, not a whole B. Here 100 ms holds come
  // every 2.5 s through a 30 s dry spell. Under mutant `stand-8s` this world breaks O1.
  fixed(
    'rw r2 m1: a dry spell with a 100 ms hold every 2.5 s after a read saw it: Buffering',
    'ios',
    { lag: () => 600, sample: () => 0.9 },
    (w) =>
      Effect.gen(function* () {
        yield* playing(w);
        yield* w.run(2000);
        w.stall(30_000);
        expect(
          yield* w.until(() => w.answered.some((read) => read.sampleAt > w.lastSound), 3000),
        ).toBe(true);
        for (const _ of Arr.range(1, 8)) {
          w.hold(100);
          yield* w.run(2500);
        }
        expect(tag(w)).toBe('Buffering');
        expect(yield* w.until(() => tag(w) === 'Playing', 15_000)).toBe(true);
      }),
  );
  // A play answers the latest Resume told before it, by that Resume's places alone (r1 m1):
  // a Resume from Paused asks no play, so its place does not wait for a later one. Here two
  // such Resumes, from 1:00 and from the place 10 s on, and then a play from 1:00 as a wrong
  // page would ask it.
  fixed(
    'rw r1 m1: two Resumes from Paused, then a play from the first one: O6',
    'ios',
    {},
    (w) =>
      Effect.gen(function* () {
        yield* playingAt(w, 60);
        w.send(Command.Pause());
        yield* w.run(1000);
        const first = Option.getOrThrow(w.readerPlace);
        const plays = w.plays.length;
        w.send(Command.Resume());
        yield* w.run(10_000);
        w.send(Command.Pause());
        yield* w.run(1000);
        w.send(Command.Resume());
        yield* w.run(1000);
        expect(w.plays.length).toBe(plays);
        expect(rules(w)).toEqual([]);
        yield* Effect.forkChild(Effect.ignore(w.playback.play('wrong', first)));
        yield* w.run(1000);
        expect(rules(w)).toContain('O6 a Resume played from another place');
      }),
    { judged: false },
  );
  // Failed or Stopped keeps the reader's place, or the place before the first press the page
  // has not been told of (r1 m1(b)): the place before a later untold press is no place the page
  // knew. Here a load with seeks to 0:40 and 1:30, then two lock-screen seeks, to 0:40 and to
  // 2:30, both told 5 s on, and a Pause whose last look takes a read sampled before them: the
  // page keeps 1:30. Under mutant `seek-keeps-old-place` it keeps 0:40, the place before the
  // second press, and breaks O6.
  fixed(
    'rw r1 m1(b): two lock-screen seeks the page is not told of, then a Pause while Loading: Stopped at the place before the first',
    'android',
    { lag: () => 600, loadFor: () => 60_000, tellAfter: () => 5000 },
    (w) =>
      Effect.gen(function* () {
        w.send(Command.Start({ track: morning }));
        yield* w.run(1000);
        w.send(Command.Seek({ seconds: 40 }));
        yield* w.run(1000);
        w.send(Command.Seek({ seconds: 90 }));
        yield* w.run(1000);
        expect(yield* w.until(() => w.reads.some((read) => read.sampleAt < w.t), 2000)).toBe(true);
        w.press('seek', 40_000);
        w.press('seek', 150_000);
        w.send(Command.Pause());
        expect(yield* w.until(() => tag(w) === 'Stopped', 1000)).toBe(true);
        expect(w.tells.length).toBe(2);
        expect(rules(w)).toEqual([]);
      }),
  );
  // A tell of the connection between the turning read's sample and its answer breaks the run
  // (r1 m2): the page reads the connection at the answer. The first world waits offline until
  // the page turns Failed, at a read's answer; the second, the same world, has the link back
  // in that read's window: a page that turns Failed there has no cause. Under mutant
  // `online-gives-up` the second world breaks O2.
  it.effect(
    'rw r1 m2: offline Buffering, the link back between the turning read sample and its answer: no rule broken',
    () =>
      Effect.gen(function* () {
        const clock = yield* TestClock.testClockWith(Effect.succeed);
        const start = yield* Clock.currentTimeMillis;
        const waiting = (back: (w: World) => boolean) =>
          Effect.gen(function* () {
            const w = makeWorld(
              'ios',
              clock,
              { ...fixedKnobs, lag: () => 600, sample: () => 0.1 },
              start,
            );
            yield* playing(w);
            w.connect(false);
            w.stall(120_000);
            expect(yield* w.until(() => tag(w) === 'Buffering', 10_000)).toBe(true);
            const from = w.t;
            yield* w.until(() => back(w) || tag(w) === 'Failed', 30_000);
            if (back(w)) w.connect(true);
            yield* w.run(3000);
            w.dispose();
            return { w, from };
          });
        const first = yield* waiting(() => false);
        const turned = Option.getOrThrow(
          Arr.findFirst(first.w.history, (it) => it.tag === 'Failed'),
        );
        const read = Option.getOrThrow(
          Arr.findFirst(first.w.answered, (it) => it.answered === turned.t),
        );
        expect(read.answered - read.sampleAt).toBeGreaterThanOrEqual(500);
        const second = yield* waiting((w) => w.t === read.sampleAt + step);
        expect(second.w.onlineToldAt).toBeLessThan(read.answered);
        expect(report(0, second.w)).toEqual([]);
      }),
  );
  // A Retry is early only once the page could know the silence it waits on (r2 m4, ios 3804):
  // sound that comes and goes between two reads' samples starts a new silence the page learns
  // at the answer of the first read sampled in it, and a Retry shown till then is not early.
  fixed(
    'rw r2 m4 (ios 3804): Retry, then sound between two samples and dry again: no Retry early',
    'ios',
    { lag: () => 600, sample: () => 0.1 },
    (w) =>
      Effect.gen(function* () {
        yield* playing(w);
        w.stall(120_000);
        expect(yield* w.until(() => retry(w), 25_000)).toBe(true);
        expect(yield* w.until(() => w.reads.some((read) => read.sampleAt === w.t), 2000)).toBe(
          true,
        );
        const sampled = w.t;
        w.stall(0);
        expect(yield* w.until(() => sound(w), 600)).toBe(true);
        yield* w.run(100);
        w.stall(120_000);
        expect(yield* w.until(() => !sound(w), 200)).toBe(true);
        const quietFrom = w.t;
        // No read sampled the sound: the page is told of it by the first read after.
        expect(
          [...w.answered, ...w.reads].every(
            (read) => read.sampleAt <= sampled || read.sampleAt >= quietFrom,
          ),
        ).toBe(true);
        expect(retry(w)).toBe(true);
        yield* w.run(3000);
      }),
  );
  // A read of `ended` lands every act (Terms; ios 3143): a lock-screen seek takes the paused,
  // loading device to its end, the page's later seek is refused until the item is ready, and
  // the device, resumed, ends there before any ask of it lands. O7's duty ends at that read.
  fixed(
    'rw O7 (ios 3143): a seek refused while loading, then an end a read sampled: no O7',
    'ios',
    { loadFor: () => 8000 },
    (w) =>
      Effect.gen(function* () {
        w.send(Command.Start({ track: morning }));
        yield* w.run(1000);
        w.interrupt();
        expect(yield* w.until(() => tag(w) === 'Paused', 2000)).toBe(true);
        w.press('seek', 240_000);
        yield* w.run(1000);
        expect(w.place).toBe(240_000);
        w.send(Command.Resume());
        yield* w.run(500);
        w.send(Command.Seek({ seconds: 89.283 }));
        const seekAt = w.t;
        expect(yield* w.until(() => tag(w) === 'Ended', 20_000)).toBe(true);
        expect(w.endedSampled).toBeGreaterThan(seekAt);
        expect(w.place).toBe(240_000);
        yield* w.run(5000);
      }),
  );
  // Only an end after the seek ends O7's duty: reads of a device that ended before it say
  // `ended` until the seek lands, and a page that drops the seek leaves them saying so.
  fixed('rw O7: Ended, then a seek to 30 s and no Resume: the seek lands', 'ios', {}, (w) =>
    Effect.gen(function* () {
      yield* playingAt(w, 238);
      expect(yield* w.until(() => tag(w) === 'Ended', 5000)).toBe(true);
      w.send(Command.Seek({ seconds: 30 }));
      yield* w.run(5000);
    }),
  );
  // A read asked before an act cannot start P4's wait, even when it samples after the act
  // (android 351: press 15,550, read asked 15,300, sampled 15,700): the wait starts at the
  // first read asked after it. The press is told at that read's answer (D8), and one read's
  // answer 250 ms puts the page's last ask before the give-up just short of 15 s past its
  // wait's start: the page turns Failed 17 s after the older read's answer, past O4's 16.75 s
  // from that answer and within it from the answer of the read asked after the press.
  for (const at of [100, 250, 400])
    it.effect(
      `rw r2 M7: offline Buffering, a lock-screen play ${at} ms after a read's ask, before its sample: Failed owed from the read asked after it`,
      () =>
        Effect.gen(function* () {
          const clock = yield* TestClock.testClockWith(Effect.succeed);
          let quickAt = Number.POSITIVE_INFINITY;
          let now = () => 0;
          const lag = () => {
            if (now() < quickAt) return 600;
            quickAt = Number.POSITIVE_INFINITY;
            return 250;
          };
          const w = makeWorld(
            'android',
            clock,
            { ...fixedKnobs, lag, sample: () => 0.9, tellAfter: () => 10_000 },
            yield* Clock.currentTimeMillis,
          );
          now = () => w.t;
          yield* playing(w);
          w.connect(false);
          w.stall(120_000);
          expect(yield* w.until(() => tag(w) === 'Buffering', 10_000)).toBe(true);
          const count = w.reads.length;
          expect(yield* w.until(() => w.reads.length > count, 2000)).toBe(true);
          const read = Option.getOrThrow(Arr.last(w.reads));
          yield* w.run(at);
          const pressedAt = w.t;
          w.press('play');
          quickAt = w.t + 3000;
          expect(read.sampleAt).toBeGreaterThan(pressedAt);
          expect(yield* w.until(() => tag(w) === 'Failed', 40_000)).toBe(true);
          w.dispose();
          expect(report(0, w)).toEqual([]);
        }),
    );
  // The ios 59 world with the late lock-screen seek landing as the load sounds: the read after
  // it says a place past 218,900 by sound, not 218,900 itself (Decided 12: a read never lands
  // an act, and the page's own seek lands at its answer).
  for (const remoteLand of [2900, 3000, 3100, 3200])
    fixed(
      `rw r2 M4 (ios 59): a late lock-screen seek lands ${remoteLand} ms after its tell and sounds before the next read: the page's place`,
      'ios',
      { loadFor: () => 3000, remoteLand: () => remoteLand },
      (w) =>
        Effect.gen(function* () {
          w.send(Command.Start({ track: morning }));
          yield* w.run(500);
          const pressedAt = w.t;
          w.press('seek', 218_900);
          expect(yield* w.until(() => w.toldAt > pressedAt, 2000)).toBe(true);
          w.send(Command.Seek({ seconds: 0 }));
          yield* w.run(8000);
          expect(tag(w)).toBe('Playing');
          w.fail();
          yield* w.run(2000);
          const at = Option.getOrThrow(atOf(w.state())) * 1000;
          expect(at).toBeLessThan(20_000);
          expect(Math.abs(at - w.place)).toBeLessThan(1000);
        }),
    );
});

// Each oracle change of round 3 that narrows a duty leaves a wrong page red (rewrite/r3/
// attacks.md): the test body asks the seam as a wrong page would, or keeps the page from a tell
// or a read it needs, in a world the change judges.
describe('a wrong page the oracle changes could excuse stays red (rw r3 attacks)', () => {
  const rules = (w: World) => w.breaches.map((it) => it.rule);
  const resumed = 'O6 a Resume played from another place';
  /** A play from `from` ms, asked as a wrong page would. */
  const wrongPlay = (w: World, from: number) =>
    Effect.gen(function* () {
      yield* Effect.forkChild(Effect.ignore(w.playback.play('wrong', from)));
      yield* w.run(1000);
    });
  /** A Resume, its play asked first from `from` ms as a wrong page would. */
  const wrongResume = (w: World, from: number) =>
    Effect.gen(function* () {
      w.send(Command.Resume());
      yield* wrongPlay(w, from);
    });
  /** Pause, a Resume from Paused (which asks no play), `between`, then a wrong page's play. */
  const pausedThenWrong = (w: World, from: number, between: Effect.Effect<void> = Effect.void) =>
    Effect.gen(function* () {
      w.send(Command.Pause());
      yield* w.run(1000);
      const plays = w.plays.length;
      w.send(Command.Resume());
      yield* w.run(1000);
      yield* between;
      expect(w.plays.length).toBe(plays);
      expect(rules(w)).toEqual([]);
      yield* wrongPlay(w, from);
    });

  // a982803c9 (r2 M1): the excuse for sound unseen in a hold lasts to its time bound, with no
  // pair to end it. Past the bound, the place before that sound is no place to play from.
  fixed(
    'a982803c9: sound unseen in a hold, past its time bound: a play from the place before it breaks O6',
    'ios',
    {},
    (w) =>
      Effect.gen(function* () {
        yield* playing(w);
        yield* w.run(5000);
        w.hold(3000);
        yield* w.run(step);
        const before = Option.getOrThrow(w.unseenFrom);
        yield* w.run(3000 + 3 * cadence);
        expect(w.unseenFrom).toEqual(Option.none());
        yield* pausedThenWrong(w, before);
        expect(rules(w)).toContain(resumed);
      }),
    { judged: false },
  );

  // 4b66e1b55 (r2 m4): O5 judges a Retry early only once a read saw the new silence. A dry spell
  // every read samples from its start still holds a page that offers Retry before 15 s: under
  // mutant `retry-early` (Retry at 12 s) this world breaks O5.
  fixed(
    '4b66e1b55: a dry spell online that the reads sample from its start: Retry, and none early',
    'ios',
    {},
    (w) =>
      Effect.gen(function* () {
        yield* playingAt(w, 60);
        w.stall(40_000);
        expect(yield* w.until(() => retry(w), 30_000)).toBe(true);
      }),
  );

  // 3c2765a9e (r2 M6): a seek after the end keeps the end from resetting the place. A seek before
  // the end does not: after the end a read heard, the place is 0:00, and a play from the end
  // breaks O6.
  fixed(
    '3c2765a9e: a seek to 3:50, then the end a read heard: a play from the end breaks O6',
    'ios',
    {},
    (w) =>
      Effect.gen(function* () {
        yield* playingAt(w, 230);
        expect(yield* w.until(() => tag(w) === 'Ended', 15_000)).toBe(true);
        yield* w.run(1000);
        yield* wrongResume(w, 240_000);
        expect(rules(w)).toContain(resumed);
      }),
    { judged: false },
  );

  // 74aaad4de: a seek's answer that says `ended` samples the end, as a read's does. With no read
  // after the seek, that answer alone tells the end: the seek past the end is no place to play
  // from after it; the end's 0:00 is.
  fixed(
    '74aaad4de: a page seek past the end answered ended, no read after it: a play from the end breaks O6',
    'ios',
    {},
    (w) =>
      Effect.gen(function* () {
        yield* playingAt(w, 60);
        Object.assign(w.audio, { getPlaybackStatus: () => Effect.runPromise(Effect.never) });
        w.send(Command.Seek({ seconds: 250 }));
        expect(yield* w.until(() => w.phase === 'ended', 5000)).toBe(true);
        yield* w.run(1000);
        yield* wrongResume(w, 240_000);
        expect(rules(w)).toContain(resumed);
      }),
    { judged: false },
  );

  // 42eddb106: a failed device never ends. A device that failed, played again and ran to its
  // end still owes Ended: here the page reads nothing after the replay sounds.
  fixed(
    '42eddb106: a failure, a Resume, then the end with no read: Ended owed',
    'ios',
    {},
    (w) =>
      Effect.gen(function* () {
        yield* playingAt(w, 200);
        w.fail();
        expect(yield* w.until(() => tag(w) === 'Failed', 5000)).toBe(true);
        w.send(Command.Resume());
        expect(yield* w.until(() => tag(w) === 'Playing', 10_000)).toBe(true);
        Object.assign(w.audio, { getPlaybackStatus: () => Effect.runPromise(Effect.never) });
        expect(yield* w.until(() => w.phase === 'ended', 60_000)).toBe(true);
        yield* w.run(2 * cadence);
        expect(rules(w)).toContain('O8 Ended owed');
      }),
    { judged: false },
  );

  // 42eddb106: presses order by act counts. A page Seek sent after a press's tell is the
  // reader's latest word: a play from the press's place breaks O6.
  fixed(
    "42eddb106: a lock-screen seek told, then a page Seek: a play from the press's place breaks O6",
    'android',
    { tellAfter: () => 300 },
    (w) =>
      Effect.gen(function* () {
        yield* playingAt(w, 60);
        w.press('seek', 120_000);
        yield* w.run(1000);
        w.send(Command.Seek({ seconds: 30 }));
        yield* w.run(2000);
        yield* pausedThenWrong(w, 120_000);
        expect(rules(w)).toContain(resumed);
      }),
    { judged: false },
  );

  // 42eddb106: a seek after a Resume, before its play, is a place the play may go to. A place
  // neither the Resume nor the seek asked is not.
  fixed(
    '42eddb106: a Resume, then a page Seek: a play from a third place breaks O6',
    'ios',
    {},
    (w) =>
      Effect.gen(function* () {
        yield* playingAt(w, 60);
        yield* pausedThenWrong(
          w,
          50_000,
          Effect.gen(function* () {
            w.send(Command.Seek({ seconds: 100 }));
            yield* w.run(1000);
          }),
        );
        expect(rules(w)).toContain(resumed);
      }),
    { judged: false },
  );

  // 42eddb106: an end resets the place only for a seek at or before it. A seek after the end is
  // the reader's place: a play from 0:00 breaks O6.
  fixed(
    '42eddb106: the end a read heard, then a page Seek to 1:40: a play from 0:00 breaks O6',
    'ios',
    {},
    (w) =>
      Effect.gen(function* () {
        yield* playingAt(w, 230);
        expect(yield* w.until(() => tag(w) === 'Ended', 15_000)).toBe(true);
        yield* w.run(1000);
        w.send(Command.Seek({ seconds: 100 }));
        yield* w.run(2000);
        yield* wrongResume(w, 0);
        expect(rules(w)).toContain(resumed);
      }),
    { judged: false },
  );

  // 42eddb106: a play from 0:00 is the reader's only for a place at the length. Short of it,
  // a play from 0:00 breaks O6.
  fixed(
    '42eddb106: paused 4 s before the end: a play from 0:00 breaks O6',
    'ios',
    {},
    (w) =>
      Effect.gen(function* () {
        yield* playingAt(w, 234);
        yield* pausedThenWrong(w, 0);
        expect(rules(w)).toContain(resumed);
      }),
    { judged: false },
  );

  // bafd83ab0: an end counts only when the page asked its answer after its last stop. A stop of
  // an earlier load keeps nothing: after the end a read heard, the place is 0:00, and a play from
  // the end breaks O6.
  fixed(
    'bafd83ab0: a stop, a new load, a seek to 3:50 and the end: a play from the end breaks O6',
    'ios',
    {},
    (w) =>
      Effect.gen(function* () {
        w.send(Command.Start({ track: morning }));
        yield* w.run(200);
        w.send(Command.Pause());
        expect(yield* w.until(() => tag(w) === 'Stopped' && w.stops > 0, 3000)).toBe(true);
        w.send(Command.Resume());
        expect(yield* w.until(() => tag(w) === 'Playing', 10_000)).toBe(true);
        w.send(Command.Seek({ seconds: 230 }));
        expect(yield* w.until(() => tag(w) === 'Ended', 15_000)).toBe(true);
        yield* w.run(1000);
        yield* wrongResume(w, 240_000);
        expect(rules(w)).toContain(resumed);
      }),
    { judged: false },
  );

  // 56566c03d (ios 949): a seek's own answer that says `ended` is the device's word until the
  // next act. A lock-screen play after it, which the page never hears, ends it: Ended shown on
  // breaks O8.
  fixed(
    '56566c03d: a seek past the end answered ended, then a lock-screen play the page misses: Ended breaks O8',
    'ios',
    {},
    (w) =>
      Effect.gen(function* () {
        yield* playingAt(w, 60);
        w.send(Command.Seek({ seconds: 250 }));
        expect(yield* w.until(() => tag(w) === 'Ended', 5000)).toBe(true);
        yield* w.run(1000);
        const listeners = w.remoteListeners.splice(0);
        w.press('play');
        yield* w.run(3000);
        w.remoteListeners.push(...listeners);
        expect(tag(w)).toBe('Ended');
        expect(rules(w)).toContain('O8 Ended, not ended');
      }),
    { judged: false },
  );

  // 56566c03d (android 1449): before a press is told, the place before sound unseen in a hold is
  // one the page may keep. Once told, the press's place is the reader's: a play from the place
  // before the unseen sound breaks O6.
  fixed(
    '56566c03d: sound unseen in a hold, a lock-screen seek told after it: a play from the place before the sound breaks O6',
    'android',
    { tellAfter: () => 3000 },
    (w) =>
      Effect.gen(function* () {
        yield* playing(w);
        yield* w.run(5000);
        w.hold(3000);
        yield* w.run(step);
        const before = Option.getOrThrow(w.unseenFrom);
        yield* w.run(1000);
        w.press('seek', 100_000);
        yield* w.run(5000);
        yield* pausedThenWrong(w, before);
        expect(rules(w)).toContain(resumed);
      }),
    { judged: false },
  );
});
