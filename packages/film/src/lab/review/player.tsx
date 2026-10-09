// The review's players, shared by its pages (a Set, Choices, Project and a
// sheet's lone render): the synced player's transport row, the one video that
// plays on a clock of its own, and the ref that joins a media element to a
// player's driver.

import { useAtomSet, useAtomValue } from '@bible/atom-solid';
import { Match, Option } from 'effect';
import * as ActorAtom from 'effect-machine/atom';
import { Show } from '@solidjs/web';
import {
  type Accessor,
  type ParentProps,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onSettled,
  untrack,
} from 'solid-js';
import { type Playable, playableOf } from '../../browser/media.ts';
import { rateCommands, rateId, rateText, rateTitle } from '../../player/transport.ts';
import { Actor } from '../actor.tsx';
import { hubKeys } from '../command/changes.ts';
import { CommandChip } from '../command/command-chip.tsx';
import { HearIcon, useShellTime } from '../page-shell.tsx';
import { pressed } from '../pressed.ts';
import { useReview } from './context.tsx';
import {
  Rate,
  SyncEvent,
  type SyncState,
  atRest,
  clockParts,
  failureOf,
  reachOf,
  runningOf,
  spawnSync,
} from './machine.ts';
import { type SyncDriver, makeSync } from './sync.ts';

/**
 * The speaker that makes what it names the sound heard: the one hear button
 * every page draws (a Set's version, a Choices or Project card), pressed
 * while it is the one heard, named for a reader by `title`.
 */
export const HearToggle = (props: {
  readonly on: boolean;
  readonly title: string;
  readonly hear: () => void;
  readonly disabled?: boolean;
}) => (
  <button
    type="button"
    class={['sh-tool', 'rv-sound', { on: props.on }]}
    data-act="hear"
    title={props.title}
    aria-label={props.title}
    aria-pressed={pressed(props.on)}
    disabled={props.disabled}
    onClick={() => props.hear()}
  >
    <HearIcon />
  </button>
);

/**
 * The synced player's controls, one row: play, the clock, a scrub over every
 * track, and the one rate chip (UR-25), whose rates are the page's commands
 * while the transport is shown (J, K, L; ⌘K). Its keys are in the `?` sheet.
 * A page docks it (`.sh-dock`: over the tab bar on a phone, held under the
 * header on a laptop, design language §4), Choices, a Set and Project alike.
 */
export const Transport = (props: {
  readonly sync: Accessor<SyncState>;
  readonly send: (event: SyncEvent) => void;
}) => {
  const { sync } = props;
  const { meta } = useReview();
  const keys = hubKeys(meta.hub);
  // The header's timecode is this transport's clock.
  useShellTime(() => sync().t);
  onCleanup(
    meta.hub.commands.register(
      ...rateCommands({
        all: Rate.literals,
        now: () => sync().rate,
        choose: (rate) => props.send(SyncEvent.RateChosen({ rate })),
      }),
    ),
  );
  return (
    <TransportRow
      sync={sync}
      send={props.send}
      scrubs="Scrub every video"
      title="Play / pause (space)"
    >
      <CommandChip
        hub={meta.hub}
        ids={Rate.literals.map(rateId)}
        act="rate"
        class="sh-btn"
        title={rateTitle(keys.titled)}
      >
        <span data-rate={String(sync().rate)}>{rateText(sync().rate)}</span>
      </CommandChip>
    </TransportRow>
  );
};

/** What a page's player whose clock cannot play says, in its row, in place of the scrub. */
const CANNOT_PLAY_CLOCK = 'Can’t play this video';

/**
 * A synced player's row: play, the clock and a scrub (`scrubs` names what it
 * moves), then `children` (the docked transport's rate chip). Once its
 * clock's media cannot play (`Failed`) the row says so in place of the
 * scrub, and play is off: there is nothing to play or scrub until the page
 * gives the clock new media (another quality, another picture).
 */
const TransportRow = (
  props: ParentProps<{
    readonly sync: Accessor<SyncState>;
    readonly send: (event: SyncEvent) => void;
    readonly scrubs: string;
    readonly title: string;
    /** Whether it plays one video on a clock of its own (`PlayedAlone`), not the page's. */
    readonly alone?: boolean;
  }>,
) => {
  const { sync } = props;
  const send = { sync: props.send };
  const playing = () => runningOf(sync()) || sync()._tag === 'Buffering';
  const failure = () => failureOf(sync());
  return (
    <section class={['rv-transport', { 'rv-alone-row': props.alone === true }]}>
      <button
        type="button"
        class="sh-btn rv-big"
        data-primary=""
        data-act="play"
        title={props.title}
        disabled={Option.isSome(failure())}
        onClick={() => send.sync(SyncEvent.Toggled)}
      >
        {Match.value(playing()).pipe(
          Match.when(true, () => '❚❚'),
          Match.orElse(() => '▶'),
        )}
      </button>
      <span class="rv-time" data-state={sync()._tag}>
        {/* The time: a laptop's header shows the docked one's already (`useShellTime`), so its row leaves it out. */}
        <span class="rv-time-at">{clockParts(sync()).at}</span>
        {/* The end, and a wait: a phone's row leaves them out (the scrub shows the end). */}
        <span class="rv-time-rest">{clockParts(sync()).rest}</span>
      </span>
      <Show
        when={Option.getOrUndefined(failure())}
        fallback={
          <input
            type="range"
            aria-label={props.scrubs}
            min={sync().start}
            max={reachOf(sync())}
            step="0.05"
            value={sync().t}
            onInput={(e) => send.sync(SyncEvent.ScrubMoved({ t: Number(e.currentTarget.value) }))}
            onChange={() => send.sync(SyncEvent.ScrubReleased)}
          />
        }
      >
        {(reason) => (
          <span class="rv-failed" data-role="failed" data-reason={reason()}>
            {CANNOT_PLAY_CLOCK}
          </span>
        )}
      </Show>
      {props.children}
    </section>
  );
};

/** The one video a lone player plays: its clock and the one heard. */
const ALONE = 'alone';

/** What a lone video whose media cannot play says, on its picture, which tries it again. */
const CANNOT_PLAY = 'Can’t play this video · Try again';

/** One try at a lone video's source: the `n`th (0: the first; later ones are retries). */
interface Try {
  readonly src: string;
  readonly n: number;
}

/**
 * The `ref` of a media element that joins `driver` as `id`, for as long as
 * the calling owner lives: a page makes a fresh element for each source (and
 * each retry), so the driver knows the clock's media is new, and lets this
 * one go as it leaves, whatever replaced it since. `joined`, when given, is
 * told the element's `Playable` as it joins.
 */
export const useClockMedia = (
  driver: SyncDriver,
  id: string,
  joined?: (media: Playable) => void,
) => {
  let release = Option.none<() => void>();
  onCleanup(() => Option.map(release, (letGo) => letGo()));
  return (el: HTMLMediaElement) => {
    const media = playableOf(el);
    release = Option.some(driver.attach(id, media));
    Option.map(Option.fromUndefinedOr(joined), (told) => told(media));
  };
};

/**
 * A video on a clock of its own (a video in no set, a render in a sheet),
 * never the browser's controls: at rest (`atRest`) its picture is the one
 * control, a press plays or pauses it; once it has moved (playing, scrubbed,
 * paused past its start) the review's transport row shows under it (play,
 * the clock, a scrub), for the whole of a scrub. A failure is its media's:
 * each try at a source (a new source, or a retry of a failed one) is a fresh
 * element on the same clock, so a new source stands where the last stood,
 * playing if it played, and nothing of a failed try outlives it. Once its
 * media cannot play (`Failed`) its picture says so and no row shows (there
 * is nothing to play or scrub); a press on the picture then tries again,
 * from where the failure left it, and plays as it starts (the press asked
 * for it). It is heard, and its time is its own, not the page's. `children`
 * are its `<track>`s.
 */
export const PlayedAlone = (
  props: ParentProps<{ readonly src: string; readonly poster: string }>,
) => {
  const { meta } = useReview();
  const [retried, setRetried] = createSignal<Option.Option<Try>>(Option.none());
  // The play a press on a failed picture asked for: the retry's element's alone, taken once
  // as that element starts (a source switched away and back is a new try, which plays only
  // if the clock plays).
  let asked = Option.none<Try>();
  const takeAsked = (at: Try) => {
    const mine = Option.exists(asked, (a) => a.src === at.src && a.n === at.n);
    if (mine) asked = Option.none();
    return mine;
  };
  // A new source is its first try; the same source keeps its retries.
  const current = createMemo((): Try => ({
    src: props.src,
    n: Option.getOrElse(
      Option.map(
        Option.filter(retried(), (r) => r.src === props.src),
        (r) => r.n,
      ),
      () => 0,
    ),
  }));
  return (
    <Actor runtime={meta.runtime} spawn={spawnSync(ALONE, 0)}>
      {(actor) => {
        const syncAtom = ActorAtom.make(actor);
        const sync = useAtomValue(() => syncAtom);
        const send = useAtomSet(() => syncAtom);
        const driver = makeSync(ALONE, send, meta.host);
        onCleanup(driver.stop);
        createEffect(sync, (state) => driver.apply(state));
        const failure = () => failureOf(sync());
        const failed = () => Option.isSome(failure());
        const label = () =>
          Option.match(failure(), { onNone: () => 'Play / pause', onSome: () => CANNOT_PLAY });
        return (
          <>
            <button
              type="button"
              class="rv-alone-picture"
              data-act="play-video"
              title={label()}
              aria-label={label()}
              onClick={() => {
                if (!failed()) return send(SyncEvent.Toggled);
                const at = untrack(current);
                const next = { src: at.src, n: at.n + 1 };
                asked = Option.some(next);
                setRetried(Option.some(next));
              }}
            >
              <Show when={current()} keyed>
                {(at: Try) => {
                  const ref = useClockMedia(driver, ALONE);
                  // A retry plays as it starts: the press asked for it, once.
                  if (takeAsked(at)) onSettled(() => send(SyncEvent.Toggled));
                  return (
                    <video
                      preload="metadata"
                      playsinline
                      poster={props.poster}
                      src={at.src}
                      ref={ref}
                    >
                      {props.children}
                    </video>
                  );
                }}
              </Show>
              <Show when={failed()}>
                <span
                  class="rv-failed"
                  data-role="failed"
                  data-reason={Option.getOrElse(failure(), () => '')}
                >
                  {CANNOT_PLAY}
                </span>
              </Show>
            </button>
            <Show when={!atRest(sync()) && !failed()}>
              <TransportRow
                sync={sync}
                send={send}
                scrubs="Scrub the video"
                title="Play / pause"
                alone
              />
            </Show>
          </>
        );
      }}
    </Actor>
  );
};
