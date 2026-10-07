// Where the review page is, read from its URL's path and written back to it
// (`Places`, `core/api.ts`), so a link, a reload or Back opens the same
// place: every folder (`/`), one folder (`/sets/<folder>`), one comparison
// set in it (`/sets/<folder>/<point>`, its view in the query:
// `?view=pair|wipe&other=<id>`, `?view=moments&m=<n>`, `?view=diff&other=<id>&m=<n>`), one film's choices
// (`/films/<film>/choices`), or one film's project by its address tree
// (`/films/<film>/project`). Each of those is also a place ⌘K goes to by
// its name (`destinationsOf`).

import { Place } from '@bible/url-state';
import { Data, Match, Option } from 'effect';
import { Places, pageHref } from '../../core/api.ts';
import type { Destination } from '../../command/go.ts';
import type { ReviewFilms, ReviewIndex } from '../../core/review.ts';
import { onTheMs } from '../../player/t-in-url.ts';
import { folderTitle } from './format.ts';
import { type ViewEvent, ViewState, otherOf, viewNameOf } from './machine.ts';

export type ReviewPlace = Data.TaggedEnum<{
  Home: {};
  Folder: { readonly folder: string };
  /** A render choice point of the folder, by its id. */
  Set: { readonly folder: string; readonly point: string };
  /** A film's choices: every choice point it has, by kind; `point` the card in focus ('' for none). */
  Film: { readonly film: string; readonly point: string };
  /** A film's project: its acts and scenes, each scene's render and the owner's say. */
  Project: { readonly film: string };
}>;
export const ReviewPlace = Data.taggedEnum<ReviewPlace>();

/** What a comparison set's URL keeps of its view: its name, a pair's other, the moment. */
export type SetQuery = Omit<Place.Type<typeof Places.set>['query'], 'inspect'>;

/** The place `href` names; home when it names none of the review's. */
export const placeOf = (href: string): ReviewPlace =>
  Option.firstSomeOf<ReviewPlace>([
    Option.map(Place.decode(Places.folder, href), (v) => ReviewPlace.Folder(v.path)),
    Option.map(Place.decode(Places.set, href), (v) => ReviewPlace.Set(v.path)),
    Option.map(Place.decode(Places.choices, href), (v) =>
      ReviewPlace.Film({ film: v.path.film, point: v.query.point }),
    ),
    Option.map(Place.decode(Places.project, href), (v) => ReviewPlace.Project(v.path)),
  ]).pipe(Option.getOrElse(() => ReviewPlace.Home()));

/** The link that opens `place`, its view and selections at their defaults. */
export const hrefOf = (place: ReviewPlace): string =>
  Match.value(place).pipe(
    Match.tagsExhaustive({
      Home: () => pageHref.home(),
      Folder: (p) => pageHref.folder(p.folder),
      Set: (p) => pageHref.set(p.folder, p.point),
      Film: (p) => pageHref.choices(p.film, p.point),
      Project: (p) => pageHref.project(p.film),
    }),
  );

/**
 * The view a set's query keeps: its `view`, the `other` a pair, its wipe or
 * its difference is against (when it is one of `ids` past the first; the
 * second otherwise; a set of one has none of them and shows all), the
 * moment `m` of the moments or the difference.
 */
export const viewOf = (query: SetQuery, ids: ReadonlyArray<string>): ViewState => {
  const others = ids.slice(1);
  const other = Option.orElse(
    Option.liftPredicate(query.other, (id) => others.includes(id)),
    () => Option.fromUndefinedOr(others[0]),
  );
  /** A view against an other, or All where the set has none. */
  const against = (paired: (id: string) => ViewState) =>
    Option.match(other, { onSome: paired, onNone: () => ViewState.All });
  return Match.value(query.view).pipe(
    Match.when('pair', () => against((id) => ViewState.Pair({ other: id }))),
    Match.when('wipe', () => against((id) => ViewState.Wipe({ other: id }))),
    Match.when('diff', () => against((id) => ViewState.Diff({ other: id, index: query.m }))),
    Match.when('moments', () => ViewState.Moments({ index: query.m })),
    // All, and the old notes (`shownQuery` opens the first version's Info for it).
    Match.orElse(() => ViewState.All),
  );
};

/**
 * Why a view's `event` moves the URL (`addressOn`): a ←/→ step through the
 * moments follows the viewer's stepping in place; every other event is the
 * viewer's move, entered as `Places.set` declares it (a view or a moment
 * chosen is a step Back walks, a pair's other cycled is a refinement).
 */
export const causeOf = (event: ViewEvent): 'go' | 'follow' =>
  Match.value(event).pipe(
    Match.tags({ MomentStepped: (): 'follow' => 'follow' }),
    Match.orElse((): 'go' => 'go'),
  );

/**
 * Every place the review can go to by its name, as read so far: each
 * folder (by its title and its ref), each set in it, and each film's choices
 * and project. `go` goes there as a link does.
 */
export const destinationsOf = (
  index: Option.Option<ReviewIndex>,
  films: Option.Option<ReviewFilms>,
  go: (place: ReviewPlace) => void,
): ReadonlyArray<Destination> => [
  ...Option.match(index, { onNone: () => [], onSome: (i) => i.folders }).flatMap(
    (folder): ReadonlyArray<Destination> => [
      {
        kind: 'folder',
        id: folder.ref,
        name: `${folderTitle(folder)} ${folder.ref}`,
        go: () => go(ReviewPlace.Folder({ folder: folder.ref })),
      },
      ...folder.sets.map((set): Destination => ({
        kind: 'set',
        id: `${folder.ref}.${set.id}`,
        name: `${set.title} in ${folderTitle(folder)}`,
        go: () => go(ReviewPlace.Set({ folder: folder.ref, point: set.id })),
      })),
    ],
  ),
  ...Option.match(films, { onNone: () => [], onSome: (f) => f.films }).flatMap(
    (film): ReadonlyArray<Destination> => [
      {
        kind: 'choices',
        id: film,
        name: `of ${film}`,
        go: () => go(ReviewPlace.Film({ film, point: '' })),
      },
      {
        kind: 'project',
        id: film,
        name: `of ${film}`,
        go: () => go(ReviewPlace.Project({ film })),
      },
    ],
  ),
];

/**
 * The time a URL keeps for a player at `t`: none at its `start`, else to the
 * ms rounded up, as every `#t=` is (`onTheMs`).
 */
export const keptTime = (t: number, start: number): Option.Option<number> =>
  Option.liftPredicate(onTheMs(t), (ms) => ms !== onTheMs(start));

/**
 * The query a set's URL is corrected to once its view is shown: the view
 * `state` (`queryOfView`), and for an old `?view=notes`, which the set no
 * longer shows, the first version's inspector (`first`), whose Info holds
 * what the notes showed, unless the link opens another.
 */
export const shownQuery = (
  query: Place.Type<typeof Places.set>['query'],
  state: ViewState,
  first: string,
): Place.Type<typeof Places.set>['query'] => ({
  ...query,
  ...queryOfView(state),
  inspect: Option.getOrElse(
    Option.liftPredicate(query.inspect, (named) => query.view !== 'notes' || named !== ''),
    () => first,
  ),
});

/** The query that keeps the view `state` shows (and nothing else of a view's). */
export const queryOfView = (state: ViewState): SetQuery => ({
  view: viewNameOf(state),
  other: Option.getOrElse(otherOf(state), () => ''),
  m: Match.value(state).pipe(
    Match.tag('Moments', 'Diff', (s) => s.index),
    Match.orElse(() => 0),
  ),
});
