// The place and view the review page's URL keeps: every place read back as
// it was written, and the view (a pair against one of the set, the moment
// shown) kept beside the place.

import { describe, expect, test } from 'bun:test';
import { ViewState } from './machine.ts';
import { ReviewPlace, placeOf, searchOf, searchWithView, viewOf } from './place.ts';

describe('the place in the URL', () => {
  test('reads home, a folder and a set, and writes them back', () => {
    for (const place of [
      ReviewPlace.Home(),
      ReviewPlace.Folder({ folder: 'out/art 3' }),
      ReviewPlace.Set({ folder: 'out/art 3', point: 'render:scenes:roof&sky' }),
      ReviewPlace.Film({ film: 'righteousness-by-faith' }),
      ReviewPlace.Project({ film: 'righteousness-by-faith' }),
    ])
      expect(placeOf(searchOf(place))).toEqual(place);
    expect(searchOf(ReviewPlace.Home())).toBe('');
    expect(placeOf('?set=roof')).toEqual(ReviewPlace.Home());
    expect(placeOf('?folder=&set=roof')).toEqual(ReviewPlace.Home());
  });

  test('keeps the view, a pair against one of the set, the moment shown', () => {
    const ids = ['A', 'B', 'C'];
    expect(viewOf('?folder=f&set=s', ids)).toEqual(ViewState.All);
    expect(viewOf('?view=pair&other=C', ids)).toEqual(ViewState.Pair({ other: 'C' }));
    expect(viewOf('?view=pair&other=A', ids)).toEqual(ViewState.Pair({ other: 'B' }));
    expect(viewOf('?view=pair&other=Z', ids)).toEqual(ViewState.Pair({ other: 'B' }));
    expect(viewOf('?view=moments&m=3', ids)).toEqual(ViewState.Moments({ index: 3 }));
    expect(viewOf('?view=moments&m=-2', ids)).toEqual(ViewState.Moments({ index: 0 }));
    expect(viewOf('?view=notes', ids)).toEqual(ViewState.Notes);
    expect(viewOf('?view=wat', ids)).toEqual(ViewState.All);
  });

  test('writes the view into the URL, leaving the place as it was', () => {
    const at = '?folder=f&set=s';
    const pair = searchWithView(at, ViewState.Pair({ other: 'C' }));
    expect(pair).toBe('?folder=f&set=s&view=pair&other=C');
    expect(searchWithView(pair, ViewState.Moments({ index: 2 }))).toBe(
      '?folder=f&set=s&view=moments&m=2',
    );
    expect(searchWithView(pair, ViewState.All)).toBe(at);
  });
});
