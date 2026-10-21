/* oxlint-disable effect/noNewPromise, effect/noNewError -- the world stands in for One's `Audio` and `Network`, whose calls are promises the adapter wraps; a refused call rejects with an Error as One's do. */
/**
 * The world the player's property and its fixed cases run in: One's `Audio`
 * and `Network` as each platform has them (the device), the host that holds
 * the app's JS, the reader and the lock screen, all on the test's clock.
 * The player runs over it through its own adapter (`playbackOn`), so the
 * world judges the adapter and the player together, at the `Playback` seam.
 *
 * Time moves in steps of 50 ms. Each step the device moves (it loads, says
 * `playing` with no sound, sounds, runs dry, ends), then, while the host
 * runs, the JS side catches up: the clock moves to the world's time, each
 * lock-screen press and connection change due is told, then each read due
 * is answered. A read samples the device at one instant inside
 * `[asked, answered]`, and is answered only once every press made before
 * that instant has been told (One applies a press and calls its listeners in
 * one main-thread task; reads resolve in later ones). While the host holds,
 * the device moves on and the JS side does nothing; at the resume the clock
 * jumps, the tells come first, then the reads.
 *
 * The judge reads only the world: the device's phases, its sound, the
 * connection, the reader's acts, the holds and the calls the device
 * received. It never reads the player's proofs; the page's state is what it
 * judges.
 */

import { Array as Arr, Clock, Effect, Layer, Match, Option, Predicate, References } from 'effect';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import type { TestClock } from 'effect/testing';

import { type Device, playbackOn, type Session } from '../player/playback.live';
import { Command, Playback, Player, playerOn, type Status, statusEvery } from '../player/player';

export type Platform = 'ios' | 'android' | 'web';

/**
 * Where the device is. `silent`: it says `playing` with no sound (AVPlayer's
 * start, D2). `held`, `closed`, `reasked`: the iOS closed socket (D5): it
 * sounds what it holds, runs dry saying `loading` until 30 s after the
 * close, then says `playing` 2 s with no sound.
 */
export type Phase =
  | 'idle'
  | 'loading'
  | 'silent'
  | 'sound'
  | 'dry'
  | 'paused'
  | 'ended'
  | 'failed'
  | 'held'
  | 'closed'
  | 'reasked';

export const step = 50;
/** A read span: the read period and the longest answer. */
export const span = 250 + 600;
/** O1's allowance: the stand, two read spans and a step. */
export const allowance = 2000 + 2 * span + step;
/** O4's and O5's span: the wait, two read spans and a step. */
export const owed = 15_000 + 2 * span + step;
const length = 240_000;

/** The draws a world takes; a fixed case fixes them. */
export interface Knobs {
  /** How late a call answers, ms (10 to 600). */
  readonly lag: () => number;
  /** The share of a read's lag before it samples the device (0 to 1). */
  readonly sample: () => number;
  /** D1: the online time a load takes, ms. */
  readonly loadFor: () => number;
  /** D2 (iOS): how long the device says `playing` before sound, ms; 0 for none. */
  readonly silentFor: () => number;
  /** D10: how long a seek takes to land, ms (0 to 1000). */
  readonly landAfter: () => number;
  /** D8: how long after its tell an iOS lock-screen seek lands, ms (0 to 500). */
  readonly remoteLand: () => number;
  /** D8: how long a press waits before it is told, ms. */
  readonly tellAfter: () => number;
  /** Whether a seek lands outside what the device holds (it runs dry). */
  readonly seekDry: () => boolean;
}

export const fixedKnobs: Knobs = {
  lag: () => 50,
  sample: () => 0.5,
  loadFor: () => 500,
  silentFor: () => 0,
  landAfter: () => 0,
  remoteLand: () => 0,
  tellAfter: () => 0,
  seekDry: () => false,
};

/** A broken rule: its id, the time and what the world was. */
export interface Breach {
  readonly rule: string;
  readonly t: number;
  readonly detail: string;
}

interface Read {
  readonly asked: number;
  /** The world's act count at the ask. */
  readonly acts: number;
  readonly sampleAt: number;
  readonly dueAt: number;
  seen: Option.Option<Status>;
  readonly answer: (status: Status) => void;
}

interface Tell {
  readonly pressedAt: number;
  readonly at: number;
  readonly run: () => void;
  /** A phone press's reader place before it: the place the page knows until the tell. */
  readonly before?: Option.Option<number>;
}

interface Target {
  readonly to: number;
  readonly asked: number;
  readonly at: number;
  landed: boolean;
}

export type Press = 'play' | 'pause' | 'seek' | 'follow';
type RemoteListener = Parameters<Device['audio']['watchRemoteCommands']>[0];
type NetworkListener = Parameters<Device['network']['addStateListener']>[0];

const settleJs = Effect.forEach(
  Array.from({ length: 3 }),
  () =>
    Effect.andThen(
      Effect.promise(() => Promise.resolve()),
      Effect.yieldNow,
    ),
  { discard: true },
);

const silentPhase = (phase: Phase) =>
  phase === 'loading' ||
  phase === 'silent' ||
  phase === 'dry' ||
  phase === 'closed' ||
  phase === 'reasked';
const soundPhase = (phase: Phase) => phase === 'sound' || phase === 'held';
const holding = (phase: Phase) => phase !== 'idle' && phase !== 'failed';
const insideClose = (phase: Phase) => phase === 'held' || phase === 'closed' || phase === 'reasked';

/** What One says of the device in `phase` on `platform`. */
const stateOf = (platform: Platform, phase: Phase): Status['state'] =>
  Match.value(phase).pipe(
    Match.whenOr('silent', 'sound', 'held', 'reasked', (): Status['state'] => 'playing'),
    Match.when('dry', (): Status['state'] =>
      Match.value(platform).pipe(
        Match.when('ios', (): Status['state'] => 'loading'),
        Match.orElse((): Status['state'] => 'playing'),
      ),
    ),
    Match.when('closed', (): Status['state'] => 'loading'),
    Match.orElse((it): Status['state'] => it),
  );

/** A run's start: kept while `holds`, begun now when it starts, none when it breaks. */
const keepRun = (since: number, holds: boolean, now: number) => {
  if (!holds) return Number.NaN;
  if (Number.isNaN(since)) return now;
  return since;
};

const pressAction = (kind: Press) =>
  Match.value(kind).pipe(
    Match.when('play', () => 'play'),
    Match.when('pause', () => 'pause'),
    Match.orElse(() => 'seekto'),
  );

const pressCommand = (kind: Press) =>
  Match.value(kind).pipe(
    Match.when('play', () => 'Resume'),
    Match.when('pause', () => 'Pause'),
    Match.when('seek', () => 'Seek'),
    Match.orElse(() => 'Follow'),
  );

const isLetGo = Predicate.or(Predicate.isTagged('Failed'), Predicate.isTagged('Stopped'));
const isHalted = Predicate.or(Predicate.isTagged('Paused'), Predicate.isTagged('Stopped'));
const isAfterSound = Predicate.or(isLetGo, Predicate.isTagged('Ended'));
const asksSound = Predicate.or(Predicate.isTagged('Start'), Predicate.isTagged('Resume'));

const isRetry = (player: Player) => Player.$is('Buffering')(player) && player.retry;

/** The device's state and the world's record of it, as the world starts at `start`. */
const initial = (platform: Platform, start: number) => ({
  platform,
  t: start,
  /** The JS side's clock: it stands while the host holds. */
  js: start,
  phase: 'idle' as Phase,
  place: 0,
  length,
  ready: false,
  /** How much the device holds ahead of its place, ms. */
  ahead: 0,
  /** A server stall (D3, online), or a closed socket: no bytes until then. */
  stallUntil: 0,
  loadLeft: 0,
  phaseLeft: 0,
  online: true,
  holdUntil: start,
  holdEnd: Number.NEGATIVE_INFINITY,
  /** A seek landing later (D10, D8). */
  landing: Option.none<{ readonly to: number; readonly at: number }>(),
  reads: new Array<Read>(),
  answers: new Array<{ readonly dueAt: number; readonly run: () => void }>(),
  tells: new Array<Tell>(),
  remoteListeners: new Array<RemoteListener>(),
  networkListeners: new Array<NetworkListener>(),
  handlers: new Map<string, (details: { readonly seekTime?: number }) => void>(),
  loadAt: Number.NEGATIVE_INFINITY,
  /** The latest step of sound at the reader's place: no seek or play from a place on its way. */
  lastHeard: Number.NEGATIVE_INFINITY,
  /** The latest read sampled saying `playing` after a sound of this load, with no act between. */
  soundSampled: Number.NEGATIVE_INFINITY,
  lastSound: Number.NEGATIVE_INFINITY,
  /** The answer of the first read that sampled the device after its latest sound: O1's allowance runs from it. */
  seenAfterSound: Number.NEGATIVE_INFINITY,
  /** The most O1's allowance was moved on: the latest sound to the first read after it, while Playing, with no hold since. */
  readGap: 0,
  /** Each read's sample and answer, the latest two minutes. */
  answered: new Array<{ readonly sampleAt: number; readonly answered: number }>(),
  soundSince: Number.NaN,
  /** The latest act: a page command, a lock-screen press, a play from a place. */
  lastAct: start,
  /** How many acts were made or told so far: a read asked in the same step as an act is before or after it. */
  acts: 0,
  /** When the JS side last learnt of an act, and of an act asking for sound. */
  toldAt: start,
  playTold: start,
  /** The latest pause: the reader's, the lock screen's or the device's own. */
  pauseAt: Number.NEGATIVE_INFINITY,
  /** When the page learnt of the latest lock-screen pause: a press told after a later page Play is still a pause. */
  pauseTold: Number.NEGATIVE_INFINITY,
  /** The reader's place before sound a host hold kept unseen. */
  unseenFrom: Option.none<number>(),
  unseenSince: Number.POSITIVE_INFINITY,
  /** The latest answered read: the act count at its ask, and the place it saw. */
  lastRead: Option.none<{ readonly acts: number; readonly place: number }>(),
  /** The latest step the device was ended. */
  endedLast: Number.NEGATIVE_INFINITY,
  wants: false,
  /** Where the device last sounded, or the latest seek target since. */
  readerPlace: Option.none<number>(),
  /**
   * The reader's place at each Resume the page knows and has not played yet: a page Resume at
   * its send, a lock-screen play at its press, told in order.
   */
  resumePlaces: new Array<number>(),
  /** A play from a place whose seek has not landed, and since when. */
  fromPending: Option.none<number>(),
  fromSince: start,
  /** A Resume's play from a place, until its first sound. */
  firstFrom: Option.none<number>(),
  /** The reader's latest seek, and every place the reader asked since the latest Start. */
  target: Option.none<Target>(),
  asks: new Array<number>(),
  landedAt: Number.NEGATIVE_INFINITY,
  failedAt: Number.NEGATIVE_INFINITY,
  endedAt: Number.NEGATIVE_INFINITY,
  endedSeen: false,
  /** Whether a read asked since the latest act said `ended` (O8: "has said ended since the latest act"). */
  endedSaid: false,
  readyAt: Number.POSITIVE_INFINITY,
  /** Runs: silent and wanting; the same offline; the same online. */
  quiet: Number.NaN,
  offQuiet: Number.NaN,
  onQuiet: Number.NaN,
  stops: 0,
  lastCommand: '',
  was: 'Idle' as Player['_tag'],
  wasRetry: false,
  breaches: new Array<Breach>(),
  counts: new Map<string, number>(),
  plays: new Array<{ readonly t: number; readonly from: number }>(),
  sought: new Array<number>(),
  /** Each state the page showed, from when. */
  history: new Array<{
    readonly t: number;
    readonly tag: Player['_tag'];
    readonly retry: boolean;
  }>(),
});

/**
 * A world on `platform` over the test's `clock`, with the player running in
 * it. Its methods are the world's acts; `tick` moves it one step.
 * `outOfOrder` tells presses late, after reads that show them (outside
 * One's order, for the census case that needs it).
 */
/** A command or a page in a trace: its tag and fields, an option as its value or none. */
const told = (value: { readonly _tag: string }) =>
  Object.entries(value)
    .map(([key, it]) => {
      if (key === 'track') return '';
      if (Option.isOption(it))
        return `${key}=${Option.getOrElse(Option.map(it, String), () => 'none')}`;
      return `${key}=${String(it)}`;
    })
    .filter((it) => it !== '')
    .join(' ');

export const makeWorld = (
  platform: Platform,
  clock: TestClock.TestClock,
  knobs: Knobs,
  start: number,
  options: { readonly outOfOrder?: boolean; readonly trace?: boolean } = {},
) => {
  const w = initial(platform, start);
  /** What happened, step by step, when `trace` is asked for (a failing seed's story). */
  const story = new Array<string>();
  const note = (line: string) => {
    if (options.trace) story.push(`${w.t} ${line}`);
  };
  const phone = platform !== 'web';
  const count = (item: string) => w.counts.set(item, (w.counts.get(item) ?? 0) + 1);
  const breach = (rule: string, detail: string) =>
    w.breaches.push({
      rule,
      t: w.t,
      detail: `${detail} phase=${w.phase} place=${w.place} online=${w.online} wants=${w.wants}`,
    });

  const said = (): Status => {
    const status = { state: stateOf(platform, w.phase), positionMs: w.place };
    if (w.ready) return { ...status, durationMs: w.length };
    return status;
  };

  /** Answer `run` after a lag, on the JS side. */
  const later = <A>(run: () => A) =>
    new Promise<A>((resolve) =>
      w.answers.push({ dueAt: w.t + knobs.lag(), run: () => resolve(run()) }),
    );
  const refuse = (message: string) =>
    new Promise<never>((_, reject) =>
      w.answers.push({ dueAt: w.t + knobs.lag(), run: () => reject(new Error(message)) }),
    );

  const startSound = () => {
    w.phase = 'dry';
    if (w.ahead > 0) w.phase = 'sound';
  };
  const markLanded = (at: number) => {
    Option.map(w.target, (it) => {
      // Sound the device made before the seek took is from its old place: the landing is the
      // reader's place again.
      if (Math.abs(it.to - at) <= 2) {
        it.landed = true;
        w.readerPlace = Option.some(at);
      }
      if (at === 0 && it.to >= w.length - 5000) breach('O7 seek in the last 5 s landed at 0', '');
    });
    Option.map(w.fromPending, (from) => {
      if (Math.abs(Math.min(from, w.length) - at) <= 2) w.fromPending = Option.none();
    });
  };
  /** The device lands a seek at `to` (rounded to 1/600 s, as AVPlayer does). */
  const land = (to: number) => {
    const at = Math.max(0, Math.min(w.length, Math.round(to * 0.6) / 0.6));
    markLanded(at);
    // A landing breaks the sound's run, as the act that asked it does; a seek
    // still on its way is superseded, as a later seekTo supersedes it.
    w.landedAt = w.t;
    w.landing = Option.none();
    w.place = at;
    if (w.place >= w.length) {
      w.phase = 'ended';
      w.endedAt = w.t;
      return;
    }
    if (w.phase === 'ended') {
      w.phase = 'paused';
      w.pauseAt = w.t;
    }
    if (knobs.seekDry() && soundPhase(w.phase)) {
      w.ahead = 0;
      w.phase = 'dry';
    }
  };
  /** A seek that lands after `after` ms, or at once. */
  const landAfter = (to: number, after: number) => {
    if (after <= 0) land(to);
    else w.landing = Option.some({ to, at: w.t + after });
  };

  const load = () => {
    Object.assign(w, {
      phase: 'loading',
      place: 0,
      ready: false,
      ahead: 0,
      loadLeft: knobs.loadFor(),
      landing: Option.none(),
      loadAt: w.t,
      readyAt: Number.POSITIVE_INFINITY,
      endedSeen: false,
      stops: 0,
    });
    count('D1 load');
  };
  const resumeDevice = () => {
    if (w.phase === 'ended') {
      w.place = 0;
      startSound();
    } else if (w.phase === 'paused' && w.ready) startSound();
    else if (w.phase === 'paused') w.phase = 'loading';
  };
  const pauseDevice = () => {
    if (holding(w.phase) && w.phase !== 'ended') w.phase = 'paused';
  };

  const seek = (positionMs: number) => {
    note(`device seek ${positionMs} phase=${w.phase} ready=${w.ready}`);
    w.sought.push(positionMs);
    const asked =
      w.asks.some(
        (it) =>
          Math.abs(Math.min(it, w.length) - positionMs) <= 2 || Math.abs(it - positionMs) <= 2,
      ) || Option.exists(w.fromPending, (from) => Math.abs(from - positionMs) <= 2);
    if (!asked)
      breach('O7 the device was asked a place the reader did not ask', `to=${positionMs}`);
    if (!holding(w.phase) || (phone && !w.ready)) {
      count('D10 refused');
      return refuse('The item is not ready to seek');
    }
    count('D10 seek');
    let after = knobs.landAfter();
    // MediaPlayer sounds from 0:00 until a play from a place lands (D4, 50 to 400 ms).
    if (Option.isSome(w.fromPending) && platform === 'android') after = Math.min(300, after);
    landAfter(positionMs, after);
    return later(said);
  };

  const audio: Device['audio'] = {
    play: () => {
      load();
      return later(said);
    },
    pause: () => {
      pauseDevice();
      return later(said);
    },
    resume: () => {
      resumeDevice();
      return later(said);
    },
    seek,
    stop: () => {
      Object.assign(w, { phase: 'idle', place: 0, ready: false, landing: Option.none() });
      return later(() => {});
    },
    getPlaybackStatus: () =>
      new Promise<Status>((resolve) => {
        const lag = knobs.lag();
        w.reads.push({
          asked: w.t,
          acts: w.acts,
          sampleAt: w.t + Math.floor((lag * knobs.sample()) / step) * step,
          dueAt: w.t + lag,
          seen: Option.none(),
          answer: resolve,
        });
        count('D7 read');
      }) as never,
    setNowPlayingInfo: () => later(() => {}),
    watchRemoteCommands: (listener) => {
      w.remoteListeners.push(listener);
      return () => void w.remoteListeners.splice(w.remoteListeners.indexOf(listener), 1);
    },
  };
  const network: Device['network'] = {
    getState: () => Promise.resolve({ isConnected: w.online } as never),
    addStateListener: (listener) => {
      w.networkListeners.push(listener);
      return {
        remove: () => void w.networkListeners.splice(w.networkListeners.indexOf(listener), 1),
      };
    },
  };
  const session = Option.liftPredicate(
    {
      setActionHandler: (action, handler) =>
        void w.handlers.set(action, (details) => handler?.(details as never)),
    } satisfies Session,
    () => !phone,
  );

  const api = playbackOn(() => ({ audio, network }), session);
  /** The seam the player sees, with each play's place and each stop kept. */
  const seam = Playback.of({
    ...api,
    play: (uri, fromMs) =>
      Effect.suspend(() => {
        w.plays.push({ t: w.t, from: fromMs });
        w.lastAct = w.t;
        w.acts += 1;
        w.fromPending = Option.liftPredicate(fromMs, (from) => from > 0);
        w.fromSince = w.t;
        // The page acts on the Resumes it was told in order: its play is from the reader's
        // place at one of them.
        const places = w.resumePlaces.splice(0);
        const resumed = places.length > 0;
        w.firstFrom = Option.filter(w.fromPending, () => resumed);
        const from = Math.min(fromMs, w.length);
        if (resumed && !places.some((place) => near(from, place)))
          breach(
            'O6 a Resume played from another place',
            `from=${fromMs} reader=${places.join('/')}`,
          );
        // The place a play goes to is the reader's from then on.
        if (resumed) w.readerPlace = Option.some(Math.min(fromMs, w.length));
        w.unseenFrom = Option.none();
        return api.play(uri, fromMs);
      }),
    stop: Effect.suspend(() => {
      w.stops += 1;
      return api.stop;
    }),
  });
  // The JS side reads the host's time: a timer that falls due inside a hold fires at the resume
  // and reads the resume's time, as on a device. Sleeps still run on the test's clock.
  const hostClock: Clock.Clock = {
    ...clock,
    currentTimeMillisUnsafe: () => w.js,
    currentTimeMillis: Effect.sync(() => w.js),
    currentTimeNanosUnsafe: () => BigInt(w.js) * 1_000_000n,
    currentTimeNanos: Effect.sync(() => BigInt(w.js) * 1_000_000n),
  };
  const player = playerOn(
    Layer.mergeAll(
      Layer.succeed(Playback, seam),
      Layer.succeed(Clock.Clock, hostClock),
      Layer.succeed(References.MinimumLogLevel, 'None'),
    ),
    statusEvery,
  );
  const registry = AtomRegistry.make();
  registry.mount(player.send);
  registry.mount(player.remote);
  const page = () => registry.get(player.state);

  const running = () => w.t >= w.holdUntil;
  /** Whether a place the page keeps is the reader's, or the one before sound a hold kept unseen. */
  const near = (at: number, expected: number) =>
    Math.abs(at - expected) <= 1000 ||
    Option.exists(w.unseenFrom, (from) => Math.abs(at - from) <= 1000);
  const settled = () => w.t >= w.holdEnd + span + step;
  const noteAct = () => {
    w.lastAct = w.t;
    w.acts += 1;
    // The first sound after a later act is that act's, not a play's from before it.
    w.firstFrom = Option.none();
    w.endedSeen = false;
    w.endedSaid = false;
  };
  const askSeek = (asked: number) => {
    const to = Math.min(w.length, Math.max(0, asked));
    w.target = Option.some({ to, asked: Math.max(0, asked), at: w.t, landed: false });
    w.asks.push(Math.max(0, asked));
    w.readerPlace = Option.some(to);
    w.unseenFrom = Option.none();
    // A later seek is the place the device goes to, not a play's from before it. The play's
    // place stays one the reader asked: until told of a phone's press, the page asks it again.
    Option.map(w.fromPending, (from) => w.asks.push(from));
    w.fromPending = Option.none();
    return to;
  };
  const wantSound = () => {
    w.wants = true;
    if (page()._tag === 'Ended') w.readerPlace = Option.some(0);
  };

  const countResume = () => {
    const shown = page();
    if (isAfterSound(shown)) count(`resume from ${shown._tag}`);
    if (isRetry(shown)) count('resume from retry');
  };

  /** A page command (D9): the reader acts only while the host runs. */
  const send = (command: Command) => {
    note(`send ${told(command)}`);
    noteAct();
    w.lastCommand = command._tag;
    Command.$match(command, {
      Start: () => {
        w.wants = true;
        w.resumePlaces = [];
        w.readerPlace = Option.none();
        w.target = Option.none();
        w.asks = [];
      },
      Resume: () => {
        countResume();
        wantSound();
        w.resumePlaces.push(Option.getOrElse(w.readerPlace, () => 0));
        // A phone press not told yet is unknown to the page: its Resume may play from the
        // place before that press.
        for (const tell of w.tells)
          if (tell.before) w.resumePlaces.push(Option.getOrElse(tell.before, () => 0));
      },
      Pause: () => {
        w.wants = false;
        w.pauseAt = w.t;
      },
      Seek: ({ seconds }) => void askSeek(seconds * 1000),
      Follow: () => {},
    });
    count(`D9 ${command._tag}`);
    if (insideClose(w.phase)) count(`act inside D5 ${w.phase}`);
    w.toldAt = w.t;
    w.acts += 1;
    if (asksSound(command)) w.playTold = w.t;
    registry.set(player.send, command);
  };

  const countPress = (kind: Press, to: number) => {
    count(`D8 ${kind}`);
    if (w.phase === 'silent') count('D8 inside D2');
    if (w.phase === 'dry') count('D8 inside D3');
    if (insideClose(w.phase)) count(`act inside D5 ${w.phase}`);
    if (kind !== 'seek') return;
    const delta = Math.min(w.length, Math.max(0, to)) - w.place;
    if (Math.abs(delta) <= 300) count('D8 seek tiny');
    if (delta < 0) count('D8 seek back');
    if (to >= w.length - 5000) count('D8 seek last 5 s');
  };
  /** What a phone's session does at the press. */
  const pressPhone = (kind: Press, to: number) => {
    if (kind === 'play' && (w.phase === 'ended' || w.phase === 'paused')) resumeDevice();
    if (kind === 'pause') pauseDevice();
    if (kind === 'seek' && platform === 'android' && holding(w.phase)) land(to);
  };
  /** The press told to the app: One's listeners on a phone, the page's handler on the web. */
  const tellPress = (kind: Press, to: number) => {
    const pressedAt = w.t;
    return () => tellNow(kind, to, pressedAt);
  };
  /**
   * The tell itself. A phone's play acted at its press, so a pause pressed
   * after it is the later act, whenever either is told; the web's acts at
   * its tell.
   */
  const tellNow = (kind: Press, to: number, pressedAt: number) => {
    w.toldAt = w.t;
    w.acts += 1;
    if (kind === 'play') w.playTold = Math.max(w.playTold, pressedAt);
    if (kind === 'play' && !phone) w.playTold = w.t;
    if (kind === 'pause') w.pauseTold = w.t;
    if (!phone) {
      const details = Option.match(
        Option.liftPredicate(kind, (it) => it === 'seek'),
        {
          onNone: () => ({}),
          onSome: () => ({ seekTime: to / 1000 }),
        },
      );
      Option.map(Option.fromNullishOr(w.handlers.get(pressAction(kind))), (handler) =>
        handler(details),
      );
      return;
    }
    if (kind === 'seek' && platform === 'ios' && holding(w.phase))
      landAfter(to, knobs.remoteLand());
    const event = Option.match(
      Option.liftPredicate(kind, (it) => it === 'seek'),
      {
        onNone: () => ({ type: kind }),
        onSome: () => ({ type: kind, positionMs: to }),
      },
    );
    for (const listener of [...w.remoteListeners]) listener(event as never);
  };

  /** A lock-screen press (D8): a phone acts at the press; the app is told later. */
  const press = (kind: Press, to = 0) => {
    note(`press ${kind} ${to}`);
    countPress(kind, to);
    // One drops a seek with no place on a phone: nothing acts, nothing is told.
    if (kind === 'follow' && phone) return;
    const tell = tellPress(kind, to);
    // The web's session only calls the page's handler, and an iOS seek lands after its
    // tell: the press acts when the app is told.
    if (!phone || (platform === 'ios' && kind === 'seek')) {
      w.tells.push({
        pressedAt: w.t,
        at: w.t + knobs.tellAfter(),
        run: () => {
          pressed(kind, to);
          tell();
        },
      });
      return;
    }
    const before = w.readerPlace;
    const pressedAt = w.t;
    pressed(kind, to);
    pressPhone(kind, to);
    const placeThen = Option.getOrElse(w.readerPlace, () => 0);
    w.tells.push({
      pressedAt,
      before,
      at: w.t + knobs.tellAfter(),
      run: () => {
        if (kind === 'play') w.resumePlaces.push(placeThen);
        // A page play between the press and its tell went to the place the page knew; told
        // the seek, the page goes to its place, so the play's own place is owed no more.
        if (kind === 'seek' && w.plays.some((play) => play.t > pressedAt)) {
          w.readerPlace = Option.some(Math.min(w.length, Math.max(0, to)));
          w.fromPending = Option.none();
          w.firstFrom = Option.none();
        }
        tell();
      },
    });
  };
  /** What the reader's press is to the world: an act, and what the reader wants. */
  const pressed = (kind: Press, to: number) => {
    noteAct();
    w.lastCommand = pressCommand(kind);
    if (kind === 'play') wantSound();
    // The web's and an iOS seek's press acts at the tell, so it is known in order there.
    if (kind === 'play' && !phone) w.resumePlaces.push(Option.getOrElse(w.readerPlace, () => 0));
    if (kind === 'pause') {
      w.wants = false;
      w.pauseAt = w.t;
    }
    if (kind === 'seek') askSeek(to);
  };

  /** The connection changes (D11); One tells it when the host runs. */
  const connect = (online: boolean) => {
    if (online === w.online) return;
    w.online = online;
    count('D11 change');
    if (!running()) count('D11 inside a hold');
    w.tells.push({
      pressedAt: Number.POSITIVE_INFINITY,
      at: w.t,
      run: () => {
        for (const listener of [...w.networkListeners]) listener({ isConnected: online } as never);
      },
    });
  };

  /** The host holds the app's JS for `ms` (D7). */
  const hold = (ms: number) => {
    w.holdUntil = Math.max(w.holdUntil, w.t + ms);
    w.holdEnd = w.holdUntil;
    count('D7 hold');
    if (ms < 1000) count('D7 hold under 1 s');
  };
  /** A server stall while online (D3): no bytes for `ms`, and nothing held. */
  const stall = (ms: number) => {
    w.stallUntil = w.t + ms;
    w.ahead = Math.min(w.ahead, 0);
  };
  /** The iOS socket closes (D5). */
  const close = () => {
    if (!soundPhase(w.phase) && w.phase !== 'loading' && w.phase !== 'dry') return;
    w.phase = 'held';
    w.phaseLeft = 300;
    w.stallUntil = w.t + 32_000;
    count('D5 close');
  };
  /** The device fails (D6). */
  const fail = () => {
    if (!holding(w.phase)) return;
    w.phase = 'failed';
    w.failedAt = w.t;
    count('D6 failed');
  };
  /** The device pauses itself (D12). */
  const interrupt = () => {
    if (!soundPhase(w.phase) && !silentPhase(w.phase)) return;
    w.phase = 'paused';
    w.pauseAt = w.t;
    w.wants = false;
    count('D12 interrupted');
  };

  /** The item turns ready: a refused seek to the place it starts at is where the device is. */
  const turnReady = () => {
    w.ready = true;
    w.readyAt = w.t;
    Option.map(w.target, (it) => {
      if (Math.abs(it.to - w.place) <= 2) it.landed = true;
    });
  };
  const becomeReady = () => {
    turnReady();
    w.ahead = Math.max(w.ahead, 1500);
    let silentFor = 0;
    if (platform === 'ios') silentFor = knobs.silentFor();
    if (silentFor <= 0) return startSound();
    w.phase = 'silent';
    w.phaseLeft = silentFor;
    count('D2 silent start');
  };
  /** The silent phases through one step. */
  const wait = () => {
    if (w.phase === 'loading') {
      if (w.online) w.loadLeft -= step;
      if (w.loadLeft <= 0) becomeReady();
    } else if (w.phase === 'silent') {
      w.phaseLeft -= step;
      if (w.phaseLeft <= 0) startSound();
    } else if (w.phase === 'dry' && w.ahead >= 1000) w.phase = 'sound';
    else if (w.phase === 'closed' && w.t >= w.stallUntil - 2000) {
      w.phase = 'reasked';
      w.phaseLeft = 2000;
    } else if (w.phase === 'reasked') {
      w.phaseLeft -= step;
      if (w.phaseLeft > 0) return;
      w.ahead = Math.max(w.ahead, 1500);
      w.phase = 'sound';
    }
  };
  /** O6: the first sound after a Resume's play from a place is at that place. */
  const firstSound = () => {
    Option.map(w.firstFrom, (from) => {
      if (Math.abs(w.place - from) > 1000)
        breach('O6 the first sound is not at the place played from', `from=${from}`);
    });
    w.firstFrom = Option.none();
  };
  /** A step of sound. */
  const sound = () => {
    if (w.phase === 'sound' && w.ahead <= 0) {
      w.phase = 'dry';
      count('D3 dry');
      return;
    }
    // An item that sounds is ready, as on a first load a close cut off.
    if (!w.ready) turnReady();
    const before = w.place;
    w.place = Math.min(w.length, w.place + step);
    // Sound that carries the device onto a seek's place lands it, as the landing window of
    // the Terms counts a place up to the time since the ask past the target.
    Option.map(
      Option.filter(w.target, (it) => !it.landed && before < it.to - 2 && w.place >= it.to - 2),
      (it) => {
        it.landed = true;
      },
    );
    w.ahead -= step;
    w.lastSound = w.t + step;
    // Sound before a seek or a play from a place lands is not where the reader is.
    const seeking = Option.exists(w.target, (it) => !it.landed);
    if (Option.isSome(w.fromPending)) count('D4 lead-in');
    else if (!seeking) {
      w.lastHeard = w.t + step;
      firstSound();
      // Sound in a host hold no read has sampled since is unseen (gap 3): the page may keep the place before it.
      if (!running() && Option.isNone(w.unseenFrom)) {
        w.unseenFrom = w.readerPlace;
        w.unseenSince = w.t;
      }
      w.readerPlace = Option.some(w.place);
    }
    if (w.phase === 'held') {
      w.phaseLeft -= step;
      if (w.phaseLeft <= 0) w.phase = 'closed';
    }
    if (w.place < w.length) return;
    w.phase = 'ended';
    w.endedAt = w.t + step;
    w.wants = false;
    count('D13 ended');
  };
  /** The device through one step. */
  const engine = () => {
    Option.map(
      Option.filter(w.landing, (it) => w.t >= it.at),
      (it) => {
        w.landing = Option.none();
        land(it.to);
      },
    );
    const filling = w.online && w.t >= w.stallUntil;
    if (filling && holding(w.phase) && w.phase !== 'ended')
      w.ahead = Math.min(w.ahead + 150, 20_000);
    wait();
    if (soundPhase(w.phase)) sound();
  };

  /** The world's runs, before the JS side acts on this step. */
  const runs = () => {
    w.soundSince = keepRun(w.soundSince, soundPhase(w.phase), w.t);
    const quiet = w.wants && silentPhase(w.phase);
    w.quiet = keepRun(w.quiet, quiet, w.t);
    w.offQuiet = keepRun(w.offQuiet, quiet && !w.online, w.t);
    w.onQuiet = keepRun(w.onQuiet, quiet && w.online, w.t);
  };

  /** Each tell due now, and each one a read due now needs, in order. */
  const tellDue = (due: ReadonlyArray<Read>) => {
    const needed = Math.max(Number.NEGATIVE_INFINITY, ...due.map((read) => read.sampleAt));
    const last = w.tells.findLastIndex(
      (tell) => tell.at <= w.t || (!options.outOfOrder && tell.pressedAt <= needed),
    );
    for (const tell of w.tells.splice(0, last + 1)) tell.run();
    return last >= 0;
  };
  const answerDue = (due: ReadonlyArray<Read>) => {
    for (const read of due) {
      w.reads.splice(w.reads.indexOf(read), 1);
      w.answered.push({ sampleAt: read.sampleAt, answered: w.t });
      if (read.sampleAt >= w.lastSound && w.seenAfterSound < w.lastSound) w.seenAfterSound = w.t;
      if (w.answered.length > 1000) w.answered.splice(0, 500);
      const seen = Option.getOrThrow(read.seen);
      // The unseen sound is seen once a read sampled after it closes a sound pair: it says
      // `playing` past the place of the read before, with no act from that read's ask on.
      const pair = Option.exists(
        w.lastRead,
        (before) => before.acts === w.acts && seen.positionMs > before.place + 2,
      );
      if (read.sampleAt >= w.unseenSince && seen.state === 'playing' && pair)
        w.unseenFrom = Option.none();
      w.lastRead = Option.some({ acts: read.acts, place: seen.positionMs });
      note(`read asked=${read.asked} sample=${read.sampleAt} ${seen.state} ${seen.positionMs}`);
      const current = read.acts === w.acts;
      if (seen.state === 'ended' && current) w.endedSaid = true;
      if (seen.state === 'ended' && settled() && current) w.endedSeen = true;
      read.answer(seen);
    }
    const answers = w.answers.filter((answer) => answer.dueAt <= w.t);
    for (const answer of answers) {
      w.answers.splice(w.answers.indexOf(answer), 1);
      answer.run();
    }
  };
  /** The JS side, while the host runs: the clock, the tells, then the reads and answers. */
  const js = Effect.gen(function* () {
    if (w.t > w.js) {
      const by = w.t - w.js;
      w.js = w.t;
      yield* clock.adjust(by);
    }
    yield* settleJs;
    const due = w.reads.filter((read) => read.dueAt <= w.t && Option.isSome(read.seen));
    if (tellDue(due)) yield* settleJs;
    answerDue(due);
    yield* settleJs;
  });

  // A landing moves the device as the act that asked it does (D10: it says its old place
  // until then), so the wait runs from the act or its landing, whichever is later.
  const quietFor = (since: number) => w.t - Math.max(since, w.lastAct, w.landedAt);
  /**
   * How long a run has been seen: from the answer of the first read that sampled the device
   * after the run began (P4 dates a wait from a read that saw it; Decided 4).
   */
  const seenFor = (since: number) => {
    const from = Math.max(since, w.lastAct, w.landedAt);
    return Option.match(
      Arr.findFirst(w.answered, (it) => it.sampleAt > from),
      { onNone: () => 0, onSome: (first) => w.t - first.answered },
    );
  };

  /** O1 to O3: Playing only with sound, Failed only with a cause, Playing owed. */
  const judgeSound = (now: Player) => {
    // The allowance runs from the answer of the first read that sampled the device after its
    // latest sound: silence is dated from a read that saw it (Decided 4, P4), and the page
    // learns of no read before its answer.
    const heardAt = Option.getOrElse(
      Option.liftPredicate(w.seenAfterSound, (at) => at >= w.lastSound),
      () => w.t,
    );
    const heard = w.lastSound >= w.loadAt && w.t - heardAt <= allowance;
    if (settled() && now._tag === 'Playing' && heard && w.holdEnd < w.lastSound)
      w.readGap = Math.max(w.readGap, Math.min(heardAt, w.t) - w.lastSound);
    if (settled() && now._tag === 'Playing' && !heard)
      breach('O1 Playing with no sound', `lastSound=${w.lastSound} loadAt=${w.loadAt}`);
    if (now._tag === 'Failed' && w.was !== 'Failed') {
      const byDevice = w.phase === 'failed' || w.failedAt >= w.lastAct;
      if (!byDevice && quietFor(w.offQuiet) < 15_000 - span)
        breach('O2 Failed with no cause', `offQuietFor=${quietFor(w.offQuiet)}`);
    }
    const unacted = w.t - Math.max(w.lastAct, w.landedAt, w.holdEnd) >= 1500 + span;
    const sounding = w.t - w.soundSince >= 1500 && Option.isNone(w.fromPending);
    if (settled() && w.wants && sounding && unacted && now._tag !== 'Playing')
      breach('O3 sounding, not Playing', `page=${now._tag}`);
  };
  /** O4 and O5: Failed owed offline, Retry owed online, never early. */
  const judgeWait = (now: Player) => {
    const unheld = w.t - w.holdEnd >= owed;
    if (unheld && quietFor(w.offQuiet) >= owed && seenFor(w.offQuiet) >= owed) {
      if (!(Player.$is('Failed')(now) && now.offline)) breach('O4 Failed owed', `page=${now._tag}`);
      else if (w.stops !== 1) breach('O4 stop called once', `stops=${w.stops}`);
    }
    // The load's first sound, as a read could show it (P1): a sound no read sampled saying
    // `playing` is one no pair proves, so the page waits as before a first sound.
    const sounded = w.soundSampled >= w.loadAt;
    if (unheld && sounded && seenFor(w.onQuiet) >= owed && !isRetry(now))
      breach('O5 Retry owed', `page=${now._tag}`);
    if (isRetry(now) && !w.wasRetry && quietFor(w.quiet) < 15_000 - span)
      breach('O5 Retry early', `quietFor=${quietFor(w.quiet)}`);
  };
  /** O6: the place a Failed or Stopped page keeps; a play from a place lands. */
  const judgePlace = (now: Player) => {
    if (isLetGo(now) && w.was !== now._tag)
      Option.map(now.at, (at) => {
        const expected = Option.getOrElse(w.readerPlace, () => 0);
        // A place past an end the page cannot know yet lands at the end. A phone's press not
        // told yet is unknown to the page: the place before it is the page's to keep.
        const kept = Math.min(at * 1000, w.length);
        const untold = w.tells.flatMap((tell) =>
          Option.toArray(
            Option.map(
              Option.fromNullishOr(tell.before),
              Option.getOrElse(() => 0),
            ),
          ),
        );
        if (!near(kept, expected) && !untold.some((place) => Math.abs(kept - place) <= 1000))
          breach('O6 the page keeps another place', `at=${at} reader=${expected}`);
      });
    const latest = w.fromSince >= w.lastAct - 1;
    // A refused place is asked again at a read that sees the item ready; the read in flight
    // at the readiness may have seen it before, so the ask comes by the second read span.
    const dueAt = Math.max(w.fromSince, w.readyAt + span, w.holdEnd) + 1000 + span;
    if (Option.isSome(w.fromPending) && holding(w.phase) && settled() && latest && w.t >= dueAt)
      breach('O6 the play from a place never landed', `from=${Option.getOrThrow(w.fromPending)}`);
  };
  /** O7: each seek lands. */
  const judgeSeek = () =>
    Option.map(w.target, (it) => {
      // As a refused play's place: asked again by the second read span after the readiness.
      const dueAt = Math.max(it.at, w.readyAt + span, w.holdEnd) + 1000 + span;
      const latest = it.at >= w.lastAct && holding(w.phase) && settled();
      if (it.landed || !latest || w.t < dueAt) return;
      breach('O7 the seek never landed', `to=${it.to}`);
      it.landed = true;
    });
  /** O8 and O9: Ended only once ended, Ended owed; Paused only after a pause. */
  const judgeEnd = (now: Player) => {
    // An ended device a seek moves on was ended since the act; the page learns it by a read.
    const endedNow =
      w.phase === 'ended' ||
      w.endedSaid ||
      w.endedAt >= w.lastAct ||
      (w.endedLast >= w.lastAct && w.t - w.endedLast <= allowance);
    // The page learns of an act at its tell; a read asked then answers within a span.
    const sinceKnown = w.t - Math.max(w.lastAct, w.toldAt);
    if (now._tag === 'Ended' && settled() && sinceKnown > span && !endedNow)
      breach('O8 Ended, not ended', '');
    if (settled() && w.endedSeen && w.phase === 'ended' && now._tag !== 'Ended')
      breach('O8 Ended owed', `page=${now._tag}`);
    if (isHalted(now) && Math.max(w.pauseAt, w.pauseTold) < w.playTold)
      breach('O9 Paused on its own', `page=${now._tag}`);
  };
  /** The rules O1 to O9, judged by the world at this step. */
  const judge = () => {
    const now = page();
    judgeSound(now);
    judgeWait(now);
    judgePlace(now);
    judgeSeek();
    judgeEnd(now);
    const retry = isRetry(now);
    if (now._tag !== w.was || retry !== w.wasRetry) {
      w.history.push({ t: w.t, tag: now._tag, retry });
      note(`page ${told(now)}`);
    }
    w.was = now._tag;
    w.wasRetry = retry;
  };

  /** One step of the world. */
  const tick = Effect.gen(function* () {
    engine();
    if (w.phase === 'ended') w.endedLast = w.t;
    w.t += step;
    for (const read of w.reads)
      if (Option.isNone(read.seen) && w.t >= read.sampleAt) {
        read.seen = Option.some(said());
        // A sound a read can show: at the reader's place, sampled after it saying `playing`,
        // with no act between.
        if (said().state === 'playing' && w.lastHeard >= w.loadAt && w.lastAct < w.lastHeard)
          w.soundSampled = w.t;
      }
    runs();
    if (running()) yield* js;
    judge();
  });

  return Object.assign(w, {
    page: () => page()._tag,
    state: page,
    send,
    press,
    connect,
    hold,
    stall,
    close,
    fail,
    interrupt,
    running,
    settled,
    tick,
    /** Run the world for `ms`. */
    run: (ms: number) =>
      Effect.gen(function* () {
        for (let i = 0; i < ms / step; i++) yield* tick;
      }),
    /** Run the world until `holds`, for at most `ms`; whether it came. */
    until: (holds: () => boolean, ms = 60_000) =>
      Effect.gen(function* () {
        for (let i = 0; i < ms / step && !holds(); i++) yield* tick;
        return holds();
      }),
    /** The states the page showed since `from`. */
    shownSince: (from: number) => w.history.filter((it) => it.t >= from).map((it) => it.tag),
    story,
    note,
    dispose: () => registry.dispose(),
  });
};

export type World = ReturnType<typeof makeWorld>;

/** A seeded draw in [0, 1). */
export const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** `r` below `p`: `yes`, else `no`. */
const either = <A>(r: () => number, p: number, yes: () => A, no: () => A) => {
  if (r() < p) return yes();
  return no();
};

/** The world's draws from `r`, over D1 to D13's ranges. */
export const drawnKnobs = (r: () => number): Knobs => ({
  lag: () => 10 + Math.floor(r() * 591),
  sample: r,
  loadFor: () =>
    either(
      r,
      0.3,
      () => r() * 1000,
      () =>
        either(
          r,
          0.7,
          () => 1000 + r() * 4000,
          () => 5000 + r() * 55_000,
        ),
    ),
  silentFor: () =>
    either(
      r,
      0.7,
      () => 300 + r() * 2700,
      () => 0,
    ),
  landAfter: () =>
    either(
      r,
      0.5,
      () => 0,
      () => r() * 1000,
    ),
  remoteLand: () => r() * 500,
  tellAfter: () =>
    either(
      r,
      0.5,
      () => 0,
      () => r() * 600,
    ),
  seekDry: () => r() < 0.5,
});

/** A place the reader seeks to, over D8's ranges, from `place`. */
const seekFrom = (r: () => number, place: number) => {
  const kind = r();
  const sign = Math.sign(r() - 0.5) || 1;
  if (kind < 0.2) return place + sign * (1 + Math.floor(r() * 300));
  if (kind < 0.45) return place + sign * (300 + Math.floor(r() * 4700));
  if (kind < 0.7) return Math.floor(r() * length);
  if (kind < 0.9) return length - Math.floor(r() * 5000);
  return length + Math.floor(r() * 2000);
};

export const morning = { number: 100, title: 'Great Is Thy Faithfulness' };

const pressDrawn = (w: World, r: () => number) => {
  const kind = r();
  if (kind < 0.45) w.press('seek', seekFrom(r, w.place));
  else if (kind < 0.55) w.press('follow');
  else if (kind < 0.75) w.press('play');
  else w.press('pause');
};

/** The reader's command, by what the page shows. */
const commandDrawn = (w: World, r: () => number) => {
  const shown = w.state();
  const tag = shown._tag;
  const seekTo = () => w.send(Command.Seek({ seconds: seekFrom(r, w.place) / 1000 }));
  if (tag === 'Idle' || (tag === 'Stopped' && r() < 0.2)) w.send(Command.Start({ track: morning }));
  else if (tag === 'Stopped' || tag === 'Failed' || tag === 'Ended') w.send(Command.Resume());
  else if (isRetry(shown) && r() < 0.7) w.send(Command.Resume());
  else if (tag === 'Paused' && r() < 0.6) w.send(Command.Resume());
  else if (tag === 'Paused' || r() >= 0.3) seekTo();
  else w.send(Command.Pause());
};

/** The world's acts at one step, drawn from `r`. */
export const roam = (w: World, r: () => number) => {
  if (r() < 0.004) w.connect(!w.online);
  if (w.running() && r() < 0.002)
    w.hold(
      either(
        r,
        0.4,
        () => 50 + r() * 950,
        () => 1000 + r() * 24_000,
      ),
    );
  const inside = w.phase === 'silent' || w.phase === 'held' || w.phase === 'reasked';
  // Acts come often inside the short phases, and seldom inside the 30 s of a closed socket.
  let chance = 0.002;
  let commandChance = 0.006;
  if (w.phase === 'dry') chance = 0.005;
  if (w.phase === 'closed') commandChance = 0.0015;
  if (inside) {
    chance = 0.04;
    commandChance = 0.03;
  }
  // A reader waits on a Buffering page, so a wait can run to its Retry.
  const shown = w.state();
  if (shown._tag === 'Buffering' && !isRetry(shown)) {
    chance /= 10;
    commandChance /= 10;
  }
  if (w.phase !== 'idle' && r() < chance) pressDrawn(w, r);
  if (w.running() && r() < commandChance) commandDrawn(w, r);
  deviceDrawn(w, r);
};

/** The device's and the server's own turns at one step, drawn from `r`. */
const deviceDrawn = (w: World, r: () => number) => {
  if (w.online && w.phase === 'sound' && r() < 0.005)
    w.stall(
      either(
        r,
        0.5,
        () => 100 + r() * 1900,
        () => 2000 + r() * 58_000,
      ),
    );
  const closable = w.phase === 'sound' || w.phase === 'loading';
  if (w.platform === 'ios' && closable && r() < 0.003) w.close();
  if (r() < 0.0002) w.fail();
  if (r() < 0.0005) w.interrupt();
};

const only = (holds: boolean, items: ReadonlyArray<string>) => items.filter(() => holds);

/** The items each platform's seeds must reach. */
export const reachable = (platform: Platform) => [
  'D1 load',
  ...only(platform === 'ios', ['D2 silent start', 'D8 inside D2']),
  'D3 dry',
  'D8 inside D3',
  ...only(platform === 'android', ['D4 lead-in']),
  ...only(platform === 'ios', [
    'D5 close',
    'act inside D5 held',
    'act inside D5 closed',
    'act inside D5 reasked',
  ]),
  'D6 failed',
  'D7 read',
  'D7 hold',
  'D7 hold under 1 s',
  'D8 play',
  'D8 pause',
  'D8 seek',
  'D8 follow',
  'D8 seek tiny',
  'D8 seek back',
  'D8 seek last 5 s',
  'D9 Start',
  'D9 Pause',
  'D9 Resume',
  'D9 Seek',
  'D10 seek',
  'D11 change',
  'D11 inside a hold',
  'D12 interrupted',
  'D13 ended',
  'resume from Failed',
  'resume from Stopped',
  'resume from retry',
  'resume from Ended',
];
