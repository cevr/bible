/**
 * EGW API Client using Effect-TS
 * Adapted from Spotify client patterns with Effect-TS
 */

import type { HttpClientError } from 'effect/unstable/http';
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/unstable/http';
import {
  Config,
  Context,
  Duration,
  Effect,
  Layer,
  Option,
  Redacted,
  Schedule,
  Schema,
  Stream,
} from 'effect';

import { EGWAuth } from './auth.js';
import { bakedApiBaseUrl, bakedUserAgent, envVar } from './build-defines.js';
import * as Schemas from './schemas.js';

/**
 * EGW API Client Errors
 */
export class EGWApiError extends Schema.TaggedErrorClass<EGWApiError>()('EGWApiError', {
  cause: Schema.Unknown,
  message: Schema.String,
}) {}

const encodeJson = (value: unknown) => JSON.stringify(value, null, 2);

// ============================================================================
// Service Interface
// ============================================================================

/**
 * EGW API Client error type (union of possible errors)
 */
export type EGWApiClientError = EGWApiError | HttpClientError.HttpClientError | Schema.SchemaError;

/**
 * EGW API Client service interface.
 */
export interface EGWApiClientService {
  readonly getLanguages: () => Effect.Effect<readonly Schemas.Language[], EGWApiClientError>;
  readonly getFoldersByLanguage: (
    languageCode: string,
  ) => Effect.Effect<readonly Schemas.Folder[], EGWApiClientError>;
  readonly getBooksByFolder: (
    folderId: number,
    params?: Partial<Schemas.BooksQueryParams>,
  ) => Effect.Effect<readonly Schemas.Book[], EGWApiClientError>;
  readonly getBooks: (
    params?: Partial<Schemas.BooksQueryParams>,
  ) => Stream.Stream<Schemas.Book, EGWApiClientError>;
  readonly getBook: (
    bookId: number,
    params?: { trans?: string },
  ) => Effect.Effect<Schemas.Book, EGWApiClientError>;
  readonly getBookToc: (
    bookId: number,
  ) => Effect.Effect<readonly Schemas.TocItem[], EGWApiClientError>;
  readonly getChapterContent: (
    bookId: number,
    chapterId: string,
    params?: Partial<Schemas.ChapterContentParams>,
  ) => Effect.Effect<readonly Schemas.Paragraph[], EGWApiClientError>;
  readonly downloadBook: (bookId: number) => Effect.Effect<ArrayBuffer, EGWApiClientError>;
  readonly search: (
    params: Schemas.SearchParams,
  ) => Effect.Effect<Schemas.SearchResponse, EGWApiClientError>;
  readonly getSuggestions: (
    query: string,
    limit?: number,
  ) => Effect.Effect<readonly string[], EGWApiClientError>;
  readonly getBookCoverUrl: (bookId: number, size?: 'small' | 'large') => Effect.Effect<string>;
  readonly getMirrors: () => Effect.Effect<readonly string[], EGWApiClientError>;
}

// ============================================================================
// Service Definition
// ============================================================================

/**
 * EGW API Client Service
 */
export class EGWApiClient extends Context.Service<EGWApiClient, EGWApiClientService>()(
  '@bible/core/egw/client/EGWApiClient',
) {
  /**
   * Live implementation using HTTP client and EGW Auth.
   */
  static Live: Layer.Layer<
    EGWApiClient,
    Config.ConfigError | HttpClientError.HttpClientError | Schema.SchemaError,
    EGWAuth | HttpClient.HttpClient
  > = Layer.effect(
    EGWApiClient,
    Effect.gen(function* () {
      const baseUrl = yield* Config.string('EGW_API_BASE_URL').pipe(
        Config.withDefault(
          bakedApiBaseUrl() ?? envVar('EGW_API_BASE_URL') ?? 'https://a.egwwritings.org',
        ),
      );
      const userAgent = yield* Config.string('EGW_USER_AGENT').pipe(
        Config.withDefault(bakedUserAgent() ?? envVar('EGW_USER_AGENT') ?? 'EGW-Effect-Client/1.0'),
      );

      const auth = yield* EGWAuth;
      const rawHttpClient = yield* HttpClient.HttpClient;

      /**
       * Create an instrumented HTTP client with optional baseUrl prepending
       * @param prependBaseUrl - If true, prepends baseUrl to relative URLs
       */
      const createHttpClient = (prependBaseUrl: boolean) =>
        rawHttpClient.pipe(
          HttpClient.mapRequest((request) => {
            // Conditionally prepend baseUrl based on the parameter
            const withBaseUrl = prependBaseUrl
              ? HttpClientRequest.prependUrl(baseUrl)(request)
              : request;
            return withBaseUrl.pipe(
              HttpClientRequest.setHeader('User-Agent', userAgent),
              HttpClientRequest.acceptJson,
            );
          }),
          HttpClient.mapRequestEffect((request) =>
            Effect.gen(function* () {
              const token = yield* auth.getToken();
              return HttpClientRequest.bearerToken(request, Redacted.value(token.accessToken));
            }),
          ),
          // Log outgoing requests
          HttpClient.tapRequest((request) => {
            const params = Array.isArray(request.urlParams)
              ? Object.fromEntries(request.urlParams)
              : request.urlParams;
            return Effect.logDebug(
              `-> req ${request.method} ${request.url}${new URLSearchParams(params as Record<string, string>).toString()}`,
            );
          }),
          // Log incoming responses
          HttpClient.transformResponse((responseEffect) =>
            responseEffect.pipe(
              Effect.tap((response) =>
                Effect.gen(function* () {
                  yield* Effect.logDebug(
                    `<- res ${response.status} ${response.request.method} ${response.request.url}`,
                  );
                  // Log response body for non-2xx status codes
                  if (response.status < 200 || response.status >= 300) {
                    const body = yield* response.text.pipe(Effect.result);
                    if (body._tag === 'Success') {
                      yield* Effect.logError('Error response body:', body.success);
                    }
                  }
                }),
              ),
            ),
          ),
          // Log errors
          HttpClient.tapError((error) =>
            Effect.gen(function* () {
              const request =
                error && typeof error === 'object' && 'request' in error
                  ? (error as { request?: { method?: string; url?: string } }).request
                  : undefined;
              yield* Effect.logError(`✗ res ${request?.method} ${request?.url}`, error);
            }),
          ),
          HttpClient.filterStatusOk,
        );

      // Create HTTP client for relative URLs (with baseUrl prepending)
      const httpClient = createHttpClient(true);

      // Create HTTP client for absolute URLs (without baseUrl prepending)
      const absoluteUrlHttpClient = createHttpClient(false);

      /**
       * Retry schedule with exponential backoff
       * Maximum 3 retries (1 initial attempt + 2 retries)
       * Exponential delays: 100ms, 200ms, 400ms
       */
      const retrySchedule = Schedule.exponential(Duration.millis(100)).pipe(Schedule.take(2));

      // Paginated response schema
      const PaginatedResponse = Schema.Struct({
        count: Schema.Number,
        ipp: Schema.Number,
        previous: Schema.NullOr(Schema.String),
        next: Schema.NullOr(Schema.String),
        results: Schema.Array(Schemas.Book),
      });

      type PaginatedResponse = Schema.Schema.Type<typeof PaginatedResponse>;

      /**
       * Fetch a single page of books from a URL
       * Handles both absolute URLs (from next field) and relative URLs
       */
      const fetchBooksPage = (url: string): Effect.Effect<PaginatedResponse, EGWApiError> =>
        Effect.gen(function* () {
          // Determine if URL is absolute or relative
          const isAbsoluteUrl = url.startsWith('http://') || url.startsWith('https://');

          const response = yield* isAbsoluteUrl
            ? absoluteUrlHttpClient.get(url)
            : httpClient.get(url.startsWith('/') ? url : `/${url}`);

          return yield* HttpClientResponse.schemaBodyJson(PaginatedResponse)(response);
        }).pipe(
          Effect.mapError(
            (error) =>
              new EGWApiError({
                message: `Failed to fetch books page: ${url}`,
                cause: error,
              }),
          ),
          Effect.retry(retrySchedule),
        );

      /**
       * Create a stream of books from paginated API responses
       * Uses Stream.paginateEffect to handle pagination automatically
       */
      const booksStream = (initialUrl: string): Stream.Stream<Schemas.Book, EGWApiError> =>
        Stream.paginate(initialUrl, (url) =>
          Effect.gen(function* () {
            const page = yield* fetchBooksPage(url);
            return [page.results, page.next ? Option.some(page.next) : Option.none()] as const;
          }),
        );

      return {
        getLanguages: () =>
          Effect.gen(function* () {
            const response = yield* httpClient.get('/content/languages');
            return yield* HttpClientResponse.schemaBodyJson(Schema.Array(Schemas.Language))(
              response,
            );
          }).pipe(Effect.retry(retrySchedule)),

        getFoldersByLanguage: (languageCode: string) =>
          Effect.gen(function* () {
            const response = yield* httpClient.get(`/content/languages/${languageCode}/folders`);
            return yield* HttpClientResponse.schemaBodyJson(Schema.Array(Schemas.Folder))(response);
          }).pipe(Effect.retry(retrySchedule)),

        getBooksByFolder: (folderId: number, params: Partial<Schemas.BooksQueryParams> = {}) =>
          Effect.gen(function* () {
            const urlParams = new URLSearchParams();
            if (params.trans) urlParams.append('trans', params.trans);
            if (params.limit) urlParams.append('limit', String(params.limit));
            if (params.offset) urlParams.append('offset', String(params.offset));
            if (params.page) urlParams.append('page', String(params.page));

            const queryString = urlParams.toString();
            const endpoint = `/content/books/by_folder/${folderId}${
              queryString ? `?${queryString}` : ''
            }`;

            const response = yield* httpClient.get(endpoint);
            return yield* HttpClientResponse.schemaBodyJson(Schema.Array(Schemas.Book))(response);
          }).pipe(Effect.retry(retrySchedule)),

        getBooks: (
          params: Partial<Schemas.BooksQueryParams> = {},
        ): Stream.Stream<Schemas.Book, EGWApiError> => {
          const urlParams = new URLSearchParams();
          if (params.pubnr) {
            params.pubnr.forEach((id) => urlParams.append('pubnr', String(id)));
          }
          if (params.since) urlParams.append('since', params.since);
          if (params.type) {
            params.type.forEach((t) => urlParams.append('type', t));
          }
          if (params.lang) urlParams.append('lang', params.lang);
          if (params.can_read) urlParams.append('can_read', params.can_read);
          if (params.has_mp3) urlParams.append('has_mp3', params.has_mp3);
          if (params.has_pdf) urlParams.append('has_pdf', params.has_pdf);
          if (params.has_epub) urlParams.append('has_epub', params.has_epub);
          if (params.has_mobi) urlParams.append('has_mobi', params.has_mobi);
          if (params.has_book) urlParams.append('has_book', params.has_book);
          if (params.page) urlParams.append('page', String(params.page));
          if (params.search) urlParams.append('search', params.search);
          if (params.folder) urlParams.append('folder', String(params.folder));
          if (params.trans) {
            const transValue = typeof params.trans === 'string' ? params.trans : 'all';
            urlParams.append('trans', transValue);
          }
          if (params.limit) urlParams.append('limit', String(params.limit));
          if (params.offset) urlParams.append('offset', String(params.offset));

          const queryString = urlParams.toString();
          const endpoint = `/content/books${queryString ? `?${queryString}` : ''}`;

          // If page is explicitly specified, return a stream of that page's results
          // Otherwise, return a stream that fetches all pages
          if (params.page !== undefined) {
            return Stream.fromEffect(
              Effect.gen(function* () {
                const response = yield* httpClient.get(endpoint);
                const paginated =
                  yield* HttpClientResponse.schemaBodyJson(PaginatedResponse)(response);
                return paginated.results;
              }).pipe(
                Effect.mapError(
                  (error) =>
                    new EGWApiError({
                      message: `Failed to fetch books page: ${endpoint}`,
                      cause: error,
                    }),
                ),
                Effect.retry(retrySchedule),
              ),
            ).pipe(Stream.flatMap((books) => Stream.fromIterable(books)));
          }

          // Return stream of all books from all pages
          return booksStream(endpoint);
        },

        getBook: (bookId: number, params: { trans?: string } = {}) =>
          Effect.gen(function* () {
            const urlParams = new URLSearchParams();
            if (params.trans) urlParams.append('trans', params.trans);

            const queryString = urlParams.toString();
            const endpoint = `/content/books/${bookId}${queryString ? `?${queryString}` : ''}`;

            const response = yield* httpClient.get(endpoint);
            return yield* HttpClientResponse.schemaBodyJson(Schemas.Book)(response);
          }).pipe(Effect.retry(retrySchedule)),

        getBookToc: (bookId: number) =>
          Effect.gen(function* () {
            yield* Effect.log(`Getting table of contents: (ID: ${bookId})`);
            const response = yield* httpClient.get(`/content/books/${bookId}/toc`);
            // Try to parse, and if it fails, log the actual response for debugging
            const parsed = yield* HttpClientResponse.schemaBodyJson(Schema.Array(Schemas.TocItem))(
              response,
            ).pipe(
              Effect.catch((error) =>
                Effect.gen(function* () {
                  const raw = yield* response.json;
                  yield* Effect.logError(
                    `Failed to parse TOC for book ${bookId}. Raw response:`,
                    encodeJson(raw),
                  );
                  return yield* Effect.fail(error);
                }),
              ),
            );
            return parsed;
          }).pipe(Effect.retry(retrySchedule)),

        getChapterContent: (
          bookId: number,
          chapterId: string,
          params: Partial<Schemas.ChapterContentParams> = {},
        ) =>
          Effect.gen(function* () {
            const urlParams = new URLSearchParams();
            if (params.highlight) urlParams.append('highlight', params.highlight);
            if (params.trans) {
              if (params.trans === 'all') {
                urlParams.append('trans', 'all');
              } else if (Array.isArray(params.trans)) {
                params.trans.forEach((t) => urlParams.append('trans', t));
              } else if (typeof params.trans === 'string') {
                urlParams.append('trans', params.trans);
              }
            }

            const queryString = urlParams.toString();
            const endpoint = `/content/books/${bookId}/chapter/${chapterId}${
              queryString ? `?${queryString}` : ''
            }`;

            const response = yield* httpClient.get(endpoint);
            return yield* HttpClientResponse.schemaBodyJson(Schema.Array(Schemas.Paragraph))(
              response,
            );
          }).pipe(Effect.retry(retrySchedule)),

        downloadBook: (bookId: number) =>
          Effect.gen(function* () {
            const response = yield* httpClient.get(`/content/books/${bookId}/download`);
            return yield* response.arrayBuffer;
          }).pipe(Effect.retry(retrySchedule)),

        search: (params: Schemas.SearchParams) =>
          Effect.gen(function* () {
            const urlParams = new URLSearchParams();
            urlParams.append('query', params.query);
            if (params.lang) urlParams.append('lang', params.lang);
            if (params.folder) urlParams.append('folder', String(params.folder));
            if (params.book) urlParams.append('book', String(params.book));
            if (params.highlight !== undefined)
              urlParams.append('highlight', String(params.highlight));
            if (params.limit) urlParams.append('limit', String(params.limit));
            if (params.offset) urlParams.append('offset', String(params.offset));

            const endpoint = `/search?${urlParams.toString()}`;
            const response = yield* httpClient.get(endpoint);
            return yield* HttpClientResponse.schemaBodyJson(Schemas.SearchResponse)(response);
          }).pipe(Effect.retry(retrySchedule)),

        getSuggestions: (query: string, limit: number = 10) =>
          Effect.gen(function* () {
            const response = yield* httpClient.get(
              `/suggestions?query=${encodeURIComponent(query)}&limit=${limit}`,
            );
            return yield* HttpClientResponse.schemaBodyJson(Schema.Array(Schema.String))(response);
          }).pipe(Effect.retry(retrySchedule)),

        getBookCoverUrl: (bookId: number, size: 'small' | 'large' = 'small') =>
          Effect.succeed(`${baseUrl}/covers/${bookId}?size=${size}`),

        getMirrors: () =>
          Effect.gen(function* () {
            const response = yield* httpClient.get('/content/mirrors');
            return yield* HttpClientResponse.schemaBodyJson(Schema.Array(Schema.String))(response);
          }).pipe(Effect.retry(retrySchedule)),
      } as EGWApiClientService;
    }),
  );

  /**
   * Default layer - alias for Live (backwards compatibility).
   */
  static Default = EGWApiClient.Live;

  /**
   * Test implementation with mock data.
   */
  static Test = (
    config: {
      books?: readonly Schemas.Book[];
      languages?: readonly Schemas.Language[];
    } = {},
  ): Layer.Layer<EGWApiClient> =>
    Layer.succeed(EGWApiClient, {
      getLanguages: () => Effect.succeed(config.languages ?? []),
      getFoldersByLanguage: () => Effect.succeed([]),
      getBooksByFolder: () => Effect.succeed(config.books ?? []),
      getBooks: () => Stream.fromIterable(config.books ?? []),
      getBook: (bookId) =>
        Effect.fromOption(
          Option.fromNullishOr(config.books?.find((b) => b.book_id === bookId)),
        ).pipe(
          Effect.mapError(
            () =>
              new EGWApiError({
                message: `Book not found: ${bookId}`,
                cause: undefined,
              }),
          ),
        ),
      getBookToc: () => Effect.succeed([]),
      getChapterContent: () => Effect.succeed([]),
      downloadBook: () => Effect.succeed(new ArrayBuffer(0)),
      search: () => Effect.succeed({ next: null, previous: null, total: 0, count: 0, results: [] }),
      getSuggestions: () => Effect.succeed([]),
      getBookCoverUrl: (bookId) => Effect.succeed(`/covers/${bookId}`),
      getMirrors: () => Effect.succeed([]),
    });
}
