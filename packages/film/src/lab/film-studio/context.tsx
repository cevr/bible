// The studio's provider (`Studio.Root`): the film's timeline read at the
// version the address names (`machine.ts`'s timeline machine), the
// transport (its machine, over the clock), the playhead, the selection and
// the zoom, given to the page's parts as `{ state, actions, meta }`. The
// parts never see a machine, the clock or the address: this is the one
// place that knows how each is kept.
//
// The address holds the version (`?v=`), the selection (`?sel=beat:<id>`,
// a step Back walks) and the playhead (`#t=`, film seconds, written as it
// settles and every quarter second while it moves). The clock is the staged
// film's preview when the version shown is the one the film registry holds
// (its narration heard), else a silent clock over the version's timeline
// (`clock.ts`). The page's keys are commands on the page's hub.

import { useAtomSet, useAtomValue } from '@bible/atom-solid';
import { Place } from '@bible/url-state';
import * as UrlAtom from '@bible/url-state/atom';
import { Array as Arr, Boolean as Bool, Effect, Layer, Match, Option, Result } from 'effect';
import * as ActorAtom from 'effect-machine/atom';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import * as Atom from 'effect/reactivity/Atom';
import type { Accessor, ParentProps } from 'solid-js';
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onSettled,
  untrack,
  useContext,
} from 'solid-js';
import { type Host, addressOn, hostLayer } from '../../browser/host.ts';
import { quietly } from '../../command/command.ts';
import type { Hub } from '../../command/hub.ts';
import {
  Places,
  type ScriptBeat,
  TIME_EVERY_MS,
  beatSelection,
  boardFileUrl,
  isRefusal,
  selectedBeat,
  statusOf,
} from '../../core/api.ts';
import { parse } from '../../core/narration.ts';
import { Segment } from '../../core/segment.ts';
import { FILM_FPS, onTheMs } from '../../core/time.ts';
import type { FilmTimeline, ScriptClip } from '../../core/timeline-schema.ts';
import type { Film } from '../../canvas/film.ts';
import type { Player, Staged } from '../../player/main.ts';
import { tInUrl } from '../../player/t-in-url.ts';
import { timersOn } from '../../player/throttle.ts';
import { Actor } from '../actor.tsx';
import { LabClient, called } from '../api.ts';
import { type StudioClock, playerClock, silentClock } from './clock.ts';
import {
  type ReadFailure,
  type TimelineActor,
  TimelineEvent,
  type TimelineState,
  type TransportActor,
  TransportEvent,
  spawnTimeline,
  spawnTransport,
} from './machine.ts';
import {
  type Picture,
  type VersionChip,
  beatAt,
  beatNamed,
  beatStep,
  keptInFilm,
  pictureAt,
  versionChip,
  zoomStep,
} from './view-state.ts';

/** The film staged in the page: its preview's player and the stage its canvas stands in. */
export interface StagedFilm {
  readonly staged: Staged;
  readonly player: Player;
}

interface StudioState {
  /** Where the read is: reading, shown, or unreadable. */
  readonly phase: Accessor<TimelineState['_tag']>;
  readonly timeline: Accessor<Option.Option<FilmTimeline>>;
  /** Why the timeline could not be read. */
  readonly why: Accessor<string>;
  /** Whether reading again can change why it could not be read (the lab did not answer, or failed). */
  readonly retryable: Accessor<boolean>;
  /** The version the page reads or shows (0: the open one). */
  readonly asked: Accessor<number>;
  /** The version chip, kept from the last timeline read while another is read or cannot be. */
  readonly chip: Accessor<Option.Option<VersionChip>>;
  /** Film seconds at the playhead. */
  readonly T: Accessor<number>;
  readonly playing: Accessor<boolean>;
  /** The beat selected (`?sel=beat:<id>`), when the version has it. */
  readonly selected: Accessor<Option.Option<ScriptClip>>;
  /** The beat at the playhead. */
  readonly current: Accessor<Option.Option<ScriptClip>>;
  /** What the viewer shows at the playhead. */
  readonly picture: Accessor<Picture>;
  /** The zoom, a factor over the fit (1: the whole film in the timeline's width). */
  readonly zoom: Accessor<number>;
  /** The beat's words at the playhead (the film's registered script only); none where none are read. */
  readonly words: (beat: string) => Option.Option<ScriptBeat>;
}

interface StudioActions {
  readonly toggle: () => void;
  readonly play: () => void;
  readonly pause: () => void;
  /** Go to film second `T`. */
  readonly seek: (T: number) => void;
  /** Go `seconds` on (back when negative). */
  readonly nudge: (seconds: number) => void;
  /** Go to the next (`1`) or previous (`−1`) beat's start. */
  readonly stepBeat: (step: -1 | 1) => void;
  readonly toStart: () => void;
  readonly toEnd: () => void;
  /** A scrub took the playhead (`grab`), moved it (`scrub`) and let it go (`release`). */
  readonly grab: () => void;
  readonly scrub: (T: number) => void;
  readonly release: () => void;
  /** Select beat `beat` (none: close the inspector). */
  readonly select: (beat: Option.Option<string>) => void;
  /** Open version `v` (0: the open one). */
  readonly version: (v: number) => void;
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  /** Back to the whole film in the timeline's width (⇧Z). */
  readonly fit: () => void;
  /** Set the zoom as a factor over the fit (a phone's opening zoom). */
  readonly zoomTo: (zoom: number) => void;
  readonly retry: () => void;
}

interface StudioMeta {
  readonly film: string;
  readonly host: Host;
  readonly hub: Hub;
  /** The staged film's stage (its canvas), when the version shown is the film registry's. */
  readonly stage: Accessor<Option.Option<HTMLElement>>;
  /** The staged film itself, when the version shown is the film registry's: what sets a Board card as the Board does. */
  readonly drawn: Accessor<Option.Option<Film>>;
  /** A Board image's URL, from the version shown's own Board. */
  readonly boardUrl: (file: string) => string;
}

interface StudioContextValue {
  readonly state: StudioState;
  readonly actions: StudioActions;
  readonly meta: StudioMeta;
}

const StudioContext = createContext<StudioContextValue>();

/** The studio's context: only inside `<Studio.Root>`. */
export const useStudio = (): StudioContextValue => useContext(StudioContext);

const studioPlace = UrlAtom.place(Places.studio);

/** The studio's place value as the address holds it. */
type StudioValue = Place.Type<typeof Places.studio>;

/** The timeline a state holds. */
const timelineOf = (state: TimelineState): Option.Option<FilmTimeline> =>
  Match.value(state).pipe(
    Match.tag('Shown', (s) => Option.some(s.timeline)),
    Match.orElse(() => Option.none<FilmTimeline>()),
  );

/** The seconds an arrow moves the playhead: a frame, or a second with ⇧. */
const stepSeconds = (step: 'normal' | 'coarse' | 'fine'): number =>
  Bool.match(step === 'coarse', { onTrue: () => 1, onFalse: () => 1 / FILM_FPS });

/** A beat's line as it is spoken: its marks and cues out. */
const spokenOf = (beat: ScriptBeat): ScriptBeat =>
  Option.match(Option.fromUndefinedOr(beat.say), {
    onNone: () => beat,
    onSome: (say) =>
      Result.match(parse(beat.id, say), {
        onSuccess: (parsed) => ({ ...beat, say: parsed.spoken }),
        onFailure: () => beat,
      }),
  });

const Body = (
  props: ParentProps<{
    readonly film: string;
    readonly host: Host;
    readonly hub: Hub;
    readonly staged: Option.Option<StagedFilm>;
    readonly runtime: Atom.AtomRuntime<LabClient>;
    readonly timelineActor: TimelineActor;
    readonly transportActor: TransportActor;
  }>,
) => {
  const timelineAtom = ActorAtom.make(props.timelineActor);
  const transportAtom = ActorAtom.make(props.transportActor);
  const read = useAtomValue(() => timelineAtom);
  const sendTimeline = useAtomSet(() => timelineAtom);
  const transport = useAtomValue(() => transportAtom);
  const sendTransport = useAtomSet(() => transportAtom);
  const place = useAtomValue(() => studioPlace);
  const setPlace = useAtomSet(() => studioPlace);
  const address = addressOn(props.host);

  const timeline = createMemo(() => timelineOf(read()));
  // The last timeline shown, kept while another version is read or cannot be.
  const lastShown = createMemo((before): Option.Option<FilmTimeline> =>
    Option.orElse(timeline(), () => Option.flatten(Option.fromUndefinedOr(before))),
  );
  // The registry's film plays the version kept in the film's own files.
  const drawable = createMemo(
    () => Option.isSome(props.staged) && Option.exists(timeline(), keptInFilm),
  );
  const duration = () =>
    Option.getOrElse(
      Option.map(timeline(), (t) => t.duration),
      () => 0,
    );

  // The time the address opened on: its `#t=`, else the start of the beat it selects once read.
  const openedT = untrack(() => Option.flatMap(place(), (v) => v.hash.t));
  const openedBeat = untrack(() => Option.flatMap(place(), (v) => selectedBeat(v.query.sel)));
  const opened = Option.getOrElse(openedT, () => 0);
  let first = true;
  const [T, setT] = createSignal(opened, { ownedWrite: true });

  // `#t=`: followed every quarter second while it moves, at once as it settles or jumps.
  const writeT = (cause: 'play' | 'jump') =>
    Option.map(Place.decode(Places.studio, address.href()), (value: StudioValue) => {
      const href = Place.href(Places.studio, { ...value, hash: { t: Option.some(onTheMs(T())) } });
      return Match.value(cause).pipe(
        Match.when('jump', () => address.go(href)),
        Match.orElse(() => address.follow(href)),
      );
    });
  const inUrl = tInUrl(writeT, TIME_EVERY_MS, timersOn(props.host));

  // The clock: the staged film's while it can draw this version, else a silent one.
  let clock: StudioClock = silentClock(props.host, 0, opened);
  let stopMoves = (): void => {};
  let stopPlaying = (): void => {};
  const useClock = (next: StudioClock) => {
    stopMoves();
    stopPlaying();
    clock.close();
    clock = next;
    stopMoves = clock.onMove((at) => {
      setT(at);
      inUrl.moved();
    });
    stopPlaying = clock.onPlaying((on) => {
      sendTransport(
        Bool.match(on, {
          onTrue: () => TransportEvent.Played,
          onFalse: () => TransportEvent.Paused,
        }),
      );
      if (!on) inUrl.settled();
    });
    setT(clock.now());
  };
  // A new clock for each version shown: the staged film's when it can draw the version, else a silent one.
  createEffect(
    () =>
      Option.match(timeline(), {
        onNone: () => '',
        onSome: (t) => `${t.version.n}:${drawable()}`,
      }),
    (shown) => {
      if (shown === '') return;
      untrack(() => {
        const from = Bool.match(first && Option.isNone(openedT), {
          onTrue: () =>
            Option.getOrElse(
              Option.flatMap(openedBeat, (id) =>
                Option.flatMap(timeline(), (t) => Option.map(beatNamed(t, id), (b) => b.start)),
              ),
              () => T(),
            ),
          onFalse: () => T(),
        });
        first = false;
        useClock(
          Option.match(
            Option.filter(props.staged, () => drawable()),
            {
              onSome: (s) => playerClock(s.player),
              onNone: () => silentClock(props.host, duration(), from),
            },
          ),
        );
        if (clock.now() !== from) clock.seek(Math.min(from, duration()));
      });
    },
  );

  // The address's version: read again when it changes (Back to another version among them).
  createEffect(
    () => Option.map(place(), (v) => v.query.v),
    (v) => {
      Option.map(v, (n) => sendTimeline(TimelineEvent.Version({ v: n })));
    },
  );

  const selected = createMemo(() =>
    Option.flatMap(
      Option.flatMap(place(), (v) => selectedBeat(v.query.sel)),
      (id) => Option.flatMap(timeline(), (t) => beatNamed(t, id)),
    ),
  );
  const current = createMemo(() => Option.flatMap(timeline(), (t) => beatAt(t, T())));
  const picture = createMemo((): Picture =>
    Option.match(timeline(), {
      onNone: () => ({ _tag: 'Empty', beat: Option.none() }),
      onSome: (t) => pictureAt(t, T(), drawable()),
    }),
  );

  // The words of the film's registered script, read once a version kept there is shown.
  const scriptRead = props.runtime.atom(
    LabClient.use((client) => called(client.script.beats({ params: { film: props.film } }))),
  );
  const script = useAtomValue(() => scriptRead);
  const words = (beat: string): Option.Option<ScriptBeat> =>
    Option.flatMap(
      Option.filter(AsyncResult.value(script()), () => Option.exists(timeline(), keptInFilm)),
      (read) =>
        Option.map(
          Arr.findFirst(read.beats, (b) => b.id === beat),
          spokenOf,
        ),
    );

  const [zoom, setZoom] = createSignal(1, { ownedWrite: true });

  const playing = () => transport()._tag === 'Playing';
  const seek = (to: number) => {
    clock.seek(Math.min(Math.max(0, to), duration()));
    setT(clock.now());
    inUrl.jumped();
  };
  const withTimeline = (act: (t: FilmTimeline) => void) => Option.map(timeline(), act);
  const actions: StudioActions = {
    toggle: () =>
      Bool.match(clock.playing(), { onTrue: () => clock.pause(), onFalse: () => clock.play() }),
    play: () => clock.play(),
    pause: () => clock.pause(),
    seek,
    nudge: (seconds) => seek(clock.now() + seconds),
    stepBeat: (step) => withTimeline((t) => seek(beatStep(t, clock.now(), step))),
    toStart: () => seek(0),
    toEnd: () => seek(duration()),
    grab: () => {
      sendTransport(TransportEvent.Grab);
      clock.pause();
    },
    scrub: (to) => {
      clock.scrub(Math.min(Math.max(0, to), duration()));
      setT(clock.now());
    },
    release: () => {
      const resume = Match.value(transport()).pipe(
        Match.tag('Scrubbing', (s) => s.resume),
        Match.orElse(() => false),
      );
      sendTransport(TransportEvent.Release);
      clock.settle();
      inUrl.settled();
      if (resume) clock.play();
    },
    select: (beat) =>
      Option.map(Place.decode(Places.studio, address.href()), (value: StudioValue) => {
        // The playhead stays when it is in the beat; else it goes to the beat's start.
        Option.map(
          Option.flatMap(beat, (id) => Option.flatMap(timeline(), (t) => beatNamed(t, id))),
          (clip) => {
            const now = clock.now();
            if (now < clip.start || now >= clip.start + clip.dur) {
              clock.seek(clip.start);
              setT(clock.now());
            }
          },
        );
        // One entry: the selection and the playhead it leaves.
        setPlace({
          ...value,
          query: {
            ...value.query,
            sel: Option.getOrElse(Option.map(beat, beatSelection), () => ''),
          },
          hash: { t: Option.some(onTheMs(clock.now())) },
        });
      }),
    version: (v) =>
      Option.map(Place.decode(Places.studio, address.href()), (value: StudioValue) =>
        setPlace({ ...value, query: { ...value.query, v } }),
      ),
    zoomIn: () => setZoom((z) => zoomStep(z, 1)),
    zoomOut: () => setZoom((z) => zoomStep(z, -1)),
    fit: () => setZoom(1),
    zoomTo: (z) => setZoom(Math.max(1, z)),
    retry: () => sendTimeline(TimelineEvent.Retry),
  };

  // The keys: the editors' transport (Space, J K L, ← →, ↑ ↓, Home End) and ⇧Z.
  onSettled(() =>
    props.hub.commands.register(
      ...[
        {
          id: 'play.toggle',
          label: 'Play or pause',
          keys: ['space'],
          touch: 'the play key',
          act: actions.toggle,
        },
        { id: 'studio.play', label: 'Play', keys: ['l'], touch: 'the play key', act: actions.play },
        {
          id: 'studio.pause',
          label: 'Pause',
          keys: ['k'],
          touch: 'the play key',
          act: actions.pause,
        },
        {
          id: 'studio.back',
          label: 'Previous beat',
          keys: ['j', 'arrowup'],
          touch: 'the previous-beat key',
          act: () => actions.stepBeat(-1),
        },
        {
          id: 'studio.on',
          label: 'Next beat',
          keys: ['arrowdown'],
          touch: 'the next-beat key',
          act: () => actions.stepBeat(1),
        },
        {
          id: 'studio.start',
          label: 'To the start',
          keys: ['home'],
          touch: 'the to-start key',
          act: actions.toStart,
        },
        {
          id: 'studio.end',
          label: 'To the end',
          keys: ['end'],
          touch: 'the to-end key',
          act: actions.toEnd,
        },
        {
          id: 'studio.fit',
          label: 'Fit the film',
          keys: ['shift+z'],
          touch: 'Fit, in the timeline corner',
          act: actions.fit,
        },
        {
          id: 'studio.close',
          label: 'Close the inspector',
          keys: ['escape'],
          touch: 'the inspector’s ×',
          act: () => actions.select(Option.none()),
        },
      ].map(({ act, ...command }) => ({
        ...command,
        group: 'Studio',
        when: () => true,
        run: quietly(() => act()),
      })),
      {
        id: 'play.frame-next',
        label: 'A frame on',
        group: 'Studio',
        keys: ['arrowright'],
        stepped: true,
        touch: 'drag the playhead',
        when: () => true,
        run: quietly((_ctx, how) => actions.nudge(stepSeconds(how.step))),
      },
      {
        id: 'play.frame-previous',
        label: 'A frame back',
        group: 'Studio',
        keys: ['arrowleft'],
        stepped: true,
        touch: 'drag the playhead',
        when: () => true,
        run: quietly((_ctx, how) => actions.nudge(-stepSeconds(how.step))),
      },
    ),
  );
  onSettled(() => () => clock.close());

  const value: StudioContextValue = {
    state: {
      phase: () => read()._tag,
      timeline,
      why: () =>
        Match.value(read()).pipe(
          Match.tag('Unreadable', (u) => u.why),
          Match.orElse(() => ''),
        ),
      retryable: () =>
        Match.value(read()).pipe(
          Match.tag('Unreadable', (u) => !u.lasting),
          Match.orElse(() => false),
        ),
      asked: () => read().v,
      chip: () => versionChip(lastShown(), read().v),
      T,
      playing,
      selected,
      current,
      picture,
      zoom,
      words,
    },
    actions,
    meta: {
      film: props.film,
      host: props.host,
      hub: props.hub,
      stage: () =>
        Option.map(
          Option.filter(props.staged, () => drawable()),
          (s) => s.staged.stage,
        ),
      drawn: () =>
        Option.map(
          Option.filter(props.staged, () => drawable()),
          (s) => s.staged.film,
        ),
      boardUrl: (file) =>
        Option.match(
          Option.filter(timeline(), (t) => t.version.files === 'folder'),
          {
            onNone: () => boardFileUrl(props.film, file),
            onSome: (t) => boardFileUrl(props.film, file, Segment.make(`v${t.version.n}`)),
          },
        ),
    },
  };
  return <StudioContext value={value}>{props.children}</StudioContext>;
};

/**
 * The studio of film `film` over `host`, its keys on `hub`, its reads
 * through `client` (the page's one client of the lab's API), the film
 * `staged` when the film registry holds it: the state and actions of its
 * parts.
 */
export const Root = (
  props: ParentProps<{
    readonly film: string;
    readonly host: Host;
    readonly hub: Hub;
    readonly client: Layer.Layer<LabClient>;
    readonly staged: Option.Option<StagedFilm>;
  }>,
) => {
  const runtime = Atom.runtime(Layer.merge(props.client, hostLayer(props.host)));
  const first = Option.getOrElse(
    Option.map(Place.decode(Places.studio, addressOn(props.host).href()), (v) => v.query.v),
    () => 0,
  );
  // A refusal under 500 lasts (the version kept nothing, or is none of the film's); any other
  // failure can pass, so the page offers to read again.
  const read = (v: number) =>
    LabClient.use((client) =>
      called(
        client.timeline.read({
          params: { film: props.film },
          query: Option.match(
            Option.liftPredicate(v, (n) => n > 0),
            {
              onSome: (n) => ({ v: n }),
              onNone: () => ({}),
            },
          ),
        }),
      ).pipe(
        Effect.mapError((failure): ReadFailure => ({
          message: failure.message,
          lasting: isRefusal(failure) && statusOf(failure) < 500,
        })),
      ),
    );
  return (
    <Actor runtime={runtime} spawn={spawnTimeline(read, first)}>
      {(timelineActor) => (
        <Actor runtime={runtime} spawn={spawnTransport}>
          {(transportActor) => (
            <Body
              film={props.film}
              host={props.host}
              hub={props.hub}
              staged={props.staged}
              runtime={runtime}
              timelineActor={timelineActor}
              transportActor={transportActor}
            >
              {props.children}
            </Body>
          )}
        </Actor>
      )}
    </Actor>
  );
};
