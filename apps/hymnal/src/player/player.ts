/**
 * The hymn player: one recording at a time, from `audioUrl` (`src/remote.ts`).
 *
 * The player's state is an atom; the reader acts on it by writing commands
 * to `send`. The device's playback is a service (`Playback`): One's `Audio`
 * on a phone and on the web (`playback.live.ts`), or one a test hands in.
 * One's playback tells no events of its own, so while a recording loads or
 * plays the player reads its status every `every` and shows it.
 *
 * Each command runs in place of the one before it: starting a hymn while
 * another loads or plays stops following the old one, and the device swaps
 * the recording (One's `Audio.play` replaces the one playing).
 */

import {
  Context,
  Data,
  Duration,
  Effect,
  type Layer,
  Option,
  Schedule,
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
  /** Show the device's playback again: the lock screen or Control Center moved it. */
  Follow: {};
}>;
export const Command = Data.taggedEnum<Command>();

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

/** What the lock screen or Control Center did to the playback. */
export type Remote = 'play' | 'pause' | 'seek';

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
  /** Whether the device has a connection now. */
  readonly online: Effect.Effect<boolean>;
  /** Show the recording on the lock screen and in Control Center. */
  readonly announce: (announcement: Announcement) => Effect.Effect<void, PlaybackError>;
  /** Each play, pause or seek the lock screen or Control Center makes. */
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
  Failed: ({ track }) => Option.some(track),
});

/** Whether the player is waiting on the device: it loads, plays or buffers. */
export const isMoving = (player: Player) =>
  Player.$is('Loading')(player) || Player.$is('Playing')(player) || Player.$is('Buffering')(player);

const seconds = (ms: number) => ms / 1000;

/** The length a player shows, if it shows one. */
const lengthIn: (player: Player) => Option.Option<number> = Player.$match({
  Idle: () => Option.none(),
  Loading: () => Option.none(),
  Playing: ({ length }) => length,
  Buffering: ({ length }) => length,
  Paused: ({ length }) => length,
  Ended: ({ length }) => length,
  Failed: () => Option.none(),
});

const lengthOf = (status: Status) =>
  Option.fromNullishOr(status.durationMs).pipe(
    Option.filter((ms) => Number.isFinite(ms) && ms > 0),
    Option.map(seconds),
  );

/**
 * The player showing `track` at the device's `status`, where it `was` before.
 * A failed recording says whether the device was `offline` when it failed.
 * A device that loads again once `track` has played keeps its place, its
 * length and its button: a playing hymn buffers, a paused one stays paused.
 */
export const fromStatus = (
  track: Track,
  status: Status,
  offline: boolean,
  was: Player = Player.Idle(),
): Player => {
  const at = seconds(status.positionMs);
  const held = Option.filter(trackOf(was), (it) => it.number === track.number);
  const length = Option.orElse(lengthOf(status), () => Option.flatMap(held, () => lengthIn(was)));
  switch (status.state) {
    case 'idle':
      return Player.Idle();
    case 'loading':
      return Option.match(held, {
        onNone: () => Player.Loading({ track }),
        onSome: () =>
          Player.$match(was, {
            Playing: () => Player.Buffering({ track, at, length }),
            Buffering: () => Player.Buffering({ track, at, length }),
            Paused: () => Player.Paused({ track, at, length }),
            Idle: () => Player.Loading({ track }),
            Loading: () => Player.Loading({ track }),
            Ended: () => Player.Loading({ track }),
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

/** The player's atoms over the device's `playback`, reading its status every `every` while it moves. */
export const playerOn = (playback: Layer.Layer<Playback>, every: Duration.Input) => {
  const runtime = Atom.runtime(playback);
  const state = Atom.make<Player>(Player.Idle()).pipe(Atom.keepAlive);

  const send = runtime
    .fn(
      Effect.fn('Player.send')(function* (command: Command, get: Atom.FnContext) {
        const device = yield* Playback;
        const show = (player: Player) => Effect.sync(() => get.set(state, player));
        const failed = (track: Track) =>
          Effect.map(device.online, (online) => Player.Failed({ track, offline: !online }));
        const settle = (track: Track, status: Status) =>
          Effect.map(device.online, (online) =>
            fromStatus(track, status, !online, get.registry.get(state)),
          );
        /** The device's status, shown; a status the device cannot read is a failure. */
        const read = (track: Track) =>
          device.status.pipe(
            Effect.flatMap((status) => settle(track, status)),
            Effect.catchTag('PlaybackError', (error) =>
              Effect.logWarning('player.status.failed').pipe(
                Effect.annotateLogs({ message: error.message }),
                Effect.andThen(failed(track)),
              ),
            ),
            Effect.tap(show),
          );
        /** Show the device's status until the recording stops moving. */
        const follow = (track: Track) =>
          read(track).pipe(
            Effect.repeat({ while: isMoving, schedule: Schedule.spaced(every) }),
            Effect.asVoid,
          );
        /** Ask the device; a refused ask is logged and the status shown as it is. */
        const ask = (track: Track, operation: Effect.Effect<Status, PlaybackError>) =>
          operation.pipe(
            Effect.asVoid,
            Effect.catchTag('PlaybackError', (error) =>
              Effect.logWarning('player.command.failed').pipe(
                Effect.annotateLogs({ operation: error.operation, message: error.message }),
              ),
            ),
            Effect.andThen(follow(track)),
          );
        const holding = trackOf(get.registry.get(state));
        /** Run `act` on the hymn the player holds; with none, nothing. */
        const held = (act: (track: Track) => Effect.Effect<void>) =>
          Option.match(holding, { onNone: () => Effect.void, onSome: act });
        /** The hymn the command is about: the one it starts, else the one held. */
        const subject = Option.liftPredicate(command, Command.$is('Start')).pipe(
          Option.map(({ track }) => track),
          Option.orElse(() => holding),
        );
        return yield* Command.$match(command, {
          Start: ({ track }) =>
            show(Player.Loading({ track })).pipe(
              Effect.andThen(device.play(audioUrl(track.number))),
              Effect.andThen(
                device
                  .announce({ title: track.title, artist: `Hymn ${track.number}` })
                  .pipe(
                    Effect.catchTag('PlaybackError', (error) =>
                      Effect.logWarning('player.announce.failed').pipe(
                        Effect.annotateLogs({ message: error.message }),
                      ),
                    ),
                  ),
              ),
              Effect.andThen(follow(track)),
              Effect.catchTag('PlaybackError', (error) =>
                Effect.logWarning('player.play.failed').pipe(
                  Effect.annotateLogs({ track: track.number, message: error.message }),
                  Effect.andThen(failed(track)),
                  Effect.flatMap(show),
                ),
              ),
            ),
          Pause: () => held((track) => ask(track, device.pause)),
          Resume: () => held((track) => ask(track, device.resume)),
          Seek: ({ seconds: to }) =>
            held((track) => ask(track, device.seek(Math.max(0, to) * 1000))),
          Follow: () => held(follow),
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

  /** Follows the lock screen and Control Center while it is mounted. */
  const remote = runtime.atom((get) =>
    Effect.gen(function* () {
      const device = yield* Playback;
      yield* Stream.runForEach(device.remote, () =>
        Effect.sync(() => get.set(send, Command.Follow())),
      );
    }),
  );

  return { state, send, remote };
};

/** A player's atoms: its state, the commands it takes and its lock-screen follower. */
export type HymnPlayer = ReturnType<typeof playerOn>;

/** How often the player reads the device's status while a recording moves. */
export const statusEvery = Duration.millis(250);
