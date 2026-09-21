import { Context, Duration, Effect, Layer, Option, Ref, Schedule, Schema, Stream } from "effect";
import type { Address } from "../contract.js";
import type { TransportService } from "../transport.js";
import { ActorTransport } from "../transport.js";
import { Unreachable } from "../vocabulary.js";
import {
  AddressBody,
  CallBody,
  CallWireError,
  QueryBody,
  ReadWireError,
  SendBody,
  SendWireError,
  WireApplied,
  WireProjection,
  WireQueryError,
  WireQueryValue,
  WireReceipt,
  eventPrefix,
  paths,
} from "./wire.js";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** The fetch the client uses. Defaults to the platform one; tests inject a handler. */
export const Fetch = Context.Reference<FetchLike>("@effect-frame/actor/src/http/client/Fetch", {
  defaultValue: (): FetchLike => (input, init) => globalThis.fetch(input, init),
});

export interface HttpClientOptions {
  /** For example `https://app.example.com/actors`. No trailing slash. */
  readonly baseUrl: string;
  /** Delay between reconnect attempts of a `changes` stream. */
  readonly reconnect: Schedule.Schedule<unknown>;
}

const unreachable = (cause: unknown) => Unreachable.make({ reason: String(cause) });

const decodeUnknownJson = <S extends Schema.Codec<unknown, unknown>>(schema: S) => {
  const decode = Schema.decodeEffect(Schema.fromJsonString(schema));
  return (text: string) => Effect.orDie(decode(text));
};

const decodeReceipt = decodeUnknownJson(WireReceipt);
const decodeProjection = decodeUnknownJson(WireProjection);
const decodeApplied = decodeUnknownJson(WireApplied);
const decodeQueryValue = decodeUnknownJson(WireQueryValue);
const decodeSendError = decodeUnknownJson(SendWireError);
const decodeCallError = decodeUnknownJson(CallWireError);
const decodeReadError = decodeUnknownJson(ReadWireError);
const decodeQueryError = decodeUnknownJson(WireQueryError);
const encodeSend = Schema.encodeEffect(Schema.fromJsonString(SendBody));
const encodeCall = Schema.encodeEffect(Schema.fromJsonString(CallBody));
const encodeAddress = Schema.encodeEffect(Schema.fromJsonString(AddressBody));
const encodeQuery = Schema.encodeEffect(Schema.fromJsonString(QueryBody));

const make = Effect.fn("ActorTransport.http")(function* (options: HttpClientOptions) {
  const fetch = yield* Fetch;

  const post = <E>(path: string, body: string, decodeError: (text: string) => Effect.Effect<E>) =>
    Effect.gen(function* () {
      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(`${options.baseUrl}${path}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
          }),
        catch: unreachable,
      });
      const text = yield* Effect.tryPromise({ try: () => response.text(), catch: unreachable });
      if (response.ok) {
        return text;
      }
      if (response.status >= 500 && response.status !== 503 && response.status !== 504) {
        return yield* unreachable(`${response.status} ${text}`);
      }
      return yield* Effect.flatMap(decodeError(text), (error) => Effect.fail(error));
    });

  const send: TransportService["send"] = (address, commandId, payload, active) =>
    Effect.gen(function* () {
      const body = yield* Effect.orDie(encodeSend({ address, commandId, payload, active }));
      const wire = yield* decodeReceipt(yield* post(paths.send, body, decodeSendError));
      return {
        receipt: { commandId: wire.commandId, admitted: wire.admitted, committed: wire.committed },
        refreshed: wire.refreshed,
      };
    });

  const call: TransportService["call"] = (address, commandId, payload, timeout, active) =>
    Effect.gen(function* () {
      const timeoutMillis = Duration.toMillis(timeout);
      const body = yield* Effect.orDie(
        encodeCall({ address, commandId, payload, timeoutMillis, active }),
      );
      const wire = yield* decodeApplied(yield* post(paths.call, body, decodeCallError));
      return {
        projection: { revision: wire.revision, snapshot: wire.snapshot },
        refreshed: wire.refreshed,
      };
    });

  const query: TransportService["query"] = (key) =>
    Effect.gen(function* () {
      const body = yield* Effect.orDie(encodeQuery({ key }));
      const wire = yield* decodeQueryValue(yield* post(paths.query, body, decodeQueryError));
      return wire.result;
    });

  const snapshot: TransportService["snapshot"] = (address) =>
    Effect.gen(function* () {
      const body = yield* Effect.orDie(encodeAddress({ address }));
      return yield* decodeProjection(yield* post(paths.snapshot, body, decodeReadError));
    });

  const changesUrl = (address: Address, after: number) => {
    const params = new URLSearchParams({
      contract: address.contract,
      version: String(address.version),
      key: address.key,
      after: String(after),
    });
    return `${options.baseUrl}${paths.changes}?${params.toString()}`;
  };

  /** One connection. Ends when the server closes it; fails when the network does. */
  const connect = (address: Address, after: number) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const response = yield* Effect.tryPromise({
          try: () => fetch(changesUrl(address, after), { method: "GET" }),
          catch: unreachable,
        });
        if (!response.ok) {
          const text = yield* Effect.tryPromise({
            try: () => response.text(),
            catch: unreachable,
          });
          return Stream.fail(yield* decodeReadError(text));
        }
        const body = Option.fromNullishOr(response.body);
        if (Option.isNone(body)) {
          return Stream.fail(unreachable("event stream without a body"));
        }
        return Stream.fromReadableStream({ evaluate: () => body.value, onError: unreachable }).pipe(
          Stream.decodeText,
          Stream.splitLines,
          Stream.filter((line) => line.startsWith(eventPrefix)),
          Stream.mapEffect((line) => decodeProjection(line.slice(eventPrefix.length))),
          // From the client's view the stream never ends. A server that closes
          // the connection is a disconnect, and the schedule decides the retry.
          Stream.concat(Stream.fail(unreachable("the event stream ended"))),
        );
      }),
    );

  /**
   * Reconnects after a network failure from the last revision it saw, so a
   * dropped connection never loses or repeats a revision.
   */
  const changes: TransportService["changes"] = (address, after) =>
    Stream.unwrap(
      Effect.map(Ref.make(after), (last) =>
        Stream.unwrap(Effect.map(Ref.get(last), (from) => connect(address, from))).pipe(
          Stream.tap((projection) => Ref.set(last, projection.revision)),
          Stream.retry(options.reconnect),
          Stream.filter((projection) => projection.revision > after),
        ),
      ),
    );

  const transport: TransportService = { send, call, snapshot, query, changes };
  return transport;
});

export const layer = (options: HttpClientOptions): Layer.Layer<ActorTransport> =>
  Layer.effect(ActorTransport, make(options));

export const defaultReconnect: Schedule.Schedule<unknown> = Schedule.exponential("100 millis").pipe(
  Schedule.upTo({ times: 10 }),
);
