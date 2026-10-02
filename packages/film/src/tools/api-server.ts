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
  type HttpPlatform,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/http';
import {
  type Refusal,
  Refusal as RefusalSchema,
  RequestInvalid,
  RequestRefused,
  RouteUnknown,
  ServerFailed,
  WriteNotJson,
  isRefusal,
  prefixesOf,
  statusOf,
} from '../core/api.ts';
import { type HttpApi, HttpApiError, type HttpApiGroup } from 'effect/http-api';
import { BodyTooLarge } from '../core/refusals.ts';
import { STUDIO_MAX_BODY } from '../core/studio.ts';

/** Where the server listens: Bun hands each request its server. */
export interface LabBound {
  readonly hostname?: string;
  readonly port?: number;
  /** Hold `request`'s connection open for `seconds` with nothing sent (Bun's `server.timeout`). */
  readonly timeout?: (request: Request, seconds: number) => void;
}

/** A web handler as a Bun server takes it: the request and its server. */
export type LabHandler = (request: Request, server: LabBound) => Promise<Response>;

/**
 * Hosts a server answers to beyond the bound port's loopback names: each an
 * exact Host value (`bite-cristian.exe.xyz:8229`), whose page may write from
 * `http://` or `https://` it (a TLS proxy in front): the lab's
 * `FILM_LAB_HOSTS`.
 */
export interface Allowed {
  readonly hosts: ReadonlyArray<string>;
}

/** The connection a request came on: the server's bound name and port, and a way to hold it open. */
interface ConnectionService {
  readonly hostname: Option.Option<string>;
  readonly port: Option.Option<number>;
  /** Hold this request's connection open for `seconds` with nothing sent, past the server's idle limit. */
  readonly hold: (seconds: number) => void;
}

export class Connection extends Context.Service<Connection, ConnectionService>()(
  '@bible/film/tools/Connection',
) {}

/** The connection `request` came on, as `server` (Bun's) holds it. */
const connectionOf = (request: Request, server: LabBound): ConnectionService => ({
  hostname: Option.fromUndefinedOr(server.hostname),
  port: Option.fromUndefinedOr(server.port),
  // Called on the server, never detached: Bun's `timeout` reads its own server.
  hold: (seconds) => server.timeout?.(request, seconds),
});

/** The names the loopback host answers to, beside the one the server was bound with. */
const LOOPBACK: ReadonlyArray<string> = ['127.0.0.1', 'localhost'];
/** `Sec-Fetch-Site` values of a request the server's own page (or a tool, `none`) made. */
const OWN_FETCH: ReadonlyArray<string> = ['same-origin', 'none'];
const SAFE_METHODS: ReadonlyArray<string> = ['GET', 'HEAD'];

const header = (request: HttpServerRequest.HttpServerRequest, name: string) =>
  Option.fromUndefinedOr(request.headers[name]);

/** The Host a request names: its header, else its URL's. */
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
      if (Option.exists(site, (s) => !OWN_FETCH.includes(s)))
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
    `api.request.refused method=${request.method} path=${request.url.split('?')[0]} status=${statusOf(refusal)} tag=${refusal._tag} reason="${refusal.message}"`,
  ).pipe(
    Effect.as(HttpServerResponse.jsonUnsafe(encodeRefusal(refusal), { status: statusOf(refusal) })),
  );

/**
 * `routes`, a request its route cannot decode (HttpApi dies with its schema
 * error, which would answer an empty 400) answered as `RequestInvalid`:
 * the part, and the schema's words for why.
 */
const decodedOrRefused = <E, R>(
  request: HttpServerRequest.HttpServerRequest,
  routes: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
) =>
  Effect.catchDefect(routes, (defect) => {
    if (!HttpApiError.HttpApiSchemaError.is(defect)) return Effect.die(defect);
    return answerRefused(
      request,
      // The schema's words on one line: `Expected "pick" | … at ["verb"]`.
      RequestInvalid.make({
        part: defect.kind,
        reason: defect.cause.message.replace(/\s*\n\s*/g, ' '),
      }),
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
 * else as ServerFailed with its tag and words (500); logged either way.
 */
export const answered = <A, E extends { readonly _tag: string; readonly message: string }, R>(
  self: Effect.Effect<A, E, R>,
): Effect.Effect<A, Refusal, R> =>
  Effect.catch(self, (error) => {
    const refusal = asRefusal(error);
    return Effect.logWarning(
      `api.request.failed tag=${error._tag} status=${statusOf(refusal)} reason="${error.message}"`,
    ).pipe(Effect.andThen(Effect.fail(refusal)));
  });

/** The app's pages as a route answers them: the response for the request, never a failure. */
export type PageAnswer = Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  never,
  | HttpServerRequest.HttpServerRequest
  | FileSystem.FileSystem
  | Path.Path
  | HttpPlatform.HttpPlatform
>;

/**
 * What else the server answers, once admitted: the app's pages, for every
 * path no route takes, except under the API's own prefixes (`own`), where a
 * path no route takes is a 404 RouteUnknown and never a page.
 */
const pageRoute = (
  page: PageAnswer,
  own: ReadonlyArray<string>,
  platform: Context.Context<FileSystem.FileSystem | Path.Path | HttpPlatform.HttpPlatform>,
) =>
  HttpRouter.add(
    '*',
    '/*',
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const path = request.url.split('?')[0] ?? '';
      if (own.some((prefix) => path.startsWith(prefix)))
        return yield* answerRefused(request, RouteUnknown.make({ path }));
      return yield* page;
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
  | HttpRouter.Request<'Requires', Connection>
>;

/**
 * `api`'s routes served as one web handler: the gate with `allowed` in
 * front of every path, then the routes, then `page` for the paths no route
 * takes outside the API's own. Closed when the scope closes.
 */
export const serveApi = <Id extends string, Groups extends HttpApiGroup.Constraint>(
  api: HttpApi.HttpApi<Id, Groups>,
  routes: ApiRoutes,
  options: { readonly allowed: Allowed; readonly page: PageAnswer },
) =>
  Effect.gen(function* () {
    const platform = yield* Effect.context<
      FileSystem.FileSystem | Path.Path | HttpPlatform.HttpPlatform
    >();
    const app = Layer.mergeAll(
      routes,
      gate(options.allowed),
      pageRoute(options.page, prefixesOf(api), platform),
    ).pipe(Layer.provide(Etag.layerWeak), Layer.provide(Layer.succeedContext(platform)));
    const { handler } = yield* Effect.acquireRelease(
      Effect.sync(() => HttpRouter.toWebHandler(app, { disableLogger: true })),
      (web) => Effect.promise(() => web.dispose()),
    );
    const answer: LabHandler = (request, server) =>
      handler(request, Context.make(Connection, connectionOf(request, server)));
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
