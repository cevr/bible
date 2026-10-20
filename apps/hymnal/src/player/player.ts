/**
 * The hymn player: one recording at a time, from `audioUrl` (`src/remote.ts`).
 *
 * The player's state is an atom; the reader acts on it by writing commands
 * to `send`. The device's playback is a service (`Playback`): One's `Audio`
 * on a phone and on the web (`playback.live.ts`), or one a test hands in.
 * One's playback tells no events of its own, so while the device says it
 * loads or plays, or has not answered an ask, the player reads its status
 * every `every` and shows it.
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
 * A first load ends in sound or in `stop`: a Pause before the first sound
 * (Stopped), and a load given up (Failed), let the recording go, since none
 * of the three devices keeps such a pause (the web rejects the waiting
 * `play()` and says `failed`; MediaPlayer starts once prepared whatever was
 * asked). From either, any Play starts the recording again.
 */

import {
  Clock,
  Context,
  Data,
  Deferred,
  Duration,
  Effect,
  Match,
  type Layer,
  Option,
  Schema,
  Stream,
} from 'effect';
import * as Atom from 'effect/reactivity/Atom';

import { audioUrl } from '~/remote';

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
  /** Playing, but the device waits on the network mid-recording (a stall, or a seek past what it holds). */
  Buffering: {
    readonly track: Track;
    readonly at: number;
    readonly length: Option.Option<number>;
  };
  Paused: { readonly track: Track; readonly at: number; readonly length: Option.Option<number> };
  Ended: { readonly track: Track; readonly length: Option.Option<number> };
  /** The reader paused before the first sound: the device holds nothing, and Play starts it again. */
  Stopped: { readonly track: Track };
  /** The recording could not play; `offline` when the device has no connection. */
  Failed: { readonly track: Track; readonly offline: boolean };
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
  /** Play `uri` in place of whatever plays now. */
  readonly play: (uri: string) => Effect.Effect<Status, PlaybackError>;
  readonly pause: Effect.Effect<Status, PlaybackError>;
  /** Play on; from the start once the recording has ended. */
  readonly resume: Effect.Effect<Status, PlaybackError>;
  readonly seek: (positionMs: number) => Effect.Effect<Status, PlaybackError>;
  readonly status: Effect.Effect<Status, PlaybackError>;
  /** Let the recording go: nothing loads or plays, the lock screen shows nothing, and the status says `idle`. */
  readonly stop: Effect.Effect<void, PlaybackError>;
  /** Whether the device has a connection now. */
  readonly online: Effect.Effect<boolean>;
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
const letGo = (player: Player) => Player.$is('Stopped')(player) || Player.$is('Failed')(player);

/**
 * What a status read says of the playback: it moves (it loads or plays, and
 * the player reads it again), it is still, or it failed (the reads end).
 */
type Seen = 'moving' | 'still' | 'failed';

const seenOf = (status: Status): Seen =>
  Match.value(status.state).pipe(
    Match.when('loading', (): Seen => 'moving'),
    Match.when('playing', (): Seen => 'moving'),
    Match.when('failed', (): Seen => 'failed'),
    Match.orElse((): Seen => 'still'),
  );

/**
 * How long a first load may show the spinner with no progress (the status
 * the same, read after read) before the player gives it up: a load that
 * stalls (the connection lost mid-load, which the web's element waits on
 * with no error) ends in Failed, which offers Retry.
 */
const loadingLimit = Duration.seconds(15);

/** A status as a mark: two reads with the same mark saw no progress. */
const markOf = (status: Status) =>
  `${status.state} ${status.positionMs} ${status.durationMs ?? '-'}`;

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

/**
 * The player showing `track` at the device's `status`, where it `was` before,
 * as the reader `wants` it. A failed recording says whether the device was
 * `offline` when it failed. A device that loads again once `track` has
 * played keeps its place, its length and its button, by the reader's last
 * ask: after a play it buffers (iOS waits to play on a resume), after a
 * pause it is paused (the web loads a paused place it does not hold).
 */
export const fromStatus = (
  track: Track,
  status: Status,
  offline: boolean,
  was: Player,
  wants: Intent,
): Player => {
  const at = seconds(status.positionMs);
  const held = Option.filter(trackOf(was), (it) => it.number === track.number);
  const length = Option.orElse(lengthOf(status), () => Option.flatMap(held, () => lengthIn(was)));
  const placed = () =>
    Match.value(wants).pipe(
      Match.when('play', () => Player.Buffering({ track, at, length })),
      Match.when('pause', () => Player.Paused({ track, at, length })),
      Match.exhaustive,
    );
  switch (status.state) {
    case 'idle':
      return Player.Idle();
    case 'loading':
      return Option.match(held, {
        onNone: () => Player.Loading({ track }),
        onSome: () =>
          Player.$match(was, {
            Playing: placed,
            Buffering: placed,
            Paused: placed,
            Idle: () => Player.Loading({ track }),
            Loading: () => Player.Loading({ track }),
            Ended: () => Player.Loading({ track }),
            Stopped: () => Player.Loading({ track }),
            Failed: () => Player.Loading({ track }),
          }),
      });
    case 'playing':
      return Player.Playing({ track, at, length });
    case 'paused':
      return Player.Paused({ track, at, length });
    case 'ended':
      return Player.Ended({ track, length });
    case 'failed':
      return Player.Failed({ track, offline });
  }
};

/**
 * The player as the reader's `intent` shows it, before the device answers:
 * a Play shows a paused or ended recording waiting to play (an ended one
 * from its start), a Pause shows a playing one paused, each at its place.
 */
export const asked = (player: Player, intent: Intent): Player =>
  Match.value(intent).pipe(
    Match.when('play', () =>
      Player.$match(player, {
        Paused: ({ track, at, length }) => Player.Buffering({ track, at, length }),
        Ended: ({ track, length }) => Player.Buffering({ track, at: 0, length }),
        Idle: () => player,
        Loading: () => player,
        Playing: () => player,
        Buffering: () => player,
        Stopped: () => player,
        Failed: () => player,
      }),
    ),
    Match.when('pause', () =>
      Player.$match(player, {
        Playing: ({ track, at, length }) => Player.Paused({ track, at, length }),
        Buffering: ({ track, at, length }) => Player.Paused({ track, at, length }),
        Idle: () => player,
        Loading: () => player,
        Paused: () => player,
        Ended: () => player,
        Stopped: () => player,
        Failed: () => player,
      }),
    ),
    Match.exhaustive,
  );

/** The player's atoms over the device's `playback`, reading its status every `every` while it moves. */
export const playerOn = (playback: Layer.Layer<Playback>, every: Duration.Input) => {
  const runtime = Atom.runtime(playback);
  const state = Atom.make<Player>(Player.Idle()).pipe(Atom.keepAlive);
  const wants = Atom.make<Intent>('play').pipe(Atom.keepAlive);
  /**
   * The recording the player last started, across the commands that follow
   * it: its count (`id`), the count it was announced at, the last status
   * read of it as a mark, and since when its spinner has shown that mark.
   */
  const recording = { id: 0, announced: -1, mark: '', still: Option.none<number>() };

  const send = runtime
    .fn(
      Effect.fn('Player.send')(function* (command: Command, get: Atom.FnContext) {
        const device = yield* Playback;
        const show = (player: Player) => Effect.sync(() => get.set(state, player));
        const failed = (track: Track) =>
          Effect.map(device.online, (online) => Player.Failed({ track, offline: !online }));
        const settle = (track: Track, status: Status) =>
          Effect.map(device.online, (online) =>
            fromStatus(track, status, !online, get.registry.get(state), get.registry.get(wants)),
          );
        /**
         * The device's status, shown, what it says of the playback, and its
         * mark; a status the device cannot read is a failure.
         */
        const read = (track: Track) =>
          device.status.pipe(
            Effect.flatMap((status) =>
              settle(track, status).pipe(
                Effect.flatMap(show),
                Effect.as([seenOf(status), markOf(status)] as const),
              ),
            ),
            Effect.catchTag('PlaybackError', (error) =>
              Effect.logWarning('player.status.failed').pipe(
                Effect.annotateLogs({ message: error.message }),
                Effect.andThen(failed(track)),
                Effect.flatMap(show),
                Effect.as(['failed', ''] as const),
              ),
            ),
          );
        /** The load is given up: the page offers Retry, and the device lets the recording go. */
        const stalled = (track: Track) =>
          Effect.logWarning('player.load.stalled').pipe(
            Effect.annotateLogs({ track: track.number }),
            Effect.andThen(failed(track)),
            Effect.flatMap(show),
            Effect.andThen(Effect.ignore(device.stop)),
          );
        /** Whether the spinner has shown one mark for `loadingLimit`, after a read that saw `mark`. */
        const stuck = (mark: string, now: number) => {
          const loading = Player.$is('Loading')(get.registry.get(state));
          recording.still = Option.liftPredicate(recording.still, () => loading).pipe(
            Option.map((still) => Option.filter(still, () => mark === recording.mark)),
            Option.map(Option.getOrElse(() => now)),
          );
          recording.mark = mark;
          return Option.exists(
            recording.still,
            (since) => now - since >= Duration.toMillis(loadingLimit),
          );
        };
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
            if (!holds || letGo(page) || recording.announced === recording.id) return Effect.void;
            recording.announced = recording.id;
            return Effect.uninterruptible(announce(track));
          });
        /**
         * Show the device's status while the ask is not `answered`, and after
         * until its playback stops moving: a read every `every`, and one at
         * once when the device answers. The reads end when the device fails,
         * when the ask is refused and the refusal says so (`false`), or when
         * the spinner has shown one status for `loadingLimit`.
         */
        const watch = (track: Track, answered: Deferred.Deferred<boolean>) =>
          Effect.gen(function* () {
            const once = Effect.gen(function* () {
              const [seen, mark] = yield* read(track);
              const answer = yield* Effect.when(
                Deferred.await(answered),
                Deferred.isDone(answered),
              );
              if (Option.contains(answer, false)) {
                yield* failed(track).pipe(Effect.flatMap(show));
                return false;
              }
              if (seen === 'failed') return false;
              if (stuck(mark, yield* Clock.currentTimeMillis)) {
                yield* stalled(track);
                return false;
              }
              yield* announceOnce(track, answer);
              return seen === 'moving' || Option.isNone(answer);
            });
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
            let more = yield* once;
            while (more) {
              yield* rest;
              more = yield* once;
            }
          });
        /** Show the device's status until its playback stops moving, whatever the page shows. */
        const follow = (track: Track) =>
          Deferred.make<boolean>().pipe(
            Effect.tap((answered) => Deferred.succeed(answered, true)),
            Effect.flatMap((answered) => watch(track, answered)),
          );
        /** The reader's ask, shown at once: the device's status follows it. */
        const intend = (intent: Intent) =>
          Effect.sync(() => {
            get.set(wants, intent);
            get.set(state, asked(get.registry.get(state), intent));
          });
        /** A refused ask is logged, and the status shown as it is. */
        const logged = (error: PlaybackError) =>
          Effect.logWarning('player.command.failed').pipe(
            Effect.annotateLogs({ operation: error.operation, message: error.message }),
            Effect.as(true),
          );
        /**
         * Ask the device, and show its status while it answers and after: a web
         * `play` and `resume` answer only once the element plays (or never,
         * when it fails after its data), and a `seek` once it holds the new
         * place. A refusal is `refused`: `true` reads on, `false` shows Failed.
         */
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
        const current = get.registry.get(state);
        const holding = trackOf(current);
        /** Run `act` on the hymn the player holds; with none, nothing. */
        const held = (act: (track: Track) => Effect.Effect<void>) =>
          Option.match(holding, { onNone: () => Effect.void, onSome: act });
        /** Run `act` on the recording the device holds; with none (let go, or failed), `instead`. */
        const holds = (
          act: (track: Track) => Effect.Effect<void>,
          instead: (track: Track) => Effect.Effect<void>,
        ) =>
          held((track) =>
            Match.value(letGo(current)).pipe(
              Match.when(true, () => instead(track)),
              Match.orElse(() => act(track)),
            ),
          );
        /** Start and Retry: Loading at once, the status read while the device loads. */
        const begin = (track: Track) =>
          Effect.sync(() => {
            get.set(wants, 'play');
            Object.assign(recording, { id: recording.id + 1, mark: '', still: Option.none() });
          }).pipe(
            Effect.andThen(show(Player.Loading({ track }))),
            Effect.andThen(
              ask(track, device.play(audioUrl(track.number)), (error) =>
                Effect.logWarning('player.play.failed').pipe(
                  Effect.annotateLogs({ track: track.number, message: error.message }),
                  Effect.as(false),
                ),
              ),
            ),
          );
        /** A Pause before the first sound: Stopped at once, and the device lets the recording go. */
        const halt = (track: Track) =>
          Effect.sync(() => get.set(wants, 'pause')).pipe(
            Effect.andThen(show(Player.Stopped({ track }))),
            Effect.andThen(device.stop),
            Effect.catchTag('PlaybackError', logged),
            Effect.asVoid,
          );
        const pause = (track: Track) =>
          Match.value(current).pipe(
            Match.tag('Loading', () => halt(track)),
            Match.orElse(() =>
              intend('pause').pipe(Effect.andThen(ask(track, device.pause, logged))),
            ),
          );
        /** A Pause with nothing to pause: kept as the reader's ask, and nothing else is done. */
        const keep = () => Effect.sync(() => get.set(wants, 'pause'));
        /** The hymn the command is about: the one it starts, else the one held. */
        const subject = Option.liftPredicate(command, Command.$is('Start')).pipe(
          Option.map(({ track }) => track),
          Option.orElse(() => holding),
        );
        return yield* Command.$match(command, {
          Start: ({ track }) => begin(track),
          Pause: () => holds(pause, keep),
          // From a recording let go, any Play starts it again.
          Resume: () =>
            holds(
              (track) => intend('play').pipe(Effect.andThen(ask(track, device.resume, logged))),
              begin,
            ),
          Seek: ({ seconds: to }) =>
            holds(
              (track) => ask(track, device.seek(Math.max(0, to) * 1000), logged),
              () => Effect.void,
            ),
          Follow: () => holds(follow, () => Effect.void),
        }).pipe(
          // A defect is a bug, but the reader still sees the recording fail.
          Effect.catchDefect((defect) =>
            Effect.logError('player.defect').pipe(
              Effect.annotateLogs({ defect: String(defect) }),
              Effect.andThen(
                Option.match(subject, {
                  onNone: () => Effect.void,
                  onSome: (track) => show(Player.Failed({ track, offline: false })),
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
