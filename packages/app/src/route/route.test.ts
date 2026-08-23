import { describe, expect, test } from 'bun:test';
import { Reference as BibleReference } from '@bible/core/bible';
import { topicSlug } from '@bible/core/wiki';
import { Reference as WritingsReference } from '@bible/core/writings';
import { Option } from 'effect';

import { decodeRoute, encodeRoute } from './codec.js';
import type { AppRoute, RouteHistory } from './model.js';
import { bootRoute, navigate } from './navigation.js';
import { readerLocationForRoute, readingRouteForLocation } from './reading-location.js';

const routes: readonly AppRoute[] = [
  { _tag: 'bible', reference: BibleReference.chapter(1, 1) },
  { _tag: 'bible', reference: BibleReference.verse(43, 3, 16) },
  { _tag: 'writings-catalog' },
  { _tag: 'writings', reference: WritingsReference.publication(12) },
  { _tag: 'writings', reference: WritingsReference.page(12, 42) },
  { _tag: 'writings', reference: WritingsReference.paragraph(12, 'p 1/2') },
  {
    _tag: 'search',
    query: 'living water',
    scope: 'bible',
    books: [19, 43],
    corpus: Option.none(),
    bookCode: Option.none(),
  },
  // §10's shared query/scope/book URL state: the two §9 narrowings round-trip
  // so one hybrid search is one link on web and on desktop.
  {
    _tag: 'search',
    query: 'the close of probation',
    scope: 'writings',
    books: [],
    corpus: Option.some('pioneer'),
    bookCode: Option.some('DAR'),
  },
  { _tag: 'topics', topicId: 'new earth' },
  { _tag: 'wiki', slug: topicSlug('sanctuary') },
  // A slug that needs escaping, so the encode/decode pair is exercised on the
  // one route whose segment is arbitrary authored text.
  { _tag: 'wiki', slug: topicSlug('2300-days/1844') },
  { _tag: 'plans', planId: 'gospels' },
  { _tag: 'practice', memoryVerseId: 'john-3-16' },
  { _tag: 'settings', section: 'reader' },
];

describe('route codec', () => {
  for (const route of routes) {
    test(`round trips ${route._tag}`, () => {
      expect(decodeRoute(encodeRoute(route))).toEqual(Option.some(route));
    });
  }

  test('rejects malformed explicit routes instead of guessing', () => {
    expect(decodeRoute('/bible/67/1')).toEqual(Option.none());
    expect(decodeRoute('/writings/12/page/zero')).toEqual(Option.none());
    expect(decodeRoute('/settings/unknown')).toEqual(Option.none());
    // `/wiki` with no slug composes nothing, and `/wiki/` is the same path with
    // an empty segment. Both decode to nothing, which is what makes the wiki
    // route round-trippable: the model holds a branded `TopicSlug`, so the empty
    // slug that would encode to `/wiki/` cannot be constructed in the first
    // place — `{ _tag: 'wiki', slug: '' }` is a type error, not a route that
    // fails to come back.
    expect(decodeRoute('/wiki')).toEqual(Option.none());
    expect(decodeRoute('/wiki/')).toEqual(Option.none());
    expect(decodeRoute('/wiki/a/b')).toEqual(Option.none());
  });

  /** Round-2 F16: an empty `book=` is absent, and stays absent through a
   *  re-encode.
   *
   *  The route model used to admit `Option.some('')`, which the encoder wrote
   *  as a bare `book=` and the decoder read back as `None` — a URL that could
   *  be built and then not come back to itself. The model now carries the
   *  branded `WritingsBookCode`, so the empty code cannot be constructed; what
   *  remains testable is the other direction, a hand-written or truncated link
   *  arriving with `book=` set to nothing. It must decode to `None` and
   *  re-encode without the parameter, rather than round-tripping an empty
   *  filter that narrows the search to no book at all. */
  test('an empty book parameter decodes to absent and does not survive a re-encode', () => {
    const decoded = decodeRoute('/search?q=probation&scope=writings&book=');
    expect(Option.isSome(decoded)).toBe(true);
    if (Option.isNone(decoded)) return;
    const route = decoded.value;
    expect(route._tag).toBe('search');
    if (route._tag !== 'search') return;
    expect(route.bookCode).toEqual(Option.none());
    // The canonical link carries no `book` at all, so a truncated URL
    // normalizes to the search it actually describes.
    const encoded = encodeRoute(route);
    expect(encoded).not.toContain('book=');
    expect(new URL(encoded, 'https://x').searchParams.has('book')).toBe(false);
    // And it is stable: the normalized link decodes to the same value.
    expect(decodeRoute(encoded)).toEqual(Option.some(route));
  });

  /** The same rule for `corpus=`, which shares the decoder's filter path: an
   *  unrecognized or empty value is absent rather than a failed route. */
  test('an empty corpus parameter decodes to absent and does not survive a re-encode', () => {
    const decoded = decodeRoute('/search?q=probation&scope=writings&corpus=');
    expect(Option.isSome(decoded)).toBe(true);
    if (Option.isNone(decoded)) return;
    const route = decoded.value;
    if (route._tag !== 'search') return;
    expect(route.corpus).toEqual(Option.none());
    expect(encodeRoute(route)).not.toContain('corpus=');
  });
});

describe('route boot precedence', () => {
  const persisted = { _tag: 'bible', reference: BibleReference.verse(66, 22, 21) } as const;

  test('an explicit route wins over persisted continuity', () => {
    expect(bootRoute({ requestedPath: '/bible/43/1', persisted })).toEqual({
      route: { _tag: 'bible', reference: BibleReference.chapter(43, 1) },
      historyMode: 'preserve',
      reason: 'explicit',
    });
  });

  test('only the root restores persisted continuity', () => {
    expect(bootRoute({ requestedPath: '/', persisted })).toEqual({
      route: persisted,
      historyMode: 'replace',
      reason: 'persisted',
    });
    expect(bootRoute({ requestedPath: '/' }).route).toEqual({
      _tag: 'bible',
      reference: BibleReference.chapter(1, 1),
    });
  });

  test('malformed explicit routes remain visible as not found', () => {
    expect(bootRoute({ requestedPath: '/bible/nope/1' })).toEqual({
      route: { _tag: 'not-found', requestedPath: '/bible/nope/1' },
      historyMode: 'preserve',
      reason: 'not-found',
    });
  });
});

describe('reading continuity route projection', () => {
  test('round-trips canonical Bible and Writings locations', () => {
    const bible = { _tag: 'bible', reference: BibleReference.verse(43, 3, 16) } as const;
    const writings = {
      _tag: 'writings',
      reference: WritingsReference.page(12, 42),
    } as const;

    expect(readingRouteForLocation(readerLocationForRoute(bible))).toEqual(Option.some(bible));
    expect(readingRouteForLocation(readerLocationForRoute(writings))).toEqual(
      Option.some(writings),
    );
  });

  test('rejects non-reading and mismatched persisted locations', () => {
    expect(readerLocationForRoute({ _tag: 'settings', section: 'reader' })).toEqual(Option.none());
    expect(
      readingRouteForLocation(
        Option.some({ source: 'egw', resourceId: '99', location: '/writings/12' }),
      ),
    ).toEqual(Option.none());
    expect(
      readingRouteForLocation(
        Option.some({ source: 'bible', resourceId: 'KJV', location: '/search' }),
      ),
    ).toEqual(Option.none());
  });
});

test('navigation pushes intent and replaces refinements', () => {
  const writes: string[] = [];
  const history: RouteHistory = {
    read: () => '/',
    push: (path) => writes.push(`push:${path}`),
    replace: (path) => writes.push(`replace:${path}`),
    subscribe: () => () => {},
  };
  const route = {
    _tag: 'search',
    query: 'faith',
    scope: 'all',
    books: [],
    corpus: Option.none(),
    bookCode: Option.none(),
  } as const;
  navigate(history, route);
  navigate(history, route, 'refinement');
  expect(writes).toEqual(['push:/search?q=faith', 'replace:/search?q=faith']);
});
