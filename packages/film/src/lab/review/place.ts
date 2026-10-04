// Where the review page is, read from its URL's path and written back to it
// (`Places`, `core/api.ts`), so a link, a reload or Back opens the same
// place: every folder (`/`), one folder (`/sets/<folder>`), one comparison
// set in it (`/sets/<folder>/<point>`, its view in the query:
// `?view=pair&other=<id>`, `?view=moments&m=<n>`), one film's choices
// (`/films/<film>/choices`), or one film's project by its address tree
// (`/films/<film>/project`). Each of those is also a place ⌘K goes to by
// its name (`destinationsOf`).

import { Place } from '@bible/url-state';
import { Data, Match, Option } from 'effect';
import { Places, pageHref } from '../../core/api.ts';
import type { Destination } from '../../command/go.ts';
import type { ReviewFilms, ReviewIndex } from '../../core/review.ts';
import { folderTitle } from './format.ts';
import { type ViewEvent, ViewState, viewNameOf } from './machine.ts';

export type ReviewPlace = Data.TaggedEnum<{
  Home: {};
  Folder: { readonly folder: string };
  /** A render choice point of the folder, by its id. */
  Set: { readonly folder: string; readonly point: string };
  /** A film's choices: every choice point it has, by kind. */
  Film: { readonly film: string };
  /** A film's project: its acts and scenes, each scene's render and the owner's say. */
  Project: { readonly film: string };
}>;
export const ReviewPlace = Data.taggedEnum<ReviewPlace>();

/** What a comparison set's URL keeps of its view: its name, a pair's other, the moment. */
export type SetQuery = Place.Type<typeof Places.set>['query'];

/** The place `href` names; home when it names none of the review's. */
export const placeOf = (href: string): ReviewPlace =>
  Option.firstSomeOf<ReviewPlace>([
    Option.map(Place.decode(Places.folder, href), (v) => ReviewPlace.Folder(v.path)),
    Option.map(Place.decode(Places.set, href), (v) => ReviewPlace.Set(v.path)),
    Option.map(Place.decode(Places.choices, href), (v) => ReviewPlace.Film(v.path)),
    Option.map(Place.decode(Places.project, href), (v) => ReviewPlace.Project(v.path)),
  ]).pipe(Option.getOrElse(() => ReviewPlace.Home()));

/** The link that opens `place`, its view and selections at their defaults. */
export const hrefOf = (place: ReviewPlace): string =>
  Match.value(place).pipe(
    Match.tagsExhaustive({
      Home: () => pageHref.home(),
      Folder: (p) => pageHref.folder(p.folder),
      Set: (p) => pageHref.set(p.folder, p.point),
      Film: (p) => pageHref.choices(p.film),
      Project: (p) => pageHref.project(p.film),
    }),
  );

/**
 * The view a set's query keeps: its `view`, a pair's `other` (when it is one
 * of `ids` past the first; the second otherwise; a set of one has no pair and
 * shows all), the moments' `m`.
 */
export const viewOf = (query: SetQuery, ids: ReadonlyArray<string>): ViewState => {
  const others = ids.slice(1);
  const other = Option.orElse(
    Option.liftPredicate(query.other, (id) => others.includes(id)),
    () => Option.fromUndefinedOr(others[0]),
  );
  return Match.value(query.view).pipe(
    Match.when('pair', () =>
      Option.match(other, {
        onSome: (id) => ViewState.Pair({ other: id }),
        onNone: () => ViewState.All,
      }),
    ),
    Match.when('moments', () => ViewState.Moments({ index: query.m })),
    Match.when('notes', () => ViewState.Notes),
    Match.orElse(() => ViewState.All),
  );
};

/**
 * How a view's `event` enters history: a view or a moment chosen is a step
 * of its own (Back undoes it); a pair's other cycled (a refinement, as
 * `other`'s replace policy in `Places.set` says) and a ←/→ step through the
 * moments replace the entry.
 */
export const historyOf = (event: ViewEvent): 'push' | 'replace' =>
  Match.value(event).pipe(
    Match.tags({
      OtherChosen: (): 'replace' => 'replace',
      MomentStepped: (): 'replace' => 'replace',
    }),
    Match.orElse((): 'push' => 'push'),
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
      { kind: 'choices', id: film, name: `of ${film}`, go: () => go(ReviewPlace.Film({ film })) },
      {
        kind: 'project',
        id: film,
        name: `of ${film}`,
        go: () => go(ReviewPlace.Project({ film })),
      },
    ],
  ),
];

/** The time a URL keeps for a player at `t`: none at its `start`, else to the ms. */
export const keptTime = (t: number, start: number): Option.Option<number> =>
  Option.liftPredicate(Math.round(t * 1000) / 1000, (ms) => ms !== start);

/** The query that keeps the view `state` shows (and nothing else of a view's). */
export const queryOfView = (state: ViewState): SetQuery => ({
  view: viewNameOf(state),
  other: Match.value(state).pipe(
    Match.tag('Pair', (s) => s.other),
    Match.orElse(() => ''),
  ),
  m: Match.value(state).pipe(
    Match.tag('Moments', (s) => s.index),
    Match.orElse(() => 0),
  ),
});
