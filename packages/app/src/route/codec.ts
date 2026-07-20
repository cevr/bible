import { Reference as BibleReference } from '@bible/core/bible';
import { Reference as WritingsReference } from '@bible/core/writings';
import { Option } from 'effect';

import type { AppRoute, SearchScope, SettingsSection } from './model.js';

const isSettingsSection = (value: string): value is SettingsSection =>
  value === 'reader' ||
  value === 'sync' ||
  value === 'data' ||
  value === 'shortcuts' ||
  value === 'about';

const positiveInteger = (value: string | undefined): number | undefined => {
  if (value === undefined || !/^[1-9][0-9]*$/.test(value)) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) return undefined;
  return parsed;
};

const decodeUriComponent = Option.liftThrowable(decodeURIComponent);
const parseUrl = Option.liftThrowable(
  (pathWithQuery: string) => new URL(pathWithQuery, 'https://local.bible'),
);

const decodeSegment = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const decoded = Option.getOrUndefined(decodeUriComponent(value));
  if (decoded === undefined || decoded.length === 0) return undefined;
  return decoded;
};

const normalizeBooks = (books: readonly number[]): readonly number[] =>
  [...new Set(books.filter((book) => Number.isSafeInteger(book) && book >= 1 && book <= 66))].sort(
    (left, right) => left - right,
  );

export const encodeRoute = (route: AppRoute): string => {
  switch (route._tag) {
    case 'bible': {
      const { reference } = route;
      const base = `/bible/${String(reference.book)}/${String(reference.chapter)}`;
      if (reference._tag === 'verse') return `${base}/${String(reference.verse)}`;
      return base;
    }
    case 'writings-catalog':
      return '/writings';
    case 'writings': {
      const { reference } = route;
      const base = `/writings/${String(reference.publicationId)}`;
      if (reference._tag === 'publication') return base;
      if (reference._tag === 'page') return `${base}/page/${String(reference.page)}`;
      return `${base}/p/${encodeURIComponent(reference.paragraphId)}`;
    }
    case 'search': {
      const params = new URLSearchParams();
      if (route.query.length > 0) params.set('q', route.query);
      if (route.scope !== 'all') params.set('scope', route.scope);
      const books = normalizeBooks(route.books);
      if (books.length > 0) params.set('books', books.join(','));
      const query = params.toString();
      if (query.length > 0) return `/search?${query}`;
      return '/search';
    }
    case 'topics': {
      if (route.topicId) return `/topics/${encodeURIComponent(route.topicId)}`;
      return '/topics';
    }
    case 'plans': {
      if (route.planId) return `/plans/${encodeURIComponent(route.planId)}`;
      return '/plans';
    }
    case 'practice': {
      if (route.memoryVerseId) {
        return `/practice/${encodeURIComponent(route.memoryVerseId)}`;
      }
      return '/practice';
    }
    case 'settings':
      return `/settings/${route.section}`;
    case 'not-found':
      return route.requestedPath;
  }
};

export const decodeRoute = (pathWithQuery: string): AppRoute | undefined => {
  const url = Option.getOrUndefined(parseUrl(pathWithQuery));
  if (url === undefined) return undefined;

  const segments = url.pathname.split('/').filter(Boolean);
  const [root, one, two, three] = segments;

  if (root === 'bible' && segments.length >= 3 && segments.length <= 4) {
    const book = positiveInteger(one);
    const chapter = positiveInteger(two);
    const verse = positiveInteger(three);
    if (book === undefined || book > 66 || chapter === undefined) return undefined;
    if (segments.length === 4) {
      if (verse === undefined) return undefined;
      return { _tag: 'bible', reference: BibleReference.verse(book, chapter, verse) };
    }
    return { _tag: 'bible', reference: BibleReference.chapter(book, chapter) };
  }

  if (root === 'writings') {
    if (segments.length === 1) return { _tag: 'writings-catalog' };
    const publicationId = positiveInteger(one);
    if (publicationId === undefined) return undefined;
    if (segments.length === 2) {
      return { _tag: 'writings', reference: WritingsReference.publication(publicationId) };
    }
    if (segments.length === 4 && two === 'page') {
      const page = positiveInteger(three);
      if (page === undefined) return undefined;
      return { _tag: 'writings', reference: WritingsReference.page(publicationId, page) };
    }
    if (segments.length === 4 && two === 'p') {
      const paragraphId = decodeSegment(three);
      if (paragraphId === undefined) return undefined;
      return {
        _tag: 'writings',
        reference: WritingsReference.paragraph(publicationId, paragraphId),
      };
    }
    return undefined;
  }

  if (root === 'search' && segments.length === 1) {
    const requestedScope = url.searchParams.get('scope');
    let scope: SearchScope = 'all';
    if (requestedScope === 'bible' || requestedScope === 'writings') scope = requestedScope;
    const books = normalizeBooks(
      (url.searchParams.get('books') ?? '').split(',').map((book) => Number.parseInt(book, 10)),
    );
    return { _tag: 'search', query: url.searchParams.get('q') ?? '', scope, books };
  }

  if (root === 'topics' && segments.length <= 2) {
    return { _tag: 'topics', topicId: decodeSegment(one) };
  }
  if (root === 'plans' && segments.length <= 2) {
    return { _tag: 'plans', planId: decodeSegment(one) };
  }
  if (root === 'practice' && segments.length <= 2) {
    return { _tag: 'practice', memoryVerseId: decodeSegment(one) };
  }
  if (root === 'settings' && segments.length <= 2) {
    const section = one ?? 'reader';
    if (!isSettingsSection(section)) return undefined;
    return { _tag: 'settings', section };
  }

  return undefined;
};
