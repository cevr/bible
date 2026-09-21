import { Schema } from "effect";

/** A schema whose codecs need no services. Contracts cross the wire alone. */
export type Pure = Schema.Codec<unknown, unknown>;

/**
 * What a client may know about an actor: its name, protocol version, the
 * shape of the key that selects one instance, the snapshot clients observe,
 * and the messages clients may send. Schemas only. This module must stay
 * safe to ship to a browser: it never imports behavior, stores, or hosts.
 */
export interface ActorContract<
  Name extends string,
  Key extends Pure,
  Snapshot extends Pure,
  Message extends Pure,
> {
  readonly name: Name;
  /** Bumped when `key`, `snapshot`, or `message` changes incompatibly. */
  readonly version: number;
  readonly key: Schema.fromJsonString<Key>;
  readonly snapshot: Schema.fromJsonString<Snapshot>;
  readonly message: Schema.fromJsonString<Message>;
  /** The schemas as given, for embedding inside a larger document. */
  readonly raw: { readonly key: Key; readonly snapshot: Snapshot; readonly message: Message };
}

export interface ContractOptions<Key extends Pure, Snapshot extends Pure, Message extends Pure> {
  readonly version: number;
  /** Selects one instance. Include the tenant so authorization can read it. */
  readonly key: Key;
  /** The public projection of the actor state. Often the state itself. */
  readonly snapshot: Snapshot;
  /** A `Schema.Union` of `Schema.TaggedStruct` members. */
  readonly message: Message;
}

export type AnyContract = ActorContract<string, Pure, Pure, Pure>;

export type KeyOf<C extends AnyContract> = C["key"]["Type"];
export type SnapshotOf<C extends AnyContract> = C["snapshot"]["Type"];
export type MessageOf<C extends AnyContract> = C["message"]["Type"];

export const contract = <
  const Name extends string,
  Key extends Pure,
  Snapshot extends Pure,
  Message extends Pure,
>(
  name: Name,
  options: ContractOptions<Key, Snapshot, Message>,
): ActorContract<Name, Key, Snapshot, Message> => ({
  name,
  version: options.version,
  key: Schema.fromJsonString(options.key),
  snapshot: Schema.fromJsonString(options.snapshot),
  message: Schema.fromJsonString(options.message),
  raw: { key: options.key, snapshot: options.snapshot, message: options.message },
});

/**
 * The codec for a revisioned snapshot a server hands a client, so the
 * client's reference can resume from it. One JSON string carries both.
 */
export type ResumeCodec<C extends AnyContract> = Schema.fromJsonString<
  Schema.Struct<{ readonly revision: typeof Schema.Finite; readonly state: C["raw"]["snapshot"] }>
>;

export const resumeCodec = <C extends AnyContract>(definition: C): ResumeCodec<C> => {
  const snapshot: C["raw"]["snapshot"] = definition.raw.snapshot;
  return Schema.fromJsonString(Schema.Struct({ revision: Schema.Finite, state: snapshot }));
};

/** Where one actor instance lives on the wire. Every field is a string. */
export interface Address {
  readonly contract: string;
  readonly version: number;
  readonly key: string;
}
