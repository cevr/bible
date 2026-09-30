// Where the review page is, read from and written to its URL, so a link (or
// a reload, or Back) opens the same place: every folder (`/`), one folder
// (`?folder=<ref>`), one comparison set in it (`&set=<clip>`) and the view
// it shows (`&view=pair&other=<id>`, `&view=moments&m=<n>`), or one film's
// options (`?film=<film>`).

import { Data, Match, Option } from 'effect';
import { type ViewName, ViewState, viewNameOf } from './machine.ts';

export type ReviewPlace = Data.TaggedEnum<{
  Home: {};
  Folder: { readonly folder: string };
  Set: { readonly folder: string; readonly clip: string };
  /** A film's options: its score's, its sounds' takes. */
  Film: { readonly film: string };
}>;
export const ReviewPlace = Data.taggedEnum<ReviewPlace>();

const param = (params: URLSearchParams, name: string): Option.Option<string> =>
  Option.filter(Option.fromNullishOr(params.get(name)), (v) => v !== '');

/** The place a search string (`?folder=…&set=…`, `?film=…`) names; home when it names none. */
export const placeOf = (search: string): ReviewPlace => {
  const params = new URLSearchParams(search);
  return Option.match(param(params, 'film'), {
    onSome: (film) => ReviewPlace.Film({ film }),
    onNone: () =>
      Option.match(param(params, 'folder'), {
        onNone: () => ReviewPlace.Home(),
        onSome: (folder) =>
          Option.match(param(params, 'set'), {
            onNone: () => ReviewPlace.Folder({ folder }),
            onSome: (clip) => ReviewPlace.Set({ folder, clip }),
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
      Set: (p) => new URLSearchParams({ folder: p.folder, set: p.clip }),
      Film: (p) => new URLSearchParams({ film: p.film }),
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
