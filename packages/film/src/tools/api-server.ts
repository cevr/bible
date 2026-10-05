// Where the lab's server is composed from its API (`core/api.ts`): the
// handlers its groups derive, behind one gate every request passes first,
// then its routes and the app's pages as one web handler.
//
// The gate is the only place a request is admitted (`admit`): the Host (or,
// where no header is sent, the URL's host) must be the bound port on a
// loopback name, or one the server is told (`FILM_LAB_HOSTS`); a
// browser's `Sec-Fetch-Site` must be same-origin; a write must come from no
// Origin (a tool, like curl) or one of those hosts', with a JSON body (a
// cross-site form can post text/plain without a preflight; JSON cannot) of
// at most `STUDIO_MAX_BODY` bytes, counted as it streams. A new route is
// behind the gate by being a route.
//
// Every film route names its film (`filmNamed`): one of the app's films, and
// any other name is a 404 FilmUnknown before anything reads it.

import {
  Array as Arr,
  Context,
  Deferred,
  Effect,
  type FileSystem,
  Layer,
  Option,
  type Path,
  Result,
  Schema,
  String as Str,
} from 'effect';
import {
  Etag,
  HttpMiddleware,
  HttpPlatform,
  HttpRouter,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/http';
import * as NodeHttpCompression from '@effect/platform-node-shared/NodeHttpCompression';
import {
  type Refusal,
  Refusal as RefusalSchema,
  RequestInvalid,
  RequestRefused,
  RouteUnknown,
  ServerFailed,
  WriteNotJson,
  isRefusal,
  legacyPlace,
  pageAt,
  prefixesOf,
  statusOf,
} from '../core/api.ts';
import { type HttpApi, HttpApiError, type HttpApiGroup } from 'effect/http-api';
import { NetAddress } from 'effect/net';
import { BunHttpServer } from '@effect/platform-bun';
import { BodyTooLarge } from '../core/refusals.ts';
import { STUDIO_MAX_BODY } from '../core/studio.ts';
import { urlPath } from './review-file.ts';

/** Where the server listens: the name and port it is bound to. */
interface LabBound {
  readonly hostname?: string;
  readonly port?: number;
}

/** A web handler as a Bun server takes it: the request and its server. */
type LabHandler = (request: Request, server: LabBound) => Promise<Response>;

/**
 * Hosts a server answers to beyond the bound port's loopback names: each an
 * exact Host value (`bite-cristian.exe.xyz:8229`), whose page may write from
 * `http://` or `https://` it (a TLS proxy in front): the lab's
 * `FILM_LAB_HOSTS`.
 */
export interface Allowed {
  readonly hosts: ReadonlyArray<string>;
}

/** The connection a request came on: the server's bound name and port. */
interface ConnectionService {
  readonly hostname: Option.Option<string>;
  readonly port: Option.Option<number>;
}

class Connection extends Context.Service<Connection, ConnectionService>()(
  '@bible/film/tools/Connection',
) {}

/** The connection a request came on, as the server it reached is bound. */
const connectionOf = (server: LabBound): ConnectionService => ({
  hostname: Option.fromUndefinedOr(server.hostname),
  port: Option.fromUndefinedOr(server.port),
});

/** The names the loopback host answers to, beside the one the server was bound with. */
const LOOPBACK: ReadonlyArray<string> = ['127.0.0.1', 'localhost'];
/** `Sec-Fetch-Site` values of a request the server's own page (or a tool, `none`) made. */
const OWN_FETCH: ReadonlyArray<string> = ['same-origin', 'none'];
const SAFE_METHODS: ReadonlyArray<string> = ['GET', 'HEAD'];

const header = (request: HttpServerRequest.HttpServerRequest, name: string) =>
  Option.fromUndefinedOr(request.headers[name]);

/**
 * The Host a request names: its header, else its URL's. A request line in
 * absolute form (`GET http://other/ HTTP/1.1`) names another authority than
 * its header, but only a proxy client sends one; a browser on a rebound name
 * sends origin form, so the header is the name it reached.
 */
const hostOf = (request: HttpServerRequest.HttpServerRequest) =>
  Option.getOrElse(
    Option.orElse(header(request, 'host'), () =>
      Option.map(Result.getSuccess(HttpServerRequest.toWebResult(request)), (web) =>
        Result.getOrElse(
          Result.try(() => new URL(web.url).host),
          () => '',
        ),
      ),
    ),
    () => '',
  );

const refused = (reason: string) => Option.some<Refusal>(RequestRefused.make({ reason }));

/**
 * A link opened from another site (a chat, a mail): a GET or HEAD the
 * browser makes for a new document (`Sec-Fetch-Mode: navigate`,
 * `Sec-Fetch-Dest: document`) of one of the app's pages (`pageAt`) or an old link to one (`legacyPlace`). The site
 * cannot read what it answers, and a page runs nothing; the API, a script, a
 * file and a write stay the server's own.
 */
const isNavigation = (request: HttpServerRequest.HttpServerRequest) =>
  SAFE_METHODS.includes(request.method) &&
  Option.contains(header(request, 'sec-fetch-mode'), 'navigate') &&
  Option.contains(header(request, 'sec-fetch-dest'), 'document') &&
  (Option.isSome(pageAt(urlPath(request.url))) || Option.isSome(legacyPlace(request.url)));

/**
 * Whether the server answers `request` at all: `None` when it does, else the
 * refusal. Pure: see the gate above.
 */
const admit = (
  request: HttpServerRequest.HttpServerRequest,
  connection: ConnectionService,
  allowed: Allowed,
): Option.Option<Refusal> =>
  Option.match(connection.port, {
    onNone: () => refused('the server has no port to check the Host against'),
    onSome: (port) => {
      const local = Arr.dedupe([...Option.toArray(connection.hostname), ...LOOPBACK]).map(
        (name) => `${name}:${port}`,
      );
      const hosts = [...local, ...allowed.hosts];
      const origins = [
        ...local.map((h) => `http://${h}`),
        ...allowed.hosts.flatMap((h) => [`http://${h}`, `https://${h}`]),
      ];
      const host = hostOf(request);
      if (!hosts.includes(host))
        return refused(`Host ${host} is not the server's (${hosts.join(', ')})`);
      const site = header(request, 'sec-fetch-site');
      if (Option.exists(site, (s) => !OWN_FETCH.includes(s)) && !isNavigation(request))
        return refused(`a ${Option.getOrElse(site, () => '')} request`);
      if (SAFE_METHODS.includes(request.method)) return Option.none();
      const origin = header(request, 'origin');
      if (Option.exists(origin, (o) => !origins.includes(o)))
        return refused(`Origin ${Option.getOrElse(origin, () => '')} is not the server's`);
      const type = Option.getOrElse(
        Option.map(header(request, 'content-type'), (t) =>
          Arr.headNonEmpty(Str.split(t, ';')).trim().toLowerCase(),
        ),
        () => 'no body type',
      );
      if (type !== 'application/json') return Option.some(WriteNotJson.make({ type }));
      return Option.none();
    },
  });

/**
 * `request` with its body read, when the body is `STUDIO_MAX_BODY` bytes or
 * less; BodyTooLarge the moment it is not. The stream is counted as it comes
 * (a Content-Length over the limit is refused before a byte is read, one
 * under it is not believed), so a body over the limit is never held whole.
 */
const bounded = Effect.fn('api.bounded')(function* (request: HttpServerRequest.HttpServerRequest) {
  const tooLarge = BodyTooLarge.make({ limit: STUDIO_MAX_BODY });
  const web = HttpServerRequest.toWebResult(request);
  if (Result.isFailure(web)) return request;
  const source = web.success;
  const declared = Option.map(header(request, 'content-length'), Number);
  if (Option.exists(declared, (n) => n > STUDIO_MAX_BODY)) return yield* tooLarge;
  const body = Option.fromNullishOr(source.body);
  if (Option.isNone(body)) return request;
  const reader = body.value.getReader();
  const unreadable = (cause: unknown) =>
    ServerFailed.make({
      tag: 'BodyUnread',
      reason: `the request body could not be read: ${String(cause)}`,
    });
  const chunks: Array<Uint8Array> = [];
  let total = 0;
  while (true) {
    const next = yield* Effect.tryPromise({ try: () => reader.read(), catch: unreadable });
    if (next.done) break;
    total += next.value.byteLength;
    if (total > STUDIO_MAX_BODY) {
      yield* Effect.tryPromise({ try: () => reader.cancel(), catch: unreadable }).pipe(
        Effect.ignore,
      );
      return yield* tooLarge;
    }
    chunks.push(next.value);
  }
  const whole = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    whole.set(chunk, at);
    at += chunk.byteLength;
  }
  const headers = new Headers(source.headers);
  headers.delete('content-length');
  return HttpServerRequest.fromWeb(
    new Request(source.url, { method: source.method, headers, body: whole }),
  );
});

const encodeRefusal = Schema.encodeSync(RefusalSchema);

/** `refusal` as the server answers it: its JSON at its status, logged. */
const answerRefused = (request: HttpServerRequest.HttpServerRequest, refusal: Refusal) =>
  Effect.logWarning(
    `api.request.refused method=${request.method} path=${urlPath(request.url)} status=${statusOf(refusal)} tag=${refusal._tag} reason="${refusal.message}"`,
  ).pipe(
    Effect.as(HttpServerResponse.jsonUnsafe(encodeRefusal(refusal), { status: statusOf(refusal) })),
  );

/** The parts of a request HttpApi decodes; its other schema errors are of the answer. */
const REQUEST_PARTS: ReadonlyArray<string> = ['Params', 'Headers', 'Query', 'Payload'];

/**
 * `routes`, a schema error answered (HttpApi dies with it, which would answer
 * an empty 400): a request its route cannot decode as `RequestInvalid`, the
 * part and the schema's words for why; an answer the server cannot encode
 * (its body, its headers) as the server's own failure, `ServerFailed`.
 */
const decodedOrRefused = <E, R>(
  request: HttpServerRequest.HttpServerRequest,
  routes: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
) =>
  Effect.catchDefect(routes, (defect) => {
    if (!HttpApiError.HttpApiSchemaError.is(defect)) return Effect.die(defect);
    // The schema's words on one line: `Expected "pick" | … at ["verb"]`.
    const reason = defect.cause.message.replace(/\s*\n\s*/g, ' ');
    if (REQUEST_PARTS.includes(defect.kind))
      return answerRefused(request, RequestInvalid.make({ part: defect.kind, reason }));
    const failed = ServerFailed.make({
      tag: 'AnswerUnencoded',
      reason: `${defect.kind}: ${reason}`,
    });
    return Effect.logWarning(
      `api.request.failed method=${request.method} path=${urlPath(request.url)} status=${statusOf(failed)} tag=${failed.tag} reason="${failed.reason}"`,
    ).pipe(
      Effect.as(HttpServerResponse.jsonUnsafe(encodeRefusal(failed), { status: statusOf(failed) })),
    );
  });

/** The gate: a request admitted, a write's body bounded; anything else answered with its refusal. */
const gate = (allowed: Allowed) =>
  HttpRouter.middleware(
    (routes) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const refusal = admit(request, yield* Connection, allowed);
        if (Option.isSome(refusal)) return yield* answerRefused(request, refusal.value);
        if (SAFE_METHODS.includes(request.method)) return yield* decodedOrRefused(request, routes);
        const whole = yield* Effect.result(bounded(request));
        if (Result.isFailure(whole)) return yield* answerRefused(request, whole.failure);
        return yield* decodedOrRefused(whole.success, routes).pipe(
          Effect.provideService(HttpServerRequest.HttpServerRequest, whole.success),
        );
      }),
    { global: true },
  );

/** A failure as the contract has it: a Refusal as itself, anything else ServerFailed with its tag and words. */
const asRefusal = (error: { readonly _tag: string; readonly message: string }): Refusal => {
  if (isRefusal(error)) return error;
  return ServerFailed.make({ tag: error._tag, reason: error.message });
};

/**
 * A handler's failure as a route answers it: a Refusal as itself, anything
 * else as ServerFailed with its tag and words (500); logged either way, with
 * the request it answers (its method and path) as a refusal's line has.
 */
export const answered = <A, E extends { readonly _tag: string; readonly message: string }, R>(
  self: Effect.Effect<A, E, R>,
): Effect.Effect<A, Refusal, R> =>
  Effect.catch(self, (error) => {
    const refusal = asRefusal(error);
    return Effect.flatMap(Effect.serviceOption(HttpServerRequest.HttpServerRequest), (request) => {
      const asked = Option.match(request, {
        onNone: () => '',
        onSome: (r) => `method=${r.method} path=${urlPath(r.url)} `,
      });
      return Effect.logWarning(
        `api.request.failed ${asked}status=${statusOf(refusal)} tag=${error._tag} reason="${error.message}"`,
      );
    }).pipe(Effect.andThen(Effect.fail(refusal)));
  });

/**
 * The reads a page's render makes of the lab's API, for the page being
 * answered (`readsOf`): each a GET of a path of the API through the lab's
 * own handler with the page's Host, so the gate admits it as it admitted
 * the page; any other path is a 404 RouteUnknown.
 */
export class PageReads extends Context.Service<
  PageReads,
  { readonly read: (path: string) => Effect.Effect<Response> }
>()('@bible/film/tools/PageReads') {}

/**
 * The app's pages as a route answers them: the response for the request,
 * never a failure; a page rendered on the server reads the API through
 * `PageReads`.
 */
export type PageAnswer = Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  never,
  | HttpServerRequest.HttpServerRequest
  | FileSystem.FileSystem
  | Path.Path
  | HttpPlatform.HttpPlatform
  | PageReads
>;

/** The server's own web handler, with the connection a request came on. */
type OwnHandler = (request: Request, context: Context.Context<Connection>) => Promise<Response>;

/**
 * A page's reads of the API while it renders: each a GET of the path at the
 * Host the page was asked of, answered by the server's own handler on the
 * page's connection, so the gate admits it as it admitted the page (and
 * refuses it as it would the page's own fetch), and the same routes answer.
 * A path outside the API's own prefixes (`own`: a page, a script, a file)
 * is a 404 RouteUnknown, never asked. A read given up (its render over)
 * aborts its request, which stops its handler.
 */
const readsOf = (
  self: Deferred.Deferred<OwnHandler>,
  own: ReadonlyArray<string>,
  request: HttpServerRequest.HttpServerRequest,
  connection: ConnectionService,
): Context.Context<PageReads> =>
  Context.make(
    PageReads,
    PageReads.of({
      read: (path) => {
        const url = new URL(path, `http://${hostOf(request)}`);
        if (!own.some((prefix) => url.pathname.startsWith(prefix)))
          return Effect.map(
            answerRefused(
              HttpServerRequest.fromWeb(new Request(url)),
              RouteUnknown.make({ path: url.pathname }),
            ),
            (refusal) => HttpServerResponse.toWeb(refusal),
          );
        return Effect.flatMap(Deferred.await(self), (handler) =>
          Effect.promise((signal) =>
            handler(
              new Request(url, { headers: { accept: 'application/json' }, signal }),
              Context.make(Connection, connection),
            ),
          ),
        );
      },
    }),
  );

/** The codings a page's answer is sent in, by the request's `Accept-Encoding`, best first. */
const PAGE_CODINGS: ReadonlyArray<HttpPlatform.CompressionAlgorithm> = ['br', 'gzip'];

/**
 * One member of an Accept-Encoding as Effect's negotiation reads it
 * (`acceptMember`, internal to `effect/http`): a coding, and at most a
 * weight from 0 to 1 with up to three decimals.
 */
const ACCEPT_MEMBER = /^([a-z0-9!#$%&'*+.^_`|~-]+)(?:;q=(0(?:\.[0-9]{0,3})?|1(?:\.0{0,3})?))?$/;

/**
 * `header`'s codings by weight, as Effect's negotiation reads them
 * (`parseAcceptEncoding`): none for an empty header, or for one with any
 * member it cannot read, which is then answered as if it took no coding.
 */
const acceptedOf = (header: string): Option.Option<ReadonlyMap<string, number>> =>
  Option.flatMap(
    Option.liftPredicate(header.trim(), (trimmed) => trimmed !== ''),
    (trimmed) =>
      Option.map(
        Option.all(
          trimmed.split(',').map((part) =>
            Option.map(
              Option.fromNullishOr(
                ACCEPT_MEMBER.exec(
                  part
                    .trim()
                    .toLowerCase()
                    .replace(/[ \t]*;[ \t]*/g, ';'),
                ),
              ),
              ([, coding = '', weight]) =>
                [
                  coding,
                  Option.match(Option.fromUndefinedOr(weight), {
                    onNone: () => 1,
                    onSome: Number,
                  }),
                ] as const,
            ),
          ),
        ),
        (members) => new Map(members),
      ),
  );

/**
 * The coding a page's answer is sent in for `accept` (its Accept-Encoding),
 * as `HttpMiddleware.compression` negotiates it over `PAGE_CODINGS` (Effect
 * keeps its negotiation internal, so its rules are followed here): the first
 * the header takes with a weight above 0, named or by `*`; none when Effect
 * reads the header as none (`acceptedOf`). A file sent already compressed
 * (`LabPage`'s best brotli) is sent so only when this names its coding, so
 * a header is answered in the same coding before and after it is made.
 */
export const pageCodingOf = (
  accept: Option.Option<string>,
): Option.Option<HttpPlatform.CompressionAlgorithm> =>
  Option.flatMap(Option.flatMap(accept, acceptedOf), (accepted) =>
    Arr.findFirst(PAGE_CODINGS, (coding) => (accepted.get(coding) ?? accepted.get('*') ?? 0) > 0),
  );

/**
 * A response's `Vary` once it varies by `dimension` too, by the rule of
 * Effect's own compression (`varyWith`, internal to `HttpPlatform.make`):
 * kept as it is when it already names the dimension or `*`.
 */
const varyWith = (vary: Option.Option<string>, dimension: string): string =>
  Option.match(vary, {
    onNone: () => dimension,
    onSome: (kept) => {
      const members = kept.split(',').map((member) => member.trim().toLowerCase());
      if (members.includes('*') || members.includes(dimension.toLowerCase())) return kept;
      return `${kept}, ${dimension}`;
    },
  });

/**
 * How a page's answer is compressed: bytes whole, a stream through zlib
 * flushed at every chunk (`NodeHttpCompression`), so a page's shell reaches
 * the browser while its render goes on. The platform's own compression of a
 * stream (`CompressionStream`) holds its bytes until it ends. Marked as
 * `HttpPlatform.make` marks it (Effect's `wrapCompression`, which it does
 * not export): the coding named, `Vary` naming `Accept-Encoding` once, a
 * strong ETag made weak.
 */
const FLUSHED: HttpPlatform.Compression = (() => {
  const made = NodeHttpCompression.make(
    HttpPlatform.makeCompressionWeb({
      algorithms: PAGE_CODINGS,
      transform: NodeHttpCompression.compressTransformWeb,
    }),
  );
  return {
    algorithms: made.algorithms,
    compressResponse: (response, algorithm, options) =>
      Effect.map(made.compressResponse(response, algorithm, options), (compressed) => {
        if (compressed === response) return response;
        const vary = varyWith(
          Option.fromUndefinedOr(compressed.headers['vary']),
          'Accept-Encoding',
        );
        const etag = Option.filter(
          Option.fromUndefinedOr(compressed.headers['etag']),
          (tag) => !tag.startsWith('W/'),
        );
        return HttpServerResponse.setHeaders(compressed, {
          'content-encoding': algorithm,
          vary,
          ...Option.match(etag, { onNone: () => ({}), onSome: (tag) => ({ etag: `W/${tag}` }) }),
        });
      }),
  };
})();

/**
 * A page's answer compressed by the request's `Accept-Encoding` (`FLUSHED`),
 * text only, as `HttpMiddleware.compression` judges it: a streamed page
 * stays streamed.
 */
const compressed = <E, R>(
  answer: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
  platform: HttpPlatform.HttpPlatform['Service'],
) =>
  HttpMiddleware.compression({ algorithms: PAGE_CODINGS })(answer).pipe(
    Effect.provideService(HttpPlatform.HttpPlatform, { ...platform, compression: FLUSHED }),
  );

/**
 * What else the server answers, once admitted: the app's pages, for every
 * path no route takes, except under the API's own prefixes (`own`), where a
 * path no route takes is a 404 RouteUnknown and never a page. A page is
 * read, never written: any method but GET and HEAD is a 405. A page's answer
 * (its HTML, scripts and styles) is compressed (`compressed`).
 */
const pageRoute = (
  page: PageAnswer,
  own: ReadonlyArray<string>,
  platform: Context.Context<FileSystem.FileSystem | Path.Path | HttpPlatform.HttpPlatform>,
  self: Deferred.Deferred<OwnHandler>,
) =>
  HttpRouter.add(
    '*',
    '/*',
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const path = urlPath(request.url);
      if (own.some((prefix) => path.startsWith(prefix)))
        return yield* answerRefused(request, RouteUnknown.make({ path }));
      if (!SAFE_METHODS.includes(request.method))
        return HttpServerResponse.text('a page is only read', {
          status: 405,
          headers: { allow: SAFE_METHODS.join(', ') },
        });
      const reads = readsOf(self, own, request, yield* Connection);
      return yield* compressed(
        page.pipe(Effect.provideContext(reads)),
        Context.get(platform, HttpPlatform.HttpPlatform),
      );
    }),
  ).pipe(HttpRouter.provideRequest(Layer.succeedContext(platform)));

/** An API's routes (`HttpApiBuilder.layer(api)` over its groups' handlers), their services provided. */
type ApiRoutes = Layer.Layer<
  never,
  never,
  | HttpRouter.HttpRouter
  | Etag.Generator
  | FileSystem.FileSystem
  | Path.Path
  | HttpPlatform.HttpPlatform
>;

/** Routes beside an API's, outside its prefixes: a fixture's own (the studio harness's control). */
export type BesideRoutes = Layer.Layer<never, never, HttpRouter.HttpRouter>;

/**
 * `api`'s routes served as one web handler: the gate with `allowed` in
 * front of every path, then the routes (and any `beside` them), then `page`
 * for the paths no route takes outside the API's own. Closed when the scope
 * closes.
 */
export const serveApi = <Id extends string, Groups extends HttpApiGroup.Constraint>(
  api: HttpApi.HttpApi<Id, Groups>,
  routes: ApiRoutes,
  options: {
    readonly allowed: Allowed;
    readonly page: PageAnswer;
    readonly beside: BesideRoutes;
  },
) =>
  Effect.gen(function* () {
    const platform = yield* Effect.context<
      FileSystem.FileSystem | Path.Path | HttpPlatform.HttpPlatform
    >();
    // The handler itself, for a page's reads as it renders (`PageReads`): known once made.
    const self = yield* Deferred.make<OwnHandler>();
    const app = Layer.mergeAll(
      routes,
      options.beside,
      gate(options.allowed),
      pageRoute(options.page, prefixesOf(api), platform, self),
    ).pipe(Layer.provide(Etag.layerWeak), Layer.provide(Layer.succeedContext(platform)));
    const { handler } = yield* Effect.acquireRelease(
      Effect.sync(() => HttpRouter.toWebHandler(app, { disableLogger: true })),
      (web) => Effect.promise(() => web.dispose()),
    );
    yield* Deferred.succeed(self, handler);
    const answer: LabHandler = (request, server) =>
      handler(request, Context.make(Connection, connectionOf(server)));

    return answer;
  });

/**
 * An API's routes (`HttpApiBuilder.layer(api)` over its groups) with the
 * services their handlers run with, for every request: the caller's.
 */
export const withServices =
  <R>(services: Context.Context<R>) =>
  <A, E, RIn>(groups: Layer.Layer<A, E, RIn>) =>
    groups.pipe(HttpRouter.provideRequest(Layer.succeedContext(services)));

/**
 * How long a connection stays open with nothing sent: Bun's longest. A
 * film's first mix renders the whole film before it answers; a take's import
 * answers within the studio's wait (`STUDIO_IMPORT_WAIT_S`), which is
 * shorter, so the page stops waiting before the socket closes.
 */
export const LAB_IDLE_SECONDS = 255;

/**
 * The largest body Bun reads before the gate: the gate's own limit and a
 * margin, so a body over `STUDIO_MAX_BODY` is the gate's 413 BodyTooLarge;
 * one past this Bun refuses with its own 413 before any byte is held. Bun
 * calls neither the handler nor its error hook for that one (a declared
 * length past the limit), so no line of the lab's can log it; a streamed
 * body is counted by the gate first, which logs its refusal.
 */
export const MAX_REQUEST_BODY = STUDIO_MAX_BODY + 1024 * 1024;

/** Where a lab listens: the interface's name and the port (0: any free one). */
export interface LabAt {
  readonly hostname: string;
  readonly port: number;
}

/**
 * The lab's HTTP server on `at`: Effect's over `Bun.serve`, with no route or
 * development server of Bun's (each would answer before the gate), its idle
 * limit and its body limit. `serveLab` answers every request it takes.
 */
export const labServer = (at: LabAt) =>
  BunHttpServer.layerServer({
    hostname: at.hostname,
    port: at.port,
    development: false,
    idleTimeout: LAB_IDLE_SECONDS,
    maxRequestBodySize: MAX_REQUEST_BODY,
  });

/** The name and port a server is bound to; none for a socket file. */
const boundOf = (address: NetAddress.SocketAddress): LabBound => {
  if (address._tag === 'UnixPathAddress') return {};
  return { hostname: address.address.toString(), port: address.port };
};

/**
 * Every request the server (`HttpServer`, `labServer`) takes answered by
 * `handler`, the lab's (`labHandler`), until the scope closes; the server's
 * URL. The handler's response is sent as it is, a file's bytes included.
 */
export const serveLab = Effect.fn('lab.serve')(function* (handler: LabHandler) {
  const server = yield* HttpServer.HttpServer;
  const bound = boundOf(server.address);
  yield* server.serve(
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const web = yield* Effect.fromResult(HttpServerRequest.toWebResult(request));
      const response = yield* Effect.promise(() => handler(web, bound));
      return HttpServerResponse.raw(response);
    }),
  );
  return `${NetAddress.formatUrlUnsafe(server.address)}/`;
});
