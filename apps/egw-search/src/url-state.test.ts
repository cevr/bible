import { describe, expect, test } from 'bun:test';

import {
  cycle,
  DEFAULT_LIMIT,
  EMPTY_PARAMS,
  MAX_PANES,
  paneKey,
  parseWorkspace,
  toRequest,
  toWorkspaceString,
} from './url-state.js';

describe('workspace URL', () => {
  test('a one-pane link reads as the URLs this app always produced', () => {
    const panes = parseWorkspace('?q=latter+rain&subtype=-devotional');
    expect(panes).toHaveLength(1);
    expect(panes[0]?.q).toBe('latter rain');
    expect(panes[0]?.subtype).toEqual({ include: [], exclude: ['devotional'] });
    expect(panes[0]?.limit).toBe(DEFAULT_LIMIT);
  });

  test('a second pane reads its suffixed keys', () => {
    const panes = parseWorkspace('?q=latter+rain&q2=loud+cry&section2=bible');
    expect(panes.map((pane) => pane.q)).toEqual(['latter rain', 'loud cry']);
    expect(panes[1]?.section).toEqual({ include: ['bible'], exclude: [] });
  });

  test('writing then reading gives the same workspace back', () => {
    const panes = parseWorkspace(
      '?q=latter+rain&scope=egw&type=book&type=-periodical&noref=1&q2=&section2=bible',
    );
    expect(parseWorkspace(toWorkspaceString(panes).slice(1))).toEqual(panes);
  });

  test('an added, empty pane survives the round trip as a pane', () => {
    const panes = [{ ...EMPTY_PARAMS, q: 'latter rain' }, EMPTY_PARAMS];
    expect(toWorkspaceString(panes)).toBe('/?q=latter+rain&q2=');
    expect(parseWorkspace(toWorkspaceString(panes).slice(1))).toHaveLength(2);
  });

  test('a pane present only through a filter key is still a pane', () => {
    expect(parseWorkspace('?q=a&subtype2=commentary')).toHaveLength(2);
  });

  test('an empty workspace is the root path', () => {
    expect(toWorkspaceString([EMPTY_PARAMS])).toBe('/');
  });

  test('the walk stops at the first gap and at MAX_PANES', () => {
    expect(parseWorkspace('?q=a&q3=c')).toHaveLength(1);
    const many = Object.fromEntries(
      Array.from({ length: MAX_PANES + 3 }, (_, i) => [paneKey('q', i), 'x']),
    );
    expect(parseWorkspace(new URLSearchParams(many).toString())).toHaveLength(MAX_PANES);
  });

  test('a broken value degrades to the default rather than failing the page', () => {
    const panes = parseWorkspace('?q=x&scope=banana&type=book&type=nonsense&limit=-3');
    expect(panes[0]?.scope).toBe('all');
    expect(panes[0]?.type).toEqual({ include: ['book'], exclude: [] });
    expect(panes[0]?.limit).toBe(DEFAULT_LIMIT);
  });
});

describe('cycle', () => {
  test('off → include → exclude → off', () => {
    const include = cycle({ include: [], exclude: [] }, 'a');
    expect(include).toEqual({ include: ['a'], exclude: [] });
    const exclude = cycle(include, 'a');
    expect(exclude).toEqual({ include: [], exclude: ['a'] });
    expect(cycle(exclude, 'a')).toEqual({ include: [], exclude: [] });
  });
});

describe('toRequest', () => {
  test('carries every field and the caller-supplied context', () => {
    const request = toRequest({ ...EMPTY_PARAMS, q: '  latter rain ' }, 3);
    expect(request.q).toBe('latter rain');
    expect(request.context).toBe(3);
    expect(request.limit).toBe(DEFAULT_LIMIT);
  });
});
