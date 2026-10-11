// The synced player's driver: the media of a set (`Playable`s: live its
// `<video>`s and `<audio>`s), made to do what the machine's state says, and
// what they do told back to it as events. It reaches them only through the
// port (`browser/media.ts`), and plays them through `Media.playOrMute`. The
// leading version's video is the clock, and the clock alone: its time, its
// end, its ending and its failure are the set's, and while it is not
// attached the set's time stands. The page says which version leads; when
// that changes the driver `follow`s the new one (`ClockMoved`). Every other
// video that drifts more than DRIFT_S from it is put back on it. Only the audible
// one is unmuted. The machine is told when the clock's media cannot play
// (`MediaFailed`), and when the clock's media is new (`MediaReplaced`: each
// source, and each retry, is a fresh element attached), so a failure is its
// media's alone; another video that fails is left out: of the drift pull,
// of the seeks and plays, and of what a stalled set waits on, until its media
// is measured again. A seek moves every video that can play, each onto its
// own frame at the clock's (`landing`, by its own rate once `timed`); a stall pauses
// them all until each has enough to play on (`Buffering`). A seek or a play it sets going on a video lasts
// only while that video is attached: replaced, released or stopped, it
// ends. The player's transport (space, ←/→) is declared here too, as the
// page's commands, for every page with a synced player.

import { type Context, Data, type Duration, Effect, Option } from 'effect';
import { Frames } from '../../browser/frames.ts';
import { frameAtOrBefore, frameRead } from '../../core/time.ts';
import { Media, type Playable } from '../../browser/media.ts';
import { type Command, type Invocation, quietly } from '../../command/command.ts';
import type { Target } from '../../command/target.ts';
import {
  type SyncEvent,
  SyncEvent as Events,
  type SyncState,
  UNKNOWN_END,
  runningOf,
} from './machine.ts';

/** How far a video may drift from the clock before it is put back on it, in seconds. */
const DRIFT_S = 0.2;

/** How far the clock moves before the machine hears of it, in seconds. */
const TICK_S = 0.05;

/** How far into its frame a seek lands, in frames. */
const INTO_FRAME = 0.25;

/**
 * Where a seek of the clock to `t` (counting `fps` frames a second) lands on
 * a video at `own` frames a second: the clock's frame is the one its
 * timecode reads (`frameRead`), and the video lands a quarter of one of its
 * own frames into its frame that holds that frame's start. A step's time is
 * its frame's start (`n / fps`), and Chrome keeps an element's time a
 * microsecond short of some frames' starts (frame 25 at 24 fps, 62 at 30),
 * which shows the frame before; inside the frame, it shows that frame's
 * picture. So each video shows its own frame at the clock's frame, at any
 * rate of either, and a scrub or a `#t=` shows the frame its timecode reads.
 * The clock's own time stays as the machine has it (`t`).
 */
const landing = (t: number, fps: number, own: number): number =>
  (frameAtOrBefore(frameRead(t, fps) / fps, own) + INTO_FRAME) / own;

/**
 * Whether `video` has drifted from the clock's video at `t` far enough to be
 * put back on it: the drift pull seeks it to `t` itself (a playing picture
 * needs no quarter in), so a video put back is never found drifted again by
 * where it landed, at any rate.
 */
export const drifted = (video: number, t: number): boolean => Math.abs(video - t) > DRIFT_S;

export interface SyncDriver {
  /**
   * A variant's video joins the set, in the place of any it had: it takes the
   * clock, the rate and the sound as they are. What it gives lets this video
   * go (its element gone, its placeholder back), and leaves a video attached
   * in its place since as it is.
   */
  readonly attach: (id: string, video: Playable) => () => void;
  /** The machine's state, made so. */
  readonly apply: (state: SyncState) => void;
  /**
   * The clock is `id`'s video from now on (another version leads: the one it
   * followed left the set, or another plays first here): the machine is told
   * its end, and whether its media failed or ended already; every media
   * event after is heard against it.
   */
  readonly follow: (id: string) => void;
  /**
   * `id`'s video runs at `fps` frames a second, its own (`Media.timing`, as
   * the server reads it for the file it is now): each seek lands it in its
   * own frames (`landing`); none (not read yet, or no rate its frames tell)
   * lands it by the clock's rate, as the clock itself then counts. It is put
   * on its frame again now. For any video that joins as `id`, from now on.
   */
  readonly timed: (id: string, fps: Option.Option<number>) => void;
  /** Every video paused, every listener and the clock's loop stopped. */
  readonly stop: () => void;
}

interface Attached {
  readonly video: Playable;
  /** Aborted when the video is let go: its listeners, and its seeks and plays, end. */
  readonly held: AbortController;
}

/**
 * Ask for `video`'s media again, after `wait`, each time it fails to load, up
 * to `tries` times: a mix that renders for long enough that the connection
 * drops finds the server's render made. It hears the failure through the
 * port, and waits on `host`'s clock. What it gives stops it.
 */
export const reloadOnError = <R>(
  video: Playable,
  host: Context.Context<R>,
  wait: Duration.Duration,
  tries: number,
): (() => void) => {
  const held = new AbortController();
  let left = tries;
  video.on(
    'error',
    () => {
      if (left <= 0) return;
      left -= 1;
      Effect.runForkWith(host)(
        Effect.sleep(wait).pipe(Effect.andThen(Effect.sync(() => video.reload()))),
        { signal: held.signal },
      );
    },
    held.signal,
  );
  return () => held.abort();
};

/**
 * The driver of a set whose clock is the video of `leader` (until it
 * `follow`s another), telling the machine through `send`.
 */
export const makeSync = (
  leader: string,
  send: (event: SyncEvent) => void,
  host: Context.Context<Frames | Media>,
): SyncDriver => {
  const videos = new Map<string, Attached>();
  /** Each version's video's own frames a second, once told (`timed`). */
  const rates = new Map<string, number>();
  let current = Option.none<SyncState>();
  let seek = -1;
  /** The clock's rate the videos last landed by: a new one puts them on its frames again. */
  let grid = -1;
  let told = -1;
  /** The stop of the clock's loop, while it runs. */
  let looping = Option.none<() => void>();
  /** The version whose video is the clock: every media event is heard against it. */
  let leading = leader;

  /**
   * The videos whose media failed (an `error`, a play the browser would not
   * start), each with why: out of the set's way.
   */
  const broken = new Map<Attached, string>();
  const all = () => [...videos.values()];
  const working = () => all().filter((a) => !broken.has(a));
  /** The clock: the leading version's video, none until it is attached. */
  const clock = () => Option.fromUndefinedOr(videos.get(leading));

  /** Do `effect` on the host, without waiting for it. */
  const fork = (effect: Effect.Effect<unknown, never, Frames | Media>) => {
    Effect.runForkWith(host)(effect);
  };
  /** Do `effect` on the host while `a` stays attached, without waiting for it. */
  const forkOn = (a: Attached, effect: Effect.Effect<unknown, never, Frames | Media>) => {
    Effect.runForkWith(host)(effect, { signal: a.held.signal });
  };
  /** `id`'s media cannot play, for `reason`: the machine told, when it is the clock's. */
  const failed = (id: string, a: Attached, reason: string) => {
    broken.set(a, reason);
    if (id === leading) send(Events.MediaFailed({ reason }));
  };
  /**
   * Play `id`'s video `a`; a browser that will not play sound unasked plays it
   * muted; one that cannot play it at all fails it (`failed`); a pause before
   * it started is left as it is.
   */
  const play = (id: string, a: Attached) =>
    forkOn(
      a,
      Media.use((media) => media.playOrMute(a.video)).pipe(
        Effect.tap((played) =>
          Effect.sync(() => {
            if (played._tag === 'Failed') failed(id, a, played.name);
          }),
        ),
      ),
    );
  /** `id`'s video `a` put where the clock at `state` stands, in its own frames (`landing`). */
  const land = (id: string, a: Attached, state: SyncState) =>
    forkOn(
      a,
      a.video.seek(
        landing(
          state.t,
          state.fps,
          Option.getOrElse(Option.fromUndefinedOr(rates.get(id)), () => state.fps),
        ),
      ),
    );

  const hear = (state: SyncState) => {
    for (const [id, a] of videos) {
      a.video.mute(id !== state.audible);
      a.video.rate(state.rate);
    }
  };

  /**
   * Each frame while it runs: tell the machine the clock's time, and pull
   * drifters back; on while the set plays or waits for its videos.
   */
  const step = (): boolean =>
    Option.exists(current, (state) => {
      Option.map(clock(), (master) => {
        const t = master.video.time();
        if (state._tag === 'Buffering') {
          if (working().every((a) => a.video.ready())) send(Events.Resumed);
          return;
        }
        if (Math.abs(t - told) >= TICK_S) {
          told = t;
          send(Events.Ticked({ t }));
        }
        for (const a of working()) {
          const video = a.video;
          if (a === master || video.seeking() || video.ended()) continue;
          if (t < video.duration() && drifted(video.time(), t)) forkOn(a, video.seek(t));
        }
      });
      return Option.exists(current, (now) => runningOf(now) || now._tag === 'Buffering');
    });

  const run = () => {
    if (Option.isSome(looping)) return;
    // A loop that ends forgets its stop only while it is still the loop running.
    const stop = Effect.runCallbackWith(host)(
      Frames.use((frames) => frames.loop(step)),
      {
        onExit: () => {
          if (Option.exists(looping, (running) => running === stop)) looping = Option.none();
        },
      },
    );
    looping = Option.some(stop);
  };
  const halt = () => {
    Option.map(looping, (stop) => stop());
    looping = Option.none();
  };

  const apply = (state: SyncState) => {
    current = Option.some(state);
    hear(state);
    // A seek, or the clock's rate read (its frames are not the ones the videos landed on).
    if (state.seek !== seek || state.fps !== grid) {
      seek = state.seek;
      grid = state.fps;
      told = state.t;
      for (const [id, a] of videos) if (!broken.has(a)) land(id, a, state);
    }
    if (runningOf(state)) {
      for (const [id, a] of videos) if (!broken.has(a) && !a.video.playing()) play(id, a);
      run();
      return;
    }
    for (const a of all()) fork(a.video.pause);
    if (state._tag === 'Buffering') {
      run();
      return;
    }
    halt();
  };

  /** Let `a` go, when it is still `id`'s video: its listeners, seeks and plays end, and it pauses. */
  const release = (id: string, a: Attached) => {
    if (videos.get(id) !== a) return;
    a.held.abort();
    fork(a.video.pause);
    videos.delete(id);
    broken.delete(a);
  };

  /** The machine told the clock's end, when `id` leads and its video is measured. */
  const measure = (id: string, video: Playable) => {
    if (id === leading && Number.isFinite(video.duration()))
      send(Events.Measured({ end: video.duration() }));
  };

  const attach = (id: string, video: Playable) => {
    Option.map(Option.fromUndefinedOr(videos.get(id)), (old) => {
      old.held.abort();
      broken.delete(old);
    });
    const attached: Attached = { video, held: new AbortController() };
    const signal = attached.held.signal;
    videos.set(id, attached);
    // The clock's new media, while its last failed: the failure was that media's.
    if (id === leading && Option.exists(current, (state) => state._tag === 'Failed'))
      send(Events.MediaReplaced);
    // Measured before it joined (its `loadedmetadata` came first): no `measured` follows.
    measure(id, video);
    video.on(
      'measured',
      () => {
        // Measured, it plays: a failure before was another try's.
        broken.delete(attached);
        measure(id, video);
        Option.map(current, (state) => land(id, attached, state));
      },
      signal,
    );
    video.on('stalled', () => send(Events.Stalled), signal);
    video.on('error', () => failed(id, attached, 'error'), signal);
    video.on(
      'ended',
      () => {
        if (id === leading) send(Events.Ended);
      },
      signal,
    );
    Option.map(current, (state) => {
      hear(state);
      land(id, attached, state);
      if (runningOf(state)) play(id, attached);
    });
    return () => release(id, attached);
  };

  const follow = (id: string) => {
    if (id === leading) return;
    leading = id;
    told = -1;
    const now = Option.fromUndefinedOr(videos.get(id));
    send(
      Events.ClockMoved({
        end: Option.getOrElse(
          Option.filter(
            Option.map(now, (a) => a.video.duration()),
            Number.isFinite,
          ),
          () => UNKNOWN_END,
        ),
      }),
    );
    Option.map(now, (a) => {
      Option.map(Option.fromUndefinedOr(broken.get(a)), (reason) =>
        send(Events.MediaFailed({ reason })),
      );
      if (a.video.ended()) send(Events.Ended);
    });
  };

  const timed = (id: string, fps: Option.Option<number>) => {
    if (rates.get(id) === Option.getOrUndefined(fps)) return;
    Option.match(fps, {
      onNone: () => rates.delete(id),
      onSome: (rate) => rates.set(id, rate),
    });
    Option.map(Option.fromUndefinedOr(videos.get(id)), (a) => {
      if (!broken.has(a)) Option.map(current, (state) => land(id, a, state));
    });
  };

  const stop = () => {
    halt();
    for (const [id, a] of [...videos]) release(id, a);
  };

  return { attach, apply, follow, timed, stop };
};

/** What a synced player is asked: play or pause, or a step back or on (`by` frames). */
export type PlayerKey = Data.TaggedEnum<{
  Toggle: {};
  Step: { readonly by: number };
}>;
export const PlayerKey = Data.taggedEnum<PlayerKey>();

/** The machine's event for a player's ask: a toggle, or a step of `by` frames. */
export const playerEvent = (key: PlayerKey): SyncEvent =>
  PlayerKey.$match(key, {
    Toggle: () => Events.Toggled,
    Step: ({ by }) => Events.Stepped({ frames: by }),
  });

/** The frames a ←/→ moves by: one, ten with Shift (the coarse step), one with Alt. */
const STEPS_BY: Readonly<Record<Invocation['step'], number>> = { normal: 1, coarse: 10, fine: 1 };

/**
 * Where a step is offered by touch: a long-press on a Set's version
 * (its picture is the version's) or on a page's picture (Choices', the
 * Project's dock), with its ×10 row, as Play's picture offers its frames.
 */
const STEP_ABOUT: ReadonlyArray<Target> = ['Version', 'Page'];

/**
 * A synced player's transport as the page's commands: Space plays or
 * pauses, ← and → step back or on (ten steps with Shift). `heed` says what
 * the page does with an ask now, or none when it has nothing to do with it
 * (a page whose view does not play): the command is available only then.
 * Every page with a synced player registers these while it is mounted.
 */
export const playerCommands = (
  heed: (key: PlayerKey) => Option.Option<() => void>,
): ReadonlyArray<Command> => {
  const asked = (key: (how: Invocation) => PlayerKey) => ({
    when: () => Option.isSome(heed(key({ step: 'normal', via: 'key' }))),
    run: quietly((_ctx, how) => Option.map(heed(key(how)), (act) => act())),
  });
  return [
    {
      id: 'review.play',
      label: 'Play or pause',
      group: 'Player',
      keys: ['space'],
      touch: 'the play button',
      ...asked(() => PlayerKey.Toggle()),
    },
    {
      id: 'review.step-next',
      label: 'Step on',
      group: 'Player',
      keys: ['arrowright'],
      about: STEP_ABOUT,
      stepped: true,
      touch: 'long-press the picture, then Step on (or ×10)',
      ...asked((how) => PlayerKey.Step({ by: STEPS_BY[how.step] })),
    },
    {
      id: 'review.step-previous',
      label: 'Step back',
      group: 'Player',
      keys: ['arrowleft'],
      about: STEP_ABOUT,
      stepped: true,
      touch: 'long-press the picture, then Step back (or ×10)',
      ...asked((how) => PlayerKey.Step({ by: -STEPS_BY[how.step] })),
    },
  ];
};
