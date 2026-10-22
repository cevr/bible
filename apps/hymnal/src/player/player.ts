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

import type { Scope } from 'effect';
import {
  Clock,
  Context,
  Data,
  Deferred,
  Duration,
  Effect,
  Fiber,
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

/**
 * Where the device's answers to the player's asks run: the player's runtime,
 * never the command that asked. A command runs in place of the one before
 * it, but the device has each ask once it is sent, so its answer lands the
 * act it answers whatever command comes next.
 */
class Answers extends Context.Service<Answers, Scope.Scope>()('hymnal/Answers') {}

/** The scope of the player's runtime, closed with it. */
const answersLayer = Layer.effect(Answers)(Effect.scope);

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
  moving: Option.Option<Fiber.Fiber<unknown, unknown>>;
  reading: Option.Option<Deferred.Deferred<Proof.Read, PlaybackError>>;
  resuming: boolean;
  id: number;
  announced: number;
}

/** The player's atoms over the device's `playback`, reading its status every `every` while it moves. */
export const playerOn = (playback: Layer.Layer<Playback>, every: Duration.Input) => {
  const runtime = Atom.runtime(
    Layer.provideMerge(Layer.mergeAll(linkLayer, answersLayer), playback),
  );
  const state = Atom.make<Player>(Player.Idle()).pipe(Atom.keepAlive);
  /**
   * What the player holds across the commands: the reader's intent, what the
   * reads have proved, the place a seek still asks the device for (and
   * whether that ask is in flight), the ask that moves the device, the read
   * in flight, whether a Resume from Ended still reads the device before it
   * acts, and the recording's count and the count it was announced at.
   */
  const held: Held = {
    wants: 'play',
    proof: Proof.none,
    seeking: Option.none(),
    moving: Option.none(),
    reading: Option.none(),
    resuming: false,
    id: 0,
    announced: -1,
  };

  const send = runtime
    .fn(
      Effect.fn('Player.send')(function* (command: Command, get: Atom.FnContext) {
        const device = yield* Playback;
        const link = yield* Link;
        const answers = yield* Answers;
        const now = Clock.currentTimeMillis;
        const show = (player: Player) => Effect.sync(() => get.set(state, player));
        const offline = () => !link.told().online;
        const failed = (track: Track) =>
          Player.Failed({ track, offline: offline(), at: placeOf(held.proof) });
        /**
         * An act the page knows now, moving the device to `target` ms if it
         * names one. No pair spans it, so a page that showed Playing shows
         * Buffering until a pair after it proves sound again. It starts the
         * wait again, so a Retry beside Buffering goes until the new wait runs out.
         */
        const act = (target: Option.Option<number>) =>
          Effect.flatMap(now, (at) => {
            held.proof = Proof.acted(held.proof, at, target);
            const was = get.registry.get(state);
            if (!Player.$is('Playing')(was) && !Player.$is('Buffering')(was)) return Effect.void;
            return show(
              Player.Buffering({ track: was.track, at: was.at, length: was.length, retry: false }),
            );
          });
        /**
         * One status read, run in the player's scope: reads are one at a time (D7), so a read
         * a command finds in flight is the one it takes, and a command that cuts off the reads
         * before it never drops an answer the device gave.
         */
        const readDevice = Effect.suspend(() =>
          Option.match(held.reading, {
            onSome: Deferred.await,
            onNone: () =>
              Effect.gen(function* () {
                const done = yield* Deferred.make<Proof.Read, PlaybackError>();
                held.reading = Option.some(done);
                const reading = Effect.gen(function* () {
                  const asked = yield* now;
                  const status = yield* device.status;
                  return { asked, answered: yield* now, status };
                }).pipe(
                  // A read is taken while in flight: once answered, the next read is asked anew.
                  Effect.onExit(() =>
                    Effect.sync(() => {
                      if (Option.exists(held.reading, (it) => it === done))
                        held.reading = Option.none();
                    }),
                  ),
                  Effect.exit,
                  Effect.flatMap((exit) => Deferred.done(done, exit)),
                );
                yield* Effect.forkIn(reading, answers, { startImmediately: true });
                return yield* Deferred.await(done);
              }),
          }),
        );
        /**
         * A read asked since the latest act, and since any answer that said `ended` unless it says
         * `ended` too: one asked before either may show the device before it, so the device is
         * read again.
         */
        const readFresh = Effect.filterOrElse(
          readDevice,
          (read) =>
            read.asked >= held.proof.known &&
            (read.status.state === 'ended' || read.asked >= held.proof.endedAt),
          () => readDevice,
        );
        /** One read, taken into the proof and shown nowhere; a refused read changes nothing. */
        const lastLook = readFresh.pipe(
          Effect.tap((read) =>
            Effect.sync(() => (held.proof = Proof.readOf(held.proof, read).proof)),
          ),
          Effect.asVoid,
          Effect.catchTag('PlaybackError', () => Effect.void),
        );
        /**
         * The device answered the ask for `to` ms, asked at `asked`: the act lands
         * when the answer's place is in its window (`Proof.answered`), and the
         * place is asked no more. An answer outside it leaves the place asked.
         */
        const answeredAt = (asked: number, to: number) => (status: Status) =>
          Effect.flatMap(now, (at) =>
            Effect.sync(() => {
              held.proof = Proof.answered(held.proof, { asked, answered: at, status }, to).proof;
              if (Option.isNone(held.proof.pending)) held.seeking = Option.none();
            }),
          );
        /** The ask that moves the device cut off: a newer one moves it, or the recording is let go. */
        const cut = Effect.suspend(() => {
          const fiber = held.moving;
          held.moving = Option.none();
          return Option.match(fiber, { onNone: () => Effect.void, onSome: Fiber.interrupt });
        });
        /**
         * An ask that moves the device (a play or a seek), run in the player's scope in place of
         * the one before it: the adapter asks a play's seek again until it lands, so only the
         * latest place is asked. A command that moves nothing leaves it to its answer.
         */
        const moves = (operation: Effect.Effect<unknown>) =>
          Effect.gen(function* () {
            yield* cut;
            const fiber = yield* Effect.forkIn(operation, answers, { startImmediately: true });
            held.moving = Option.some(fiber);
          });
        /** The place a seek asks, asked of the device until an answer lands it. */
        const askSeek = (to: number) =>
          Effect.gen(function* () {
            const seeking = { to, asking: true };
            held.seeking = Option.some(seeking);
            const asked = yield* now;
            yield* device.seek(to).pipe(
              Effect.flatMap(answeredAt(asked, to)),
              Effect.catchTag('PlaybackError', (error) =>
                Effect.logWarning('player.seek.refused').pipe(
                  Effect.annotateLogs({ to, message: error.message }),
                ),
              ),
              Effect.ensuring(Effect.sync(() => (seeking.asking = false))),
            );
          });
        /** A seek the device refused or answered outside its window, asked again while it holds the recording. */
        const askAgain = (status: Status) =>
          Option.match(
            Option.filter(
              held.seeking,
              (it) => !it.asking && holdsRecording(status) && Option.isSome(held.proof.pending),
            ),
            {
              onNone: () => Effect.void,
              onSome: ({ to }) => moves(askSeek(to)),
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
         * next, an announce begun is not cut off. It runs beside the reads,
         * so its answer never holds the next read back.
         */
        const announceOnce = (track: Track, answer: Option.Option<boolean>) =>
          Effect.suspend(() => {
            const page = get.registry.get(state);
            const holds = Option.contains(answer, true) || Player.$is('Playing')(page);
            if (!holds || letGo(page) || held.announced === held.id) return Effect.void;
            held.announced = held.id;
            return Effect.forkDetach(announce(track)).pipe(Effect.asVoid);
          });
        /** The load given up: the page offers Retry, and the device lets the recording go. */
        const giveUp = (track: Track) =>
          Effect.logWarning('player.load.stalled').pipe(
            Effect.annotateLogs({ track: track.number }),
            Effect.andThen(show(failed(track))),
            Effect.andThen(cut),
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
            // An act turned Playing to Buffering when the page learnt of it: a page still
            // Playing has seen no act since its sound pair.
            Playing: () => Player.Playing({ track, at, length }),
            // Under the stand the wait is under 15 s: no Retry.
            Buffering: () => buffering(false),
            Loading: () => Player.Loading({ track }),
            Idle: () => buffering(false),
            Paused: () => buffering(false),
            Ended: () => buffering(false),
            Stopped: () => buffering(false),
            Failed: () => buffering(false),
          });
        };
        /**
         * Whether the wait has run out offline: silence and the connection's loss each 15 s old
         * at once, at the read's ask, the last instant its silence is proved.
         */
        const givenUp = (read: Proof.Read) => {
          const wait = Duration.toMillis(giveUpAfter);
          const told = link.told();
          return (
            held.wants === 'play' &&
            Proof.silentFor(held.proof, read) >= wait &&
            !told.online &&
            read.asked - told.since >= wait
          );
        };
        /**
         * A `paused` the reader did not ask for is the device's own pause, and the page shows
         * Paused: the device is asked to pause once, so it holds what the page shows. Android
         * starts a recording paused before it was prepared and says `paused` over its sound
         * (One 2.8.1, HybridOneAudio.kt:199-204); a device paused already stays so.
         */
        const heldPaused = Effect.suspend(() => {
          if (held.wants === 'pause') return Effect.void;
          held.wants = 'pause';
          return Effect.ignore(device.pause);
        });
        /**
         * Read the device's status once and show it; whether to read on. The
         * reads end when the device fails, ends, is idle or paused with no
         * place pending, or when the load is given up.
         */
        const readOnce = (track: Track, answered: Deferred.Deferred<boolean>) =>
          Effect.gen(function* () {
            const read = yield* readFresh;
            const status = read.status;
            const next = Proof.readOf(held.proof, read);
            held.proof = next.proof;
            const answer = yield* Effect.when(Deferred.await(answered), Deferred.isDone(answered));
            if (Option.contains(answer, false)) {
              yield* show(failed(track));
              return false;
            }
            if (next.seen === 'stale') return true;
            yield* askAgain(status);
            // A give-up lets the recording go: the reads end, whether the ask answered or not.
            let gaveUp = false;
            const done = yield* Match.value(status.state).pipe(
              Match.when('failed', () => Effect.as(show(failed(track)), true)),
              // An end lands every act.
              Match.when('ended', () =>
                Effect.as(show(Player.Ended({ track, length: lengthOf(status) })), true),
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
                  ).pipe(Effect.andThen(heldPaused)),
                  Option.isNone(held.proof.pending),
                ),
              ),
              Match.orElse(() =>
                Effect.suspend(() => {
                  if (givenUp(read)) {
                    gaveUp = true;
                    return Effect.as(giveUp(track), true);
                  }
                  return Effect.as(show(seenAt(track, read, next.seen)), false);
                }),
              ),
            );
            yield* announceOnce(track, answer);
            return !gaveUp && (!done || Option.isNone(answer));
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
        /**
         * Ask the device, and show its status while it answers and after. A refusal is
         * `refused`: `true` reads on, `false` shows Failed. An ask that `moving` moves the device
         * runs in place of the one before it (`moves`).
         */
        const ask = (
          track: Track,
          operation: Effect.Effect<unknown, PlaybackError>,
          refused: (error: PlaybackError) => Effect.Effect<boolean>,
          moving = false,
        ) =>
          Effect.gen(function* () {
            const answered = yield* Deferred.make<boolean>();
            const asking = operation.pipe(
              Effect.as(true),
              Effect.catchTag('PlaybackError', refused),
              Effect.flatMap((goOn) => Deferred.succeed(answered, goOn)),
            );
            // Started at once, so the device has the ask before the first read; its answer
            // runs in the player's scope, so a command sent meanwhile does not cut it off.
            yield* Match.value(moving).pipe(
              Match.when(true, () => moves(asking)),
              Match.orElse(() => Effect.forkIn(asking, answers, { startImmediately: true })),
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
            held.resuming = false;
            held.id += 1;
            const asked = yield* now;
            held.proof = Proof.loaded(asked, fromMs);
            const seeking = { to: fromMs, asking: true };
            held.seeking = Option.liftPredicate(seeking, () => fromMs > 0);
            yield* show(Player.Loading({ track }));
            // The play's answer lands it: past 0, the adapter answers with its seek's answer.
            const played = device
              .play(audioUrl(track.number), fromMs)
              .pipe(
                Effect.tap(answeredAt(asked, fromMs)),
                Effect.ensuring(Effect.sync(() => (seeking.asking = false))),
              );
            yield* ask(
              track,
              played,
              (error) =>
                Effect.logWarning('player.play.failed').pipe(
                  Effect.annotateLogs({ track: track.number, message: error.message }),
                  Effect.as(false),
                ),
              true,
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
            Ended: ({ length }) =>
              Effect.gen(function* () {
                // A phone plays the lock screen's press before One tells the page of it: a
                // device that holds the recording again already played it from 0:00 to the
                // place this read saw, an act the page follows, known from the read's ask (the
                // device moves on from it no faster than time passes); a device still at its
                // end plays the recording again, from the place of a seek asked since the end
                // (an end leaves no place, so with none from 0:00).
                // A command that cuts this Resume off before it acts carries its play (`seek`).
                held.resuming = true;
                const read = yield* readFresh.pipe(Effect.option);
                held.resuming = false;
                const again = Option.filter(read, (it) => holdsRecording(it.status));
                if (Option.isNone(again))
                  return yield* load(
                    track,
                    Option.getOrElse(held.proof.place, () => 0),
                  );
                held.wants = 'play';
                // The followed place supersedes any seek still asked from before the end.
                held.seeking = Option.none();
                yield* cut;
                held.proof = Proof.followed(
                  held.proof,
                  again.value.asked,
                  again.value.status.positionMs,
                );
                yield* show(
                  Player.Buffering({
                    track,
                    at: seconds(again.value.status.positionMs),
                    length,
                    retry: false,
                  }),
                );
                yield* ask(track, device.resume, logged);
              }),
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
            held.resuming = false;
            if (letGo(current)) return;
            if (Player.$is('Loading')(current)) {
              // The device may have sounded since the last read: one more read before it lets
              // the recording go keeps the place it reached.
              yield* lastLook;
              yield* show(Player.Stopped({ track, at: placeOf(held.proof) }));
              // A read that saw the device playing with no place proved opens a pair: the read
              // that finishes it, before the device is let go, sets the place the reader last
              // heard (P7), for Stopped and the next Resume.
              const opened = Option.exists(
                held.proof.last,
                (last) => last.status.state === 'playing' && Option.isNone(held.proof.place),
              );
              if (opened) {
                yield* lastLook;
                yield* show(Player.Stopped({ track, at: placeOf(held.proof) }));
              }
              yield* cut;
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
            // A Resume from Ended cut off before it asked the device: told in this order, the
            // reader plays from the sought place.
            if (held.resuming && Player.$is('Ended')(current)) return yield* load(track, ms);
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
            yield* ask(track, askSeek(ms), logged, true);
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
