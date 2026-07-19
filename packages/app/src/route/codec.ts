import { Reference as BibleReference } from '@bible/core/bible';
import { Reference as WritingsReference } from '@bible/core/writings';

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
  return Number.isSafeInteger(parsed) ? parsed : undefined;
};

const decodeSegment = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  try {
    const decoded = decodeURIComponent(value);
    return decoded.length > 0 ? decoded : undefined;
  } catch {
    return undefined;
  }
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
      return reference._tag === 'verse' ? `${base}/${String(reference.verse)}` : base;
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
      return query.length > 0 ? `/search?${query}` : '/search';
    }
    case 'topics':
      return route.topicId ? `/topics/${encodeURIComponent(route.topicId)}` : '/topics';
    case 'plans':
      return route.planId ? `/plans/${encodeURIComponent(route.planId)}` : '/plans';
    case 'practice':
      return route.memoryVerseId
        ? `/practice/${encodeURIComponent(route.memoryVerseId)}`
        : '/practice';
    case 'settings':
      return `/settings/${route.section}`;
    case 'not-found':
      return route.requestedPath;
  }
};

export const decodeRoute = (pathWithQuery: string): AppRoute | undefined => {
  let url: URL;
  try {
    url = new URL(pathWithQuery, 'https://local.bible');
  } catch {
    return undefined;
  }

  const segments = url.pathname.split('/').filter(Boolean);
  const [root, one, two, three] = segments;

  if (root === 'bible' && segments.length >= 3 && segments.length <= 4) {
    const book = positiveInteger(one);
    const chapter = positiveInteger(two);
    const verse = positiveInteger(three);
    if (book === undefined || book > 66 || chapter === undefined) return undefined;
    if (segments.length === 4) {
      return verse === undefined
        ? undefined
        : { _tag: 'bible', reference: BibleReference.verse(book, chapter, verse) };
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
      return page === undefined
        ? undefined
        : { _tag: 'writings', reference: WritingsReference.page(publicationId, page) };
    }
    if (segments.length === 4 && two === 'p') {
      const paragraphId = decodeSegment(three);
      return paragraphId === undefined
        ? undefined
        : {
            _tag: 'writings',
            reference: WritingsReference.paragraph(publicationId, paragraphId),
          };
    }
    return undefined;
  }

  if (root === 'search' && segments.length === 1) {
    const requestedScope = url.searchParams.get('scope');
    const scope: SearchScope =
      requestedScope === 'bible' || requestedScope === 'writings' ? requestedScope : 'all';
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
    return isSettingsSection(section) ? { _tag: 'settings', section } : undefined;
  }

  return undefined;
};
