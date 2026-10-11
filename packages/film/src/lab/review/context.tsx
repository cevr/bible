// The review's providers. `<Root>` holds the page: its runtime (the
// review's routes), where it is (read from and kept in the URL, so Back and a
// reload work), the index, the copy its videos play (the phone's 720p or the
// file); the page's own commands (Refresh, the copy played,
// every place by its name for ⌘K). `<SetProvider>`
// holds one comparison set: its two machines (the synced player and the
// view, spawned on the runtime and stopped with the set), the driver that
// makes its videos follow the player, and its moments.

import {
  RegistryProvider,
  useAtomMount,
  useAtomRefresh,
  useAtomSet,
  useAtomValue,
  useRegistry,
} from '@bible/atom-solid';
import { Place, UrlState } from '@bible/url-state';
import * as UrlAtom from '@bible/url-state/atom';
import { type JSX, isServer } from '@solidjs/web';
import { Array as Arr, Clock, Effect, Equal, Exit, Function, Layer, Option, Schema } from 'effect';
import type { HttpClient } from 'effect/http';
import * as ActorAtom from 'effect-machine/atom';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import * as Atom from 'effect/reactivity/Atom';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import type { Accessor, ParentProps } from 'solid-js';
import {
  createContext,
  createEffect,
  createMemo,
  isHydrating,
  omit,
  onCleanup,
  untrack,
  useContext,
} from 'solid-js';
import { type SeenPoint, seenVariants } from '../../core/choice.ts';
import type { DrawStills } from './options/stills.tsx';
import {
  ReviewDuration,
  type ReviewFile,
  ReviewFilms,
  type ReviewFolder,
  ReviewIndex,
} from '../../core/review.ts';
import { Viewport } from '../../browser/viewport.ts';
import { plainClick } from '../../browser/pointer.ts';
import { PHONE } from '../viewport.ts';
import {
  type BrowserServices,
  type Host,
  addressOn,
  hostLayer,
  onTraverse,
} from '../../browser/host.ts';
import { type Command, type CommandId, quiet, quietly, said } from '../../command/command.ts';
import { goToCommands } from '../../command/go.ts';
import { registerWhile } from '../command/changes.ts';
import { type Context, selected } from '../../command/context.ts';
import type { Hub } from '../../command/hub.ts';
import { Actor } from '../actor.tsx';
import type { LabClient, LabFailure } from '../api.ts';
import { served } from '../api.ts';
import { keptText } from '../../browser/storage.ts';
import { ViewerStore } from '../../browser/storage-browser.ts';
import { ReviewApi, reviewApiLayer } from './api.ts';
import { type Quality, fileInfoText, videoSource } from './format.ts';
import { OptionsApi, optionsApiLayer } from './options/api.ts';
import { Places, ProjectView, legacyPlace, pageHref, reviewFileUrl } from '../../core/api.ts';
import { FILM_FPS } from '../../core/time.ts';
import { onChoicesTab } from '../../core/point.ts';
import {
  type SyncActor,
  SyncEvent,
  type SyncState,
  ViewEvent,
  ViewState,
  modesOf,
  nextLayout,
  nextModeView,
  otherOf,
  playsIn,
  spawnSync,
  spreadMoments,
  stepView,
  viewNameOf,
} from './machine.ts';
import {
  ReviewPlace,
  causeOf,
  destinationsOf,
  hrefOf,
  keptTime,
  placeOf,
  queryOfView,
  shownQuery,
  viewOf,
} from './place.ts';
import { PlayerKey, type SyncDriver, playerCommands, makeSync, playerEvent } from './sync.ts';
import { type Asks, newestAsked } from './asked.ts';
import { useIndexOwner } from './index-owner.ts';
import { hearVersionCommands } from './hear.ts';

type Loaded<A> = Atom.Atom<AsyncResult.AsyncResult<A, LabFailure>>;

/**
 * A film's project (`film project`) as the review shows it, the one owner of
 * it for the page's life, whatever shows it (a Films card, a Set's
 * judgement, Project): the first read, then the newest ask's answer
 * (`asked.ts`): a say's, or a read again's. A move between the review's
 * places never reads it twice. A change the page hears of (a Set's say, a
 * source write, Refresh) reads it again now while a page shows it, else once
 * one next does; a change made elsewhere (another tab, the CLI) shows after
 * a Refresh or a reload.
 */
interface FilmProject {
  /**
   * The first read, under its served key (`review.project:<film>`): read by
   * the server where it renders a page that shows it, and sent with the page.
   */
  readonly first: Loaded<ProjectView>;
  /** The newest later answer (a say's, a read again's): none until one lands. */
  readonly answered: Atom.Atom<Option.Option<ProjectView>>;
  /**
   * The project as shown (`shownProject`), as an atom: for a reader's own
   * atom (a Set's judgement, which keeps its own server value).
   */
  readonly shown: Loaded<ProjectView>;
  /** Whether a read again is out. */
  readonly reading: Atom.Atom<boolean>;
  /** Its asks, in the order made: a say takes one as it is sent (`useWrite`'s orders). */
  readonly asks: Asks;
  /** A say's answer: shown only through its `Landed.show` on `asks`. */
  readonly answer: (view: ProjectView) => void;
  /**
   * The project may have moved: read it again now while a page shows it,
   * else once one next does (`hold`).
   */
  readonly changed: () => void;
  /**
   * Count the caller as showing it until the release it returns is called:
   * a change heard while nothing showed it is read again now.
   */
  readonly hold: () => () => void;
}

/** The project as shown: the newest later answer once one has landed, else the first read. */
const shownProject = <E,>(
  answered: Option.Option<ProjectView>,
  first: AsyncResult.AsyncResult<ProjectView, E>,
): AsyncResult.AsyncResult<ProjectView, E> =>
  Option.match(answered, {
    onNone: () => first,
    onSome: (view) => AsyncResult.success<ProjectView, E>(view),
  });

interface ReviewStateValue {
  readonly place: Accessor<ReviewPlace>;
  /**
   * Every folder with something to review, as the newest ask answered it
   * (`asked.ts`): the first read, a Refresh, or a say's answer for its folder.
   */
  readonly index: Accessor<AsyncResult.AsyncResult<ReviewIndex, LabFailure>>;
  /** The app's films, each with options to pick from. */
  readonly films: Accessor<AsyncResult.AsyncResult<ReviewFilms, LabFailure>>;
  readonly quality: Accessor<Quality>;
}

interface ReviewActions {
  /** Go to `place`, as a link does (Back returns). */
  readonly go: (place: ReviewPlace) => void;
  /**
   * Walk the roots again now (an ask of the index, `asks`), read the films
   * again, and read every film's project the page has read again
   * (`FilmProject.changed`).
   */
  readonly refresh: () => void;
  /**
   * A write the index does not answer (a say on Project) moved what it lists
   * (a version's approval, a comment): walk the roots again now, an ask of
   * the index (`asks`), so a Set shows the say.
   */
  readonly indexChanged: () => void;
  /**
   * A write's answer, `folder` as the write left it, put in its place in the
   * index's newest answer, shown or not yet (`useIndexOwner`): only through
   * its `Landed.show` on the index's `asks`, so an answer a newer read
   * overtook is never shown over it.
   */
  readonly answered: (folder: ReviewFolder) => void;
  readonly quality: (quality: Quality) => void;
}

/** A file as the index last saw it: its ref, and when it was written. */
type Written = Pick<ReviewFile, 'ref' | 'mtime'>;

interface ReviewMeta {
  /**
   * The index's asks, in the order they are made: each Refresh, and each
   * write that answers a folder of the index (a set's say), as it is sent.
   */
  readonly asks: Asks;
  /**
   * A video's length and its frame rate (its own, as the server reads its
   * packets: never rounded, so a 29.97 video steps on its own grid), read once per file as the index last saw it: a video written
   * again since is measured afresh.
   */
  readonly timing: (video: Written) => Loaded<ReviewDuration>;
  /**
   * The same read in the page alone (`Atom.withServerValue`): the server's
   * render never waits on it, nor shows it, and while the page hydrates it
   * is pending; it then takes the timing the server sent, if it sent one,
   * else reads it once.
   */
  readonly timedHere: (video: Written) => Loaded<ReviewDuration>;
  /** The app's films, the read `state.films` gives: for a read of a page's own that waits on them. */
  readonly films: Loaded<ReviewFilms>;
  /** A film's project, its one owner for the page's life (`FilmProject`); a page shows it through `useProject`. */
  readonly project: (film: string) => FilmProject;
  /**
   * A doc's text, read once per file as the index last saw it (its ref and
   * when it was written): a doc written again since is read afresh.
   */
  readonly text: (file: Written) => Loaded<string>;
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
   * How a film's Project draws its scenes' stills: from the app's films,
   * each loaded on demand, in the browser (`draw-stills.ts`); none on the
   * server, which draws no film.
   */
  readonly draw: DrawStills;
}

interface ReviewContextValue {
  readonly state: ReviewStateValue;
  readonly actions: ReviewActions;
  readonly meta: ReviewMeta;
}

const ReviewContext = createContext<ReviewContextValue>();

/** The review's context: only inside `<Root>`. */
export const useReview = (): ReviewContextValue => useContext(ReviewContext);

/** A film's project as a page shows it (`useProject`). */
interface ProjectShown {
  /** The project as the newest ask answered it (`shownProject`): the first read until a later one lands. */
  readonly view: Accessor<AsyncResult.AsyncResult<ProjectView, LabFailure>>;
  /** Whether a read again is out. */
  readonly reading: Accessor<boolean>;
  /** Its owner: the asks a say takes, a say's answer, a change. */
  readonly project: FilmProject;
}

/**
 * `film`'s project, shown while the calling component lives (it holds the
 * owner, `FilmProject.hold`): the read the server sent with the page, or the
 * page's own, then the newest answer.
 */
export const useProject = (film: string): ProjectShown => {
  const { meta } = useReview();
  const project = meta.project(film);
  const first = useAtomValue(() => project.first);
  const answered = useAtomValue(() => project.answered);
  const reading = useAtomValue(() => project.reading);
  onCleanup(project.hold());
  return { view: () => shownProject(answered(), first()), reading, project };
};

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

/** The copy the page plays: the kept one, else 720p on a phone's width (`PHONE`). */
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
    readonly draw: DrawStills;
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
  // A first read takes the server's cache; a refresh asks it to walk its roots again.
  const firstIndexAtom = runtime
    .atom(ReviewApi.use((api) => api.index(false)))
    .pipe(served('review.index', ReviewIndex));
  const againAtom = runtime.fn(() => ReviewApi.use((api) => api.index(true)));
  // A video's length and a doc's text are each keyed by what names the file's
  // content, its ref and when it was written: a refreshed index that saw it
  // written again names a new read.
  const timingOf = Atom.family((file: Written) =>
    runtime
      .atom(ReviewApi.use((api) => api.duration(file.ref)))
      .pipe(served(`review.duration:${file.ref}@${file.mtime}`, ReviewDuration)),
  );
  const textOf = Atom.family((file: Written) =>
    runtime
      .atom(ReviewApi.use((api) => api.text(file.ref)))
      .pipe(served(`review.text:${file.ref}@${file.mtime}`, Schema.String)),
  );
  const timing = (file: Written) => timingOf({ ref: file.ref, mtime: file.mtime });
  const timedHereOf = Atom.family((file: Written) =>
    Atom.make((get) => get(timingOf(file))).pipe(
      Atom.withServerValue(() => AsyncResult.initial<ReviewDuration, LabFailure>()),
    ),
  );
  const timedHere = (file: Written) => timedHereOf({ ref: file.ref, mtime: file.mtime });
  const text = (file: Written) => textOf({ ref: file.ref, mtime: file.mtime });
  // A film's project (`FilmProject`), kept for the page's life (`Atom.keepAlive`), so a move
  // between the review's places never reads it twice: its first read under its served key,
  // its read again, and the newest later answer.
  const projectFirstOf = Atom.family((film: string) =>
    runtime
      .atom(OptionsApi.use((api) => api.project(film)))
      .pipe(served(`review.project:${film}`, ProjectView), Atom.keepAlive),
  );
  const projectAgainOf = Atom.family((film: string) =>
    runtime.fn(() => OptionsApi.use((api) => api.project(film))).pipe(Atom.keepAlive),
  );
  const projectAnsweredOf = Atom.family((_film: string) =>
    Atom.make(Option.none<ProjectView>()).pipe(Atom.keepAlive),
  );
  const servedAtAtom = Atom.make(Clock.currentTimeMillis).pipe(served(SERVED_AT, Schema.Finite));

  const address = addressOn(props.host);

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
        Option.map(moved, address.follow);
      },
    );
    // The index as the newest ask answered it (`useIndexOwner`): a walk of the roots
    // again, or a say's answer for its folder (`asked.ts`); until one has, the first
    // read's: it was asked first, so any later answer stands over it.
    const firstIndex = useAtomValue(() => firstIndexAtom);
    useAtomMount(() => againAtom);
    const askAgain = useAtomSet(() => againAtom, { mode: 'promiseExit' });
    const indexOwner = useIndexOwner(firstIndex, () => askAgain());
    const { index, asks } = indexOwner;
    const films = useAtomValue(() => filmsAtom);
    // A Refresh reads the films again too: a film added since is one from then on.
    const refreshFilms = useAtomRefresh(() => filmsAtom);
    const keptQuality = useAtomValue(() => kept.quality);
    const keepQuality = useAtomSet(() => kept.quality);
    const narrow = () => Effect.runSyncWith(props.host)(Viewport.use((v) => v.matches(PHONE)));
    // The viewer's copy once the page is the client's; the phone's until then.
    const quality = createMemo(() => qualityOf(keptQuality(), narrow), {
      ssrSource: 'client',
      loadingValue: SERVED_QUALITY,
    });
    const servedAt = useAtomValue(() => servedAtAtom);
    const clockNow = () => Effect.runSyncWith(props.host)(Clock.currentTimeMillis);
    // Each film's project, made the first time a page asks for it, kept for the page's life.
    const registry = useRegistry();
    const projects = new Map<string, FilmProject>();
    const projectOf = (film: string): FilmProject => {
      const first = projectFirstOf(film);
      const again = projectAgainOf(film);
      const answered = projectAnsweredOf(film);
      const projectAsks = newestAsked();
      // How many pages show it now; whether one ever has; a change heard since one last did.
      let holders = 0;
      let held = false;
      let stale = false;
      const answer = (view: ProjectView) => registry.set(answered, Option.some(view));
      const readAgain = () => {
        const ask = projectAsks.ask();
        registry.set(again, Function.constVoid());
        void Effect.runPromiseExit(
          AtomRegistry.getResult(registry, again, { suspendOnWaiting: true }),
        ).then((exit) => {
          if (Exit.isSuccess(exit)) ask.answer(() => answer(exit.value));
        });
      };
      return {
        first,
        answered,
        shown: Atom.make((get) => shownProject(get(answered), get(first))),
        reading: Atom.make((get) => get(again).waiting),
        asks: projectAsks,
        answer,
        // A project never shown is read fresh when one first shows it.
        changed: () => {
          if (holders > 0) readAgain();
          else stale = held;
        },
        hold: () => {
          holders += 1;
          held = true;
          if (stale) readAgain();
          stale = false;
          return () => {
            holders -= 1;
          };
        },
      };
    };
    const project = (film: string): FilmProject =>
      Option.getOrElse(Option.fromUndefinedOr(projects.get(film)), () => {
        const made = projectOf(film);
        projects.set(film, made);
        return made;
      });
    const value: ReviewContextValue = {
      state: { place, index, films, quality },
      actions: {
        go: (next) => {
          address.go(hrefOf(next));
          window.scrollTo(0, 0);
        },
        refresh: () => {
          refreshFilms();
          indexOwner.again();
          // Every project the page has read is read again (now where it shows).
          for (const p of projects.values()) p.changed();
        },
        indexChanged: indexOwner.again,
        answered: indexOwner.answered,
        quality: keepQuality,
      },
      meta: {
        asks,
        timing,
        timedHere,
        films: filmsAtom,
        project,
        text,
        runtime,
        client: props.client,
        host: props.host,
        hub: props.hub,
        // The server's render and the client's hydration count from the time
        // the page was rendered, so both say the same; the client's later
        // renders count from its own clock.
        now: () => {
          if (!isServer && !isHydrating()) return clockNow();
          return Option.getOrElse(AsyncResult.value(untrack(servedAt)), clockNow);
        },
        draw: props.draw,
      },
    };
    onCleanup(
      props.hub.commands.register(
        ...openCommands(value.actions.go, place),
        ...versionCommands(() => AsyncResult.value(index()), address.go),
        ...fileCommands(() => AsyncResult.value(index()), value.meta.now),
        ...pageCommands(value),
      ),
    );
    // Every folder, set and film's page is a place ⌘K goes to by its name.
    registerWhile(props.hub, () =>
      goToCommands(
        destinationsOf(AsyncResult.value(index()), AsyncResult.value(films()), value.actions.go),
      ),
    );
    return <ReviewContext value={value}>{inner.children}</ReviewContext>;
  };

  // The registry's URL atoms read and write through the host's own `UrlState`
  // (its layer carries it, and the atoms reuse it), so they and the page's
  // effects share one address bar; the default layer would build the
  // browser's own (none on the server, a second one in the browser).
  return (
    <RegistryProvider initialValues={[[UrlAtom.layer, hostLayer(props.host)]]}>
      <Inner>{props.children}</Inner>
    </RegistryProvider>
  );
};

/** Open on Choices: a choice off the Choices tab, opened there at its card. */
export const OPEN_ON_CHOICES: CommandId = 'review.open-on-choices';

/**
 * The review's ways into a thing from its context menu (and ⌘K, while the
 * page selects it): a folder or a set opens in the page; a film's parts
 * open from its card through the studio shell's `filmCommands`; a choice
 * off the Choices tab (a project's card, a scene's Choices in this scene)
 * opens on Choices at its card.
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
    run: quietly((ctx) => Option.map(placeOfTarget(ctx), (open) => open())),
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

/** How many of a set's versions its card's menu names: the first nine. */
const NAMED_VERSIONS = 9;

/**
 * A set card's versions, by name, in its long-press menu: the
 * card shows its strip and its title, and Open version n · <label> opens
 * the set at that version's sheet.
 */
const versionCommands = (
  index: Accessor<Option.Option<ReviewIndex>>,
  open: (href: string) => void,
): ReadonlyArray<Command> =>
  Arr.makeBy(NAMED_VERSIONS, (i): Command => {
    const n = i + 1;
    const version = (ctx: Context) =>
      Option.flatMap(selected(ctx, 'Set'), (s) =>
        index().pipe(
          Option.flatMap((ix) =>
            Option.fromUndefinedOr(ix.folders.find((f) => f.ref === s.folder)),
          ),
          Option.flatMap((f) => Option.fromUndefinedOr(f.sets.find((x) => x.id === s.point))),
          Option.flatMap((set) => Option.fromUndefinedOr(seenVariants(set)[i])),
          Option.map((v) => ({ set: s, version: v })),
        ),
      );
    return {
      id: `review.open-version-${n}`,
      label: `Open version ${n}`,
      labelIn: (ctx) =>
        Option.match(version(ctx), {
          onNone: () => `Open version ${n}`,
          onSome: ({ version: v }) => `Open version ${n} · ${v.label}`,
        }),
      group: 'Open',
      about: ['Set'],
      touch: `long-press a version stack, then Open version ${n}`,
      when: (ctx) => Option.isSome(version(ctx)),
      run: quietly((ctx) => {
        Option.map(version(ctx), ({ set, version: v }) =>
          open(pageHref.set(set.folder, set.point, v.id)),
        );
      }),
    };
  });

/**
 * A loose video's file, from its long-press menu and ⌘K while it is
 * selected: Open the file in a tab of its own, and Info, saying its
 * size, its age and its proxy, which the card no longer prints at rest. Copy
 * link copies the file's own link (`citeOf`).
 */
const fileCommands = (
  index: Accessor<Option.Option<ReviewIndex>>,
  now: () => number,
): ReadonlyArray<Command> => {
  const video = (ctx: Context) =>
    Option.flatMap(selected(ctx, 'File'), (file) =>
      Option.flatMap(index(), (ix) =>
        Option.fromUndefinedOr(ix.folders.flatMap((f) => f.videos).find((v) => v.ref === file.ref)),
      ),
    );
  const about = {
    group: 'Open',
    about: ['File'],
    when: (ctx) => Option.isSome(video(ctx)),
  } as const satisfies Pick<Command, 'group' | 'about' | 'when'>;
  return [
    {
      id: 'review.file-open',
      label: 'Open the file',
      touch: 'long-press a video, then Open the file',
      ...about,
      run: quietly((ctx) =>
        Option.map(video(ctx), (v) => window.open(reviewFileUrl(v.ref), '_blank', 'noreferrer')),
      ),
    },
    {
      id: 'review.file-info',
      label: 'Info',
      touch: 'long-press a video, then Info',
      ...about,
      run: (ctx) =>
        Effect.succeed(
          Option.match(video(ctx), {
            onNone: () => quiet,
            onSome: (v) => said(fileInfoText(v, now())),
          }),
        ),
    },
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
 * The review's page-wide commands, in ⌘K and the page's long-press menu:
 * Refresh walks the roots again and reads every film's project the page has
 * read again; the copy played switches
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
    run: quietly(() => review.actions.refresh()),
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
  /** The set's folder and the set, as the index last read them: a refresh moves them under the player. */
  readonly folder: Accessor<ReviewFolder>;
  readonly set: Accessor<SeenPoint>;
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

const unmeasured = Atom.make(AsyncResult.initial<ReviewDuration, LabFailure>());

/** No video to time, as a page-only read is (`timedHere`): the same kind of atom on either side. */
const untimed = unmeasured.pipe(
  Atom.withServerValue(() => AsyncResult.initial<ReviewDuration, LabFailure>()),
);

/**
 * Tell a clock (`send`) the frame rate of its video (`video`, none when it
 * has none): the rate the server reads from the video's own packets
 * (`ReviewDuration.fps`, as measured), once it answers; the film rate (`FILM_FPS`) while the answer is pending, or when
 * the video names none. Read in the page only (`timedHere`): nothing the
 * server renders counts frames past the clock's start, so its render never
 * waits on it.
 */
export const useClockRate = (
  video: Accessor<Option.Option<Written>>,
  send: (event: SyncEvent) => void,
) => {
  const { meta } = useReview();
  const timed = useAtomValue(() =>
    Option.match(video(), { onNone: () => untimed, onSome: meta.timedHere }),
  );
  createEffect(
    () =>
      Option.getOrElse(
        Option.flatMap(AsyncResult.value(timed()), (t) => t.fps),
        () => FILM_FPS,
      ),
    (fps) => send(SyncEvent.Timed({ fps })),
  );
};

/**
 * Tell a set's driver the frame rate of each version's video (`timed`), its
 * own as the server reads it for the file it is now: each video lands in its
 * own frames (`landing`), whatever the clock's rate. Derived as the clock's
 * rate is (`useClockRate`): none while its file's answer is pending, or when
 * it names none, so a file written again with no rate its frames tell lands
 * by the clock's rate, never by its old file's. Read in the page only
 * (`timedHere`), as the clock's is.
 */
const useVersionRates = (variants: Accessor<SeenPoint['variants']>, driver: SyncDriver) => {
  const { meta } = useReview();
  const rates = useAtomValue(() => {
    const each = variants();
    return Atom.make((get) =>
      each.map((v) => ({
        id: v.id,
        fps: Option.flatMap(AsyncResult.value(get(meta.timedHere(v.video))), (t) => t.fps),
      })),
    );
  });
  createEffect(rates, (known) => {
    for (const { id, fps } of known) driver.timed(id, fps);
  });
};

/** The set's place in the URL: its path, its view in the query, the player's time in the hash. */
const setPlace = UrlAtom.place(Places.set);

/**
 * The version whose video is `set`'s clock in `view` at `quality`: the first
 * of those the view plays (all of them, or a pair's two) whose video plays
 * here, so a phone's version whose proxy is still being made never holds the
 * clock; else the view's first.
 */
const leaderOf = (set: SeenPoint, view: ViewState, quality: Quality): string => {
  const head = set.variants[0];
  const shown = Option.match(otherOf(view), {
    onNone: () => set.variants,
    onSome: (o) => set.variants.filter((v) => v === head || v.id === o),
  });
  return Option.getOrElse(
    Option.map(
      Option.orElse(
        Arr.findFirst(shown, (v) => Option.isSome(videoSource(v.video, quality))),
        () => Arr.head(shown),
      ),
      (v) => v.id,
    ),
    () => '',
  );
};

const SetBody = (
  props: ParentProps<{
    readonly folder: ReviewFolder;
    readonly set: SeenPoint;
    readonly sync: SyncActor;
  }>,
) => {
  const { meta, state: page } = useReview();
  const syncAtom = ActorAtom.make(props.sync);
  const sync = useAtomValue(() => syncAtom);
  const sendSync = useAtomSet(() => syncAtom);
  const ids = createMemo(() => props.set.variants.map((v) => v.id), { equals: Equal.equals });
  const first = () => Option.getOrElse(Option.fromUndefinedOr(ids()[0]), () => '');
  const other = () => Option.fromUndefinedOr(ids()[1]);

  // The view is the URL's: a link, a reload, Back and Forward all show what
  // it keeps. A choice of view or of a moment is a new history entry (Back
  // undoes it); cycling the pair's other and a ←/→ step through the moments
  // are not.
  const at = useAtomValue(() => setPlace);
  const view = createMemo(
    () =>
      viewOf(
        Option.match(at(), { onSome: (v) => v.query, onNone: () => queryOfView(ViewState.All) }),
        ids(),
      ),
    // The time moving on is no new view.
    { equals: Equal.equals },
  );

  // The clock is the leading version's video alone (`leaderOf`): its time,
  // its end and its ending are the set's. A refresh that takes it away, a
  // view that leaves it out, or a copy played that makes another the first
  // to play moves the clock (`follow`), and the player plays on.
  const leader = createMemo(() => leaderOf(props.set, view(), page.quality()));
  const driver = makeSync(untrack(leader), sendSync, meta.host);
  onCleanup(driver.stop);
  createEffect(sync, (state) => driver.apply(state));
  createEffect(leader, (id) => driver.follow(id));

  const address = addressOn(meta.host);
  // A view moved closes a still open full size (`?still=`): the still was the view's.
  const sendView = (event: ViewEvent) =>
    Option.map(at(), (v) =>
      address[causeOf(event)](
        Place.href(Places.set, {
          ...v,
          query: { ...v.query, ...queryOfView(stepView(view(), other(), event)), still: '' },
        }),
      ),
    );
  // A link asking for what the set cannot show (a pair on a set of one, an
  // other it does not hold, the old notes) shows what `viewOf` makes of it,
  // and the URL is corrected to say so, in the same entry.
  createEffect(
    () =>
      Option.map(at(), (v) =>
        Place.href(Places.set, { ...v, query: shownQuery(v.query, view(), first()) }),
      ),
    (shown) => {
      Option.map(shown, address.follow);
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
  // The set as it stands when an entry lands, read untracked: a listener tracks nothing, and
  // the landing that mounted the set (Back onto it) is heard as the set mounts.
  onCleanup(
    onTraverse(meta.host, (href) =>
      untrack(() =>
        Option.map(
          Option.filter(
            Place.decode(Places.set, href),
            (v) => v.path.folder === props.folder.ref && v.path.point === props.set.id,
          ),
          (v) =>
            sendSync(SyncEvent.Landed({ t: Option.getOrElse(v.hash.t, () => props.set.start) })),
        ),
      ),
    ),
  );
  // Nothing plays behind the moments or the difference; a pair (or
  // its wipe) hears one of its two, and every view a version the set still
  // holds: else the one leading.
  createEffect(
    () => [view(), sync().audible, ids(), leader()] as const,
    ([state, audible, all, lead]) => {
      if (!playsIn(viewNameOf(state))) sendSync(SyncEvent.PausePressed);
      Option.map(Option.fromUndefinedOr(all[0]), (head) => {
        const heard = Option.match(otherOf(state), {
          onNone: () => all,
          onSome: (o) => [head, o],
        });
        if (!heard.includes(audible)) sendSync(SyncEvent.HeardChosen({ id: lead }));
      });
    },
  );

  const length = useAtomValue(() => {
    if (Option.isSome(props.set.moments)) return unmeasured;
    return Option.match(Option.fromUndefinedOr(props.set.variants[0]), {
      onNone: () => unmeasured,
      onSome: (v) => meta.timing(v.video),
    });
  });
  // The clock steps and counts by the leading video's own frames. Read after
  // `length`: hydrating, that read takes the timing the server sent, so the
  // clock's page-only read of the same video finds it there and asks again
  // for nothing.
  useClockRate(
    () =>
      Option.map(
        Option.fromUndefinedOr(props.set.variants.find((v) => v.id === leader())),
        (v) => v.video,
      ),
    sendSync,
  );
  // Each version's video lands in its own frames at the clock's.
  useVersionRates(() => props.set.variants, driver);
  // The same instants read again are no new moments: the views over them stay.
  const moments = createMemo(
    () =>
      Option.orElse(props.set.moments, () =>
        Option.map(AsyncResult.value(length()), ({ seconds }) =>
          spreadMoments(seconds, props.set.start),
        ),
      ),
    { equals: Equal.equals },
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
      onSome: (o) => id === first() || id === o,
    });
  };
  // A version of this set heard alone, from its context menu (as its speaker does).
  const versionHere = (ctx: Context) =>
    Option.filter(
      selected(ctx, 'Version'),
      (v) =>
        v.folder === props.folder.ref &&
        v.point === props.set.id &&
        v.version !== sync().audible &&
        hearable(v.version),
    );
  // `1`…`9` hear the versions as the index last named them.
  registerWhile(meta.hub, () =>
    hearVersionCommands({
      versions: props.set.variants,
      heard: () => sync().audible,
      hearable,
      hear: (id) => sendSync(SyncEvent.HeardChosen({ id })),
    }),
  );
  // The set's modes and Compare's layouts by key and ⌘K, each the next one
  // round; their touch path the segmented controls (`ViewTabs`).
  const modes = () => modesOf(props.set.variants.length);
  onCleanup(
    meta.hub.commands.register(
      {
        id: 'set.next-mode',
        label: 'Next mode: All, Compare, Moments',
        group: 'Review',
        keys: ['v'],
        touch: "tap one of the set's modes",
        when: () => modes().length > 1,
        run: quietly(() => {
          sendView(ViewEvent.ViewChosen({ view: nextModeView(viewNameOf(view()), modes()) }));
        }),
      },
      {
        id: 'set.next-layout',
        label: 'Next Compare layout: side by side, wipe, difference',
        group: 'Review',
        keys: ['shift+v'],
        touch: 'in Compare, tap one of its layouts',
        when: () => Option.isSome(nextLayout(viewNameOf(view()))),
        run: quietly(() => {
          Option.map(nextLayout(viewNameOf(view())), (layout) =>
            sendView(ViewEvent.ViewChosen({ view: layout })),
          );
        }),
      },
    ),
  );
  onCleanup(
    meta.hub.commands.register({
      id: 'set.hear',
      label: 'Hear this version',
      group: 'Review',
      about: ['Version'],
      touch: 'long-press a version, then Hear this version (or tap its speaker)',
      when: (ctx) => Option.isSome(versionHere(ctx)),
      run: quietly((ctx) =>
        Option.map(versionHere(ctx), (v) => sendSync(SyncEvent.HeardChosen({ id: v.version }))),
      ),
    }),
  );

  const value: SetContextValue = {
    folder: () => props.folder,
    set: () => props.set,
    sync,
    view,
    moments,
    driver,
    send: { sync: sendSync, view: sendView },
  };
  return <SetContext value={value}>{props.children}</SetContext>;
};

/**
 * One version stack's player, view and moments, for its page; a stack of one
 * has no side by side. Its player is the set's for as long as the page shows
 * it: a refreshed index moves `folder` and `set` under it, so it plays on
 * with its time, rate, version heard and the view's own state.
 */
export const SetProvider = (
  props: ParentProps<{ readonly folder: ReviewFolder; readonly set: SeenPoint }>,
) => {
  const { meta, state } = useReview();
  // Made once, for the set as the page opened it: the player opens where the
  // URL's `#t=` says, else at the set's start, hearing the version that leads it.
  const spawn = untrack(() => {
    const at = Option.getOrElse(
      Option.flatMap(Effect.runSyncWith(meta.host)(UrlState.get(Places.set)), (v) => v.hash.t),
      () => props.set.start,
    );
    return spawnSync(leaderOf(props.set, ViewState.All, state.quality()), props.set.start, at);
  });
  return (
    <Actor runtime={meta.runtime} spawn={spawn}>
      {(sync) => (
        <SetBody folder={props.folder} set={props.set} sync={sync}>
          {props.children}
        </SetBody>
      )}
    </Actor>
  );
};
