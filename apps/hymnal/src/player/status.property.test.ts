/**
 * What the player shows from the moment the reader presses Play, by any
 * path, over seeded runs on each device's playback as One's `Audio` gives
 * it, on a network that loads the recording at once, at Chrome's "Slow 4G"
 * or at its "3G" (latency and throughput), on the test's clock. Each answer
 * of the device reaches the app `hop` later, never in the turn that asked:
 * an element's promise settles in a later task, and a native call crosses
 * to the main thread.
 * - The web (`HTMLAudioElement`): `play()` and `resume()` wait until the
 *   element plays, `seek` waits for `seeked`, and a status read says
 *   `loading` while the element holds too little at its place, paused or
 *   not. An element that fails before it has data refuses its pending
 *   `play()`; one that fails after it never settles it (the media data
 *   processing steps fire `error` and reject no promise). A connection lost
 *   mid-load stalls the request with no error. The Media Session's buttons
 *   (the browser's and the system's media controls, a hardware play key)
 *   reach the app at the press and do nothing else: the app acts on them.
 * - iOS (AVPlayer): `resume` answers at once; a status read says `loading`
 *   while it waits to play and `paused` once paused; `seek` waits for its
 *   completion. The lock screen plays or pauses, then tells the app at once.
 * - Android (MediaPlayer): `resume` answers at once; a status read says
 *   `loading` until the recording is prepared and `playing` once started;
 *   `seek` waits for its completion. The lock screen as on iOS.
 *
 * The reader presses what the page offers: Start, then Pause while it plays
 * or loads, Play while paused or ended, Retry once failed, the bar (near
 * the place, just past what is loaded, far into what is not, near the end)
 * while it shows; the lock screen or the Media Session plays and pauses. A
 * key on the page's button is the button (the browser activates it). The
 * world meanwhile drops the connection and brings it back, and fails the
 * recording before or after it has data. In every run:
 * - from a Play (Start, Retry, Resume, the lock screen's or the Media
 *   Session's), at its press, until the next Pause, the page never shows
 *   Paused;
 * - while the device has not answered a play, a resume or a seek, the
 *   player reads its status at least every two `statusEvery`, until the
 *   page shows Failed;
 * - the spinner (Loading, which offers no button) never shows for longer
 *   than `spinnerLimit`: a load that stalls ends in Failed, with Retry;
 * - once the device fails while the page waits on it or plays, the page
 *   shows Failed, with Retry, within a second;
 * - a second after a Pause, by any path, the device is not playing;
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
const instant: Network = { name: 'instant', latency: 0, rate: Number.MAX_SAFE_INTEGER };
// Chrome's network profiles: latency in ms, throughput in bytes a second.
const slow4g: Network = { name: 'Slow 4G', latency: 562, rate: 180_000 / bytesPerSecond / 1000 };
const g3: Network = { name: '3G', latency: 2000, rate: 50_000 / bytesPerSecond / 1000 };
const networks: ReadonlyArray<Network> = [instant, slow4g, g3];

/**
 * How long a device's answer takes to reach the app. The atoms' fibers run
 * the turn a command is sent until they wait on the clock, so an answer that
 * only yielded would reach the page before the reader's press returned.
 */
const hop = Duration.millis(1);

/** The recording's length in seconds. */
const length = 240;

/** A request for the recording from `start` (seconds), its data flowing from `begins` (ms). */
interface Range {
  readonly start: number;
  begins: number;
  /** Where it stopped: a later request took its place, or the connection dropped. */
  frozen: Option.Option<number>;
  /** Stopped by a lost connection: it flows again once the connection is back. */
  dropped: boolean;
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
    /** When the recording fails (ms); never while infinite. */
    failsAt: Number.POSITIVE_INFINITY,
    online: true,
    /** Asks the app made that the device has not answered yet (a play, a resume, a seek), and since when. */
    asking: 0,
    askedAt: 0,
    /** When the app last read the status. */
    readAt: 0,
  };
  const failed = () => media.loaded && now() >= media.failsAt;
  const endOf = (range: Range, t: number) =>
    Option.getOrElse(range.frozen, () =>
      Math.min(length, range.start + Math.max(0, t - range.begins) * network.rate),
    );
  /** Whether the recording holds a second's sound at `at` (seconds) by `t` (ms). */
  const holds = (at: number, t: number) =>
    media.ranges.some((range) => range.start <= at && endOf(range, t) >= Math.min(at + 1, length));
  /** When the recording first holds `at`, or never with the requests flowing. */
  const heldBy = (at: number) =>
    media.ranges
      .filter((range) => range.start <= at && Option.isNone(range.frozen))
      .map((range) => range.begins + (Math.min(at + 1, length) - range.start) / network.rate)
      .reduce((least, t) => Math.min(least, t), Number.POSITIVE_INFINITY);
  /** The element has its metadata: its first request's data has begun. */
  const ready = (t: number) =>
    media.loaded &&
    Option.exists(
      Option.fromNullishOr(media.ranges[0]),
      (r) => endOf(r, t) > r.start || (Option.isNone(r.frozen) && t >= r.begins),
    );
  const prepare = (t: number) => {
    if (platform === 'android' && !media.prepared && holds(0, t)) media.prepared = true;
  };
  const moving = () =>
    !media.paused && !media.ended && !failed() && (platform !== 'android' || media.prepared);
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
    advance();
    const held = holds(media.position, now());
    return firstOf(
      Match.value(platform).pipe(
        Match.when('web', (): Cases => [
          [!media.loaded, 'idle'],
          [failed(), 'failed'],
          [media.ended, 'ended'],
          [!held, 'loading'],
          [media.paused, 'paused'],
        ]),
        Match.when('ios', (): Cases => [
          [!media.loaded, 'idle'],
          [failed(), 'failed'],
          [media.ended, 'ended'],
          [media.paused, 'paused'],
          [!held, 'loading'],
        ]),
        Match.when('android', (): Cases => [
          [!media.loaded, 'idle'],
          [failed(), 'failed'],
          [!media.prepared, 'loading'],
          [media.ended, 'ended'],
          [media.paused, 'paused'],
        ]),
        Match.exhaustive,
      ),
    );
  };
  const status = (): Status => {
    const said = state();
    const known = ready(now()) && (platform !== 'android' || media.prepared);
    return {
      state: said,
      positionMs: media.position * 1000,
      ...(known && { durationMs: length * 1000 }),
    };
  };
  /** The device's answer reaches the app `hop` after the ask. */
  const answer = <A, E>(reply: Effect.Effect<A, E>) => Effect.andThen(Effect.sleep(hop), reply);
  const refused = (operation: string) =>
    answer(Effect.fail(PlaybackError.make({ operation, message: `${operation}: not ready` })));
  /** Sleeps until `t` (ms), or a second at most: the requests may change meanwhile. */
  const until = (t: number) =>
    Effect.sleep(Math.max(1, Math.min(t, media.failsAt, now() + 1000) - now()));
  /**
   * Waits until the recording holds its place; refused when it is paused
   * meanwhile, or fails before it has data; never settled when it fails after.
   */
  const playing = (operation: string): Effect.Effect<Status, PlaybackError> =>
    Effect.suspend(() => {
      advance();
      if (failed() && ready(now())) return Effect.never;
      if (failed()) return refused(operation);
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
  /** Waits until the recording holds `at`; refused once it fails. */
  const sought = (at: number): Effect.Effect<Status, PlaybackError> =>
    Effect.suspend(() => {
      if (failed()) return refused('seek');
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
  /** A request from `from` (seconds): its data begins after the latency, or once the connection is back. */
  const request = (from: number) => {
    const t = now();
    for (const range of media.ranges) {
      if (Option.isNone(range.frozen)) range.frozen = Option.some(endOf(range, t));
    }
    media.ranges.push({
      start: from,
      begins: t + network.latency,
      frozen: Option.liftPredicate(from, () => !media.online),
      dropped: !media.online,
    });
  };
  const resume = () => {
    advance();
    if (media.ended) {
      media.position = 0;
      media.ended = false;
    }
    media.paused = false;
  };
  const pause = () => {
    advance();
    media.paused = true;
  };
  const seek = (positionMs: number) =>
    Effect.suspend(() => {
      advance();
      const notReady = Match.value(platform).pipe(
        Match.when('android', () => !media.prepared),
        Match.orElse(() => !ready(now())),
      );
      if (notReady || failed()) return refused('seek');
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
        answering(
          Effect.suspend(() => {
            Object.assign(media, {
              loaded: true,
              ranges: [],
              position: 0,
              since: now(),
              paused: false,
              ended: false,
              prepared: false,
              // With no connection the element fails once its request does, before any data.
              failsAt: Match.value(media.online).pipe(
                Match.when(true, () => Number.POSITIVE_INFINITY),
                Match.orElse(() => now() + network.latency),
              ),
            });
            request(0);
            return started('play');
          }),
        ),
      pause: Effect.suspend(() => {
        pause();
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
      online: Effect.sync(() => media.online),
      announce: () => Effect.void,
      remote: Stream.fromQueue(remote),
    }),
  );
  /**
   * The lock screen or the Media Session presses `kind`. A phone's session
   * acts, then tells the app; the web's Media Session tells the app at the
   * press and does nothing itself.
   */
  const press = (kind: 'play' | 'pause') =>
    Effect.sync(() => {
      if (platform !== 'web')
        Match.value(kind).pipe(Match.when('play', resume), Match.orElse(pause));
      Queue.offerUnsafe(remote, kind);
    });
  /** The connection drops: every request stops where it is, with no error. */
  const drop = () => {
    const t = now();
    advance();
    media.online = false;
    for (const range of media.ranges) {
      if (Option.isNone(range.frozen)) {
        range.frozen = Option.some(endOf(range, t));
        range.dropped = true;
      }
    }
  };
  /** The connection is back: each request it stopped flows again from where it stopped, after the latency. */
  const back = () => {
    const t = now();
    advance();
    media.online = true;
    for (const range of media.ranges) {
      if (range.dropped) {
        const got = Option.getOrElse(range.frozen, () => range.start);
        range.begins = t + network.latency - (got - range.start) / network.rate;
        range.frozen = Option.none();
        range.dropped = false;
      }
    }
  };
  /** The recording fails now: before its data, or after it. */
  const fail = () => {
    advance();
    media.failsAt = now();
  };
  return { media, layer, state, press, drop, back, fail, failed, endOf };
};

/** What the reader does, and what the world does to the connection and the recording. */
type Act =
  | { readonly _tag: 'Wait'; readonly ms: number }
  | { readonly _tag: 'Pause' }
  | { readonly _tag: 'Resume' }
  /** The bar: near the place, just past what is loaded there, far into the recording, or near its end. */
  | { readonly _tag: 'Seek'; readonly to: 'near' | 'edge' | 'far' | 'end'; readonly share: number }
  | { readonly _tag: 'Remote'; readonly kind: 'play' | 'pause' }
  | { readonly _tag: 'Retry' }
  | { readonly _tag: 'Drop' }
  | { readonly _tag: 'Back' }
  | { readonly _tag: 'Fail' };

const said: (act: Act) => string = Match.type<Act>().pipe(
  Match.tagsExhaustive({
    Wait: ({ ms }) => `wait ${ms}`,
    Pause: () => 'pause',
    Resume: () => 'play',
    Seek: ({ to, share }) => `seek ${to} (${share.toFixed(2)})`,
    Remote: ({ kind }) => `remote ${kind}`,
    Retry: () => 'retry',
    Drop: () => 'connection lost',
    Back: () => 'connection back',
    Fail: () => 'recording fails',
  }),
);

const actOf = Effect.gen(function* () {
  const kind = yield* Random.nextBetween(0, 1);
  if (kind < 0.3) return { _tag: 'Wait', ms: yield* Random.nextIntBetween(0, 3000) } satisfies Act;
  if (kind < 0.42) return { _tag: 'Pause' } satisfies Act;
  if (kind < 0.56) return { _tag: 'Resume' } satisfies Act;
  if (kind < 0.74) {
    const to = yield* Random.choice(['near', 'edge', 'far', 'end'] as const);
    return { _tag: 'Seek', to, share: yield* Random.nextBetween(0, 1) } satisfies Act;
  }
  if (kind < 0.86) {
    return {
      _tag: 'Remote',
      kind: yield* Random.choice(['play', 'pause'] as const),
    } satisfies Act;
  }
  if (kind < 0.9) return { _tag: 'Retry' } satisfies Act;
  if (kind < 0.95) return { _tag: 'Drop' } satisfies Act;
  if (kind < 0.98) return { _tag: 'Back' } satisfies Act;
  return { _tag: 'Fail' } satisfies Act;
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
/** The longest the spinner may show, in ms: a load that stalls longer ends in Failed, with Retry. */
const spinnerLimit = 20_000;
/** How soon the page shows a failure, and the device obeys a Pause, in ms. */
const within = 1000;

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
  const t = () => clock.currentTimeMillisUnsafe();
  /** What the reader last asked, by any path, and when. */
  const reader = { wants: 'play' as 'play' | 'pause', at: 0 };
  /** Since when the page has shown the spinner, and since when the device has failed. */
  const since = { loading: Option.none<number>(), failed: Option.none<number>() };
  const fibers = new Array<Fiber.Fiber<void>>();
  const shown = () => registry.get(player.state);
  const where = () =>
    `${network.name}, ${platform}: ${done.join(', ')} (device ${device.state()} at ${device.media.position.toFixed(1)}, ${Match.value(
      device.media.online,
    ).pipe(
      Match.when(true, () => 'online'),
      Match.orElse(() => 'offline'),
    )})`;
  const judge = (state: Player) => {
    if (reader.wants === 'play' && Player.$is('Paused')(state))
      broken.push(`Paused shown after a play: ${where()}`);
  };
  const unwatch = registry.subscribe(player.state, judge);
  const ask = (wants: 'play' | 'pause') => {
    reader.wants = wants;
    reader.at = t();
  };
  const settle = Effect.forEach(Array.from({ length: 4 }), () => Effect.yieldNow, {
    discard: true,
  });
  /** Since when `holds` has held, as of now. */
  const held = (was: Option.Option<number>, holds: boolean) =>
    Option.liftPredicate(was, () => holds).pipe(Option.map((from) => Option.getOrElse(from, t)));
  /** One look at the page after the clock moved. */
  const glance = () => {
    const page = shown();
    judge(page);
    const now = t();
    const { asking, askedAt, readAt } = device.media;
    if (
      asking > 0 &&
      !Player.$is('Failed')(page) &&
      now - askedAt > unread &&
      now - readAt > unread
    )
      broken.push(`no status read for ${now - readAt} ms while the device answers: ${where()}`);
    since.loading = held(since.loading, Player.$is('Loading')(page));
    if (Option.exists(since.loading, (from) => now - from > spinnerLimit))
      broken.push(`the spinner shows for ${spinnerLimit} ms, with no Retry: ${where()}`);
    const waits =
      Player.$is('Loading')(page) || Player.$is('Buffering')(page) || Player.$is('Playing')(page);
    since.failed = held(since.failed, device.failed() && reader.wants === 'play' && waits);
    if (Option.exists(since.failed, (from) => now - from > within))
      broken.push(`the device failed and the page shows ${page._tag}: ${where()}`);
    if (reader.wants === 'pause' && now - reader.at > within && device.state() === 'playing')
      broken.push(`the reader paused and the device plays: ${where()}`);
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
  /** Whether the page, the lock screen or the world offers `act` now: the reader presses only what shows. */
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
        Retry: () => Player.$is('Failed')(now),
        Drop: () => device.media.online && device.media.loaded,
        Back: () => !device.media.online,
        Fail: () => device.media.loaded && !device.failed(),
      }),
    );
  };
  /** Where the bar sends the reader for `to`. */
  const placeOf = (to: 'near' | 'edge' | 'far' | 'end', share: number) => {
    const place = device.media.position;
    const loaded = device.media.ranges
      .filter((range) => range.start <= place)
      .map((range) => device.endOf(range, t()))
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
          ask('pause');
          return send(Command.Pause());
        }),
      Resume: () =>
        Effect.suspend(() => {
          ask('play');
          return send(Command.Resume());
        }),
      Seek: ({ to, share }) =>
        Effect.suspend(() => send(Command.Seek({ seconds: placeOf(to, share) }))),
      Remote: ({ kind }) =>
        Effect.gen(function* () {
          ask(kind);
          fibers.push(yield* Effect.forkChild(device.press(kind)));
          yield* settle;
          judge(shown());
        }),
      Retry: () =>
        Effect.suspend(() => {
          ask('play');
          return send(Command.Start({ track }));
        }),
      Drop: () => Effect.sync(device.drop),
      Back: () => Effect.sync(device.back),
      Fail: () => Effect.sync(device.fail),
    }),
  );
  /** The reader presses `act` if the page offers it. */
  const act = (act: Act) =>
    Effect.suspend(() => {
      if (broken.length > 0 || !offered(act)) return Effect.void;
      done.push(said(act));
      return perform(act).pipe(Effect.andThen(Effect.sync(() => judge(shown()))));
    });
  /**
   * The connection comes back, a failed recording is retried and a paused
   * one played: once the device plays, the page shows Playing within half a second.
   */
  const finish = Effect.gen(function* () {
    if (reader.wants === 'pause') yield* pass(within + look);
    yield* act({ _tag: 'Back' });
    yield* act({ _tag: 'Retry' });
    yield* act({ _tag: 'Resume' });
    if (reader.wants === 'pause') return;
    let playing = Option.none<number>();
    for (const _ of Array.from({ length: 160 })) {
      if (broken.length > 0 || Player.$is('Playing')(shown()) || Player.$is('Failed')(shown()))
        return;
      yield* pass(look);
      playing = held(playing, device.state() === 'playing');
      if (Option.exists(playing, (from) => t() - from > 500))
        broken.push(`the device plays and the page shows ${shown()._tag}: ${where()}`);
    }
  });
  return {
    broken,
    start: Effect.suspend(() => {
      done.push('start');
      ask('play');
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

describe('from the reader’s Play, by any path, the player never shows Paused and never hangs', () => {
  it.effect('on the web, whose play() waits until the element plays', () => property('web'));
  it.effect('on iOS, whose resume answers while AVPlayer waits to play', () => property('ios'));
  it.effect('on Android, whose resume answers before MediaPlayer plays', () => property('android'));
});

describe('each defect found before, as a fixed run', () => {
  const wait = (ms: number): Act => ({ _tag: 'Wait', ms });
  const pausedSeekFar: ReadonlyArray<Act> = [
    wait(3000),
    { _tag: 'Pause' },
    { _tag: 'Seek', to: 'far', share: 0.83 },
    wait(150),
  ];
  const holds = (platform: Platform, network: Network, acts: ReadonlyArray<Act>) =>
    Effect.map(play(platform, network, acts), (broken) => expect(broken).toEqual(Option.none()));

  it.effect('player r3 M2: the page’s Play after a seek while paused, on 3G', () =>
    holds('web', g3, [...pausedSeekFar, { _tag: 'Resume' }, wait(4000)]),
  );
  it.effect('player r3 M2: the page’s Play after a seek while paused, on Slow 4G', () =>
    holds('web', slow4g, [...pausedSeekFar, { _tag: 'Resume' }, wait(2000)]),
  );
  it.effect('playerfix r1 M1: the Media Session’s play after a seek while paused, on 3G', () =>
    holds('web', g3, [...pausedSeekFar, { _tag: 'Remote', kind: 'play' }, wait(4000)]),
  );
  it.effect('playerfix r1 M1: the Media Session’s play after a seek while paused, on Slow 4G', () =>
    holds('web', slow4g, [...pausedSeekFar, { _tag: 'Remote', kind: 'play' }, wait(2000)]),
  );
  it.effect('playerfix r1 M1: the Media Session’s pause pauses the element', () =>
    holds('web', instant, [wait(500), { _tag: 'Remote', kind: 'pause' }, wait(2000)]),
  );
  it.effect('playerfix r1 M2: the status is read while Start’s play() waits, on Slow 4G', () =>
    holds('web', slow4g, [wait(1430)]),
  );
  it.effect(
    'playerfix r1 M2: the recording fails mid-load, after its data began: Failed, then Retry',
    () =>
      holds('web', g3, [wait(2100), { _tag: 'Fail' }, wait(2000), { _tag: 'Retry' }, wait(4000)]),
  );
  it.effect('playerfix r1 M2: the connection drops mid-load: the spinner ends in Failed', () =>
    holds('web', g3, [wait(2100), { _tag: 'Drop' }, wait(spinnerLimit + 2000)]),
  );
  it.effect(
    'the connection drops before the data: Retry while offline fails, Retry once back plays',
    () =>
      holds('web', slow4g, [
        wait(100),
        { _tag: 'Drop' },
        wait(spinnerLimit + 2000),
        { _tag: 'Retry' },
        wait(3000),
        { _tag: 'Back' },
        { _tag: 'Retry' },
        wait(3000),
      ]),
  );
  it.effect('the lock screen’s play after a seek while paused, on iOS over 3G', () =>
    holds('ios', g3, [...pausedSeekFar, { _tag: 'Remote', kind: 'play' }, wait(4000)]),
  );
  it.effect('the connection drops mid-load on iOS: the spinner ends in Failed', () =>
    holds('ios', g3, [wait(2100), { _tag: 'Drop' }, wait(spinnerLimit + 2000)]),
  );
  it.effect('the connection drops mid-load on Android: the spinner ends in Failed', () =>
    holds('android', g3, [wait(2100), { _tag: 'Drop' }, wait(spinnerLimit + 2000)]),
  );
});
