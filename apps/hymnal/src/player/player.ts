/**
 * The hymn player: one recording at a time, from `audioUrl` (`src/remote.ts`).
 *
 * The player's state is an atom; the reader acts on it by writing commands
 * to `send`. The device's playback is a service (`Playback`): One's `Audio`
 * on a phone and on the web (`playback.live.ts`), or one a test hands in.
 * One's playback tells no events of its own, so while the device says it
 * loads or plays, or has not answered an ask, the player reads its status
 * every `every`. What the page shows comes from what the reads prove
 * (`proof.ts`): Playing at a read that closes a sound pair; Loading, or
 * Buffering once the load has sounded, after 2 s of proved silence; Retry
 * beside Buffering after 15 s of it online; Failed after 15 s of it once
 * told offline 15 s before.
 *
 * Every Play and Pause goes one way, whatever made it: the page's button
 * (or a key on it), Retry, the lock screen, Control Center and the web's
 * Media Session (`remote`) are commands. The page shows the reader's ask at
 * once, asks the device, and reads its status beside the ask, not after it.
 *
 * Each command runs in place of the one before it: starting a hymn while
 * another loads or plays stops following the old one, and the device swaps
 * the recording (One's `Audio.play` replaces the one playing).
 *
 * A Pause before the first sound (Stopped), and a load given up (Failed),
 * let the recording go. iOS keeps a pause before the first sound; Android
 * and the web cannot (MediaPlayer starts once prepared whatever was asked,
 * and the web rejects the waiting `play()` and says `failed`). One rule
 * serves all three: Stopped, and a Play from the reader's place.
 */

import {
  Clock,
  Context,
  Data,
  Deferred,
  Duration,
  Effect,
  Match,
  Layer,
  Option,
  Predicate,
  Schema,
  Stream,
} from 'effect';
import * as Atom from 'effect/reactivity/Atom';

import { audioUrl } from '~/remote';

import * as Proof from './proof';

/** A hymn the player plays: its number names its recording. */
export interface Track {
  readonly number: number;
  readonly title: string;
}

/**
 * Where the player is. A position and a length are in seconds; the length
 * is none until the recording says it.
 */
export type Player = Data.TaggedEnum<{
  Idle: {};
  Loading: { readonly track: Track };
  Playing: { readonly track: Track; readonly at: number; readonly length: Option.Option<number> };
  /**
   * Playing, but the device waits on the network mid-recording (a stall, or
   * a seek past what it holds); `retry` once it has waited long enough that
   * the page offers Retry beside Pause.
   */
  Buffering: {
    readonly track: Track;
    readonly at: number;
    readonly length: Option.Option<number>;
    readonly retry: boolean;
  };
  Paused: { readonly track: Track; readonly at: number; readonly length: Option.Option<number> };
  Ended: { readonly track: Track; readonly length: Option.Option<number> };
  /**
   * The reader paused before the first sound: the device holds nothing, and
   * Play starts it again from the reader's place `at`, if it has one.
   */
  Stopped: { readonly track: Track; readonly at: Option.Option<number> };
  /**
   * The recording could not play; `offline` when the device has no
   * connection. Retry plays it again from the reader's place `at`, if any.
   */
  Failed: {
    readonly track: Track;
    readonly offline: boolean;
    readonly at: Option.Option<number>;
  };
}>;
export const Player = Data.taggedEnum<Player>();

/** What the reader asks of the player. */
export type Command = Data.TaggedEnum<{
  /** Play this hymn from its start, in place of any other. */
  Start: { readonly track: Track };
  Pause: {};
  Resume: {};
  /** Move to `seconds` into the recording. */
  Seek: { readonly seconds: number };
  /** Show the device's playback again: the lock screen moved it to a place it did not say. */
  Follow: {};
}>;
export const Command = Data.taggedEnum<Command>();

/**
 * What the reader last asked of the recording: to hear it (Start, Resume, the
 * lock screen's play) or not (Pause, the lock screen's pause). A device that
 * says `loading` mid-recording is read by it: waiting to play, or paused.
 */
export type Intent = 'play' | 'pause';

/** The device's playback as One's `Audio` reports it. */
export interface Status {
  readonly state: 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'failed';
  readonly positionMs: number;
  readonly durationMs?: number;
}

export class PlaybackError extends Schema.TaggedError<PlaybackError>()('PlaybackError', {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * A press of the lock screen, Control Center or the web's Media Session (the
 * browser's and the system's media controls, a hardware key): a play, a
 * pause, or a seek to a place, if it says one.
 */
export type Remote = Data.TaggedEnum<{
  Play: {};
  Pause: {};
  Seek: { readonly seconds: Option.Option<number> };
}>;
export const Remote = Data.taggedEnum<Remote>();

/** The command a remote press is: the one the page's own controls send. */
const commandOf: (remote: Remote) => Command = Remote.$match({
  Play: () => Command.Resume(),
  Pause: () => Command.Pause(),
  Seek: ({ seconds }) =>
    Option.match(seconds, {
      onNone: () => Command.Follow(),
      onSome: (to) => Command.Seek({ seconds: to }),
    }),
});

/** What the lock screen and Control Center show while a hymn plays. */
export interface Announcement {
  readonly title: string;
  readonly artist: string;
}

/** The device's one playback session. */
export interface PlaybackApi {
  /**
   * Play `uri` from `fromMs` in place of whatever plays now; past 0, it asks
   * the seek again while the device holds the recording, until it lands.
   */
  readonly play: (uri: string, fromMs: number) => Effect.Effect<Status, PlaybackError>;
  readonly pause: Effect.Effect<Status, PlaybackError>;
  /** Play on; from the start once the recording has ended. */
  readonly resume: Effect.Effect<Status, PlaybackError>;
  readonly seek: (positionMs: number) => Effect.Effect<Status, PlaybackError>;
  readonly status: Effect.Effect<Status, PlaybackError>;
  /** Let the recording go: nothing loads or plays, the lock screen shows nothing, and the status says `idle`. */
  readonly stop: Effect.Effect<void, PlaybackError>;
  /** Whether the device has a connection: now, then at each change, in order. */
  readonly connection: Stream.Stream<boolean>;
  /** Show the recording on the lock screen and in Control Center. */
  readonly announce: (announcement: Announcement) => Effect.Effect<void, PlaybackError>;
  /**
   * Each play, pause or seek pressed on the lock screen, in Control Center or
   * in the web's Media Session, told at the press: the player asks the device
   * for it (a phone's session has done it already, and the ask repeats it).
   */
  readonly remote: Stream.Stream<Remote>;
}

export class Playback extends Context.Service<Playback, PlaybackApi>()('hymnal/Playback') {}

/** The connection as the device last told it, and when it told it. */
interface Told {
  readonly online: boolean;
  readonly since: number;
}

/** The connection the player follows, from the device's `connection`. */
class Link extends Context.Service<Link, { readonly told: () => Told }>()('hymnal/Link') {}

/** Follows the device's connection for as long as the player's runtime lives. */
const linkLayer = Layer.effect(Link)(
  Effect.gen(function* () {
    const device = yield* Playback;
    let told: Told = { online: true, since: yield* Clock.currentTimeMillis };
    yield* Stream.runForEach(device.connection, (online) =>
      Effect.map(Clock.currentTimeMillis, (now) => {
        if (online !== told.online) told = { online, since: now };
      }),
    ).pipe(Effect.forkScoped({ startImmediately: true }));
    return Link.of({ told: () => told });
  }),
);

/** The hymn the player holds, if any. */
export const trackOf: (player: Player) => Option.Option<Track> = Player.$match({
  Idle: () => Option.none(),
  Loading: ({ track }) => Option.some(track),
  Playing: ({ track }) => Option.some(track),
  Buffering: ({ track }) => Option.some(track),
  Paused: ({ track }) => Option.some(track),
  Ended: ({ track }) => Option.some(track),
  Stopped: ({ track }) => Option.some(track),
  Failed: ({ track }) => Option.some(track),
});

/** Whether the device holds no recording for the player: it was let go, or it failed. */
const letGo = Predicate.or(Player.$is('Stopped'), Player.$is('Failed'));

/** The stand: silence proved this long shows Loading or Buffering. */
const stand = Duration.seconds(2);
/** The wait: silence proved this long offers Retry online, and gives the load up offline. */
const giveUpAfter = Duration.seconds(15);

const seconds = (ms: number) => ms / 1000;

/** The length a player shows, if it shows one. */
const lengthIn: (player: Player) => Option.Option<number> = Player.$match({
  Idle: () => Option.none(),
  Loading: () => Option.none(),
  Playing: ({ length }) => length,
  Buffering: ({ length }) => length,
  Paused: ({ length }) => length,
  Ended: ({ length }) => length,
  Stopped: () => Option.none(),
  Failed: () => Option.none(),
});

const lengthOf = (status: Status) =>
  Option.fromNullishOr(status.durationMs).pipe(
    Option.filter((ms) => Number.isFinite(ms) && ms > 0),
    Option.map(seconds),
  );

/** Whether the device holds the recording and may land a seek. */
const holdsRecording = (status: Status) =>
  status.state === 'loading' || status.state === 'playing' || status.state === 'paused';

/** The reader's place a let-go player keeps, in seconds. */
const placeOf = (proof: Proof.Proof) => Option.map(proof.place, seconds);

/** What the player holds across the commands (see `held` in `playerOn`). */
interface Held {
  wants: Intent;
  proof: Proof.Proof;
  seeking: Option.Option<{ readonly to: number; asking: boolean }>;
  id: number;
  announced: number;
}

/** The player's atoms over the device's `playback`, reading its status every `every` while it moves. */
export const playerOn = (playback: Layer.Layer<Playback>, every: Duration.Input) => {
  const runtime = Atom.runtime(Layer.provideMerge(linkLayer, playback));
  const state = Atom.make<Player>(Player.Idle()).pipe(Atom.keepAlive);
  /**
   * What the player holds across the commands: the reader's intent, what the
   * reads have proved, the place a seek still asks the device for (and
   * whether that ask is in flight), and the recording's count and the count
   * it was announced at.
   */
  const held: Held = {
    wants: 'play',
    proof: Proof.none,
    seeking: Option.none(),
    id: 0,
    announced: -1,
  };

  const send = runtime
    .fn(
      Effect.fn('Player.send')(function* (command: Command, get: Atom.FnContext) {
        const device = yield* Playback;
        const link = yield* Link;
        const now = Clock.currentTimeMillis;
        const show = (player: Player) => Effect.sync(() => get.set(state, player));
        const offline = () => !link.told().online;
        const failed = (track: Track) =>
          Player.Failed({ track, offline: offline(), at: placeOf(held.proof) });
        /**
         * An act the page knows now, moving the device to `target` ms if it
         * names one. No pair spans it, so a page that showed Playing shows
         * Buffering until a pair after it proves sound again.
         */
        const act = (target: Option.Option<number>) =>
          Effect.flatMap(now, (at) => {
            held.proof = Proof.acted(held.proof, at, target);
            const was = get.registry.get(state);
            if (!Player.$is('Playing')(was)) return Effect.void;
            return show(
              Player.Buffering({ track: was.track, at: was.at, length: was.length, retry: false }),
            );
          });
        /** The place a seek asks, asked of the device until it takes it. */
        const askSeek = (to: number) =>
          Effect.suspend(() => {
            const seeking = { to, asking: true };
            held.seeking = Option.some(seeking);
            return device.seek(to).pipe(
              Effect.tap(() => Effect.sync(() => (held.seeking = Option.none()))),
              Effect.catchTag('PlaybackError', (error) =>
                Effect.logWarning('player.seek.refused').pipe(
                  Effect.annotateLogs({ to, message: error.message }),
                ),
              ),
              Effect.ensuring(Effect.sync(() => (seeking.asking = false))),
              Effect.asVoid,
            );
          });
        /** A seek the device refused, or one a newer command cut off, asked again while it holds the recording. */
        const askAgain = (status: Status) =>
          Option.match(
            Option.filter(
              held.seeking,
              (it) => !it.asking && holdsRecording(status) && Option.isSome(held.proof.pending),
            ),
            {
              onNone: () => Effect.void,
              onSome: ({ to }) => Effect.forkChild(askSeek(to)).pipe(Effect.asVoid),
            },
          );
        /** The hymn on the lock screen and in Control Center; a failure only logged. */
        const announce = (track: Track) =>
          device
            .announce({ title: track.title, artist: `Hymn ${track.number}` })
            .pipe(
              Effect.catchTag('PlaybackError', (error) =>
                Effect.logWarning('player.announce.failed').pipe(
                  Effect.annotateLogs({ message: error.message }),
                ),
              ),
            );
        /**
         * The recording on the lock screen and in Control Center, once per
         * recording: once the device holds it (it answered an ask, or it
         * plays) and the player has not let it go. Whatever command comes
         * next, an announce begun is not cut off.
         */
        const announceOnce = (track: Track, answer: Option.Option<boolean>) =>
          Effect.suspend(() => {
            const page = get.registry.get(state);
            const holds = Option.contains(answer, true) || Player.$is('Playing')(page);
            if (!holds || letGo(page) || held.announced === held.id) return Effect.void;
            held.announced = held.id;
            return Effect.uninterruptible(announce(track));
          });
        /** The load given up: the page offers Retry, and the device lets the recording go. */
        const giveUp = (track: Track) =>
          Effect.logWarning('player.load.stalled').pipe(
            Effect.annotateLogs({ track: track.number }),
            Effect.andThen(show(failed(track))),
            Effect.andThen(Effect.ignore(device.stop)),
          );
        /**
         * The page after `read` of `track`, as the reader wants it: Playing at
         * a read that closes a sound pair; Loading, or Buffering once this
         * load has sounded, after the stand; Retry beside it after the wait
         * online; else what it showed, at the read's place.
         */
        const seenAt = (track: Track, read: Proof.Read, seen: Proof.Seen): Player => {
          const was = get.registry.get(state);
          const sameTrack = Option.exists(trackOf(was), (it) => it.number === track.number);
          const length = Option.orElse(lengthOf(read.status), () =>
            Option.flatMap(
              Option.liftPredicate(was, () => sameTrack),
              lengthIn,
            ),
          );
          const at = seconds(
            Option.getOrElse(
              Option.map(held.proof.pending, (it) => it.target),
              () => read.status.positionMs,
            ),
          );
          const quiet = Proof.silentFor(held.proof, read);
          const buffering = (retry: boolean) =>
            Match.value(held.proof.sounded).pipe(
              Match.when(true, () => Player.Buffering({ track, at, length, retry })),
              Match.orElse(() => Player.Loading({ track })),
            );
          if (seen === 'sound') return Player.Playing({ track, at, length });
          if (held.wants === 'pause') return Player.Paused({ track, at, length });
          if (quiet >= Duration.toMillis(stand))
            return buffering(quiet >= Duration.toMillis(giveUpAfter) && !offline());
          return Player.$match(was, {
            Playing: () => Player.Playing({ track, at, length }),
            Buffering: ({ retry }) => buffering(retry),
            Loading: () => Player.Loading({ track }),
            Idle: () => buffering(false),
            Paused: () => buffering(false),
            Ended: () => buffering(false),
            Stopped: () => buffering(false),
            Failed: () => buffering(false),
          });
        };
        /** Whether the wait has run out offline: silence and the connection's loss each 15 s old. */
        const givenUp = (read: Proof.Read) => {
          const wait = Duration.toMillis(giveUpAfter);
          const told = link.told();
          return (
            held.wants === 'play' &&
            Proof.silentFor(held.proof, read) >= wait &&
            !told.online &&
            read.answered - told.since >= wait
          );
        };
        /**
         * Read the device's status once and show it; whether to read on. The
         * reads end when the device fails, ends, is idle or paused with no
         * place pending, or when the load is given up.
         */
        const readOnce = (track: Track, answered: Deferred.Deferred<boolean>) =>
          Effect.gen(function* () {
            const asked = yield* now;
            const status = yield* device.status;
            const read = { asked, answered: yield* now, status };
            const next = Proof.readOf(held.proof, read);
            held.proof = next.proof;
            const answer = yield* Effect.when(Deferred.await(answered), Deferred.isDone(answered));
            if (Option.contains(answer, false)) {
              yield* show(failed(track));
              return false;
            }
            if (next.seen === 'stale') return true;
            yield* askAgain(status);
            const done = yield* Match.value(status.state).pipe(
              Match.when('failed', () => Effect.as(show(failed(track)), true)),
              // A seek from the end still pending keeps the reads on until it lands.
              Match.when('ended', () =>
                Effect.as(
                  show(Player.Ended({ track, length: lengthOf(status) })),
                  next.seen !== 'pending',
                ),
              ),
              Match.when('idle', () => Effect.as(show(Player.Idle()), true)),
              Match.when('paused', () =>
                Effect.as(
                  show(
                    Player.Paused({
                      track,
                      at: seconds(status.positionMs),
                      length: Option.orElse(lengthOf(status), () =>
                        lengthIn(get.registry.get(state)),
                      ),
                    }),
                  ),
                  Option.isNone(held.proof.pending),
                ),
              ),
              Match.orElse(() =>
                Effect.suspend(() => {
                  if (givenUp(read)) return Effect.as(giveUp(track), true);
                  return Effect.as(show(seenAt(track, read, next.seen)), false);
                }),
              ),
            );
            yield* announceOnce(track, answer);
            return !done || Option.isNone(answer);
          }).pipe(
            Effect.catchTag('PlaybackError', (error) =>
              Effect.logWarning('player.status.failed').pipe(
                Effect.annotateLogs({ message: error.message }),
                Effect.andThen(show(failed(track))),
                Effect.as(false),
              ),
            ),
          );
        /**
         * Show the device's status while the ask is not `answered`, and after
         * until its playback stops moving: a read every `every`, and one at
         * once when the device answers.
         */
        const watch = (track: Track, answered: Deferred.Deferred<boolean>) =>
          Effect.gen(function* () {
            /** Until the next read: `every`, or less once the device answers. */
            const rest = Deferred.isDone(answered).pipe(
              Effect.flatMap((done) =>
                Match.value(done).pipe(
                  Match.when(true, () => Effect.sleep(every)),
                  Match.orElse(() =>
                    Deferred.await(answered).pipe(
                      Effect.asVoid,
                      Effect.timeoutOrElse({ duration: every, orElse: () => Effect.void }),
                    ),
                  ),
                ),
              ),
            );
            let more = yield* readOnce(track, answered);
            while (more) {
              yield* rest;
              more = yield* readOnce(track, answered);
            }
          });
        /** Ask the device, and show its status while it answers and after. A refusal is `refused`: `true` reads on, `false` shows Failed. */
        const ask = (
          track: Track,
          operation: Effect.Effect<unknown, PlaybackError>,
          refused: (error: PlaybackError) => Effect.Effect<boolean>,
        ) =>
          Effect.gen(function* () {
            const answered = yield* Deferred.make<boolean>();
            // Started at once, so the device has the ask before the first read.
            yield* operation.pipe(
              Effect.as(true),
              Effect.catchTag('PlaybackError', refused),
              Effect.flatMap((goOn) => Deferred.succeed(answered, goOn)),
              Effect.forkChild({ startImmediately: true }),
            );
            yield* watch(track, answered);
          });
        /** Read the device's status until its playback stops moving. */
        const follow = (track: Track) =>
          Deferred.make<boolean>().pipe(
            Effect.tap((answered) => Deferred.succeed(answered, true)),
            Effect.flatMap((answered) => watch(track, answered)),
          );
        /** A refused ask is logged, and the status shown as it is. */
        const logged = (error: PlaybackError) =>
          Effect.logWarning('player.command.failed').pipe(
            Effect.annotateLogs({ operation: error.operation, message: error.message }),
            Effect.as(true),
          );
        /** A load: Loading at once, the device asked to play from `fromMs`, its status read while it loads. */
        const load = (track: Track, fromMs: number) =>
          Effect.gen(function* () {
            held.wants = 'play';
            held.id += 1;
            held.proof = Proof.loaded(yield* now, fromMs);
            const seeking = { to: fromMs, asking: true };
            held.seeking = Option.liftPredicate(seeking, () => fromMs > 0);
            yield* show(Player.Loading({ track }));
            const played = device.play(audioUrl(track.number), fromMs).pipe(
              Effect.tap(() => Effect.sync(() => (held.seeking = Option.none()))),
              Effect.ensuring(Effect.sync(() => (seeking.asking = false))),
            );
            yield* ask(track, played, (error) =>
              Effect.logWarning('player.play.failed').pipe(
                Effect.annotateLogs({ track: track.number, message: error.message }),
                Effect.as(false),
              ),
            );
          });
        const current = get.registry.get(state);
        const holding = trackOf(current);
        /** Run `run` on the hymn the player holds; with none, nothing. */
        const onHeld = (run: (track: Track) => Effect.Effect<void>) =>
          Option.match(holding, { onNone: () => Effect.void, onSome: run });
        /** A Resume: from where the reader is, by what the page shows. */
        const resume = (track: Track) => {
          const fromPlace = () =>
            load(
              track,
              Option.getOrElse(held.proof.place, () => 0),
            );
          const resumed = (target: Option.Option<number>, shown: Player) =>
            Effect.gen(function* () {
              held.wants = 'play';
              yield* act(target);
              yield* show(shown);
              yield* ask(track, device.resume, logged);
            });
          return Player.$match(current, {
            Stopped: fromPlace,
            Failed: fromPlace,
            Buffering: (it) =>
              Match.value(it.retry).pipe(
                Match.when(true, fromPlace),
                Match.orElse(() => resumed(Option.none(), current)),
              ),
            Paused: ({ at, length }) =>
              resumed(
                Option.none(),
                Match.value(held.proof.sounded).pipe(
                  Match.when(true, () => Player.Buffering({ track, at, length, retry: false })),
                  Match.orElse(() => Player.Loading({ track })),
                ),
              ),
            Ended: () => load(track, 0),
            Idle: () => Effect.void,
            Loading: () => resumed(Option.none(), current),
            Playing: ({ at, length }) =>
              resumed(Option.none(), Player.Buffering({ track, at, length, retry: false })),
          });
        };
        /** A Pause: before the first sound the device lets the recording go (Stopped); after it, Paused. */
        const pause = (track: Track) =>
          Effect.gen(function* () {
            held.wants = 'pause';
            if (letGo(current)) return;
            if (Player.$is('Loading')(current)) {
              yield* show(Player.Stopped({ track, at: placeOf(held.proof) }));
              yield* device.stop.pipe(Effect.catchTag('PlaybackError', logged), Effect.asVoid);
              return;
            }
            yield* act(Option.none());
            yield* Player.$match(current, {
              Playing: ({ at, length }) => show(Player.Paused({ track, at, length })),
              Buffering: ({ at, length }) => show(Player.Paused({ track, at, length })),
              Idle: () => Effect.void,
              Loading: () => Effect.void,
              Paused: () => Effect.void,
              Ended: () => Effect.void,
              Stopped: () => Effect.void,
              Failed: () => Effect.void,
            });
            yield* ask(track, device.pause, logged);
          });
        /** A Seek: the device asked for the place, which becomes the reader's; a let-go player keeps it for its Play. */
        const seek = (track: Track, to: number) =>
          Effect.gen(function* () {
            // The device lands a seek past the end at the end.
            const end = Option.getOrElse(lengthIn(current), () => Number.POSITIVE_INFINITY);
            const ms = Math.min(Math.max(0, to), end) * 1000;
            yield* act(Option.some(ms));
            if (letGo(current)) {
              yield* show(
                Player.$match(current, {
                  Stopped: () => Player.Stopped({ track, at: placeOf(held.proof) }),
                  Failed: ({ offline: off }) =>
                    Player.Failed({ track, offline: off, at: placeOf(held.proof) }),
                  Idle: () => current,
                  Loading: () => current,
                  Playing: () => current,
                  Buffering: () => current,
                  Paused: () => current,
                  Ended: () => current,
                }),
              );
              return;
            }
            yield* ask(track, askSeek(ms), logged);
          });
        /** The hymn the command is about: the one it starts, else the one held. */
        const subject = Option.liftPredicate(command, Command.$is('Start')).pipe(
          Option.map(({ track }) => track),
          Option.orElse(() => holding),
        );
        return yield* Command.$match(command, {
          Start: ({ track }) => load(track, 0),
          Pause: () =>
            Option.match(holding, {
              onNone: () => Effect.sync(() => (held.wants = 'pause')),
              onSome: pause,
            }),
          Resume: () => onHeld(resume),
          Seek: ({ seconds: to }) => onHeld((track) => seek(track, to)),
          Follow: () =>
            onHeld((track) =>
              Match.value(letGo(current)).pipe(
                Match.when(true, () => Effect.void),
                Match.orElse(() => act(Option.none()).pipe(Effect.andThen(follow(track)))),
              ),
            ),
        }).pipe(
          // A defect is a bug, but the reader still sees the recording fail.
          Effect.catchDefect((defect) =>
            Effect.logError('player.defect').pipe(
              Effect.annotateLogs({ defect: String(defect) }),
              Effect.andThen(
                Option.match(subject, {
                  onNone: () => Effect.void,
                  onSome: (track) =>
                    show(Player.Failed({ track, offline: false, at: Option.none() })),
                }),
              ),
            ),
          ),
        );
      }),
    )
    .pipe(Atom.keepAlive);

  /** Sends each press of the lock screen, Control Center or the Media Session while it is mounted. */
  const remote = runtime.atom((get) =>
    Effect.gen(function* () {
      const device = yield* Playback;
      yield* Stream.runForEach(device.remote, (remote) =>
        Effect.sync(() => get.set(send, commandOf(remote))),
      );
    }),
  );

  return { state, send, remote };
};

/** A player's atoms: its state, the commands it takes and its lock-screen follower. */
export type HymnPlayer = ReturnType<typeof playerOn>;

/** How often the player reads the device's status while a recording moves. */
export const statusEvery = Duration.millis(250);
