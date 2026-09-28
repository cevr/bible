// The selection round-trips through the URL's `sel`, beside the page's other
// parameters; anything that does not name a cue or knob of a scene is none.

import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { searchWithSelection, selectionFromSearch, selectsCue } from './selection.ts';

describe('selection in the URL', () => {
  test('reads a cue or a knob', () => {
    expect(selectionFromSearch('?film=probe&sel=cue:one:rise')).toEqual(
      Option.some({ kind: 'cue', scene: 'one', name: 'rise' }),
    );
    expect(selectionFromSearch('?sel=knob:one:spot')).toEqual(
      Option.some({ kind: 'knob', scene: 'one', name: 'spot' }),
    );
  });

  test('anything else is none', () => {
    for (const search of ['', '?sel=', '?sel=cue:one', '?sel=mark:one:x', '?sel=cue::rise'])
      expect(selectionFromSearch(search)).toEqual(Option.none());
  });

  test('writes it beside the other parameters, and drops it for none', () => {
    const sel = Option.some({ kind: 'cue' as const, scene: 'one', name: 'rise' });
    expect(searchWithSelection('?film=probe', sel)).toBe('?film=probe&sel=cue%3Aone%3Arise');
    expect(selectionFromSearch(searchWithSelection('?film=probe', sel))).toEqual(sel);
    expect(searchWithSelection('?film=probe&sel=cue:one:rise', Option.none())).toBe('?film=probe');
  });

  test('names a cue only when its scene and name match', () => {
    const sel = Option.some({ kind: 'cue' as const, scene: 'one', name: 'rise' });
    expect(selectsCue(sel, 'one', 'rise')).toBe(true);
    expect(selectsCue(sel, 'two', 'rise')).toBe(false);
    expect(selectsCue(Option.none(), 'one', 'rise')).toBe(false);
  });
});
