// The synced player's driver: the media of a set (`Playable`s: live its
// `<video>`s and `<audio>`s), made to do what the machine's state says, and
// what they do told back to it as events. It reaches them only through the
// port (`browser/media.ts`), and plays them through `Media.playOrMute`. The
// first variant's video is the clock (its time is the set's); every other
// that drifts more than DRIFT_S from it is put back on it. Only the audible
// one is unmuted. A seek moves every video; a stall pauses them all until
// each has enough to play on (`Buffering`). A seek or a play it sets going
// on a video lasts only while that video is attached: replaced, detached or
// stopped, it ends. The player's transport (space, ←/→) is declared here
// too, as the page's commands, for every page with a synced player.

import { type Context, Data, Effect, Option } from 'effect';
import { Frames } from '../../browser/frames.ts';
import { Media, type Playable } from '../../browser/media.ts';
import { type Command, type Invocation, quiet } from '../../command/command.ts';
import type { Context as CommandContext } from '../../command/context.ts';
import type { Target } from '../../command/target.ts';
import {
  type SyncEvent,
  SyncEvent as Events,
  STEP_S,
  type SyncState,
  runningOf,
} from './machine.ts';

/** How far a video may drift from the clock before it is put back on it, in seconds. */
const DRIFT_S = 0.2;

/** How far the clock moves before the machine hears of it, in seconds. */
const TICK_S = 0.05;

/** Whether `video` has drifted from the clock at `t` far enough to be put back. */
export const drifted = (video: number, t: number): boolean => Math.abs(video - t) > DRIFT_S;

export interface SyncDriver {
  /** A variant's video joins the set: it takes the clock, the rate and the sound as they are. */
  readonly attach: (id: string, video: Playable) => void;
  /** Its card is gone. */
  readonly detach: (id: string) => void;
  /** The machine's state, made so. */
  readonly apply: (state: SyncState) => void;
  /** Every video paused, every listener and the clock's loop stopped. */
  readonly stop: () => void;
}

interface Attached {
  readonly video: Playable;
  /** Aborted when the video is let go: its listeners, and its seeks and plays, end. */
  readonly held: AbortController;
}

/**
 * The driver of a set whose clock is the video of `first`, telling the
 * machine through `send`.
 */
export const makeSync = (
  first: string,
  send: (event: SyncEvent) => void,
  host: Context.Context<Frames | Media>,
): SyncDriver => {
  const videos = new Map<string, Attached>();
  let current = Option.none<SyncState>();
  let seek = -1;
  let told = -1;
  /** The stop of the clock's loop, while it runs. */
  let looping = Option.none<() => void>();

  const all = () => [...videos.values()];
  const clock = () =>
    Option.orElse(Option.fromUndefinedOr(videos.get(first)), () =>
      Option.fromUndefinedOr(all()[0]),
    );

  /** Do `effect` on the host, without waiting for it. */
  const fork = (effect: Effect.Effect<unknown, never, Frames | Media>) => {
    Effect.runForkWith(host)(effect);
  };
  /** Do `effect` on the host while `a` stays attached, without waiting for it. */
  const forkOn = (a: Attached, effect: Effect.Effect<unknown, never, Frames | Media>) => {
    Effect.runForkWith(host)(effect, { signal: a.held.signal });
  };
  /**
   * Play `a`'s video; a browser that will not play sound unasked plays it muted
   * (any other refusal, a pause before it started, is left as it is).
   */
  const play = (a: Attached) =>
    forkOn(
      a,
      Media.use((media) => media.playOrMute(a.video)),
    );
  const seekTo = (a: Attached, t: number) => forkOn(a, a.video.seek(t));

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
          if (all().every((a) => a.video.ready())) send(Events.Resumed);
          return;
        }
        if (Math.abs(t - told) >= TICK_S) {
          told = t;
          send(Events.Ticked({ t }));
        }
        for (const a of all()) {
          const video = a.video;
          if (a === master || video.seeking() || video.ended()) continue;
          if (t < video.duration() && drifted(video.time(), t)) seekTo(a, t);
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
    if (state.seek !== seek) {
      seek = state.seek;
      told = state.t;
      for (const a of all()) seekTo(a, state.t);
    }
    if (runningOf(state)) {
      for (const a of all()) if (!a.video.playing()) play(a);
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

  const attach = (id: string, video: Playable) => {
    Option.map(Option.fromUndefinedOr(videos.get(id)), (old) => old.held.abort());
    const attached: Attached = { video, held: new AbortController() };
    const signal = attached.held.signal;
    videos.set(id, attached);
    video.on(
      'measured',
      () => {
        if (id === first && Number.isFinite(video.duration()))
          send(Events.Measured({ end: video.duration() }));
        Option.map(current, (state) => seekTo(attached, state.t));
      },
      signal,
    );
    video.on('stalled', () => send(Events.Stalled), signal);
    video.on(
      'ended',
      () => {
        if (id === first) send(Events.Ended);
      },
      signal,
    );
    Option.map(current, (state) => {
      hear(state);
      seekTo(attached, state.t);
      if (runningOf(state)) play(attached);
    });
  };

  const detach = (id: string) => {
    Option.map(Option.fromUndefinedOr(videos.get(id)), (a) => {
      a.held.abort();
      fork(a.video.pause);
    });
    videos.delete(id);
  };

  const stop = () => {
    halt();
    for (const id of [...videos.keys()]) detach(id);
  };

  return { attach, detach, apply, stop };
};

/** What a synced player is asked: play or pause, or a step back or on (`by` steps). */
export type PlayerKey = Data.TaggedEnum<{
  Toggle: {};
  Step: { readonly by: number };
}>;
export const PlayerKey = Data.taggedEnum<PlayerKey>();

/** The machine's event for a player's ask: a toggle, or a step of `by` × STEP_S seconds. */
export const playerEvent = (key: PlayerKey): SyncEvent =>
  PlayerKey.$match(key, {
    Toggle: () => Events.Toggled,
    Step: ({ by }) => Events.Stepped({ by: by * STEP_S }),
  });

/** The steps a ←/→ moves by: one, ten with Shift (the coarse step), one with Alt. */
const STEPS_BY: Readonly<Record<Invocation['step'], number>> = { normal: 1, coarse: 10, fine: 1 };

/**
 * Where a step is offered by touch (SU-11): a long-press on a Set's version
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
    run: (_ctx: CommandContext, how: Invocation) =>
      Effect.sync(() => {
        Option.map(heed(key(how)), (act) => act());
        return quiet;
      }),
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
