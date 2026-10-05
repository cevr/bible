// The review's providers. `<Root>` holds the page: its runtime (the
// review's routes), where it is (read from and kept in the URL, so Back and a
// reload work), the index, the copy its videos play (the phone's 720p or the
// file) and the lightbox; the page's own commands (Refresh, the copy played,
// every place by its name for ⌘K). `<SetProvider>`
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
import { Place, UrlState } from '@bible/url-state';
import * as UrlAtom from '@bible/url-state/atom';
import { type JSX, Loading, Show, isServer } from '@solidjs/web';
import { Clock, Effect, Equal, Layer, Option, Schema } from 'effect';
import type { HttpClient } from 'effect/http';
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
  omit,
  onCleanup,
  sharedConfig,
  untrack,
  useContext,
} from 'solid-js';
import type { SeenPoint } from '../../core/choice.ts';
import type { Films } from '../../player/main.ts';
import { ReviewFilms, type ReviewFolder, ReviewIndex } from '../../core/review.ts';
import { Viewport } from '../../browser/viewport.ts';
import {
  type BrowserServices,
  type Host,
  addressOn,
  hostLayer,
  onTraverse,
} from '../../browser/host.ts';
import { type Command, type CommandId, quiet, said } from '../../command/command.ts';
import { goToCommands } from '../../command/go.ts';
import { registerWhile } from '../command/changes.ts';
import { type Context, selected } from '../../command/context.ts';
import type { Hub } from '../../command/hub.ts';
import type { LabClient, LabFailure } from '../api.ts';
import { served } from '../api.ts';
import { keptText } from '../../browser/storage.ts';
import { ViewerStore } from '../../browser/storage-browser.ts';
import { ReviewApi, reviewApiLayer } from './api.ts';
import type { Quality } from './format.ts';
import { OptionsApi, optionsApiLayer } from './options/api.ts';
import { Places, legacyPlace } from '../../core/api.ts';
import { onChoicesTab } from '../../core/point.ts';
import {
  type SyncActor,
  SyncEvent,
  type SyncState,
  ViewEvent,
  ViewState,
  otherOf,
  playsIn,
  spawnSync,
  spreadMoments,
  stepView,
  viewNameOf,
} from './machine.ts';
import {
  ReviewPlace,
  destinationsOf,
  historyOf,
  hrefOf,
  keptTime,
  placeOf,
  queryOfView,
  viewOf,
} from './place.ts';
import { PlayerKey, type SyncDriver, playerCommands, makeSync, playerEvent } from './sync.ts';
import { hearVersionCommands } from './hear.ts';

type Loaded<A> = Atom.Atom<AsyncResult.AsyncResult<A, LabFailure>>;

interface ReviewStateValue {
  readonly place: Accessor<ReviewPlace>;
  /** Every folder with something to review, as last read. */
  readonly index: Accessor<AsyncResult.AsyncResult<ReviewIndex, LabFailure>>;
  /** The app's films, each with options to pick from. */
  readonly films: Accessor<AsyncResult.AsyncResult<ReviewFilms, LabFailure>>;
  readonly quality: Accessor<Quality>;
  /** The image the lightbox shows, when it is open. */
  readonly lightbox: Accessor<Option.Option<string>>;
}

interface ReviewActions {
  /** Go to `place`, as a link does (Back returns). */
  readonly go: (place: ReviewPlace) => void;
  /** Walk the roots again now. */
  readonly refresh: () => void;
  readonly quality: (quality: Quality) => void;
  /** Open the lightbox on an image, or close it. */
  readonly show: (src: Option.Option<string>) => void;
}

interface ReviewMeta {
  /** A video's length, read once per ref. */
  readonly duration: (ref: string) => Loaded<number>;
  /** A doc's text, read once per ref. */
  readonly text: (ref: string) => Loaded<string>;
  readonly runtime: Atom.AtomRuntime<ReviewApi | OptionsApi | BrowserServices>;
  /** The page's one client of the lab's API: what a read of its own (a feed) goes through. */
  readonly client: Layer.Layer<LabClient | HttpClient.HttpClient>;
  /** The page's host (`browser/host.ts`): what the page's own effects run with. */
  readonly host: Host;
  /** The page's commands (`command/hub.ts`): each player registers its transport here while it is mounted. */
  readonly hub: Hub;
  /** Now, in ms, on the host's `Clock`: what a card's age is counted from. */
  readonly now: () => number;
  /**
   * The app's films, each loaded on demand (`player/main.ts`'s `Films`): what
   * a film's Project draws its scenes' stills from. A film not here has none.
   */
  readonly films: Films;
}

interface ReviewContextValue {
  readonly state: ReviewStateValue;
  readonly actions: ReviewActions;
  readonly meta: ReviewMeta;
}

const ReviewContext = createContext<ReviewContextValue>();

/** The review's context: only inside `<Root>`. */
export const useReview = (): ReviewContextValue => useContext(ReviewContext);

/** Whether a click is the page's to take: a plain primary click. A modified one (a new tab or window, a download) is the browser's. */
export const plainClick = (e: MouseEvent) =>
  e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

/**
 * The review's one link to a place: a plain click goes there in the page
 * itself (so the player's state lives); a modified click is left to the
 * browser, which opens the place's URL in a tab. Any other attribute is the
 * anchor's.
 */
export const Go = (
  props: Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'> & {
    readonly place: ReviewPlace;
    readonly children: JSX.Element;
  },
) => {
  const { actions } = useReview();
  const attrs = omit(props, 'place', 'children');
  return (
    <a
      {...attrs}
      href={hrefOf(props.place)}
      onClick={(e) => {
        if (!plainClick(e)) return;
        e.preventDefault();
        actions.go(props.place);
      }}
    >
      {props.children}
    </a>
  );
};

/**
 * The page's choices kept between visits, as plain text in this browser's
 * store (a browser that keeps nothing forgets them with the page).
 */
const kept = {
  quality: keptText(ViewerStore, 'film-review.quality'),
};

/** A narrow screen, which plays the 720p copy unless the viewer kept another. */
const NARROW = '(max-width: 900px)';

/** The copy the page plays: the kept one, else 720p on a narrow screen. */
const qualityOf = (stored: Option.Option<string>, narrow: () => boolean): Quality =>
  Option.getOrElse(
    Option.filter(stored, (q): q is Quality => q === 'phone' || q === 'full'),
    (): Quality => {
      if (narrow()) return 'phone';
      return 'full';
    },
  );

/**
 * The copy a page rendered on the server plays, and the client while it
 * hydrates (a viewer's kept copy and their screen are their browser's): the
 * phone's, as the studio is designed for first (`Viewport.layerPhone`).
 */
const SERVED_QUALITY: Quality = 'phone';

/** The time a page was rendered at, by the server, sent with it: what its cards' ages are counted from while it hydrates. */
const SERVED_AT = 'review.served-at';

/** The review page: its runtime, place, index and choices, around `children`. */
export const Root = (
  props: ParentProps<{
    readonly host: Host;
    readonly hub: Hub;
    readonly films: Films;
    /**
     * The page's one client of the lab's API (`LabClient.layer` in the
     * browser, `LabClient.layerRendering` for a render on the server).
     */
    readonly client: Layer.Layer<LabClient | HttpClient.HttpClient>;
  }>,
) => {
  // One client of the lab's API for the page: the review's and the choices'
  // routes both go through it.
  const runtime = Atom.runtime(
    Layer.mergeAll(reviewApiLayer, optionsApiLayer, hostLayer(props.host)).pipe(
      Layer.provide(props.client),
    ),
  );
  // The page's reads are the server's when it renders the page: sent with it,
  // and adopted by the client, which reads none of them again (`served`).
  const filmsAtom = runtime
    .atom(OptionsApi.use((api) => api.films))
    .pipe(served('review.films', ReviewFilms));
  // A refresh asks the server to walk its roots again; a first read takes its cache.
  let fresh = false;
  const indexAtom = runtime
    .atom(
      ReviewApi.use((api) =>
        Effect.suspend(() => {
          const asked = fresh;
          fresh = false;
          return api.index(asked);
        }),
      ),
    )
    .pipe(served('review.index', ReviewIndex));
  const duration = Atom.family((ref: string) =>
    runtime
      .atom(ReviewApi.use((api) => api.duration(ref)))
      .pipe(served(`review.duration:${ref}`, Schema.Finite)),
  );
  const text = Atom.family((ref: string) =>
    runtime
      .atom(ReviewApi.use((api) => api.text(ref)))
      .pipe(served(`review.text:${ref}`, Schema.String)),
  );
  const servedAtAtom = Atom.make(Clock.currentTimeMillis).pipe(served(SERVED_AT, Schema.Finite));

  const address = addressOn(props.host);

  const [lightbox, setLightbox] = createSignal(Option.none<string>());
  // Escape closes the lightbox while it is open, from a field too.
  onCleanup(
    props.hub.commands.register({
      id: 'review.close-image',
      label: 'Close the image',
      group: 'Review',
      keys: ['escape'],
      keysIn: ['page', 'field'],
      touch: 'tap the image',
      when: () => Option.isSome(lightbox()),
      run: () =>
        Effect.sync(() => {
          setLightbox(Option.none());
          return quiet;
        }),
    }),
  );

  const Inner = (inner: ParentProps) => {
    // Where the page is: its URL, as the host's `UrlState` leaves it (a
    // write, or Back and Forward landing).
    const href = useAtomValue(() => UrlAtom.href);
    // A new href that names the same place (a view, a time) is the same
    // place: the page under it stays, so its players play on.
    const place = createMemo(() => placeOf(href()), { equals: Equal.equals });
    // An old link (`/?folder=`, `/?project=`, …) the page lands on without a
    // load (Back onto an entry the page wrote before places had paths) goes
    // on to its place; the server sends a loaded one there itself.
    createEffect(
      () => legacyPlace(href()),
      (moved) => {
        Option.map(moved, address.replace);
      },
    );
    const index = useAtomValue(() => indexAtom);
    const refreshIndex = useAtomRefresh(() => indexAtom);
    const films = useAtomValue(() => filmsAtom);
    const keptQuality = useAtomValue(() => kept.quality);
    const keepQuality = useAtomSet(() => kept.quality);
    const narrow = () => Effect.runSyncWith(props.host)(Viewport.use((v) => v.matches(NARROW)));
    // The viewer's copy once the page is the client's; the phone's until then.
    const quality = createMemo(() => qualityOf(keptQuality(), narrow), {
      ssrSource: 'client',
      loadingValue: SERVED_QUALITY,
    });
    const servedAt = useAtomValue(() => servedAtAtom);
    const clockNow = () => Effect.runSyncWith(props.host)(Clock.currentTimeMillis);
    const value: ReviewContextValue = {
      state: { place, index, films, quality, lightbox },
      actions: {
        go: (next) => {
          address.push(hrefOf(next));
          window.scrollTo(0, 0);
        },
        refresh: () => {
          fresh = true;
          refreshIndex();
        },
        quality: keepQuality,
        show: setLightbox,
      },
      meta: {
        duration,
        text,
        runtime,
        client: props.client,
        host: props.host,
        hub: props.hub,
        // The server's render and the client's hydration count from the time
        // the page was rendered, so both say the same; the client's later
        // renders count from its own clock.
        now: () => {
          if (!isServer && !sharedConfig.hydrating) return clockNow();
          return Option.getOrElse(AsyncResult.value(untrack(servedAt)), clockNow);
        },
        films: props.films,
      },
    };
    onCleanup(
      props.hub.commands.register(...openCommands(value.actions.go, place), ...pageCommands(value)),
    );
    // Every folder, set and film's page is a place ⌘K goes to by its name.
    registerWhile(props.hub, () =>
      goToCommands(
        destinationsOf(AsyncResult.value(index()), AsyncResult.value(films()), value.actions.go),
      ),
    );
    return <ReviewContext value={value}>{inner.children}</ReviewContext>;
  };

  // The registry's URL atoms read and write through the host's own `UrlState`,
  // so they and the page's effects share one address bar. Their `Location`
  // layer is the host's too: the registry still reads `services` once under
  // its seed, and the default layer would build the browser's own (none on
  // the server, a second one in the browser).
  return (
    <RegistryProvider
      initialValues={[
        [UrlAtom.layer, hostLayer(props.host)],
        [UrlAtom.services, props.host],
      ]}
    >
      <Inner>{props.children}</Inner>
    </RegistryProvider>
  );
};

/** Open on Choices: a choice off the Choices tab, opened there at its card (UR-65). */
export const OPEN_ON_CHOICES: CommandId = 'review.open-on-choices';

/**
 * The review's ways into a thing from its context menu (and ⌘K, while the
 * page selects it): a folder or a set opens in the page; a film's parts
 * open from its card through the studio shell's `filmCommands`; a choice
 * off the Choices tab (a project's card, a scene's Choices in this scene)
 * opens on Choices at its card (UR-65).
 */
const openCommands = (
  go: (place: ReviewPlace) => void,
  here: Accessor<ReviewPlace>,
): ReadonlyArray<Command> => {
  const opening = (
    id: string,
    label: string,
    about: ReadonlyArray<'Folder' | 'Set' | 'Point'>,
    placeOfTarget: (ctx: Context) => Option.Option<() => void>,
  ): Command => ({
    id,
    label,
    group: 'Open',
    about,
    touch: `long-press it, then ${label}`,
    when: (ctx) => Option.isSome(placeOfTarget(ctx)),
    run: (ctx) =>
      Effect.sync(() => {
        Option.map(placeOfTarget(ctx), (open) => open());
        return quiet;
      }),
  });
  return [
    opening('review.open-folder', 'Open the folder', ['Folder'], (ctx) =>
      Option.map(
        selected(ctx, 'Folder'),
        (f) => () => go(ReviewPlace.Folder({ folder: f.folder })),
      ),
    ),
    opening('review.open-set', 'Open the set', ['Set'], (ctx) =>
      Option.map(
        selected(ctx, 'Set'),
        (s) => () => go(ReviewPlace.Set({ folder: s.folder, point: s.point })),
      ),
    ),
    opening(OPEN_ON_CHOICES, 'Open on Choices', ['Point'], (ctx) =>
      Option.map(
        Option.filter(
          selected(ctx, 'Point'),
          (p) => onChoicesTab(p.point) && here()._tag !== 'Film',
        ),
        (p) => () => go(ReviewPlace.Film({ film: p.film, point: p.point })),
      ),
    ),
  ];
};

/** What the copy-played command does next, by the copy played now. */
const OTHER_QUALITY: Readonly<Record<Quality, Quality>> = { phone: 'full', full: 'phone' };
const QUALITY_LABEL: Readonly<Record<Quality, string>> = {
  phone: 'Play the originals',
  full: 'Play the proxies',
};
const QUALITY_SAID: Readonly<Record<Quality, string>> = {
  phone: 'Playing the proxies (720p copies)',
  full: 'Playing the originals',
};

/**
 * The review's page-wide commands, in ⌘K and the page's long-press menu
 * (UR-5, UR-6): Refresh walks the roots again; the copy played switches
 * between the Proxy (a 720p copy, made for big videos) and the Original, a
 * per-viewer setting kept in this browser.
 */
const pageCommands = (review: ReviewContextValue): ReadonlyArray<Command> => [
  {
    id: 'review.refresh',
    label: 'Refresh',
    group: 'View',
    about: ['Page'],
    touch: 'long-press the page, then Refresh',
    when: () => true,
    run: () =>
      Effect.sync(() => {
        review.actions.refresh();
        return quiet;
      }),
  },
  {
    id: 'review.quality',
    label: 'Playback: Proxy or Original',
    labelIn: () => QUALITY_LABEL[review.state.quality()],
    group: 'View',
    about: ['Page'],
    touch: 'long-press the page, then Play the originals',
    when: () => review.state.place()._tag !== 'Home',
    run: () =>
      Effect.sync(() => {
        const next = OTHER_QUALITY[review.state.quality()];
        review.actions.quality(next);
        return said(QUALITY_SAID[next]);
      }),
  },
];

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

const unmeasured = Atom.make(AsyncResult.initial<number, LabFailure>());

/** The set's place in the URL: its path, its view in the query, the player's time in the hash. */
const setPlace = UrlAtom.place(Places.set);

const SetBody = (
  props: ParentProps<{
    readonly folder: ReviewFolder;
    readonly set: SeenPoint;
    readonly sync: SyncActor;
  }>,
) => {
  const { meta } = useReview();
  const syncAtom = ActorAtom.make(props.sync);
  const sync = useAtomValue(() => syncAtom);
  const sendSync = useAtomSet(() => syncAtom);
  const ids = props.set.variants.map((v) => v.id);
  const first = Option.getOrElse(Option.fromUndefinedOr(ids[0]), () => '');
  const other = Option.fromUndefinedOr(ids[1]);

  const driver = makeSync(first, sendSync, meta.host);
  onCleanup(driver.stop);
  createEffect(sync, (state) => driver.apply(state));

  // The view is the URL's: a link, a reload, Back and Forward all show what
  // it keeps. A choice of view or of a moment is a new history entry (Back
  // undoes it); cycling the pair's other and a ←/→ step through the moments
  // are not.
  const at = useAtomValue(() => setPlace);
  const view = createMemo(
    () =>
      viewOf(
        Option.match(at(), { onSome: (v) => v.query, onNone: () => queryOfView(ViewState.All) }),
        ids,
      ),
    // The time moving on is no new view.
    { equals: Equal.equals },
  );
  const address = addressOn(meta.host);
  const sendView = (event: ViewEvent) =>
    Option.map(at(), (v) =>
      address[historyOf(event)](
        Place.href(Places.set, {
          ...v,
          query: { ...v.query, ...queryOfView(stepView(view(), other, event)) },
        }),
      ),
    );
  // A link asking for what the set cannot show (a pair on a set of one, an
  // other it does not hold) shows what `viewOf` makes of it, and the URL is
  // corrected to say so, in the same entry.
  createEffect(
    () =>
      Option.map(at(), (v) =>
        Place.href(Places.set, { ...v, query: { ...v.query, ...queryOfView(view()) } }),
      ),
    (shown) => {
      Option.map(shown, address.replace);
    },
  );
  // The player's time is kept in the hash (`#t=`, throttled), so a link
  // opens the set where it was; Back or Forward landing on this set's entry
  // moves the player to the time that entry keeps, as it shows its view.
  createEffect(
    () => keptTime(sync().t, props.set.start),
    (t) =>
      Effect.runSyncWith(meta.host)(UrlState.update(Places.set, (v) => ({ ...v, hash: { t } }))),
  );
  onCleanup(
    onTraverse(meta.host, (href) =>
      Option.map(
        Option.filter(
          Place.decode(Places.set, href),
          (v) => v.path.folder === props.folder.ref && v.path.point === props.set.id,
        ),
        (v) => sendSync(SyncEvent.Landed({ t: Option.getOrElse(v.hash.t, () => props.set.start) })),
      ),
    ),
  );
  // Nothing plays behind the moments, the difference or the notes; a pair (or
  // its wipe) hears one of its two.
  createEffect(
    () => [view(), sync().audible] as const,
    ([state, audible]) => {
      if (!playsIn(viewNameOf(state))) sendSync(SyncEvent.PausePressed);
      if (Option.exists(otherOf(state), (o) => audible !== first && audible !== o))
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

  // The moments (and the difference at a moment) step on ←/→; the playing views take the player's transport.
  onCleanup(
    meta.hub.commands.register(
      ...playerCommands((key) => {
        const name = viewNameOf(view());
        if (name === 'moments' || name === 'diff')
          return PlayerKey.$match(key, {
            Toggle: () => Option.none<() => void>(),
            Step: ({ by }) =>
              Option.map(
                moments(),
                (m) => () => sendView(ViewEvent.MomentStepped({ by, count: m.length })),
              ),
          });
        if (!playsIn(name)) return Option.none();
        return Option.some(() => sendSync(playerEvent(key)));
      }),
    ),
  );
  // Whether version `id` can be heard in the view shown: it plays, and a pair (or its wipe) holds it.
  const hearable = (id: string): boolean => {
    const shown = view();
    if (!playsIn(viewNameOf(shown))) return false;
    return Option.match(otherOf(shown), {
      onNone: () => true,
      onSome: (o) => id === first || id === o,
    });
  };
  // A version of this set heard alone, from its context menu (as its 🔊 does).
  const versionHere = (ctx: Context) =>
    Option.filter(
      selected(ctx, 'Version'),
      (v) =>
        v.folder === props.folder.ref &&
        v.point === props.set.id &&
        v.version !== sync().audible &&
        hearable(v.version),
    );
  onCleanup(
    meta.hub.commands.register(
      ...hearVersionCommands({
        versions: props.set.variants,
        heard: () => sync().audible,
        hearable,
        hear: (id) => sendSync(SyncEvent.HeardChosen({ id })),
      }),
    ),
  );
  onCleanup(
    meta.hub.commands.register({
      id: 'set.hear',
      label: 'Hear this version',
      group: 'Review',
      about: ['Version'],
      touch: 'long-press a version, then Hear this version (or tap its 🔊)',
      when: (ctx) => Option.isSome(versionHere(ctx)),
      run: (ctx) =>
        Effect.sync(() => {
          Option.map(versionHere(ctx), (v) => sendSync(SyncEvent.HeardChosen({ id: v.version })));
          return quiet;
        }),
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
    readonly sync: Atom.Atom<AsyncResult.AsyncResult<SyncActor, never>>;
  }>,
) => {
  const sync = useAtomSuspense(() => props.sync);
  return (
    <Show when={sync()} keyed>
      {(actor: SyncActor) => (
        <SetBody folder={props.folder} set={props.set} sync={actor}>
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
  const first = Option.getOrElse(
    Option.map(Option.fromUndefinedOr(props.set.variants[0]), (v) => v.id),
    () => '',
  );
  // The player opens where the URL's `#t=` says, else at the set's start.
  const at = Option.getOrElse(
    Option.flatMap(Effect.runSyncWith(meta.host)(UrlState.get(Places.set)), (v) => v.hash.t),
    () => props.set.start,
  );
  const sync = meta.runtime.atom(Machine.scoped(spawnSync(first, props.set.start, at)));
  return (
    <Loading>
      <SetReady folder={props.folder} set={props.set} sync={sync}>
        {props.children}
      </SetReady>
    </Loading>
  );
};
