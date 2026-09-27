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

/** Decodes the path segments (and, for search, the query) under one root
 *  segment. Each decoder owns its route's segment-count rule. */
type RouteDecoder = (segments: readonly string[], url: URL) => Option.Option<AppRoute>;

const decodeBibleRoute: RouteDecoder = (segments) => {
  if (segments.length < 3 || segments.length > 4) return Option.none();
  const book = positiveInteger(segments[1]);
  const chapter = positiveInteger(segments[2]);
  if (Option.isNone(book) || book.value > 66 || Option.isNone(chapter)) return Option.none();
  if (segments.length === 4) {
    return Option.map(positiveInteger(segments[3]), (verseNumber) => ({
      _tag: 'bible',
      reference: BibleReference.verse(book.value, chapter.value, verseNumber),
    }));
  }
  return Option.some({
    _tag: 'bible',
    reference: BibleReference.chapter(book.value, chapter.value),
  });
};

/** `/writings/:id/page/:page` and `/writings/:id/p/:paragraph`. */
const decodeWritingsLocation = (
  publicationId: number,
  segments: readonly string[],
): Option.Option<AppRoute> => {
  const [, , kind, value] = segments;
  if (kind === 'page') {
    return Option.map(positiveInteger(value), (page) => ({
      _tag: 'writings',
      reference: WritingsReference.page(publicationId, page),
    }));
  }
  if (kind === 'p') {
    return Option.map(decodeSegment(value), (paragraphId) => ({
      _tag: 'writings',
      reference: WritingsReference.paragraph(publicationId, paragraphId),
    }));
  }
  return Option.none();
};

const decodeWritingsRoute: RouteDecoder = (segments) => {
  if (segments.length === 1) return Option.some({ _tag: 'writings-catalog' });
  const publicationId = positiveInteger(segments[1]);
  if (Option.isNone(publicationId)) return Option.none();
  if (segments.length === 2) {
    return Option.some({
      _tag: 'writings',
      reference: WritingsReference.publication(publicationId.value),
    });
  }
  if (segments.length === 4) {
    return decodeWritingsLocation(publicationId.value, segments);
  }
  return Option.none();
};

const searchParam = (url: URL, name: string): Option.Option<string> =>
  Option.fromNullishOr(url.searchParams.get(name));

const decodeSearchRoute: RouteDecoder = (segments, url) => {
  if (segments.length !== 1) return Option.none();
  const scope = searchParam(url, 'scope').pipe(
    Option.filter((value): value is SearchScope => value === 'bible' || value === 'writings'),
    Option.getOrElse((): SearchScope => 'all'),
  );
  const books = normalizeBooks(
    Option.getOrElse(searchParam(url, 'books'), () => '')
      .split(',')
      .map((book) => Number.parseInt(book, 10)),
  );
  const query = Option.getOrElse(searchParam(url, 'q'), () => '');
  // An unrecognized corpus decodes to absent rather than to a failed route: a
  // link written against a later vocabulary should still open the search, and
  // core applies `SEARCH_DEFAULT_SCOPE` for whatever this does not pin.
  const corpus = Option.filter(
    searchParam(url, 'corpus'),
    (value): value is CorpusScope => value === 'egw' || value === 'pioneer' || value === 'all',
  );
  // Decoded through the shared schema rather than an inline length check, so
  // the route and `SearchQuery` cannot disagree about which codes are legal.
  const bookCode = Option.flatMap(searchParam(url, 'book'), (value) =>
    Schema.decodeOption(WritingsBookCode)(value),
  );
  return Option.some({ _tag: 'search', query, scope, books, corpus, bookCode });
};

/** The optional id segment of `/topics`, `/plans`, and `/practice`, which
 *  accept at most one segment after the root. */
const optionalId = (segments: readonly string[]): Option.Option<Option.Option<string>> => {
  if (segments.length > 2) return Option.none();
  return Option.some(decodeSegment(segments[1]));
};

const decodeTopicsRoute: RouteDecoder = (segments) =>
  Option.map(optionalId(segments), (topicId) => ({
    _tag: 'topics',
    topicId: Option.getOrUndefined(topicId),
  }));

// `/wiki` with no slug decodes to nothing rather than to a landing page: the
// page model composes *a topic*, and there is no topic here. The route table
// renders the not-found content for it, which is the same answer a nonexistent
// slug gets — and the honest one, because the wiki has no index in v1.
const decodeWikiRoute: RouteDecoder = (segments) => {
  if (segments.length !== 2) return Option.none();
  return Option.flatMap(decodeSegment(segments[1]), (slug) =>
    Option.map(readTopicSlug(slug), (branded) => ({ _tag: 'wiki', slug: branded })),
  );
};

const decodePlansRoute: RouteDecoder = (segments) =>
  Option.map(optionalId(segments), (planId) => ({
    _tag: 'plans',
    planId: Option.getOrUndefined(planId),
  }));

const decodePracticeRoute: RouteDecoder = (segments) =>
  Option.map(optionalId(segments), (memoryVerseId) => ({
    _tag: 'practice',
    memoryVerseId: Option.getOrUndefined(memoryVerseId),
  }));

const decodeSettingsRoute: RouteDecoder = (segments) => {
  if (segments.length > 2) return Option.none();
  const section = segments[1] ?? 'reader';
  if (!isSettingsSection(section)) return Option.none();
  return Option.some({ _tag: 'settings', section });
};

/** One decoder per root segment. A `Map` rather than an object literal so a
 *  root such as `constructor` cannot resolve to a prototype member. */
const routeDecoders: ReadonlyMap<string, RouteDecoder> = new Map([
  ['bible', decodeBibleRoute],
  ['writings', decodeWritingsRoute],
  ['search', decodeSearchRoute],
  ['topics', decodeTopicsRoute],
  ['wiki', decodeWikiRoute],
  ['plans', decodePlansRoute],
  ['practice', decodePracticeRoute],
  ['settings', decodeSettingsRoute],
]);

const decodeParsedRoute = (url: URL): Option.Option<AppRoute> => {
  const segments = url.pathname.split('/').filter(Boolean);
  return Option.fromNullishOr(segments[0]).pipe(
    Option.flatMap((root) => Option.fromUndefinedOr(routeDecoders.get(root))),
    Option.flatMap((decode) => decode(segments, url)),
  );
};

export const decodeRoute = (pathWithQuery: string): Option.Option<AppRoute> =>
  Option.flatMap(parseUrl(pathWithQuery), decodeParsedRoute);
