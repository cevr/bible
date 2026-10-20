/**
 * What the player shows from the moment the reader presses Play, by any
 * path, over seeded runs on each device's playback as One 2.8's `Audio`
 * source gives it (`one/src/platform/audio/index.ts` on the web,
 * `HybridOneAudio.swift` on iOS, `HybridOneAudio.kt` on Android), on a
 * network that loads at once, at Chrome's "Slow 4G", at its "3G", or at
 * the slowest link Chrome was measured to start a hymn on (3 kB/s), on the
 * test's clock. Each answer of the device reaches the app `hop` later,
 * never in the turn that asked.
 *
 * The recording is hymn 100: 240 s at 64 kbps. A request's data flows after
 * the network's latency at its throughput; a request lost with the
 * connection flows again once it is back. An engine plays a place once it
 * holds `need` bytes past it (Chrome played hymns 100 and 150 with 33 kB
 * received, measured), plays on while it holds a quarter second, and asks
 * for a place it lacks that no request brings.
 * - The web (`HTMLAudioElement`): `play` makes a new element and waits until
 *   it plays. Its metadata comes with the first 33 kB (measured: 33.5 kB at
 *   2 kB/s). A `pause` of the element while `play` waits rejects it, and One
 *   keeps that rejection as the status `failed` until the next `play` or
 *   `stop`; a later `resume` plays the element all the same. An error before
 *   the metadata rejects a waiting `play`; after it, the wait never settles.
 *   `resume` waits until it plays, `seek` until the element holds the
 *   place. A status says `loading` while the element waits for data, paused
 *   or not. `stop` drops the element. The Media Session's buttons reach the
 *   app at the press (the page sets the handlers) and do nothing else.
 * - iOS (AVPlayer): `play`, `pause` and `resume` answer at once; a status
 *   says `paused` from a pause on, `loading` while the item is not ready or
 *   the player waits to play. `seek` waits for its completion; `stop` drops
 *   the player. The lock screen (once the app announced the recording) plays
 *   or pauses, then tells the app.
 * - Android (MediaPlayer): `play` answers at once and prepares; once
 *   prepared it starts, whatever was asked meanwhile. A pause before that
 *   only marks it paused, so the status says `loading`, then `paused` while
 *   it plays. `resume` answers at once; `seek` waits for its completion;
 *   `stop` drops the player. The lock screen as on iOS.
 *
 * The reader presses what the page offers: Start, then Pause while it plays,
 * Play while paused, ended or stopped, Retry once failed, the bar while it
 * shows (near the place, just past what is loaded, far, near the end); the
 * lock screen or the Media Session plays, pauses and seeks. The world drops
 * the connection and brings it back, and fails the recording. In every run,
 * at every look at the page:
 * - from a Play (any path), at its press, until the next Pause or the
 *   recording's end, the page never shows Paused or Stopped;
 * - while the device has not answered a play, a resume or a seek, the
 *   player reads its status at least every two `statusEvery`, until the
 *   page shows Failed or Stopped;
 * - the spinner never shows for longer than `spinnerLimit`;
 * - once the device fails while the page waits on it or plays, the page
 *   shows Failed within a second;
 * - Failed shows only for a recording that failed or lost its connection;
 * - a second after a Pause, by any path, the device makes no sound;
 * - the device makes no sound for half a second while the page shows other
 *   than Playing;
 * - on a network that is online, with a recording that has not failed,
 *   each Play (any path), seek while playing, and return of the connection
 *   shows Playing within `boundOf` the network: the model's time to the
 *   first sound and a second.
 * Each run ends with the connection back, Retry or Play pressed, the
 * page showing Playing within that bound, and a second on, the recording
 * announced to the lock screen and the Media Session.
 */

import { describe, expect, it } from 'effect-bun-test';
import {
  Clock,
  Duration,
  Effect,
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
  type Player,
  playerOn,
  Remote,
  type Status,
  statusEvery,
} from './player';

type Platform = 'web' | 'ios' | 'android';

/** A network: the wait before a request's first byte (ms), and its throughput (bytes a second). */
interface Network {
  readonly name: string;
  readonly latency: number;
  readonly throughput: number;
}

const instant: Network = { name: 'instant', latency: 0, throughput: Number.MAX_SAFE_INTEGER };
// Chrome's network profiles.
const slow4g: Network = { name: 'Slow 4G', latency: 562.5, throughput: 180_000 };
const g3: Network = { name: '3G', latency: 2000, throughput: 50_000 };
/** The slowest link Chrome was measured to start hymn 100 on within 15 s: Playing at 13.6 s. */
const edge: Network = { name: '3 kB/s', latency: 2000, throughput: 3000 };
const networks: ReadonlyArray<Network> = [instant, slow4g, g3, edge];

/** Hymn 100's recording: its length in seconds, and its bytes a second (64 kbps; 1.92 MB, measured). */
const length = 240;
const bytesPerSecond = 8000;
/** The bytes an engine holds past a place before it plays there (Chrome: 33 kB, measured). */
const need = 33_000;
/** Those bytes in seconds of sound; and what an engine that plays holds before it waits. */
const ahead = need / bytesPerSecond;
const least = 0.25;

/** Seconds of sound a request brings in each ms. */
const rateOf = (network: Network) => network.throughput / bytesPerSecond / 1000;
/** The model's time from a request to its first sound, in ms. */
const firstSound = (network: Network) => network.latency + (need / network.throughput) * 1000;
/** How soon a Play on a working network shows Playing: the first sound and a second of reads. */
const boundOf = (network: Network) => firstSound(network) + 1000;

/**
 * How long a device's answer takes to reach the app. The atoms' fibers run
 * the turn a command is sent until they wait on the clock, so an answer that
 * only yielded would reach the page before the reader's press returned.
 */
const hop = Duration.millis(1);

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

/** A player state's name, as a string (the page's states as the reader reads them). */
const tagOf = (player: Player): string => player._tag;

/**
 * One's `Audio` on `platform` over `network`, on `clock`: the recording it
 * holds, where it is, and the calls the app makes.
 */
const element = (platform: Platform, network: Network, clock: TestClock.TestClock) => {
  const now = () => clock.currentTimeMillisUnsafe();
  const rate = rateOf(network);
  const remote = Effect.runSync(Queue.unbounded<Remote>());
  const media = {
    /** One holds a player (an element, an AVPlayer, a MediaPlayer). */
    loaded: false,
    /** Counts each player One made or dropped: an answer for an old one is refused. */
    generation: 0,
    ranges: new Array<Range>(),
    position: 0,
    since: 0,
    /** The engine is set to play: the web element is not paused, AVPlayer's rate, MediaPlayer started. */
    engine: false,
    /** It waits for data at its place. */
    waiting: true,
    /** Its metadata (the web), its item ready (iOS), prepared (Android). */
    ready: false,
    ended: false,
    /** When it last played to its end. */
    endedAt: Number.NEGATIVE_INFINITY,
    /** One's `playbackPaused` (iOS, Android). */
    marked: false,
    /** The web: One's `Audio.play` promise, while it waits, and the status `failed` it keeps once rejected. */
    pending: false,
    rejected: false,
    /** When the recording fails (ms); never while infinite. */
    failsAt: Number.POSITIVE_INFINITY,
    online: true,
    /** The recording One holds failed or lost its connection since its `play`. */
    trouble: false,
    /** A phone's now-playing session: set by an announcement, dropped with the player. */
    session: false,
    /** Asks the app made that the device has not answered yet (a play, a resume, a seek), and since when. */
    asking: 0,
    askedAt: 0,
    /** When the app last read the status. */
    readAt: 0,
    /** Each place the app asked the device to seek to (seconds), and when. */
    sought: new Array<{ readonly to: number; readonly at: number }>(),
  };
  const failed = () => media.loaded && now() >= media.failsAt;
  const endOf = (range: Range, t: number) =>
    Option.getOrElse(range.frozen, () =>
      Math.min(length, range.start + Math.max(0, t - range.begins) * rate),
    );
  /** Whether a request holds `span` seconds of sound from `at` (or to the end) by `t` (ms). */
  const holds = (at: number, span: number, t: number) =>
    media.ranges.some(
      (range) => range.start <= at && endOf(range, t) >= Math.min(at + span, length),
    );
  /** When a flowing request first holds a start at `at`, or never. */
  const heldBy = (at: number) =>
    media.ranges
      .filter((range) => range.start <= at && Option.isNone(range.frozen))
      .map((range) => range.begins + (Math.min(at + ahead, length) - range.start) / rate)
      .reduce((least, t) => Math.min(least, t), Number.POSITIVE_INFINITY);
  /** A request from `from` (seconds) in place of the others: its data begins after the latency, or once the connection is back. */
  const request = (from: number) => {
    const t = now();
    for (const range of media.ranges) {
      if (Option.isNone(range.frozen)) range.frozen = Option.some(endOf(range, t));
      range.dropped = false;
    }
    media.ranges.push({
      start: from,
      begins: t + network.latency,
      frozen: Option.liftPredicate(from, () => !media.online),
      dropped: !media.online,
    });
  };
  /**
   * The engine asks for its place when it lacks it and no request brings it
   * soon: one that flows, or will once the connection is back, and whose
   * data is less than a start's worth short of the place.
   */
  const demand = (t: number) => {
    if (!media.loaded || failed() || holds(media.position, ahead, t)) return;
    const brought = media.ranges.some(
      (range) =>
        range.start <= media.position &&
        (Option.isNone(range.frozen) || range.dropped) &&
        endOf(range, t) + ahead >= media.position,
    );
    if (!brought) request(media.position);
  };
  /** The engine's state at `t`: ready, waiting or not, and Android's start once prepared. */
  const settle = (t: number) => {
    demand(t);
    const wait = Match.value(media.waiting).pipe(
      Match.when(true, () => !holds(media.position, ahead, t)),
      Match.orElse(() => !holds(media.position, least, t)),
    );
    media.waiting = wait;
    if (!wait && !media.ready) {
      media.ready = true;
      // Android: MediaPlayer starts once prepared, whatever was asked meanwhile.
      if (platform === 'android') media.engine = true;
    }
    // The web: an error before the metadata rejects the waiting `play`, and One keeps it.
    if (media.pending && failed() && !media.ready) {
      media.pending = false;
      media.rejected = true;
    }
  };
  /** The device makes sound. */
  const sounding = () =>
    media.loaded && media.engine && !media.waiting && !media.ended && !failed();
  /** Plays the sound from `since` to now, 10 ms at a time. */
  const advance = () => {
    const t = now();
    while (media.since < t) {
      const dt = Math.min(10, t - media.since);
      settle(media.since);
      if (sounding()) {
        media.pending = false;
        media.position = Math.min(length, media.position + dt / 1000);
        if (media.position >= length) {
          media.ended = true;
          media.endedAt = media.since + dt;
          media.engine = false;
        }
      }
      media.since += dt;
    }
    settle(t);
    if (sounding()) media.pending = false;
  };
  const state = (): Status['state'] => {
    advance();
    return firstOf(
      Match.value(platform).pipe(
        Match.when('web', (): Cases => [
          [!media.loaded, 'idle'],
          [failed() || media.rejected, 'failed'],
          [media.ended, 'ended'],
          [media.waiting, 'loading'],
          [!media.engine, 'paused'],
        ]),
        Match.when('ios', (): Cases => [
          [!media.loaded, 'idle'],
          [failed(), 'failed'],
          [media.ended, 'ended'],
          [media.marked, 'paused'],
          [!media.ready || (media.engine && media.waiting), 'loading'],
          [!media.engine, 'paused'],
        ]),
        Match.when('android', (): Cases => [
          [!media.loaded, 'idle'],
          [failed(), 'failed'],
          [!media.ready, 'loading'],
          [media.ended, 'ended'],
          [media.marked, 'paused'],
          [!media.engine, 'paused'],
        ]),
        Match.exhaustive,
      ),
    );
  };
  const status = (): Status => {
    const said = state();
    return {
      state: said,
      positionMs: media.position * 1000,
      ...(media.loaded && media.ready && { durationMs: length * 1000 }),
    };
  };
  /** The device's answer reaches the app `hop` after the ask. */
  const answer = <A, E>(reply: Effect.Effect<A, E>) => Effect.andThen(Effect.sleep(hop), reply);
  const refused = (operation: string) =>
    answer(Effect.fail(PlaybackError.make({ operation, message: `${operation}: not ready` })));
  /** Sleeps until `t` (ms), or a second at most: the requests may change meanwhile. */
  const until = (t: number) =>
    Effect.sleep(Math.max(1, Math.min(t, media.failsAt, now() + 1000) - now()));
  /** An ask of the app's, counted while the device has not answered it. */
  const answering = <A, E>(ask: Effect.Effect<A, E>) =>
    Effect.suspend(() => {
      if (media.asking === 0) media.askedAt = now();
      media.asking += 1;
      return ask.pipe(Effect.ensuring(Effect.sync(() => void (media.asking -= 1))));
    });
  /** The web: `Audio.play`'s promise, settled when the element first plays or is paused, failed or dropped. */
  const played = (generation: number): Effect.Effect<Status, PlaybackError> =>
    Effect.suspend(() => {
      advance();
      if (media.generation !== generation || media.rejected) return refused('play');
      if (!media.pending) return answer(Effect.sync(status));
      return until(heldBy(media.position)).pipe(Effect.andThen(played(generation)));
    });
  /**
   * The web: `audio.play()`, settled once the element plays; refused when it
   * is paused or dropped meanwhile, or fails before its metadata; never
   * settled when it fails after.
   */
  const resumed = (generation: number): Effect.Effect<Status, PlaybackError> =>
    Effect.suspend(() => {
      advance();
      if (media.generation !== generation || !media.engine) return refused('resume');
      if (failed() && !media.ready) return refused('resume');
      if (sounding()) return answer(Effect.sync(status));
      return until(heldBy(media.position)).pipe(Effect.andThen(resumed(generation)));
    });
  /** Waits until the engine holds `at`; refused once it fails or is dropped. */
  const sought = (at: number, generation: number): Effect.Effect<Status, PlaybackError> =>
    Effect.suspend(() => {
      advance();
      if (media.generation !== generation || failed()) return refused('seek');
      if (holds(at, ahead, now())) return answer(Effect.sync(status));
      return until(heldBy(at)).pipe(Effect.andThen(sought(at, generation)));
    });
  const resume = () => {
    advance();
    if (media.ended) {
      media.position = 0;
      media.ended = false;
      media.waiting = true;
    }
    media.marked = false;
    // Android starts only a prepared player; one that prepares starts then.
    if (platform !== 'android' || media.ready) media.engine = true;
    settle(now());
  };
  const pause = () => {
    advance();
    // The web: pausing the element rejects a waiting `Audio.play`, and One keeps it as `failed`.
    if (platform === 'web' && media.engine && media.pending) {
      media.pending = false;
      media.rejected = true;
    }
    media.engine = false;
    if (platform !== 'web') media.marked = true;
  };
  /** The playback moves to `at` (seconds); the engine asks for it if no request brings it. */
  const place = (at: number) => {
    media.position = at;
    media.ended = false;
    media.waiting = true;
    settle(now());
  };
  /** One drops its player: nothing loads, nothing plays, and nothing it said stays. */
  const drop = () =>
    Object.assign(media, {
      loaded: false,
      generation: media.generation + 1,
      ranges: [],
      engine: false,
      pending: false,
      rejected: false,
      session: false,
      ended: false,
      marked: false,
    });
  const play = Effect.suspend(() => {
    drop();
    Object.assign(media, {
      loaded: true,
      position: 0,
      since: now(),
      waiting: true,
      ready: false,
      // MediaPlayer starts once prepared; the others are set to play at once.
      engine: platform !== 'android',
      pending: platform === 'web',
      trouble: !media.online,
      // With no connection the recording fails once its request does, before any data.
      failsAt: Match.value(media.online).pipe(
        Match.when(true, () => Number.POSITIVE_INFINITY),
        Match.orElse(() => now() + network.latency),
      ),
    });
    request(0);
    const generation = media.generation;
    return Match.value(platform).pipe(
      Match.when('web', () => played(generation)),
      Match.orElse(() => answer(Effect.sync(status))),
    );
  });
  const notLoaded = (operation: string) =>
    Effect.suspend(() =>
      Match.value(media.loaded).pipe(
        Match.when(true, () => Effect.void),
        Match.orElse(() =>
          Effect.fail(PlaybackError.make({ operation, message: `${operation}: no player` })),
        ),
      ),
    );
  // Built apart from `Playback.of`, so the model also offers `stop` to a player that does not ask for it.
  const api = {
    play: () => answering(play),
    pause: notLoaded('pause').pipe(
      Effect.andThen(
        Effect.suspend(() => {
          pause();
          return answer(Effect.sync(status));
        }),
      ),
    ),
    resume: notLoaded('resume').pipe(
      Effect.andThen(
        answering(
          Effect.suspend(() => {
            resume();
            return Match.value(platform).pipe(
              Match.when('web', () => resumed(media.generation)),
              Match.orElse(() => answer(Effect.sync(status))),
            );
          }),
        ),
      ),
    ),
    seek: (positionMs: number) =>
      Effect.suspend(() => {
        advance();
        const at = Math.min(positionMs / 1000, length);
        media.sought.push({ to: at, at: now() });
        if (!media.loaded || !media.ready || failed()) return refused('seek');
        if (platform === 'web' && at === media.position) return answer(Effect.sync(status));
        place(at);
        return answering(sought(at, media.generation));
      }),
    status: answer(
      Effect.sync(() => {
        media.readAt = now();
        return status();
      }),
    ),
    stop: Effect.andThen(Effect.sync(drop), answer(Effect.void)),
    online: Effect.sync(() => media.online),
    announce: () =>
      notLoaded('announce').pipe(
        Effect.andThen(Effect.sync(() => void (media.session = true))),
        Effect.andThen(Effect.sleep(hop)),
      ),
    remote: Stream.fromQueue(remote),
  };
  const layer = Layer.succeed(Playback, Playback.of(api));
  /**
   * The lock screen or the Media Session presses `kind` (a seek to `to`
   * seconds). A phone's session acts, then tells the app; the web's Media
   * Session tells the app at the press and does nothing itself.
   */
  const press = (kind: 'play' | 'pause' | 'seek', to: number) => {
    if (platform !== 'web') {
      advance();
      Match.value(kind).pipe(
        Match.when('play', resume),
        Match.when('pause', pause),
        Match.orElse(() => place(to)),
      );
    }
    Queue.offerUnsafe(
      remote,
      Match.value(kind).pipe(
        Match.when('play', () => Remote.Play()),
        Match.when('pause', () => Remote.Pause()),
        Match.orElse(() => Remote.Seek({ seconds: Option.some(to) })),
      ),
    );
  };
  /** The connection drops: every request stops where it is, with no error. */
  const lose = () => {
    const t = now();
    advance();
    media.online = false;
    if (media.loaded) media.trouble = true;
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
        range.begins = t + network.latency - (got - range.start) / rate;
        range.frozen = Option.none();
        range.dropped = false;
      }
    }
  };
  /** The recording fails now: before its data, or after it. */
  const fail = () => {
    advance();
    media.failsAt = now();
    media.trouble = true;
  };
  /** The device makes sound now. */
  const sounds = () => {
    advance();
    return sounding();
  };
  return { media, layer, state, press, lose, back, fail, failed, sounds, endOf };
};

/** What the reader does, and what the world does to the connection and the recording. */
type Act =
  | { readonly _tag: 'Wait'; readonly ms: number }
  | { readonly _tag: 'Pause' }
  /** The page's Play: on a paused, ended or stopped recording. */
  | { readonly _tag: 'Resume' }
  /** The bar: near the place, just past what is loaded there, far into the recording, or near its end. */
  | { readonly _tag: 'Seek'; readonly to: 'near' | 'edge' | 'far' | 'end'; readonly share: number }
  | { readonly _tag: 'Remote'; readonly kind: 'play' | 'pause' }
  /** The lock screen's or the Media Session's seek, to a share of the recording. */
  | { readonly _tag: 'Scrub'; readonly share: number }
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
    Scrub: ({ share }) => `remote seek (${share.toFixed(2)})`,
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
  if (kind < 0.54) return { _tag: 'Resume' } satisfies Act;
  if (kind < 0.7) {
    const to = yield* Random.choice(['near', 'edge', 'far', 'end'] as const);
    return { _tag: 'Seek', to, share: yield* Random.nextBetween(0, 1) } satisfies Act;
  }
  if (kind < 0.81) {
    return {
      _tag: 'Remote',
      kind: yield* Random.choice(['play', 'pause'] as const),
    } satisfies Act;
  }
  if (kind < 0.85) return { _tag: 'Scrub', share: yield* Random.nextBetween(0, 1) } satisfies Act;
  if (kind < 0.89) return { _tag: 'Retry' } satisfies Act;
  if (kind < 0.94) return { _tag: 'Drop' } satisfies Act;
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
/** How long the device may make sound while the page shows otherwise, in ms. */
const heard = 500;

/** How a run went: the first rule broken, the acts done and those the page did not offer, and where the page was after the acts. */
interface Outcome {
  readonly broken: Option.Option<string>;
  readonly done: ReadonlyArray<string>;
  readonly skipped: ReadonlyArray<string>;
  readonly end: string;
}

/**
 * The player over one recording on `platform` over `network`, on `clock`,
 * and the reader's hand on it: what it may press, its presses, and the
 * rules each look at the page checks. It ends with the run's `using`.
 */
const session = (platform: Platform, network: Network, clock: TestClock.TestClock) => {
  const device = element(platform, network, clock);
  const bound = boundOf(network);
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
  const skipped = new Array<string>();
  const broken = new Array<string>();
  const t = () => clock.currentTimeMillisUnsafe();
  /**
   * What the reader last asked, by any path, and when; since when a Play is
   * owed Playing (a play, a seek while playing, the connection back), whether
   * the page has shown it since, and whether the connection or the recording
   * failed since.
   */
  const reader = { wants: 'play' as 'play' | 'pause', at: 0, due: 0, played: false, rough: false };
  /** Since when the page has shown the spinner, the device has failed, and the device has made sound unshown. */
  const since = {
    loading: Option.none<number>(),
    failed: Option.none<number>(),
    unshown: Option.none<number>(),
  };
  /** A remote seek the player has not yet asked of the device: its place, and when. */
  let scrub = Option.none<{ readonly to: number; readonly at: number }>();
  const shown = () => registry.get(player.state);
  const page = () => tagOf(shown());
  const where = () =>
    `${network.name}, ${platform}: ${done.join(', ')} (page ${page()}, device ${device.state()} at ${device.media.position.toFixed(1)}, ${Match.value(
      device.media.online,
    ).pipe(
      Match.when(true, () => 'online'),
      Match.orElse(() => 'offline'),
    )})`;
  const miss = (rule: string) => void broken.push(`${rule}: ${where()}`);
  const judge = (state: Player) => {
    const tag = tagOf(state);
    // A play ends with the recording, shown or not yet read: a seek after it leaves it still, until the next Play.
    const over = tag === 'Ended' || device.media.endedAt >= reader.at;
    if (reader.wants === 'play' && over) Object.assign(reader, { wants: 'pause', at: t() });
    if (reader.wants === 'play' && (tag === 'Paused' || tag === 'Stopped'))
      miss(`${tag} shown after a play`);
    if (tag === 'Playing' || tag === 'Ended') reader.played = true;
    since.loading = held(since.loading, tag === 'Loading');
    if (tag === 'Failed' && !device.media.trouble)
      miss('Failed shown for a recording that neither failed nor lost its connection');
  };
  const unwatch = registry.subscribe(player.state, judge);
  const owe = () => {
    reader.due = t();
    reader.played = false;
    reader.rough = !device.media.online || device.failed();
  };
  const ask = (wants: 'play' | 'pause') => {
    reader.wants = wants;
    reader.at = t();
    if (wants === 'play') owe();
  };
  const yields = Effect.forEach(Array.from({ length: 4 }), () => Effect.yieldNow, {
    discard: true,
  });
  /** Since when `holds` has held, as of now. */
  const held = (was: Option.Option<number>, holds: boolean) =>
    Option.liftPredicate(was, () => holds).pipe(Option.map((from) => Option.getOrElse(from, t)));
  /** While the device answers, a page that holds the recording reads its status. */
  const reads = (tag: string, now: number) => {
    const { asking, askedAt, readAt } = device.media;
    const holds = tag !== 'Failed' && tag !== 'Stopped';
    if (asking > 0 && holds && now - askedAt > unread && now - readAt > unread)
      miss(`no status read for ${now - readAt} ms while the device answers`);
  };
  /** A play on a working network shows Playing within the bound. */
  const plays = (tag: string, now: number) => {
    const working = device.media.online && !device.failed() && tag !== 'Failed';
    if (
      reader.wants === 'play' &&
      !reader.played &&
      !reader.rough &&
      working &&
      now - reader.due > bound
    )
      miss(`a play on a working network shows no Playing within ${bound} ms`);
  };
  /** One look at the page after the clock moved. */
  const glance = () => {
    const state = shown();
    const tag = tagOf(state);
    judge(state);
    const now = t();
    reads(tag, now);
    since.loading = held(since.loading, tag === 'Loading');
    if (Option.exists(since.loading, (from) => now - from > spinnerLimit))
      miss(`the spinner shows for ${spinnerLimit} ms, with no Retry`);
    const waits = tag === 'Loading' || tag === 'Buffering' || tag === 'Playing';
    since.failed = held(since.failed, device.failed() && reader.wants === 'play' && waits);
    if (Option.exists(since.failed, (from) => now - from > within))
      miss(`the device failed and the page shows ${tag}`);
    const sounds = device.sounds();
    if (reader.wants === 'pause' && now - reader.at > within && sounds)
      miss('the reader paused and the device plays');
    since.unshown = held(since.unshown, sounds && tag !== 'Playing');
    if (Option.exists(since.unshown, (from) => now - from > heard))
      miss(`the device plays and the page shows ${tag}`);
    plays(tag, now);
    scrub = Option.filter(
      scrub,
      ({ to, at }) => !device.media.sought.some((asked) => asked.to === to && asked.at >= at),
    );
    if (Option.exists(scrub, ({ at }) => now - at > within))
      miss('a remote seek was never asked of the device');
  };
  /** Moves the clock `ms` on, looking at the page every `look`, until `stop` holds. */
  const pass = (ms: number, stop: () => boolean = () => false) =>
    Effect.forEach(
      Array.from({ length: Math.ceil(ms / look) }, (_, i) => Math.min(look, ms - i * look)),
      (step) =>
        Effect.suspend(() =>
          Match.value(broken.length > 0 || stop()).pipe(
            Match.when(true, () => Effect.void),
            Match.orElse(() =>
              clock.adjust(step).pipe(Effect.andThen(yields), Effect.andThen(Effect.sync(glance))),
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
    }).pipe(Effect.andThen(yields));
  /** The lock screen (a phone, once the app announced the recording) or the Media Session (the page holds a hymn). */
  const remote = () =>
    Match.value(platform).pipe(
      Match.when('web', () => page() !== 'Idle'),
      Match.orElse(() => device.media.session && device.media.loaded),
    );
  /** Whether the page, the lock screen or the world offers `act` now: the reader presses only what shows. */
  const offered = (act: Act) => {
    const tag = page();
    const plays = tag === 'Playing' || tag === 'Buffering';
    const bar = plays || tag === 'Paused' || tag === 'Ended';
    return Match.value(act).pipe(
      Match.tagsExhaustive({
        Wait: () => true,
        Pause: () => plays,
        Resume: () => tag === 'Paused' || tag === 'Ended' || tag === 'Stopped',
        Seek: () => bar,
        Remote: remote,
        Scrub: () => remote() && bar && device.media.ready && !device.failed(),
        Retry: () => tag === 'Failed',
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
  /** A seek while the reader wants to hear it owes Playing anew. */
  const moved = () => {
    if (reader.wants === 'play') owe();
  };
  const perform: (act: Act) => Effect.Effect<void> = Match.type<Act>().pipe(
    Match.tagsExhaustive({
      Wait: ({ ms }) => pass(ms),
      Pause: () =>
        Effect.suspend(() => {
          ask('pause');
          return send(Command.Pause());
        }),
      // The page's Play: a stopped recording starts again (the page's button sends Start).
      Resume: () =>
        Effect.suspend(() => {
          const stopped = page() === 'Stopped';
          ask('play');
          return send(
            Match.value(stopped).pipe(
              Match.when(true, () => Command.Start({ track })),
              Match.orElse(() => Command.Resume()),
            ),
          );
        }),
      Seek: ({ to, share }) =>
        Effect.suspend(() => {
          moved();
          return send(Command.Seek({ seconds: placeOf(to, share) }));
        }),
      Remote: ({ kind }) =>
        Effect.gen(function* () {
          ask(kind);
          device.press(kind, 0);
          yield* yields;
          judge(shown());
        }),
      Scrub: ({ share }) =>
        Effect.gen(function* () {
          const to = Math.floor(share * (length - 10));
          moved();
          scrub = Option.some({ to, at: t() });
          device.press('seek', to);
          yield* yields;
          judge(shown());
        }),
      Retry: () =>
        Effect.suspend(() => {
          ask('play');
          return send(Command.Start({ track }));
        }),
      Drop: () =>
        Effect.sync(() => {
          device.lose();
          reader.rough = true;
        }),
      Back: () =>
        Effect.sync(() => {
          device.back();
          moved();
        }),
      Fail: () =>
        Effect.sync(() => {
          device.fail();
          reader.rough = true;
        }),
    }),
  );
  /** The reader presses `act` if the page offers it. */
  const act = (act: Act) =>
    Effect.suspend(() => {
      if (broken.length > 0) return Effect.void;
      if (!offered(act)) {
        skipped.push(said(act));
        return Effect.void;
      }
      done.push(said(act));
      return perform(act).pipe(Effect.andThen(Effect.sync(() => judge(shown()))));
    });
  /**
   * The connection comes back, a failed recording is retried and a paused
   * or stopped one played: the page then shows Playing within the bound.
   */
  const finish = Effect.gen(function* () {
    // A pause, a remote seek and a failure are each judged a second after.
    yield* pass(within + look);
    const end = page();
    const before = skipped.length;
    yield* act({ _tag: 'Back' });
    yield* act({ _tag: 'Retry' });
    yield* act({ _tag: 'Resume' });
    // The closing presses are offered or not; only the run's own count as skipped.
    skipped.splice(before);
    if (broken.length === 0 && reader.wants !== 'play')
      miss('the run ends with the page offering no Play');
    // Playing is owed from now, whatever the page showed before.
    owe();
    judge(shown());
    yield* pass(bound + look, () => reader.played || page() === 'Failed');
    // A load the connection's loss held up may still be given up: Failed (the rules judge it), then Retry.
    if (page() === 'Failed') {
      yield* act({ _tag: 'Retry' });
      yield* pass(bound + look, () => reader.played);
    }
    if (broken.length === 0 && !reader.played)
      miss(`the closing Play shows no Playing within ${bound} ms`);
    // The recording that plays is on the lock screen and in the Media Session, a second on.
    yield* pass(within);
    if (broken.length === 0 && !device.media.session)
      miss('the recording plays and was never announced');
    return end;
  });
  return {
    broken,
    done,
    skipped,
    start: Effect.suspend(() => {
      done.push('start');
      ask('play');
      return send(Command.Start({ track }));
    }),
    act,
    finish,
    [Symbol.dispose]: () => {
      unwatch();
      registry.dispose();
    },
  };
};

/** Runs the reader's `acts` on `platform` over `network`: the first rule broken, said with what came before it. */
const play = (platform: Platform, network: Network, acts: ReadonlyArray<Act>) =>
  Effect.gen(function* () {
    const clock = yield* TestClock.testClockWith(Effect.succeed);
    using run = session(platform, network, clock);
    yield* run.start;
    yield* Effect.forEach(acts, run.act, { discard: true });
    const end = yield* run.finish;
    return {
      broken: Option.fromNullishOr(run.broken[0]),
      done: [...run.done],
      skipped: [...run.skipped],
      end,
    } satisfies Outcome;
  });

/** Seeded runs for each network on `platform`. */
const runs = 24;

const property = (platform: Platform) =>
  Effect.gen(function* () {
    const broken = new Array<string>();
    for (const network of networks) {
      for (const seed of Array.from({ length: runs }, (_, i) => i)) {
        const outcome = yield* play(platform, network, runOf(seed));
        if (Option.isSome(outcome.broken)) broken.push(`seed ${seed}: ${outcome.broken.value}`);
      }
    }
    expect(broken.slice(0, 3)).toEqual([]);
  });

describe('from the reader’s Play, by any path, the player never shows Paused and plays on a working network', () => {
  it.effect('on the web, whose play() waits until the element plays', () => property('web'));
  it.effect('on iOS, whose resume answers while AVPlayer waits to play', () => property('ios'));
  it.effect('on Android, whose MediaPlayer starts once prepared', () => property('android'));
});

describe('each defect found before, as a fixed run: every act done, and the page where its name says', () => {
  const wait = (ms: number): Act => ({ _tag: 'Wait', ms });
  const pausedSeekFar: ReadonlyArray<Act> = [
    wait(3000),
    { _tag: 'Pause' },
    { _tag: 'Seek', to: 'far', share: 0.83 },
    wait(150),
  ];
  const ends = (
    platform: Platform,
    network: Network,
    acts: ReadonlyArray<Act>,
    end: 'Playing' | 'Paused' | 'Stopped' | 'Failed',
  ) =>
    Effect.map(play(platform, network, acts), (outcome) =>
      expect({ broken: outcome.broken, skipped: outcome.skipped, end: outcome.end }).toEqual({
        broken: Option.none(),
        skipped: [],
        end,
      }),
    );

  it.effect('player r3 M2: the page’s Play after a seek while paused, on 3G: Playing', () =>
    ends('web', g3, [...pausedSeekFar, { _tag: 'Resume' }, wait(4000)], 'Playing'),
  );
  it.effect('player r3 M2: the page’s Play after a seek while paused, on Slow 4G: Playing', () =>
    ends('web', slow4g, [...pausedSeekFar, { _tag: 'Resume' }, wait(2000)], 'Playing'),
  );
  it.effect(
    'playerfix r1 M1: the Media Session’s play after a seek while paused, on 3G: Playing',
    () =>
      ends('web', g3, [...pausedSeekFar, { _tag: 'Remote', kind: 'play' }, wait(4000)], 'Playing'),
  );
  it.effect(
    'playerfix r1 M1: the Media Session’s play after a seek while paused, on Slow 4G: Playing',
    () =>
      ends(
        'web',
        slow4g,
        [...pausedSeekFar, { _tag: 'Remote', kind: 'play' }, wait(2000)],
        'Playing',
      ),
  );
  it.effect('playerfix r1 M1: the Media Session’s pause pauses the element: Paused', () =>
    ends('web', instant, [wait(500), { _tag: 'Remote', kind: 'pause' }, wait(2000)], 'Paused'),
  );
  it.effect('the Media Session’s seek moves the element there: Playing', () =>
    ends('web', instant, [wait(500), { _tag: 'Scrub', share: 0.5 }, wait(2000)], 'Playing'),
  );
  it.effect(
    'playerfix r1 M2: the status is read while Start’s play() waits, on Slow 4G: Playing',
    () => ends('web', slow4g, [wait(1430)], 'Playing'),
  );
  it.effect('playerfix r1 M2: the recording fails mid-load: Failed, then Retry plays', () =>
    ends(
      'web',
      g3,
      [wait(2100), { _tag: 'Fail' }, wait(2000), { _tag: 'Retry' }, wait(4000)],
      'Playing',
    ),
  );
  it.effect(
    'the recording fails while a play waits on a place it does not hold: Failed within a second',
    () =>
      ends(
        'web',
        g3,
        [...pausedSeekFar, { _tag: 'Resume' }, wait(300), { _tag: 'Fail' }, wait(2000)],
        'Failed',
      ),
  );
  it.effect('playerfix r1 M2: the connection drops mid-load: the spinner ends in Failed', () =>
    ends('web', g3, [wait(2100), { _tag: 'Drop' }, wait(spinnerLimit + 2000)], 'Failed'),
  );
  it.effect(
    'the connection drops before the data: Retry while offline fails, Retry once back plays',
    () =>
      ends(
        'web',
        slow4g,
        [
          wait(100),
          { _tag: 'Drop' },
          wait(spinnerLimit + 2000),
          { _tag: 'Retry' },
          wait(3000),
          { _tag: 'Back' },
          { _tag: 'Retry' },
          wait(3000),
        ],
        'Playing',
      ),
  );
  it.effect('the lock screen’s play after a seek while paused, on iOS over 3G: Playing', () =>
    ends('ios', g3, [...pausedSeekFar, { _tag: 'Remote', kind: 'play' }, wait(4000)], 'Playing'),
  );
  it.effect('the connection drops mid-load on iOS: the spinner ends in Failed', () =>
    ends('ios', g3, [wait(2100), { _tag: 'Drop' }, wait(spinnerLimit + 2000)], 'Failed'),
  );
  it.effect('the connection drops mid-load on Android: the spinner ends in Failed', () =>
    ends('android', g3, [wait(2100), { _tag: 'Drop' }, wait(spinnerLimit + 2000)], 'Failed'),
  );
  it.effect(
    'playerfix r2 m1: the Media Session’s play during the first load cuts no announce off: Playing',
    () => ends('web', g3, [wait(1000), { _tag: 'Remote', kind: 'play' }, wait(6000)], 'Playing'),
  );
  it.effect(
    'playerfix r2 M1: the Media Session’s pause during the first load stops it, and its play then plays: Playing',
    () =>
      ends(
        'web',
        g3,
        [
          wait(1000),
          { _tag: 'Remote', kind: 'pause' },
          wait(2000),
          { _tag: 'Remote', kind: 'play' },
          wait(4000),
        ],
        'Playing',
      ),
  );
  it.effect('playerfix r2 M1: the Media Session’s pause during the first load: Stopped', () =>
    ends('web', g3, [wait(1000), { _tag: 'Remote', kind: 'pause' }, wait(4000)], 'Stopped'),
  );
  it.effect(
    'playerfix r2 M1: the stall gives the load up, the connection comes back, and the Media Session’s play plays: Playing',
    () =>
      ends(
        'web',
        g3,
        [
          wait(2100),
          { _tag: 'Drop' },
          wait(16_000),
          { _tag: 'Back' },
          wait(1000),
          { _tag: 'Remote', kind: 'play' },
          wait(4000),
        ],
        'Playing',
      ),
  );
  it.effect(
    'playerfix r2 M1: the lock screen’s pause while MediaPlayer prepares stops it on Android: Stopped',
    () =>
      ends('android', g3, [wait(1000), { _tag: 'Remote', kind: 'pause' }, wait(4000)], 'Stopped'),
  );
  it.effect(
    'playerfix r2 M1: the stall gives the load up on Android, and the connection back plays nothing: Failed',
    () =>
      ends(
        'android',
        g3,
        [wait(2100), { _tag: 'Drop' }, wait(16_000), { _tag: 'Back' }, wait(5000)],
        'Failed',
      ),
  );
  it.effect(
    'playerfix r2 o3: a press while the first load stalls does not restart its 15 s: Failed',
    () =>
      ends(
        'web',
        g3,
        [
          wait(2100),
          { _tag: 'Drop' },
          wait(10_000),
          { _tag: 'Remote', kind: 'play' },
          wait(10_000),
        ],
        'Failed',
      ),
  );
  it.effect(
    'playerfix r2 M2: the first load on the slowest link Chrome plays within 15 s: Playing',
    () => ends('web', edge, [wait(15_000)], 'Playing'),
  );
  it.effect(
    'playerfix r2 M2: a remote seek into a place an earlier seek left unloaded plays: Playing',
    () =>
      ends(
        'web',
        slow4g,
        [
          wait(516),
          wait(2141),
          wait(1462),
          { _tag: 'Seek', to: 'edge', share: 0.55 },
          { _tag: 'Scrub', share: 0.22 },
          wait(3000),
        ],
        'Playing',
      ),
  );
});
