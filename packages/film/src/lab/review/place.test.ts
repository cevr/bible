// The place and view the review page's URL keeps: every place read back as
// it was written, and the view (a pair against one of the set, the moment
// shown) kept in the set's query.

import { describe, expect, test } from 'bun:test';
import { Place } from '@bible/url-state';
import { Equal, Option } from 'effect';
import { Places } from '../../core/api.ts';
import { ViewEvent, ViewState } from './machine.ts';
import {
  ReviewPlace,
  type SetQuery,
  historyOf,
  hrefOf,
  keptTime,
  placeOf,
  queryOfView,
  viewOf,
} from './place.ts';

/** The view query of a set link ending in `search`. */
const queryAt = (search: string): SetQuery =>
  Option.getOrThrow(Place.decode(Places.set, `/sets/f/s${search}`)).query;

describe('the place in the URL', () => {
  test('reads home, a folder, a set, a film and a project, and writes them back', () => {
    for (const place of [
      ReviewPlace.Home(),
      ReviewPlace.Folder({ folder: 'out/art 3' }),
      ReviewPlace.Set({ folder: 'out/art 3', point: 'render:scenes:roof&sky' }),
      ReviewPlace.Film({ film: 'righteousness-by-faith' }),
      ReviewPlace.Project({ film: 'righteousness-by-faith' }),
    ])
      expect(placeOf(hrefOf(place))).toEqual(place);
    expect(hrefOf(ReviewPlace.Home())).toBe('/');
    expect(hrefOf(ReviewPlace.Set({ folder: 'out/a b', point: 'p&q' }))).toBe(
      '/sets/out%2Fa%20b/p%26q',
    );
    expect(placeOf('/films/f/lab')).toEqual(ReviewPlace.Home());
    expect(placeOf('/sets')).toEqual(ReviewPlace.Home());
  });

  test('keeps the view, a pair against one of the set, the moment shown', () => {
    const ids = ['A', 'B', 'C'];
    expect(viewOf(queryAt(''), ids)).toEqual(ViewState.All);
    expect(viewOf(queryAt('?view=pair&other=C'), ids)).toEqual(ViewState.Pair({ other: 'C' }));
    expect(viewOf(queryAt('?view=pair&other=A'), ids)).toEqual(ViewState.Pair({ other: 'B' }));
    expect(viewOf(queryAt('?view=pair&other=Z'), ids)).toEqual(ViewState.Pair({ other: 'B' }));
    expect(viewOf(queryAt('?view=moments&m=3'), ids)).toEqual(ViewState.Moments({ index: 3 }));
    expect(viewOf(queryAt('?view=moments&m=-2'), ids)).toEqual(ViewState.Moments({ index: 0 }));
    expect(viewOf(queryAt('?view=notes'), ids)).toEqual(ViewState.Notes);
    expect(viewOf(queryAt('?view=wat'), ids)).toEqual(ViewState.All);
  });

  test('a place or a view read again from a new href is equal to the one before', () => {
    const set = '/sets/f/s?view=pair&other=C';
    expect(Equal.equals(placeOf(`${set}#t=1`), placeOf(`${set}#t=2`))).toBe(true);
    expect(Equal.equals(placeOf(set), placeOf('/sets/f/t'))).toBe(false);
    const ids = ['A', 'B', 'C'];
    expect(
      Equal.equals(
        viewOf(queryAt('?view=moments&m=2'), ids),
        viewOf(queryAt('?view=moments&m=2'), ids),
      ),
    ).toBe(true);
    expect(
      Equal.equals(
        viewOf(queryAt('?view=moments&m=2'), ids),
        viewOf(queryAt('?view=moments&m=3'), ids),
      ),
    ).toBe(false);
  });

  test('a set of one shows all where a link asks for the pair', () => {
    expect(viewOf(queryAt('?view=pair&other=nope'), ['A'])).toEqual(ViewState.All);
  });

  test('a view or a moment chosen is a step Back undoes; a pair cycled or a ←/→ step is not', () => {
    expect(historyOf(ViewEvent.ViewChosen({ view: 'moments' }))).toBe('push');
    expect(historyOf(ViewEvent.OtherChosen({ id: 'C' }))).toBe('replace');
    expect(historyOf(ViewEvent.MomentChosen({ index: 3 }))).toBe('push');
    expect(historyOf(ViewEvent.MomentStepped({ by: 1, count: 5 }))).toBe('replace');
  });

  test("keeps a player's time to the ms, and none at its start", () => {
    expect(keptTime(12.34567, 0)).toEqual(Option.some(12.346));
    expect(keptTime(2, 2)).toEqual(Option.none());
    expect(keptTime(0, 0)).toEqual(Option.none());
  });

  test('writes the view into the query, and only what that view keeps', () => {
    const at = (state: ViewState) =>
      Place.href(Places.set, {
        path: { folder: 'f', point: 's' },
        query: queryOfView(state),
        hash: { t: Option.none() },
      });
    expect(at(ViewState.Pair({ other: 'C' }))).toBe('/sets/f/s?view=pair&other=C');
    expect(at(ViewState.Moments({ index: 2 }))).toBe('/sets/f/s?view=moments&m=2');
    expect(at(ViewState.All)).toBe('/sets/f/s');
    for (const state of [ViewState.Pair({ other: 'C' }), ViewState.Moments({ index: 2 })])
      expect(viewOf(queryAt(at(state).slice('/sets/f/s'.length)), ['A', 'B', 'C'])).toEqual(state);
  });
});
