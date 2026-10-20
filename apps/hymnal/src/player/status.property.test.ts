/**
 * What the player shows after the reader's Play, over seeded runs on each
 * device's playback as One's `Audio` gives it, on a network that loads the
 * recording at once, at Chrome's "Slow 4G" or at its "3G" (latency and
 * throughput), on the test's clock. Each answer of the device reaches the
 * app a turn later, as a promise's does.
 * - The web (`HTMLAudioElement`): `play()` and `resume()` wait until the
 *   element plays, `seek` waits for `seeked`, and a status read says
 *   `loading` while the element holds too little at its place, paused or
 *   not. A play from the Media Session reaches the app once the element plays.
 * - iOS (AVPlayer): `resume` answers at once; a status read says `loading`
 *   while it waits to play and `paused` once paused; `seek` waits for its
 *   completion. The lock screen's play reaches the app at once.
 * - Android (MediaPlayer): `resume` answers at once; a status read says
 *   `loading` until the recording is prepared and `playing` once started;
 *   `seek` waits for its completion.
 *
 * The reader presses what the page offers: Pause while it plays or loads,
 * Play while paused or ended, the bar (near the place, just past what is
 * loaded, far into what is not, near the end) while it shows; the lock
 * screen plays and pauses. In every run:
 * - from a Play (Start, Resume, or the lock screen's once the app hears of
 *   it) until the next Pause, the page never shows Paused: not at the
 *   press, before the device answers, and not later;
 * - while the device has not answered a resume or a seek, the player
 *   still reads its status, at least every two `statusEvery`;
 * - once the device plays, the page shows Playing within half a second.
 */

import { describe, expect, it } from 'effect-bun-test';
import {
  Clock,
  Duration,
  Effect,
  Fiber,
  Layer,
  Match,
  Option,
  Queue,
  Random,
  References,
  Stream,
} from 'effect';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { TestClock } from 'effect/testing';

import {
  Command,
  Playback,
  PlaybackError,
  Player,
  playerOn,
  type Remote,
  type Status,
  statusEvery,
} from './player';

type Platform = 'web' | 'ios' | 'android';

/** How a network loads the recording: the wait before data comes, and seconds of sound per ms after it. */
interface Network {
  readonly name: string;
  readonly latency: number;
  readonly rate: number;
}

/** A hymn's recording is about 12.5 kB a second (3 MB over four minutes). */
const bytesPerSecond = 12_500;
const networks: ReadonlyArray<Network> = [
  // The whole recording the moment it is asked for.
  { name: 'instant', latency: 0, rate: Number.MAX_SAFE_INTEGER },
  // Chrome's network profiles: latency in ms, throughput in bytes a second.
  { name: 'Slow 4G', latency: 562, rate: 180_000 / bytesPerSecond / 1000 },
  { name: '3G', latency: 2000, rate: 50_000 / bytesPerSecond / 1000 },
];

/** The recording's length in seconds. */
const length = 240;

/** A request for the recording from `start` (seconds), its data flowing from `begins` (ms). */
interface Range {
  readonly start: number;
  readonly begins: number;
  /** Where it stopped, once a later request took its place. */
  frozen: Option.Option<number>;
}

const track = { number: 100, title: 'Great Is Thy Faithfulness' };

/** Cases in turn: whether each holds, and the state it says. */
type Cases = ReadonlyArray<readonly [holds: boolean, state: Status['state']]>;

/** The state of the first case that holds, else `playing`. */
const firstOf = (cases: Cases): Status['state'] =>
  Option.fromNullishOr(cases.find(([holds]) => holds)).pipe(
    Option.map(([, state]) => state),
    Option.getOrElse((): Status['state'] => 'playing'),
  );

/**
 * One recording on `platform` over `network`, on `clock`: what it holds,
 * where it is, and One's `Audio` over it.
 */
const element = (platform: Platform, network: Network, clock: TestClock.TestClock) => {
  const now = () => clock.currentTimeMillisUnsafe();
  const remote = Effect.runSync(Queue.unbounded<Remote>());
  const media = {
    loaded: false,
    ranges: new Array<Range>(),
    position: 0,
    since: 0,
    paused: false,
    ended: false,
    /** Android: MediaPlayer has prepared the recording. */
    prepared: false,
    /** The lock screen's play has reached the app's stream. */
    told: false,
    /** Asks the app made that the device has not answered yet (a resume, a seek), and since when. */
    asking: 0,
    askedAt: 0,
    /** When the app last read the status. */
    readAt: 0,
  };
  const endOf = (range: Range, t: number) =>
    Option.getOrElse(range.frozen, () =>
      Math.min(length, range.start + Math.max(0, t - range.begins) * network.rate),
    );
  /** Whether the recording holds a second's sound at `at` (seconds) by `t` (ms). */
  const holds = (at: number, t: number) =>
    media.ranges.some((range) => range.start <= at && endOf(range, t) >= Math.min(at + 1, length));
  /** When the recording first holds `at`, or never with the requests made. */
  const heldBy = (at: number) =>
    media.ranges
      .filter((range) => range.start <= at && Option.isNone(range.frozen))
      .map((range) => range.begins + (Math.min(at + 1, length) - range.start) / network.rate)
      .reduce((least, t) => Math.min(least, t), Number.POSITIVE_INFINITY);
  const ready = (t: number) =>
    media.loaded && Option.exists(Option.fromNullishOr(media.ranges[0]), (r) => t >= r.begins);
  const prepare = (t: number) => {
    if (platform === 'android' && !media.prepared && holds(0, t)) media.prepared = true;
  };
  const moving = () => !media.paused && !media.ended && (platform !== 'android' || media.prepared);
  /** Plays the sound from `since` to now, 10 ms at a time, waiting where it holds too little. */
  const advance = () => {
    const t = now();
    while (media.since < t) {
      const dt = Math.min(10, t - media.since);
      prepare(media.since);
      if (moving() && holds(media.position, media.since)) {
        media.position = Math.min(length, media.position + dt / 1000);
        media.ended = media.position >= length;
      }
      media.since += dt;
    }
    prepare(t);
  };
  const state = (): Status['state'] => {
    const held = holds(media.position, now());
    return firstOf(
      Match.value(platform).pipe(
        Match.when('web', (): Cases => [
          [!media.loaded, 'idle'],
          [media.ended, 'ended'],
          [!held, 'loading'],
          [media.paused, 'paused'],
        ]),
        Match.when('ios', (): Cases => [
          [!media.loaded, 'idle'],
          [media.ended, 'ended'],
          [media.paused, 'paused'],
          [!held, 'loading'],
        ]),
        Match.when('android', (): Cases => [
          [!media.loaded, 'idle'],
          [!media.prepared, 'loading'],
          [media.ended, 'ended'],
          [media.paused, 'paused'],
        ]),
        Match.exhaustive,
      ),
    );
  };
  const status = (): Status => {
    advance();
    const known = ready(now()) && (platform !== 'android' || media.prepared);
    return {
      state: state(),
      positionMs: media.position * 1000,
      ...(known && { durationMs: length * 1000 }),
    };
  };
  /** The device's answer reaches the app a turn later, as a promise's does (a native call crosses to the main thread). */
  const answer = <A, E>(reply: Effect.Effect<A, E>) => Effect.andThen(Effect.yieldNow, reply);
  const refused = (operation: string) =>
    answer(Effect.fail(PlaybackError.make({ operation, message: `${operation}: not ready` })));
  /** Sleeps until `t` (ms), or a second at most: the requests may change meanwhile. */
  const until = (t: number) => Effect.sleep(Math.max(1, Math.min(t, now() + 1000) - now()));
  /** Waits until the recording holds its place; refused when it is paused meanwhile. */
  const playing = (operation: string): Effect.Effect<Status, PlaybackError> =>
    Effect.suspend(() => {
      advance();
      if (media.paused) return refused(operation);
      if (holds(media.position, now())) return answer(Effect.sync(status));
      return until(heldBy(media.position)).pipe(Effect.andThen(playing(operation)));
    });
  /** The web waits until the element plays; a phone answers at once. */
  const started = (operation: string) =>
    Match.value(platform).pipe(
      Match.when('web', () => playing(operation)),
      Match.orElse(() => answer(Effect.sync(status))),
    );
  /** Waits until the recording holds `at`. */
  const sought = (at: number): Effect.Effect<Status> =>
    Effect.suspend(() => {
      if (holds(at, now())) return answer(Effect.sync(status));
      return until(heldBy(at)).pipe(Effect.andThen(sought(at)));
    });
  /** An ask of the app's, counted while the device has not answered it. */
  const answering = <A, E>(ask: Effect.Effect<A, E>) =>
    Effect.suspend(() => {
      if (media.asking === 0) media.askedAt = now();
      media.asking += 1;
      return ask.pipe(Effect.ensuring(Effect.sync(() => void (media.asking -= 1))));
    });
  const request = (from: number) => {
    const t = now();
    for (const range of media.ranges) {
      if (Option.isNone(range.frozen)) range.frozen = Option.some(endOf(range, t));
    }
    media.ranges.push({ start: from, begins: t + network.latency, frozen: Option.none() });
  };
  const resume = () => {
    advance();
    if (media.ended) {
      media.position = 0;
      media.ended = false;
    }
    media.paused = false;
  };
  const seek = (positionMs: number) =>
    Effect.suspend(() => {
      advance();
      const notReady = Match.value(platform).pipe(
        Match.when('android', () => !media.prepared),
        Match.orElse(() => !ready(now())),
      );
      if (notReady) return refused('seek');
      const at = Math.min(positionMs / 1000, length);
      if (platform === 'web' && at === media.position) return answer(Effect.sync(status));
      media.position = at;
      media.ended = false;
      const covered = media.ranges.some((range) => range.start <= at && endOf(range, now()) >= at);
      if (!covered) request(at);
      return answering(sought(at));
    });
  const layer = Layer.succeed(
    Playback,
    Playback.of({
      play: () =>
        Effect.suspend(() => {
          Object.assign(media, {
            loaded: true,
            ranges: [],
            position: 0,
            since: now(),
            paused: false,
            ended: false,
            prepared: false,
          });
          request(0);
          return started('play');
        }),
      pause: Effect.suspend(() => {
        advance();
        media.paused = true;
        return answer(Effect.sync(status));
      }),
      resume: answering(
        Effect.suspend(() => {
          resume();
          return started('resume');
        }),
      ),
      seek,
      status: answer(
        Effect.sync(() => {
          media.readAt = now();
          return status();
        }),
      ),
      online: Effect.succeed(true),
      announce: () => Effect.void,
      remote: Stream.fromQueue(remote),
    }),
  );
  /**
   * The lock screen presses `kind`: the session acts, then tells the app; on
   * the web the Media Session's handler waits for the element to play first.
   */
  const press = (kind: 'play' | 'pause'): Effect.Effect<void> =>
    Match.value(kind).pipe(
      Match.when('pause', () =>
        Effect.sync(() => {
          advance();
          media.paused = true;
        }),
      ),
      Match.orElse(() =>
        Effect.sync(resume).pipe(
          Effect.andThen(started('resume')),
          Effect.asVoid,
          Effect.catchTag('PlaybackError', () => Effect.never),
        ),
      ),
      Effect.andThen(
        Effect.sync(() => {
          Queue.offerUnsafe(remote, kind);
          media.told = kind === 'play';
        }),
      ),
    );
  return { media, layer, status, press, endOf };
};

/** What the reader does. */
type Act =
  | { readonly _tag: 'Wait'; readonly ms: number }
  | { readonly _tag: 'Pause' }
  | { readonly _tag: 'Resume' }
  /** The bar: near the place, just past what is loaded there, far into the recording, or near its end. */
  | { readonly _tag: 'Seek'; readonly to: 'near' | 'edge' | 'far' | 'end'; readonly share: number }
  | { readonly _tag: 'Remote'; readonly kind: 'play' | 'pause' };

const said: (act: Act) => string = Match.type<Act>().pipe(
  Match.tagsExhaustive({
    Wait: ({ ms }) => `wait ${ms}`,
    Pause: () => 'pause',
    Resume: () => 'play',
    Seek: ({ to, share }) => `seek ${to} (${share.toFixed(2)})`,
    Remote: ({ kind }) => `lock screen ${kind}`,
  }),
);

const actOf = Effect.gen(function* () {
  const kind = yield* Random.nextBetween(0, 1);
  if (kind < 0.35) return { _tag: 'Wait', ms: yield* Random.nextIntBetween(0, 3000) } satisfies Act;
  if (kind < 0.5) return { _tag: 'Pause' } satisfies Act;
  if (kind < 0.67) return { _tag: 'Resume' } satisfies Act;
  if (kind < 0.88) {
    const to = yield* Random.choice(['near', 'edge', 'far', 'end'] as const);
    return { _tag: 'Seek', to, share: yield* Random.nextBetween(0, 1) } satisfies Act;
  }
  return {
    _tag: 'Remote',
    kind: yield* Random.choice(['play', 'pause'] as const),
  } satisfies Act;
});

const runOf = (seed: number) =>
  Effect.runSync(
    Effect.gen(function* () {
      const count = yield* Random.nextIntBetween(3, 12);
      return yield* Effect.forEach(Array.from({ length: count }), () => actOf);
    }).pipe(Random.withSeed(seed)),
  );

/** How far the test's clock moves between two looks at the page, in ms. */
const look = 50;
/** The longest the player may go without reading the status while the device answers an ask, in ms. */
const unread = 2 * Duration.toMillis(statusEvery);

/**
 * The player over one recording on `platform` over `network`, on `clock`,
 * and the reader's hand on it: what it may press, its presses, and the
 * rules each look at the page checks. It ends with the run's `using`.
 */
const session = (platform: Platform, network: Network, clock: TestClock.TestClock) => {
  const device = element(platform, network, clock);
  // The device's refusals (a seek before the recording is ready) are logged by the player; the run keeps them quiet.
  const player = playerOn(
    Layer.mergeAll(
      device.layer,
      Layer.succeed(Clock.Clock, clock),
      Layer.succeed(References.MinimumLogLevel, 'None'),
    ),
    statusEvery,
  );
  const registry = AtomRegistry.make();
  registry.mount(player.send);
  registry.mount(player.remote);
  const done = new Array<string>();
  const broken = new Array<string>();
  /** What the reader last asked: a play, or a pause. */
  const reader = { wants: 'play' as 'play' | 'pause' };
  const fibers = new Array<Fiber.Fiber<void>>();
  const shown = () => registry.get(player.state);
  const where = () =>
    `${network.name}, ${platform}: ${done.join(', ')} (device ${device.status().state} at ${device.media.position.toFixed(1)})`;
  const judge = (state: Player) => {
    if (reader.wants === 'play' && Player.$is('Paused')(state))
      broken.push(`Paused shown after a play: ${where()}`);
  };
  const unwatch = registry.subscribe(player.state, judge);
  /** A play from the lock screen has reached the app: from now on it is the reader's ask. */
  const heard = () => {
    if (!device.media.told) return;
    device.media.told = false;
    reader.wants = 'play';
  };
  const settle = Effect.forEach(Array.from({ length: 4 }), () => Effect.yieldNow, {
    discard: true,
  });
  /** One look at the page after the clock moved. */
  const glance = () => {
    heard();
    judge(shown());
    const t = clock.currentTimeMillisUnsafe();
    const { asking, askedAt, readAt } = device.media;
    if (asking > 0 && t - askedAt > unread && t - readAt > unread)
      broken.push(`no status read for ${t - readAt} ms while the device answers: ${where()}`);
  };
  /** Moves the clock `ms` on, looking at the page every `look`. */
  const pass = (ms: number) =>
    Effect.forEach(
      Array.from({ length: Math.ceil(ms / look) }, (_, i) => Math.min(look, ms - i * look)),
      (step) =>
        Effect.suspend(() =>
          Match.value(broken.length > 0).pipe(
            Match.when(true, () => Effect.void),
            Match.orElse(() =>
              clock.adjust(step).pipe(Effect.andThen(settle), Effect.andThen(Effect.sync(glance))),
            ),
          ),
        ),
      { discard: true },
    );
  /** The reader's press: the page is judged at once, before the device answers anything. */
  const send = (command: Command) =>
    Effect.sync(() => {
      registry.set(player.send, command);
      judge(shown());
    }).pipe(Effect.andThen(settle));
  /** Whether the page offers `act` now: the reader presses only what it shows. */
  const offered = (act: Act) => {
    const now = shown();
    const plays = Player.$is('Playing')(now) || Player.$is('Buffering')(now);
    return Match.value(act).pipe(
      Match.tagsExhaustive({
        Wait: () => true,
        Pause: () => plays,
        Resume: () => Player.$is('Paused')(now) || Player.$is('Ended')(now),
        Seek: () => plays || Player.$is('Paused')(now),
        Remote: ({ kind }) => device.media.loaded && device.media.paused === (kind === 'play'),
      }),
    );
  };
  /** Where the bar sends the reader for `to`. */
  const placeOf = (to: 'near' | 'edge' | 'far' | 'end', share: number) => {
    const place = device.media.position;
    const loaded = device.media.ranges
      .filter((range) => range.start <= place)
      .map((range) => device.endOf(range, clock.currentTimeMillisUnsafe()))
      .reduce((most, end) => Math.max(most, end), place);
    return Match.value(to).pipe(
      Match.when('near', () => Math.max(0, place - 5)),
      Match.when('edge', () => Math.min(length - 1, loaded + 2)),
      Match.when('far', () => Math.floor(share * (length - 10))),
      Match.when('end', () => length - 1.5),
      Match.exhaustive,
    );
  };
  const perform: (act: Act) => Effect.Effect<void> = Match.type<Act>().pipe(
    Match.tagsExhaustive({
      Wait: ({ ms }) => pass(ms),
      Pause: () =>
        Effect.suspend(() => {
          reader.wants = 'pause';
          return send(Command.Pause());
        }),
      Resume: () =>
        Effect.suspend(() => {
          reader.wants = 'play';
          return send(Command.Resume());
        }),
      Seek: ({ to, share }) =>
        Effect.suspend(() => send(Command.Seek({ seconds: placeOf(to, share) }))),
      Remote: ({ kind }) =>
        Effect.gen(function* () {
          if (kind === 'pause') reader.wants = 'pause';
          fibers.push(yield* Effect.forkChild(device.press(kind)));
          yield* settle;
        }),
    }),
  );
  /** The reader presses `act` if the page offers it. */
  const act = (act: Act) =>
    Effect.suspend(() => {
      if (broken.length > 0 || !offered(act)) return Effect.void;
      done.push(said(act));
      return perform(act).pipe(
        Effect.andThen(
          Effect.sync(() => {
            judge(shown());
            heard();
          }),
        ),
      );
    });
  /** Play to the end: once the device plays, the page shows Playing within half a second. */
  const finish = Effect.gen(function* () {
    const now = shown();
    if (reader.wants === 'pause' && (Player.$is('Paused')(now) || Player.$is('Ended')(now)))
      yield* act({ _tag: 'Resume' });
    if (reader.wants === 'pause') return;
    let since = Option.none<number>();
    for (const _ of Array.from({ length: 160 })) {
      if (broken.length > 0 || Player.$is('Playing')(shown())) return;
      yield* pass(look);
      since = Option.liftPredicate(device.status().state, (s) => s === 'playing').pipe(
        Option.map(() => Option.getOrElse(since, () => clock.currentTimeMillisUnsafe())),
      );
      if (Option.exists(since, (from) => clock.currentTimeMillisUnsafe() - from > 500))
        broken.push(`the device plays and the page shows ${shown()._tag}: ${where()}`);
    }
  });
  return {
    broken,
    start: Effect.suspend(() => {
      done.push('start');
      return send(Command.Start({ track }));
    }),
    act,
    finish,
    [Symbol.dispose]: () => {
      Effect.runFork(Effect.forEach(fibers, Fiber.interrupt));
      unwatch();
      registry.dispose();
    },
  };
};

/** Runs the reader's `acts` on `platform` over `network`; the first rule broken, said with what came before it. */
const play = (platform: Platform, network: Network, acts: ReadonlyArray<Act>) =>
  Effect.gen(function* () {
    const clock = yield* TestClock.testClockWith(Effect.succeed);
    using run = session(platform, network, clock);
    yield* run.start;
    yield* Effect.forEach(acts, run.act, { discard: true });
    yield* run.finish;
    return Option.fromNullishOr(run.broken[0]);
  });

/** Seeded runs for each network on `platform`. */
const runs = 24;

const property = (platform: Platform) =>
  Effect.gen(function* () {
    const broken = new Array<string>();
    for (const network of networks) {
      for (const seed of Array.from({ length: runs }, (_, i) => i)) {
        const line = yield* play(platform, network, runOf(seed));
        if (Option.isSome(line)) broken.push(`seed ${seed}: ${line.value}`);
      }
    }
    expect(broken.slice(0, 3)).toEqual([]);
  });

describe('after the reader’s Play, the player never shows Paused', () => {
  it.effect('on the web, whose play() waits until the element plays', () => property('web'));
  it.effect('on iOS, whose resume answers while AVPlayer waits to play', () => property('ios'));
  it.effect('on Android, whose resume answers before MediaPlayer plays', () => property('android'));
});
