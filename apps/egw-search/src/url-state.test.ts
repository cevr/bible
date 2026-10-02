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

/**
 * Links as this app has written and read them, each with the href the app
 * writes back for it: the canonical ones come back byte for byte, and the
 * rest normalise the way they always have (defaults left out, unknown keys
 * and values dropped, `limit` clamped, the walk stopping at a gap).
 */
const LINKS: ReadonlyArray<readonly [search: string, written: string]> = [
  ['', '/'],
  ['q=latter+rain', '/?q=latter+rain'],
  ['q=latter%20rain', '/?q=latter+rain'],
  ['q=latter+rain&subtype=-devotional', '/?q=latter+rain&subtype=-devotional'],
  ['q=latter+rain&q2=loud+cry&section2=bible', '/?q=latter+rain&q2=loud+cry&section2=bible'],
  [
    'q=latter+rain&scope=egw&type=book&type=-periodical&noref=1&q2=&section2=bible',
    '/?q=latter+rain&scope=egw&type=book&type=-periodical&noref=1&q2=&section2=bible',
  ],
  ['q=a&q2=', '/?q=a&q2='],
  ['q=a&q2=&q3=&q4=', '/?q=a&q2=&q3=&q4='],
  ['q=a&q2=b&q3=c&q4=d&q5=e', '/?q=a&q2=b&q3=c&q4=d'],
  ['q=a&subtype2=commentary', '/?q=a&q2=&subtype2=commentary'],
  ['q=a&q3=c', '/?q=a'],
  ['q=x&scope=banana&type=book&type=nonsense&limit=-3', '/?q=x&type=book'],
  ['q=x&scope=all', '/?q=x'],
  ['q=x&limit=40', '/?q=x'],
  ['q=x&limit=100', '/?q=x&limit=100'],
  ['q=x&limit=200', '/?q=x&limit=100'],
  ['q=x&limit=7.9', '/?q=x&limit=7'],
  ['q=x&limit=1e1', '/?q=x&limit=10'],
  ['q=x&limit=', '/?q=x'],
  ['q=x&limit=abc', '/?q=x'],
  ['q=x&limit=Infinity', '/?q=x'],
  // A limit that truncates to nothing is the default: it once read as 0 and
  // wrote `limit=0`, which read back as 40.
  ['q=x&limit=0.5', '/?q=x'],
  ['q=x&noref=0', '/?q=x'],
  ['q=x&noref=true', '/?q=x'],
  ['q=x&noref=1', '/?q=x&noref=1'],
  ['q=x&q=y', '/?q=x'],
  ['scope=egw&q=x', '/?q=x&scope=egw'],
  ['q=x&section=-bible&section=egw&section=-pioneer', '/?q=x&section=-bible'],
  ['q=x&type=-book&type=book', '/?q=x&type=book&type=-book'],
  ['q=x&other=1&utm_source=mail', '/?q=x'],
  ['q=caf%C3%A9+%26+cr%C3%A8me', '/?q=caf%C3%A9+%26+cr%C3%A8me'],
  ['q=a%2Bb%3Dc', '/?q=a%2Bb%3Dc'],
  ['q=%E1%BC%80%CE%B3%CE%AC%CF%80%CE%B7', '/?q=%E1%BC%80%CE%B3%CE%AC%CF%80%CE%B7'],
  // The first pane is always there, so a link whose first pane is at its
  // defaults keeps its later panes. It once read as one pane, so "+ pane" on
  // an empty first pane wrote `/?q2=` and no second pane appeared.
  ['q2=b', '/?q2=b'],
  ['q2=', '/?q2='],
  ['scope=bible', '/'],
  ['q=a&scope2=egw&q2=', '/?q=a&q2=&scope2=egw'],
  [
    'q=a&q2=b&scope2=egw&type2=-book&noref2=1&limit2=20',
    '/?q=a&q2=b&scope2=egw&type2=-book&noref2=1&limit2=20',
  ],
];

describe("the links of today's app", () => {
  test.each(LINKS)('%p writes %p, which reads back as itself', (search, written) => {
    const panes = parseWorkspace(search);
    expect(toWorkspaceString(panes)).toBe(written);
    expect(parseWorkspace(written.slice(1))).toEqual(panes);
    expect(toWorkspaceString(parseWorkspace(written.slice(1)))).toBe(written);
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
