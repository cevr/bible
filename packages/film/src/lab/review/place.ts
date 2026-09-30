// Where the review page is, read from and written to its URL, so a link (or
// a reload, or Back) opens the same place: every folder (`/`), one folder
// (`?folder=<ref>`), one comparison set in it (`&set=<point id>`) and the view
// it shows (`&view=pair&other=<id>`, `&view=moments&m=<n>`), one film's
// choices (`?film=<film>`), or one film's project by its address tree
// (`?project=<film>`).

import { Data, Match, Option } from 'effect';
import { type ViewName, ViewState, viewNameOf } from './machine.ts';

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

const param = (params: URLSearchParams, name: string): Option.Option<string> =>
  Option.filter(Option.fromNullishOr(params.get(name)), (v) => v !== '');

/** The place a search string (`?folder=…&set=…`, `?film=…`, `?project=…`) names; home when it names none. */
export const placeOf = (search: string): ReviewPlace => {
  const params = new URLSearchParams(search);
  const project = param(params, 'project');
  if (Option.isSome(project)) return ReviewPlace.Project({ film: project.value });
  return Option.match(param(params, 'film'), {
    onSome: (film) => ReviewPlace.Film({ film }),
    onNone: () =>
      Option.match(param(params, 'folder'), {
        onNone: () => ReviewPlace.Home(),
        onSome: (folder) =>
          Option.match(param(params, 'set'), {
            onNone: () => ReviewPlace.Folder({ folder }),
            onSome: (point) => ReviewPlace.Set({ folder, point }),
          }),
      }),
  });
};

/** The search string that opens `place` (empty for home). */
export const searchOf = (place: ReviewPlace): string => {
  const params = Match.value(place).pipe(
    Match.tagsExhaustive({
      Home: () => new URLSearchParams(),
      Folder: (p) => new URLSearchParams({ folder: p.folder }),
      Set: (p) => new URLSearchParams({ folder: p.folder, set: p.point }),
      Film: (p) => new URLSearchParams({ film: p.film }),
      Project: (p) => new URLSearchParams({ project: p.film }),
    }),
  );
  const text = params.toString();
  if (text === '') return '';
  return `?${text}`;
};

const VIEW_NAMES: ReadonlyArray<string> = ['all', 'pair', 'moments', 'notes'];

const isView = (name: string): name is ViewName => VIEW_NAMES.includes(name);

/**
 * The view a search string keeps: its `view`, a pair's `other` (when it is one
 * of `ids` past the first; the second otherwise), the moments' `m`. All when
 * it keeps none.
 */
export const viewOf = (search: string, ids: ReadonlyArray<string>): ViewState => {
  const params = new URLSearchParams(search);
  const view = Option.getOrElse(
    Option.filter(param(params, 'view'), isView),
    (): ViewName => 'all',
  );
  const others = ids.slice(1);
  const other = Option.getOrElse(
    Option.filter(param(params, 'other'), (id) => others.includes(id)),
    () => Option.getOrElse(Option.fromUndefinedOr(others[0]), () => ''),
  );
  const moment = Option.getOrElse(
    Option.filter(
      Option.map(param(params, 'm'), (m) => Number.parseInt(m, 10)),
      (m) => Number.isInteger(m) && m >= 0,
    ),
    () => 0,
  );
  return Match.value(view).pipe(
    Match.when('pair', () => ViewState.Pair({ other })),
    Match.when('moments', () => ViewState.Moments({ index: moment })),
    Match.when('notes', () => ViewState.Notes),
    Match.orElse(() => ViewState.All),
  );
};

/** `search` with the view `state` shows kept in it (and nothing else of a view's). */
export const searchWithView = (search: string, state: ViewState): string => {
  const params = new URLSearchParams(search);
  for (const key of ['view', 'other', 'm']) params.delete(key);
  const view = viewNameOf(state);
  if (view !== 'all') params.set('view', view);
  if (state._tag === 'Pair') params.set('other', state.other);
  if (state._tag === 'Moments') params.set('m', String(state.index));
  const text = params.toString();
  if (text === '') return '';
  return `?${text}`;
};
