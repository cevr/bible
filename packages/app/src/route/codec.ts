import { Reference as BibleReference } from '@bible/core/bible';
import { TopicSlug } from '@bible/core/wiki';
import {
  Reference as WritingsReference,
  WritingsBookCode,
  type CorpusScope,
} from '@bible/core/writings';
import { Match, Option, Schema } from 'effect';

import type { AppRoute, SearchScope, SettingsSection } from './model.js';

const isSettingsSection = (value: string): value is SettingsSection =>
  value === 'reader' ||
  value === 'sync' ||
  value === 'data' ||
  value === 'content' ||
  value === 'shortcuts' ||
  value === 'about';

const positiveInteger = (value?: string): Option.Option<number> =>
  Option.fromNullishOr(value).pipe(
    Option.filter((raw) => /^[1-9][0-9]*$/.test(raw)),
    Option.map((raw) => Number.parseInt(raw, 10)),
    Option.filter((parsed) => Number.isSafeInteger(parsed)),
  );

const decodeUriComponent = Option.liftThrowable(decodeURIComponent);
const parseUrl = Option.liftThrowable(
  (pathWithQuery: string) => new URL(pathWithQuery, 'https://local.bible'),
);

const decodeSegment = (value?: string): Option.Option<string> =>
  Option.fromNullishOr(value).pipe(
    Option.filter((raw) => raw.length > 0),
    Option.flatMap(decodeUriComponent),
    Option.filter((decoded) => decoded.length > 0),
  );

/** A URL segment as the branded slug the route model holds. `Option` rather than
 *  `topicSlug`'s `decodeSync`: a path is user input and a segment that is not a
 *  slug must render the not-found page, not throw inside a decode. */
const readTopicSlug = Schema.decodeOption(TopicSlug);

const normalizeBooks = (books: readonly number[]): readonly number[] =>
  [...new Set(books.filter((book) => Number.isSafeInteger(book) && book >= 1 && book <= 66))].sort(
    (left, right) => left - right,
  );

export const encodeRoute = (route: AppRoute): string =>
  Match.value(route).pipe(
    Match.tagsExhaustive({
      bible: ({ reference }) => {
        const base = `/bible/${String(reference.book)}/${String(reference.chapter)}`;
        if (reference._tag === 'verse') return `${base}/${String(reference.verse)}`;
        return base;
      },
      'writings-catalog': () => '/writings',
      writings: ({ reference }) => {
        const base = `/writings/${String(reference.publicationId)}`;
        if (reference._tag === 'publication') return base;
        if (reference._tag === 'page') return `${base}/page/${String(reference.page)}`;
        return `${base}/p/${encodeURIComponent(reference.paragraphId)}`;
      },
      search: (search) => {
        const params = new URLSearchParams();
        if (search.query.length > 0) params.set('q', search.query);
        if (search.scope !== 'all') params.set('scope', search.scope);
        const books = normalizeBooks(search.books);
        if (books.length > 0) params.set('books', books.join(','));
        // Both §9 narrowings are omitted when absent, the way `scope: 'all'` and
        // an empty `books` are: a bare `/search?q=…` is the default query, and a
        // default spelled in the URL is a default that can drift from core's.
        if (Option.isSome(search.corpus)) params.set('corpus', search.corpus.value);
        if (Option.isSome(search.bookCode)) params.set('book', search.bookCode.value);
        const query = params.toString();
        if (query.length > 0) return `/search?${query}`;
        return '/search';
      },
      topics: (topics) => {
        if (topics.topicId) return `/topics/${encodeURIComponent(topics.topicId)}`;
        return '/topics';
      },
      wiki: (wiki) => `/wiki/${encodeURIComponent(wiki.slug)}`,
      plans: (plans) => {
        if (plans.planId) return `/plans/${encodeURIComponent(plans.planId)}`;
        return '/plans';
      },
      practice: (practice) => {
        if (practice.memoryVerseId) {
          return `/practice/${encodeURIComponent(practice.memoryVerseId)}`;
        }
        return '/practice';
      },
      settings: (settings) => `/settings/${settings.section}`,
      'not-found': (notFound) => notFound.requestedPath,
    }),
  );

const decodeParsedRoute = (url: URL): Option.Option<AppRoute> => {
  const segments = url.pathname.split('/').filter(Boolean);
  const [root, one, two, three] = segments;

  if (root === 'bible' && segments.length >= 3 && segments.length <= 4) {
    const book = positiveInteger(one);
    const chapter = positiveInteger(two);
    const verse = positiveInteger(three);
    if (Option.isNone(book) || book.value > 66 || Option.isNone(chapter)) return Option.none();
    if (segments.length === 4) {
      return Option.map(verse, (verseNumber) => ({
        _tag: 'bible',
        reference: BibleReference.verse(book.value, chapter.value, verseNumber),
      }));
    }
    return Option.some({
      _tag: 'bible',
      reference: BibleReference.chapter(book.value, chapter.value),
    });
  }

  if (root === 'writings') {
    if (segments.length === 1) return Option.some({ _tag: 'writings-catalog' });
    const publicationId = positiveInteger(one);
    if (Option.isNone(publicationId)) return Option.none();
    if (segments.length === 2) {
      return Option.some({
        _tag: 'writings',
        reference: WritingsReference.publication(publicationId.value),
      });
    }
    if (segments.length === 4 && two === 'page') {
      return Option.map(positiveInteger(three), (page) => ({
        _tag: 'writings',
        reference: WritingsReference.page(publicationId.value, page),
      }));
    }
    if (segments.length === 4 && two === 'p') {
      return Option.map(decodeSegment(three), (paragraphId) => ({
        _tag: 'writings',
        reference: WritingsReference.paragraph(publicationId.value, paragraphId),
      }));
    }
    return Option.none();
  }

  if (root === 'search' && segments.length === 1) {
    const requestedScope = Option.fromNullishOr(url.searchParams.get('scope'));
    let scope: SearchScope = 'all';
    if (Option.isSome(requestedScope)) {
      if (requestedScope.value === 'bible' || requestedScope.value === 'writings') {
        scope = requestedScope.value;
      }
    }
    const books = normalizeBooks(
      Option.getOrElse(Option.fromNullishOr(url.searchParams.get('books')), () => '')
        .split(',')
        .map((book) => Number.parseInt(book, 10)),
    );
    const query = Option.getOrElse(Option.fromNullishOr(url.searchParams.get('q')), () => '');
    // An unrecognized corpus decodes to absent rather than to a failed route: a
    // link written against a later vocabulary should still open the search, and
    // core applies `SEARCH_DEFAULT_SCOPE` for whatever this does not pin.
    const corpus = Option.filter(
      Option.fromNullishOr(url.searchParams.get('corpus')),
      (value): value is CorpusScope => value === 'egw' || value === 'pioneer' || value === 'all',
    );
    // Decoded through the shared schema rather than an inline length check, so
    // the route and `SearchQuery` cannot disagree about which codes are legal.
    const bookCode = Option.flatMap(Option.fromNullishOr(url.searchParams.get('book')), (value) =>
      Schema.decodeOption(WritingsBookCode)(value),
    );
    return Option.some({ _tag: 'search', query, scope, books, corpus, bookCode });
  }

  if (root === 'topics' && segments.length <= 2) {
    return Option.some({ _tag: 'topics', topicId: Option.getOrUndefined(decodeSegment(one)) });
  }
  // `/wiki` with no slug decodes to nothing rather than to a landing page: the
  // page model composes *a topic*, and there is no topic here. The route table
  // renders the not-found content for it, which is the same answer a nonexistent
  // slug gets — and the honest one, because the wiki has no index in v1.
  if (root === 'wiki' && segments.length === 2) {
    return Option.flatMap(decodeSegment(one), (slug) =>
      Option.map(readTopicSlug(slug), (branded) => ({ _tag: 'wiki', slug: branded })),
    );
  }
  if (root === 'plans' && segments.length <= 2) {
    return Option.some({ _tag: 'plans', planId: Option.getOrUndefined(decodeSegment(one)) });
  }
  if (root === 'practice' && segments.length <= 2) {
    return Option.some({
      _tag: 'practice',
      memoryVerseId: Option.getOrUndefined(decodeSegment(one)),
    });
  }
  if (root === 'settings' && segments.length <= 2) {
    const section = one ?? 'reader';
    if (!isSettingsSection(section)) return Option.none();
    return Option.some({ _tag: 'settings', section });
  }

  return Option.none();
};

export const decodeRoute = (pathWithQuery: string): Option.Option<AppRoute> =>
  Option.flatMap(parseUrl(pathWithQuery), decodeParsedRoute);
