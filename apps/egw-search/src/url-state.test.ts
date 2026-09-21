import { describe, expect, test } from 'bun:test';
import { Schema } from 'effect';

import {
  DEFAULT_LIMIT,
  EMPTY_PARAMS,
  MAX_PANES,
  paneKey,
  parseWorkspace,
  toRequest,
  toWorkspaceString,
  Workspace,
} from './url-state.js';

const decode = Schema.decodeUnknownSync(Workspace);
const encode = Schema.encodeUnknownSync(Workspace);

describe('Workspace codec', () => {
  test('a one-pane link decodes as the URLs this app always produced', () => {
    const panes = decode({ q: ['latter rain'], subtype: ['-devotional'] });
    expect(panes).toHaveLength(1);
    expect(panes[0]?.q).toBe('latter rain');
    expect(panes[0]?.subtype).toEqual({ include: [], exclude: ['devotional'] });
    expect(panes[0]?.limit).toBe(DEFAULT_LIMIT);
  });

  test('a second pane reads its suffixed keys', () => {
    const panes = decode({ q: ['latter rain'], q2: ['loud cry'], section2: ['bible'] });
    expect(panes.map((pane) => pane.q)).toEqual(['latter rain', 'loud cry']);
    expect(panes[1]?.section).toEqual({ include: ['bible'], exclude: [] });
  });

  test('encoding then decoding gives the same workspace back', () => {
    const panes = decode({
      q: ['latter rain'],
      scope: ['egw'],
      type: ['book', '-periodical'],
      noref: ['1'],
      q2: [''],
      section2: ['bible'],
    });
    expect(decode(encode(panes))).toEqual(panes);
  });

  test('an added, empty pane survives the round trip as a pane', () => {
    const panes = [{ ...EMPTY_PARAMS, q: 'latter rain' }, EMPTY_PARAMS];
    expect(toWorkspaceString(panes)).toBe('/?q=latter+rain&q2=');
    expect(decode(encode(panes))).toHaveLength(2);
  });

  test('the walk stops at the first gap and at MAX_PANES', () => {
    expect(parseWorkspace('?q=a&q3=c')).toHaveLength(1);
    const many = Object.fromEntries(
      Array.from({ length: MAX_PANES + 3 }, (_, i) => [paneKey('q', i), 'x']),
    );
    expect(parseWorkspace(new URLSearchParams(many).toString())).toHaveLength(MAX_PANES);
  });

  test('a broken value degrades to the default rather than failing the page', () => {
    const panes = decode({ q: ['x'], scope: ['banana'], type: ['book', 'nonsense'] });
    expect(panes[0]?.scope).toBe('all');
    expect(panes[0]?.type).toEqual({ include: ['book'], exclude: [] });
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
