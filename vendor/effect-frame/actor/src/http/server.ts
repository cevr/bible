import type { Layer } from "effect";
import { Duration, Effect, ManagedRuntime, Option, Schema, Stream } from "effect";
import type { Projection } from "../transport.js";
import { ActorTransport } from "../transport.js";
import {
  AddressBody,
  CallBody,
  QueryBody,
  SendBody,
  WireAddress,
  WireApplied,
  WireError,
  WireProjection,
  WireQueryError,
  WireQueryValue,
  WireReceipt,
  eventPrefix,
  paths,
  queryStatusOf,
  statusOf,
} from "./wire.js";

/**
 * A web-standard handler over the transport in context. `Request` in,
 * `Response` out: the shape Bun, Cloudflare Workers, and celld all serve.
 * Mount it under one prefix and give the client that prefix as `baseUrl`.
 */
export type WebHandler = (request: Request) => Effect.Effect<Response>;

const decodeBody = <S extends Schema.Codec<unknown, unknown>>(schema: S) => {
  const decode = Schema.decodeEffect(Schema.fromJsonString(schema));
  return (request: Request) =>
    Effect.flatMap(
      Effect.tryPromise({ try: () => request.text(), catch: (cause) => String(cause) }),
      (text) => Effect.mapError(decode(text), (error) => error.message),
    );
};

const decodeSend = decodeBody(SendBody);
const decodeCall = decodeBody(CallBody);
const decodeAddress = decodeBody(AddressBody);
const decodeQueryBody = decodeBody(QueryBody);
const encodeReceipt = Schema.encodeEffect(Schema.fromJsonString(WireReceipt));
const encodeProjection = Schema.encodeEffect(Schema.fromJsonString(WireProjection));
const encodeApplied = Schema.encodeEffect(Schema.fromJsonString(WireApplied));
const encodeQueryValue = Schema.encodeEffect(Schema.fromJsonString(WireQueryValue));
const encodeError = Schema.encodeEffect(Schema.fromJsonString(WireError));
const encodeQueryError = Schema.encodeEffect(Schema.fromJsonString(WireQueryError));
const decodeQuery = Schema.decodeEffect(
  Schema.Struct({ ...WireAddress.fields, after: Schema.Finite }),
);

const json = (status: number, body: string) =>
  new Response(body, { status, headers: { "content-type": "application/json" } });

const BadRequest = Schema.TaggedStruct("BadRequest", { reason: Schema.String });
const encodeBadRequest = Schema.encodeSync(Schema.fromJsonString(BadRequest));
const badRequest = (reason: string) => json(400, encodeBadRequest({ _tag: "BadRequest", reason }));

const respond = <A>(
  result: Effect.Effect<A, WireError>,
  encode: (value: A) => Effect.Effect<string, Schema.SchemaError>,
): Effect.Effect<Response> =>
  result.pipe(
    Effect.flatMap((value) => Effect.map(Effect.orDie(encode(value)), (text) => json(200, text))),
    Effect.catch((error) =>
      Effect.map(Effect.orDie(encodeError(error)), (text) => json(statusOf(error), text)),
    ),
  );

/** The query verb has its own failure union and its own status map. */
const respondQuery = <A>(
  result: Effect.Effect<A, WireQueryError>,
  encode: (value: A) => Effect.Effect<string, Schema.SchemaError>,
): Effect.Effect<Response> =>
  result.pipe(
    Effect.flatMap((value) => Effect.map(Effect.orDie(encode(value)), (text) => json(200, text))),
    Effect.catch((error) =>
      Effect.map(Effect.orDie(encodeQueryError(error)), (text) => json(queryStatusOf(error), text)),
    ),
  );

const eventLine = (projection: Projection) =>
  Effect.map(Effect.orDie(encodeProjection(projection)), (text) => `${eventPrefix}${text}\n\n`);

const parseQuery = (url: URL) =>
  decodeQuery({
    contract: Option.getOrElse(Option.fromNullishOr(url.searchParams.get("contract")), () => ""),
    version: Number(url.searchParams.get("version")),
    key: Option.getOrElse(Option.fromNullishOr(url.searchParams.get("key")), () => ""),
    after: Number(url.searchParams.get("after")),
  });

export const make: Effect.Effect<WebHandler, never, ActorTransport> = Effect.gen(function* () {
  const transport = yield* ActorTransport;
  const context = yield* Effect.context<never>();

  const changes = (request: Request): Effect.Effect<Response> =>
    parseQuery(new URL(request.url)).pipe(
      Effect.map((query) => {
        const address = { contract: query.contract, version: query.version, key: query.key };
        const lines = transport
          .changes(address, query.after)
          .pipe(Stream.mapEffect(eventLine), Stream.encodeText);
        // A protocol failure ends the stream with one error event so the
        // client can decode it; a transport failure closes the connection.
        const body = Stream.catch(lines, (error) =>
          Stream.fromEffect(
            Effect.map(Effect.orDie(encodeError(error)), (text) =>
              new TextEncoder().encode(`event: error\n${eventPrefix}${text}\n\n`),
            ),
          ),
        );
        return new Response(Stream.toReadableStreamWith(body, context), {
          status: 200,
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
          },
        });
      }),
      Effect.catch((error) => Effect.succeed(badRequest(error.message))),
    );

  const handler: WebHandler = (request) => {
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path.endsWith(paths.changes)) {
      return changes(request);
    }
    if (request.method !== "POST") {
      return Effect.succeed(new Response("method not allowed", { status: 405 }));
    }
    if (path.endsWith(paths.send)) {
      return decodeSend(request).pipe(
        Effect.flatMap((body) =>
          respond(
            Effect.map(
              transport.send(body.address, body.commandId, body.payload, body.active),
              (result) => ({ ...result.receipt, refreshed: result.refreshed }),
            ),
            encodeReceipt,
          ),
        ),
        Effect.catch((reason) => Effect.succeed(badRequest(reason))),
      );
    }
    if (path.endsWith(paths.call)) {
      return decodeCall(request).pipe(
        Effect.flatMap((body) =>
          respond(
            Effect.map(
              transport.call(
                body.address,
                body.commandId,
                body.payload,
                Duration.millis(body.timeoutMillis),
                body.active,
              ),
              (result) => ({ ...result.projection, refreshed: result.refreshed }),
            ),
            encodeApplied,
          ),
        ),
        Effect.catch((reason) => Effect.succeed(badRequest(reason))),
      );
    }
    if (path.endsWith(paths.query)) {
      return decodeQueryBody(request).pipe(
        Effect.flatMap((body) =>
          respondQuery(
            Effect.map(transport.query(body.key), (result) => ({ key: body.key, result })),
            encodeQueryValue,
          ),
        ),
        Effect.catch((reason) => Effect.succeed(badRequest(reason))),
      );
    }
    if (path.endsWith(paths.snapshot)) {
      return decodeAddress(request).pipe(
        Effect.flatMap((body) => respond(transport.snapshot(body.address), encodeProjection)),
        Effect.catch((reason) => Effect.succeed(badRequest(reason))),
      );
    }
    return Effect.succeed(new Response("not found", { status: 404 }));
  };
  return handler;
});

/**
 * A promise-returning handler for `Bun.serve` or a Worker `fetch`. The
 * runtime owns the transport layer; dispose it when the server stops.
 */
export const toWebHandler = (layer: Layer.Layer<ActorTransport>) => {
  const runtime = ManagedRuntime.make(layer);
  const handler = runtime.runPromise(make);
  return {
    fetch: (request: Request): Promise<Response> =>
      handler.then((run) => runtime.runPromise(run(request))),
    dispose: (): Promise<void> => runtime.dispose(),
  };
};
