// MCP Events, as the lab serves them (protocol 2026-07-28, OpenAI's MCP
// Events profile): what a subscriber asks (`events/subscribe`,
// `events/unsubscribe`), what the lab keeps of each subscription on disk,
// and what each webhook delivery carries. The events are the lab's
// catalogue (`LAB_EVENTS`) and each delivery's `data` its payload
// (`LabChange`); a subscription's `arguments` narrow it to one film. Pure:
// the lab's side (verifying a callback, signing and posting each delivery,
// the store) is `tools/mcp-events.ts`.

import { Array as Arr, Match, Option, Order, Result, Schema } from 'effect';
import { Base64 } from 'effect/encoding';
import { LabChange } from './lab-events.ts';

/** The most bytes a delivery's body takes: a callback refuses more (Standard Webhooks, the profile's limit). */
export const DELIVERY_MAX_BYTES = 256 * 1024;

/** What a subscription to one of the lab's events takes: the film its events are about (every film's when left out). */
export const EventArguments = Schema.Struct({
  film: Schema.optionalKey(
    Schema.String.annotate({ description: "Only this film's events; every film's when left out" }),
  ),
});
export type EventArguments = typeof EventArguments.Type;

/** A subscription's webhook: where each event is posted, and the secret it is signed with. */
const Webhook = Schema.Struct({
  mode: Schema.Literal('webhook'),
  url: Schema.String,
  secret: Schema.String,
});

/** `events/subscribe`'s params. `ttlMs` null asks for no expiry; left out, the lab's own. */
export const SubscribeParams = Schema.Struct({
  name: Schema.String,
  arguments: Schema.optionalKey(Schema.Record(Schema.String, Schema.Json)),
  delivery: Webhook,
  cursor: Schema.optionalKey(Schema.NullOr(Schema.String)),
  ttlMs: Schema.optionalKey(Schema.NullOr(Schema.Finite)),
});
export type SubscribeParams = typeof SubscribeParams.Type;

/** `events/unsubscribe`'s params: the subscription named as it was made, its secret aside. */
export const UnsubscribeParams = Schema.Struct({
  name: Schema.String,
  arguments: Schema.optionalKey(Schema.Record(Schema.String, Schema.Json)),
  delivery: Schema.Struct({ mode: Schema.Literal('webhook'), url: Schema.String }),
});
export type UnsubscribeParams = typeof UnsubscribeParams.Type;

/** `events/subscribe`'s answer: the subscription's id, when to subscribe again by (none: never), its cursor, and whether the history asked for is gone. */
export const SubscribeResult = Schema.Struct({
  id: Schema.String,
  refreshBefore: Schema.OptionFromNullOr(Schema.String),
  cursor: Schema.OptionFromNullOr(Schema.String),
  truncated: Schema.Boolean,
});

/** One subscription as the lab keeps it (`lab/events/subscriptions.json`). */
export const EventSubscription = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  arguments: EventArguments,
  url: Schema.String,
  secret: Schema.String,
  /** Where its deliveries read on from: the feed's cursor after the last event it was sent. */
  cursor: Schema.String,
  /** ISO time it expires at; none: it never does. */
  refreshBefore: Schema.optionalKey(Schema.String),
  /** ISO time it was made, and last subscribed again. */
  made: Schema.String,
  refreshed: Schema.String,
});
export type EventSubscription = typeof EventSubscription.Type;

/** The lab's subscriptions file. */
export const SubscriptionsJson = Schema.fromJsonString(
  Schema.Struct({ subscriptions: Schema.Array(EventSubscription) }),
);
export type Subscriptions = typeof SubscriptionsJson.Type;

/** What a callback is posted to show it answers for the subscriber: its challenge, echoed. */
export const Verification = Schema.Struct({
  type: Schema.Literal('verification'),
  challenge: Schema.String,
});

/** One event as a webhook delivers it: its id (the same on each retry), name, time, payload and the cursor after it. */
export const Delivery = Schema.Struct({
  eventId: Schema.String,
  name: Schema.String,
  timestamp: Schema.String,
  data: LabChange,
  cursor: Schema.String,
});

const SECRET_PREFIX = 'whsec_';

/** A subscription's secret, read: `whsec_` and base64 of 24 to 64 bytes, the key it signs with; or why not. Pure. */
export const secretKey = (secret: string): Result.Result<Uint8Array, string> =>
  Result.flatMap(
    Result.fromOption(
      Option.liftPredicate(secret, (s) => s.startsWith(SECRET_PREFIX)),
      () => `the secret does not start with ${SECRET_PREFIX}`,
    ),
    (s) =>
      Result.flatMap(
        Result.mapError(
          Base64.decode(s.slice(SECRET_PREFIX.length)),
          () => 'the secret is not base64',
        ),
        (key) =>
          Result.fromOption(
            Option.liftPredicate(key, (k) => k.length >= 24 && k.length <= 64),
            () => `the secret is ${key.length} bytes, not 24 to 64`,
          ),
      ),
  );

const isJsonObject = Schema.is(Schema.JsonObject);
const isJsonArray = Schema.is(Schema.Array(Schema.Json));
const jsonText = Schema.encodeSync(Schema.fromJsonString(Schema.Json));

const BY_KEY = Order.mapInput(Order.String, ([key]: readonly [string, Schema.Json]) => key);

/** `value` with every object's keys in order, at every depth. Pure. */
const ordered = (value: Schema.Json): Schema.Json =>
  Match.value(value).pipe(
    Match.when(isJsonArray, (all) => all.map(ordered)),
    Match.when(isJsonObject, (record) =>
      Object.fromEntries(
        Arr.sort(Object.entries(record), BY_KEY).map(([key, inner]) => [key, ordered(inner)]),
      ),
    ),
    Match.orElse(() => value),
  );

/** `value` as canonical JSON: keys in order at every depth, so two orders of one object read alike. Pure. */
export const canonicalJson = (value: Schema.Json): string => jsonText(ordered(value));
