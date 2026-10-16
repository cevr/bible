// The place and view the review page's URL keeps: every place read back as
// it was written, and the view (a pair against one of the set, the moment
// shown) kept in the set's query; and every place ⌘K's Go to reaches.

import { describe, expect, test } from 'bun:test';
import { Place } from '@bible/url-state';
import { Equal, Option, Schema } from 'effect';
import { Places, pageMove } from '../../core/api.ts';
import { ReviewIndex } from '../../core/review.ts';
import { ViewEvent, ViewState } from './machine.ts';
import {
  ReviewPlace,
  destinationsOf,
  type SetQuery,
  causeOf,
  hrefOf,
  keptTime,
  placeOf,
  queryOfView,
  shownQuery,
  stillIn,
  viewOf,
  withStill,
} from './place.ts';

/** The view query of a set link ending in `search`. */
const queryAt = (search: string): SetQuery =>
  Option.getOrThrow(Place.decode(Places.set, `/sets/f/s${search}`)).query;

describe('the place in the URL', () => {
  test('reads home, a folder and a set, and writes them back', () => {
    for (const place of [
      ReviewPlace.Home(),
      ReviewPlace.Folder({ folder: 'out/art 3' }),
      ReviewPlace.Set({ folder: 'out/art 3', point: 'render:scenes:roof&sky' }),
    ])
      expect(placeOf(hrefOf(place))).toEqual(place);
    expect(hrefOf(ReviewPlace.Home())).toBe('/');
    expect(hrefOf(ReviewPlace.Set({ folder: 'out/a b', point: 'p&q' }))).toBe(
      '/sets/out%2Fa%20b/p%26q',
    );
    expect(placeOf('/films/f/lab')).toEqual(ReviewPlace.Home());
    // The studio replaced a film's project: the review reads it as no place of its own.
    expect(placeOf('/films/f/project')).toEqual(ReviewPlace.Home());
    expect(placeOf('/films/f/choices')).toEqual(ReviewPlace.Home());
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
    expect(viewOf(queryAt('?view=notes'), ids)).toEqual(ViewState.All);
    expect(viewOf(queryAt('?view=wat'), ids)).toEqual(ViewState.All);
  });

  test("an old link to a set's notes opens all, with the first version's Info (UR-34)", () => {
    const whole = (search: string) =>
      Option.getOrThrow(Place.decode(Places.set, `/sets/f/s${search}`)).query;
    const old = whole('?view=notes');
    expect(shownQuery(old, viewOf(old, ['A', 'B']), 'A')).toEqual({
      ...whole(''),
      inspect: 'A',
    });
    // A link that names a version's Info keeps it.
    const named = whole('?view=notes&inspect=B');
    expect(shownQuery(named, viewOf(named, ['A', 'B']), 'A').inspect).toBe('B');
    // Any other view keeps its sheet as it is.
    const pair = whole('?view=pair&other=B');
    expect(shownQuery(pair, viewOf(pair, ['A', 'B']), 'A').inspect).toBe('');
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

  test('keeps the wipe and the difference (PA-8): an other of the set, and the moment the difference is at', () => {
    const ids = ['A', 'B', 'C'];
    expect(viewOf(queryAt('?view=wipe&other=C'), ids)).toEqual(ViewState.Wipe({ other: 'C' }));
    expect(viewOf(queryAt('?view=wipe&other=Z'), ids)).toEqual(ViewState.Wipe({ other: 'B' }));
    expect(viewOf(queryAt('?view=diff&other=C&m=3'), ids)).toEqual(
      ViewState.Diff({ other: 'C', index: 3 }),
    );
    expect(viewOf(queryAt('?view=diff&other=C&m=-1'), ids)).toEqual(
      ViewState.Diff({ other: 'C', index: 0 }),
    );
    expect(viewOf(queryAt('?view=wipe'), ['A'])).toEqual(ViewState.All);
    expect(viewOf(queryAt('?view=diff'), ['A'])).toEqual(ViewState.All);
    const at = (state: ViewState) =>
      Place.href(Places.set, {
        path: { folder: 'f', point: 's' },
        query: { ...queryOfView(state), inspect: '', still: '' },
        hash: { t: Option.none() },
      });
    expect(at(ViewState.Wipe({ other: 'C' }))).toBe('/sets/f/s?view=wipe&other=C');
    expect(at(ViewState.Diff({ other: 'C', index: 2 }))).toBe('/sets/f/s?view=diff&other=C&m=2');
    for (const state of [ViewState.Wipe({ other: 'C' }), ViewState.Diff({ other: 'B', index: 1 })])
      expect(viewOf(queryAt(at(state).slice('/sets/f/s'.length)), ids)).toEqual(state);
  });

  test('a view or a moment chosen is a step Back undoes; a pair cycled or a ←/→ step is not', () => {
    const set = '/sets/f/s';
    /** The move `event` makes from `from` to `to`, as the address bar enters it. */
    const moveOf = (event: ViewEvent, from: string, to: string) =>
      ({ follow: 'replace', go: pageMove(`${set}${from}`, `${set}${to}`) })[causeOf(event)];
    expect(moveOf(ViewEvent.ViewChosen({ view: 'moments' }), '', '?view=moments')).toBe('push');
    expect(
      moveOf(ViewEvent.OtherChosen({ id: 'C' }), '?view=pair&other=B', '?view=pair&other=C'),
    ).toBe('replace');
    expect(
      moveOf(ViewEvent.MomentChosen({ index: 3 }), '?view=moments&m=1', '?view=moments&m=3'),
    ).toBe('push');
    expect(
      moveOf(
        ViewEvent.MomentStepped({ by: 1, count: 5 }),
        '?view=moments&m=3',
        '?view=moments&m=4',
      ),
    ).toBe('replace');
  });

  test("keeps a player's time to the ms rounded up, as every #t= is, and none at its start", () => {
    expect(keptTime(12.34567, 0)).toEqual(Option.some(12.346));
    // Rounded up, never to the nearest: a reload reads it back in its own frame, not before it.
    expect(keptTime(12.3451, 0)).toEqual(Option.some(12.346));
    // A time on the ms already stays itself.
    expect(keptTime(12.346, 0)).toEqual(Option.some(12.346));
    expect(keptTime(2, 2)).toEqual(Option.none());
    expect(keptTime(0, 0)).toEqual(Option.none());
  });

  test('writes the view into the query, and only what that view keeps', () => {
    const at = (state: ViewState) =>
      Place.href(Places.set, {
        path: { folder: 'f', point: 's' },
        query: { ...queryOfView(state), inspect: '', still: '' },
        hash: { t: Option.none() },
      });
    expect(at(ViewState.Pair({ other: 'C' }))).toBe('/sets/f/s?view=pair&other=C');
    expect(at(ViewState.Moments({ index: 2 }))).toBe('/sets/f/s?view=moments&m=2');
    expect(at(ViewState.All)).toBe('/sets/f/s');
    for (const state of [ViewState.Pair({ other: 'C' }), ViewState.Moments({ index: 2 })])
      expect(viewOf(queryAt(at(state).slice('/sets/f/s'.length)), ['A', 'B', 'C'])).toEqual(state);
  });

  test('a folder and a set keep the still open full size, its opening a step Back closes (SH5-1)', () => {
    const folder = '/sets/out%2Fsheets';
    const set = '/sets/f/s?view=moments&m=2';
    expect(stillIn(folder)).toEqual(Option.none());
    const sheet = Option.getOrThrow(withStill(folder, 'out/sheets/ink.jpg'));
    expect(sheet).toBe('/sets/out%2Fsheets?still=out%2Fsheets%2Fink.jpg');
    expect(stillIn(sheet)).toEqual(Option.some('out/sheets/ink.jpg'));
    const version = Option.getOrThrow(withStill(set, 'B'));
    expect(stillIn(version)).toEqual(Option.some('B'));
    // The view and the place stay as they were; none open again is the link before.
    expect(placeOf(version)).toEqual(placeOf(set));
    expect(withStill(version, '')).toEqual(Option.some(set));
    expect(pageMove(folder, sheet)).toBe('push');
    // An ask keeps one too: its Board's stills open full size, the ask's place unchanged.
    const ask = Option.getOrThrow(withStill('/asks/a0123456780', 'board-open.breath'));
    expect(ask).toBe('/asks/a0123456780?still=board-open.breath');
    expect(stillIn(ask)).toEqual(Option.some('board-open.breath'));
    expect(placeOf(ask)).toEqual(placeOf('/asks/a0123456780'));
    expect(withStill(ask, '')).toEqual(Option.some('/asks/a0123456780'));
    // Only a folder, a set or an ask keeps one.
    expect(withStill('/films/f/choices', 'x')).toEqual(Option.none());
    expect(stillIn('/films/f/choices?still=x')).toEqual(Option.none());
  });
});

describe('Go to on the review (AA-2)', () => {
  const index = Schema.decodeSync(ReviewIndex)({
    folders: [
      {
        ref: 'out/art',
        title: 'Roofs at dusk',
        mtime: 0,
        sets: [
          {
            id: 'render:p6-onset-roof',
            kind: 'render',
            title: 'Onset',
            lines: [],
            start: 0,
            marks: [],
            variants: [],
          },
        ],
        videos: [],
        images: [],
        docs: [],
      },
    ],
  });

  test('every folder and set, named as it is typed, going where its link goes', () => {
    const went: Array<ReviewPlace> = [];
    const destinations = destinationsOf(Option.some(index), (p) => went.push(p));
    expect(destinations.map((d) => [d.kind, d.id, d.name])).toEqual([
      ['folder', 'out/art', 'Roofs at dusk out/art'],
      ['set', 'out/art.render:p6-onset-roof', 'Onset in Roofs at dusk'],
    ]);
    for (const d of destinations) d.go('pointer');
    expect(went).toEqual([
      ReviewPlace.Folder({ folder: 'out/art' }),
      ReviewPlace.Set({ folder: 'out/art', point: 'render:p6-onset-roof' }),
    ]);
  });

  test('nothing to go to before the index is read', () => {
    expect(destinationsOf(Option.none(), () => {})).toEqual([]);
  });
});
