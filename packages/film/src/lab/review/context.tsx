// The review's providers. `<Root>` holds the page: its runtime (the
// review's routes), where it is (read from and kept in the URL, so Back and a
// reload work), the index, the copy its videos play (the phone's 720p or the
// file), the home page's filter and the lightbox. `<SetProvider>`
// holds one comparison set: its two machines (the synced player and the
// view, spawned on the runtime and stopped with the set), the driver that
// makes its videos follow the player, and its moments.

import {
  RegistryProvider,
  useAtomRefresh,
  useAtomSet,
  useAtomSuspense,
  useAtomValue,
} from '@bible/atom-solid';
import { Loading, Show } from '@solidjs/web';
import { Clock, Effect, Layer, Option, Result } from 'effect';
import { Machine } from 'effect-machine';
import * as ActorAtom from 'effect-machine/atom';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import * as Atom from 'effect/reactivity/Atom';
import type { Accessor, ParentProps } from 'solid-js';
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  useContext,
} from 'solid-js';
import type { SeenPoint } from '../../core/choice.ts';
import type { ReviewFilms, ReviewFolder, ReviewIndex } from '../../core/review.ts';
import { type BrowserServices, type Host, hostLayer } from '../../browser/host.ts';
import type { LabFailure } from '../api.ts';
import { localStore } from '../studio/mic-choice.ts';
import { ReviewApi, reviewApiLayer } from './api.ts';
import type { Quality } from './format.ts';
import { OptionsApi, optionsApiLayer } from './options/api.ts';
import {
  type SyncActor,
  SyncEvent,
  type SyncState,
  type ViewActor,
  ViewEvent,
  type ViewState,
  playsIn,
  spawnSync,
  spawnView,
  spreadMoments,
  viewNameOf,
} from './machine.ts';
import { type ReviewPlace, placeOf, searchOf, searchWithView, viewOf } from './place.ts';
import { PlayerKey, type SyncDriver, listenPlayerKeys, makeSync, playerEvent } from './sync.ts';

type Loaded<A> = Atom.Atom<AsyncResult.AsyncResult<A, LabFailure>>;

interface ReviewStateValue {
  readonly place: Accessor<ReviewPlace>;
  /** Every folder with something to review, as last read. */
  readonly index: Accessor<AsyncResult.AsyncResult<ReviewIndex, LabFailure>>;
  /** The app's films, each with options to pick from. */
  readonly films: Accessor<AsyncResult.AsyncResult<ReviewFilms, LabFailure>>;
  readonly quality: Accessor<Quality>;
  /** What the home page's filter holds. */
  readonly filter: Accessor<string>;
  /** The image the lightbox shows, when it is open. */
  readonly lightbox: Accessor<Option.Option<string>>;
}

interface ReviewActions {
  /** Go to `place`, as a link does (Back returns). */
  readonly go: (place: ReviewPlace) => void;
  /** Walk the roots again now. */
  readonly refresh: () => void;
  readonly quality: (quality: Quality) => void;
  readonly filter: (text: string) => void;
  /** Open the lightbox on an image, or close it. */
  readonly show: (src: Option.Option<string>) => void;
}

interface ReviewMeta {
  /** A video's length, read once per ref. */
  readonly duration: (ref: string) => Loaded<number>;
  /** A doc's text, read once per ref. */
  readonly text: (ref: string) => Loaded<string>;
  readonly runtime: Atom.AtomRuntime<ReviewApi | OptionsApi | BrowserServices>;
  /** The page's host (`browser/host.ts`): what the page's own effects run with. */
  readonly host: Host;
  /** Now, in ms: what a card's age is counted from. */
  readonly now: () => number;
}

interface ReviewContextValue {
  readonly state: ReviewStateValue;
  readonly actions: ReviewActions;
  readonly meta: ReviewMeta;
}

const ReviewContext = createContext<ReviewContextValue>();

/** The review's context: only inside `<Root>`. */
export const useReview = (): ReviewContextValue => useContext(ReviewContext);

/** Where the page keeps its choices between visits. */
const KEPT = { quality: 'film-review.quality', filter: 'film-review.filter' } as const;

/** `run`'s value, or none when it throws (storage a private window or a full quota refuses). */
const attempt = <A,>(run: () => A): Option.Option<A> => Result.getSuccess(Result.try(run));

/** A kept choice, when the browser keeps any. */
const kept = (key: string): Option.Option<string> =>
  Option.flatMap(
    Option.flatMap(localStore(), (s) => attempt(() => s.getItem(key))),
    Option.fromNullishOr,
  );

/** Keep a choice; a browser that keeps nothing forgets it with the page. */
const keep = (key: string, value: string) =>
  Option.map(localStore(), (s) => attempt(() => s.setItem(key, value)));

/** The copy the page plays first: the kept one, else 720p on a narrow screen. */
const firstQuality = (): Quality =>
  Option.getOrElse(
    Option.filter(kept(KEPT.quality), (q): q is Quality => q === 'phone' || q === 'full'),
    (): Quality => {
      if (matchMedia('(max-width: 900px)').matches) return 'phone';
      return 'full';
    },
  );

/** The review page: its runtime, place, index and choices, around `children`. */
export const Root = (props: ParentProps<{ readonly origin: string; readonly host: Host }>) => {
  const runtime = Atom.runtime(
    Layer.mergeAll(
      reviewApiLayer(props.origin),
      optionsApiLayer(props.origin),
      hostLayer(props.host),
    ),
  );
  const filmsAtom = runtime.atom(OptionsApi.use((api) => api.films));
  // A refresh asks the server to walk its roots again; a first read takes its cache.
  let fresh = false;
  const indexAtom = runtime.atom(
    ReviewApi.use((api) =>
      Effect.suspend(() => {
        const asked = fresh;
        fresh = false;
        return api.index(asked);
      }),
    ),
  );
  const duration = Atom.family((ref: string) =>
    runtime.atom(ReviewApi.use((api) => api.duration(ref))),
  );
  const text = Atom.family((ref: string) => runtime.atom(ReviewApi.use((api) => api.text(ref))));

  const [place, setPlace] = createSignal(placeOf(location.search));
  const onPop = () => setPlace(placeOf(location.search));
  window.addEventListener('popstate', onPop);
  onCleanup(() => window.removeEventListener('popstate', onPop));

  const [quality, setQuality] = createSignal(firstQuality());
  const [filter, setFilter] = createSignal(Option.getOrElse(kept(KEPT.filter), () => ''));
  const [lightbox, setLightbox] = createSignal(Option.none<string>());
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') setLightbox(Option.none());
  };
  document.addEventListener('keydown', onKey);
  onCleanup(() => document.removeEventListener('keydown', onKey));

  const Inner = (inner: ParentProps) => {
    const index = useAtomValue(() => indexAtom);
    const refreshIndex = useAtomRefresh(() => indexAtom);
    const films = useAtomValue(() => filmsAtom);
    const value: ReviewContextValue = {
      state: { place, index, films, quality, filter, lightbox },
      actions: {
        go: (next) => {
          const search = searchOf(next);
          history.pushState(history.state, '', `${location.pathname}${search}`);
          setPlace(next);
          window.scrollTo(0, 0);
        },
        refresh: () => {
          fresh = true;
          refreshIndex();
        },
        quality: (q) => {
          keep(KEPT.quality, q);
          setQuality(q);
        },
        filter: (t) => {
          keep(KEPT.filter, t);
          setFilter(t);
        },
        show: setLightbox,
      },
      meta: {
        duration,
        text,
        runtime,
        host: props.host,
        now: () => Effect.runSync(Clock.currentTimeMillis),
      },
    };
    return <ReviewContext value={value}>{inner.children}</ReviewContext>;
  };

  return (
    <RegistryProvider>
      <Inner>{props.children}</Inner>
    </RegistryProvider>
  );
};

// ---------------------------------------------------------------------------
// One comparison set

interface SetContextValue {
  readonly folder: ReviewFolder;
  readonly set: SeenPoint;
  /** The synced player's state. */
  readonly sync: Accessor<SyncState>;
  readonly view: Accessor<ViewState>;
  /** The instants the moments show: the set's own, else five spread over its first video once its length is read. */
  readonly moments: Accessor<Option.Option<ReadonlyArray<number>>>;
  /** Where each card's video joins the player. */
  readonly driver: SyncDriver;
  readonly send: {
    readonly sync: (event: SyncEvent) => void;
    readonly view: (event: ViewEvent) => void;
  };
}

const SetContext = createContext<SetContextValue>();

/** A set's context: only inside `<SetProvider>`. */
export const useSet = (): SetContextValue => useContext(SetContext);

interface SetActors {
  readonly sync: SyncActor;
  readonly view: ViewActor;
}

const unmeasured = Atom.make(AsyncResult.initial<number, LabFailure>());

const SetBody = (
  props: ParentProps<{
    readonly folder: ReviewFolder;
    readonly set: SeenPoint;
    readonly actors: SetActors;
  }>,
) => {
  const { meta } = useReview();
  const syncAtom = ActorAtom.make(props.actors.sync);
  const viewAtom = ActorAtom.make(props.actors.view);
  const sync = useAtomValue(() => syncAtom);
  const sendSync = useAtomSet(() => syncAtom);
  const view = useAtomValue(() => viewAtom);
  const sendView = useAtomSet(() => viewAtom);
  const ids = props.set.variants.map((v) => v.id);
  const first = Option.getOrElse(Option.fromUndefinedOr(ids[0]), () => '');

  const driver = makeSync(first, sendSync);
  onCleanup(driver.stop);
  createEffect(sync, (state) => driver.apply(state));

  // The view kept in the URL, so a reload or a link opens it again.
  createEffect(view, (state) => {
    history.replaceState(
      history.state,
      '',
      `${location.pathname}${searchWithView(location.search, state)}${location.hash}`,
    );
  });
  // Nothing plays behind the moments or the notes; a pair hears one of its two.
  createEffect(
    () => [view(), sync().audible] as const,
    ([state, audible]) => {
      if (!playsIn(viewNameOf(state))) sendSync(SyncEvent.PausePressed);
      if (state._tag === 'Pair' && audible !== first && audible !== state.other)
        sendSync(SyncEvent.HeardChosen({ id: first }));
    },
  );

  const length = useAtomValue(() => {
    if (Option.isSome(props.set.moments)) return unmeasured;
    return meta.duration(
      Option.getOrElse(
        Option.map(Option.fromUndefinedOr(props.set.variants[0]), (v) => v.video.ref),
        () => '',
      ),
    );
  });
  const moments = createMemo(() =>
    Option.orElse(props.set.moments, () =>
      Option.map(AsyncResult.value(length()), (seconds) => spreadMoments(seconds, props.set.start)),
    ),
  );

  // The moments step on ←/→; the playing views hear the player's keys.
  onCleanup(
    listenPlayerKeys((key) => {
      const name = viewNameOf(view());
      if (name === 'moments')
        return PlayerKey.$match(key, {
          Toggle: () => false,
          Step: ({ by }) =>
            Option.match(moments(), {
              onNone: () => false,
              onSome: (m) => {
                sendView(ViewEvent.MomentStepped({ by, count: m.length }));
                return true;
              },
            }),
        });
      if (!playsIn(name)) return false;
      sendSync(playerEvent(key));
      return true;
    }),
  );

  const value: SetContextValue = {
    folder: props.folder,
    set: props.set,
    sync,
    view,
    moments,
    driver,
    send: { sync: sendSync, view: sendView },
  };
  return <SetContext value={value}>{props.children}</SetContext>;
};

const SetReady = (
  props: ParentProps<{
    readonly folder: ReviewFolder;
    readonly set: SeenPoint;
    readonly actors: Atom.Atom<AsyncResult.AsyncResult<SetActors, never>>;
  }>,
) => {
  const actors = useAtomSuspense(() => props.actors);
  return (
    <Show when={actors()} keyed>
      {(a: SetActors) => (
        <SetBody folder={props.folder} set={props.set} actors={a}>
          {props.children}
        </SetBody>
      )}
    </Show>
  );
};

/** One version stack's player, view and moments, for its page; a stack of one has no side by side. */
export const SetProvider = (
  props: ParentProps<{ readonly folder: ReviewFolder; readonly set: SeenPoint }>,
) => {
  const { meta } = useReview();
  const ids = props.set.variants.map((v) => v.id);
  const first = Option.getOrElse(Option.fromUndefinedOr(ids[0]), () => '');
  const initial = viewOf(location.search, ids);
  const other = Option.fromUndefinedOr(ids[1]);
  const actors = meta.runtime.atom(
    Machine.scoped(
      Effect.all({
        sync: spawnSync(first, props.set.start),
        view: spawnView(initial, other),
      }),
    ),
  );
  return (
    <Loading>
      <SetReady folder={props.folder} set={props.set} actors={actors}>
        {props.children}
      </SetReady>
    </Loading>
  );
};
