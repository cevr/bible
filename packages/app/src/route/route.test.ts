import { describe, expect, test } from 'bun:test';
import { Reference as BibleReference } from '@bible/core/bible';
import { Reference as WritingsReference } from '@bible/core/writings';

import { decodeRoute, encodeRoute } from './codec.js';
import {
  defaultDisclosure,
  dismissTopDisclosure,
  openContext,
  openNavigation,
  projectSurface,
  pushOverlay,
} from './disclosure.js';
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
  { _tag: 'search', query: 'living water', scope: 'bible', books: [19, 43] },
  { _tag: 'topics', topicId: 'new earth' },
  { _tag: 'plans', planId: 'gospels' },
  { _tag: 'practice', memoryVerseId: 'john-3-16' },
  { _tag: 'settings', section: 'reader' },
];

describe('route codec', () => {
  for (const route of routes) {
    test(`round trips ${route._tag}`, () => {
      expect(decodeRoute(encodeRoute(route))).toEqual(route);
    });
  }

  test('rejects malformed explicit routes instead of guessing', () => {
    expect(decodeRoute('/bible/67/1')).toBeUndefined();
    expect(decodeRoute('/writings/12/page/zero')).toBeUndefined();
    expect(decodeRoute('/settings/unknown')).toBeUndefined();
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

    expect(readingRouteForLocation(readerLocationForRoute(bible))).toEqual(bible);
    expect(readingRouteForLocation(readerLocationForRoute(writings))).toEqual(writings);
  });

  test('rejects non-reading and mismatched persisted locations', () => {
    expect(readerLocationForRoute({ _tag: 'settings', section: 'reader' })).toBeUndefined();
    expect(
      readingRouteForLocation({ source: 'egw', resourceId: '99', location: '/writings/12' }),
    ).toBeUndefined();
    expect(
      readingRouteForLocation({ source: 'bible', resourceId: 'KJV', location: '/search' }),
    ).toBeUndefined();
  });
});

test('navigation pushes intent and replaces refinements', () => {
  const writes: string[] = [];
  const history: RouteHistory = {
    read: () => '/',
    push: (path) => writes.push(`push:${path}`),
    replace: (path) => writes.push(`replace:${path}`),
    subscribe: () => () => undefined,
  };
  const route = { _tag: 'search', query: 'faith', scope: 'all', books: [] } as const;
  navigate(history, route);
  navigate(history, route, 'refinement');
  expect(writes).toEqual(['push:/search?q=faith', 'replace:/search?q=faith']);
});

test('escape dismisses overlay, context, then navigation', () => {
  let disclosure = defaultDisclosure('narrow');
  disclosure = openNavigation(disclosure, 'contents');
  disclosure = openContext(disclosure, {
    _tag: 'verse-study',
    reference: BibleReference.verse(1, 1, 1),
    tab: 'notes',
  });
  disclosure = pushOverlay(disclosure, 'quick-find');

  expect(
    projectSurface({ _tag: 'bible', reference: BibleReference.chapter(1, 1) }, disclosure),
  ).toMatchObject({
    left: null,
    right: null,
    replacement: { _tag: 'context', pane: { _tag: 'verse-study' } },
  });

  disclosure = dismissTopDisclosure(disclosure);
  expect(disclosure.overlays).toEqual([]);
  disclosure = dismissTopDisclosure(disclosure);
  expect(disclosure.context).toBeNull();
  disclosure = dismissTopDisclosure(disclosure);
  expect(disclosure.navigation).toBe('closed');
});
