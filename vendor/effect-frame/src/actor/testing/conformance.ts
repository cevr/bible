import type { Layer, Scope } from "effect";
import { Cause, Effect, Equal, Exit, Inspectable, Option, Schema } from "effect";
import type { CommandConflict } from "../vocabulary.js";
import { CommandId } from "../vocabulary.js";
import type { Appended, Committed, StoredReceipt } from "../mailbox-store.js";
import { MailboxStore } from "../mailbox-store.js";

/** The outcome of one conformance case. `detail` explains a failure. */
export interface ConformanceCase {
  readonly name: string;
  readonly passed: boolean;
  readonly detail: string;
}

/**
 * The service the `MailboxStore` key resolves to. `MailboxStore.of` is the
 * constructor the key publishes, so its return type is the service itself.
 */
export type StoreService = ReturnType<typeof MailboxStore.of>;

/**
 * Builds a fresh, empty store. Each case takes one. A scoped factory lets a
 * host open and close real storage per case.
 */
export type StoreFactory = Effect.Effect<StoreService, never, Scope.Scope>;

const id = Schema.decodeSync(CommandId);

interface Check {
  readonly ok: boolean;
  readonly detail: string;
}

const show = <A>(value: A): string => Inspectable.toStringUnknown(value);

const equals = <A>(label: string, actual: A, expected: NoInfer<A>): Check => ({
  ok: Equal.equals(actual, expected),
  detail: `${label}: got ${show(actual)}, want ${show(expected)}`,
});

const isTrue = (label: string, actual: boolean): Check => ({
  ok: actual,
  detail: `${label}: got false, want true`,
});

const firstFailure = (checks: ReadonlyArray<Check>): Option.Option<Check> =>
  Option.fromNullishOr(checks.find((check) => !check.ok));

const commandIdOf = (command: Option.Option<{ readonly commandId: CommandId }>) =>
  Option.map(command, (found) => found.commandId);

const receiptFields = (receipt: StoredReceipt) => ({
  commandId: receipt.commandId,
  admitted: receipt.admitted,
  revision: receipt.revision,
  state: receipt.state,
});

const committedFields = (committed: Option.Option<Committed>) =>
  Option.map(committed, (found) => ({ revision: found.revision, state: found.state }));

const duplicateReceipt = (appended: Appended): Option.Option<StoredReceipt> => {
  if (appended._tag === "Duplicate") {
    return appended.receipt;
  }
  return Option.none();
};

const startsEmpty = Effect.fn("Conformance.startsEmpty")(function* (store: StoreService) {
  const next = yield* store.next;
  const pending = yield* store.pending;
  const latest = yield* store.latest;
  return [
    equals("next", next, Option.none()),
    equals("pending", pending, []),
    equals("latest", latest, Option.none()),
  ];
});

const admitsInOrder = Effect.fn("Conformance.admitsInOrder")(function* (store: StoreService) {
  const first = yield* store.append({ commandId: id("a"), payload: "1", payloadHash: 1 });
  const second = yield* store.append({ commandId: id("b"), payload: "2", payloadHash: 2 });
  const next = yield* store.next;
  const pending = yield* store.pending;
  return [
    equals("first append", first, { _tag: "Admitted", admitted: 1 }),
    equals("second append", second, { _tag: "Admitted", admitted: 2 }),
    equals("next command", commandIdOf(next), Option.some(id("a"))),
    equals("pending", pending, [id("a"), id("b")]),
  ];
});

const duplicateCarriesReceipt = Effect.fn("Conformance.duplicateCarriesReceipt")(function* (
  store: StoreService,
) {
  yield* store.append({ commandId: id("a"), payload: "1", payloadHash: 1 });
  const beforeCommit = yield* store.append({ commandId: id("a"), payload: "1", payloadHash: 1 });
  const receipt = yield* store.commit(id("a"), "s1");
  const afterCommit = yield* store.append({ commandId: id("a"), payload: "1", payloadHash: 1 });
  const afterReceipt = Option.map(duplicateReceipt(afterCommit), receiptFields);
  return [
    equals("duplicate before commit", beforeCommit, {
      _tag: "Duplicate",
      admitted: 1,
      receipt: Option.none(),
    }),
    equals("duplicate tag after commit", afterCommit._tag, "Duplicate"),
    equals("duplicate receipt after commit", afterReceipt, Option.some(receiptFields(receipt))),
  ];
});

const conflictRejectsNewPayload = Effect.fn("Conformance.conflictRejectsNewPayload")(function* (
  store: StoreService,
) {
  yield* store.append({ commandId: id("a"), payload: "1", payloadHash: 1 });
  const outcome = yield* Effect.exit(
    store.append({ commandId: id("a"), payload: "2", payloadHash: 2 }),
  );
  const pending = yield* store.pending;
  const failure = Option.map(Exit.findErrorOption(outcome), (conflict) => ({
    tag: conflict._tag,
    commandId: conflict.commandId,
  }));
  return [
    equals("append fails", failure, Option.some({ tag: "CommandConflict", commandId: id("a") })),
    equals("pending unchanged", pending, [id("a")]),
  ];
});

const commitAdvancesRevision = Effect.fn("Conformance.commitAdvancesRevision")(function* (
  store: StoreService,
) {
  yield* store.append({ commandId: id("a"), payload: "1", payloadHash: 1 });
  yield* store.append({ commandId: id("b"), payload: "2", payloadHash: 2 });
  const first = yield* store.commit(id("a"), "s1");
  const latest = yield* store.latest;
  const next = yield* store.next;
  const second = yield* store.commit(id("b"), "s2");
  const drained = yield* store.next;
  const pending = yield* store.pending;
  return [
    equals("first receipt", receiptFields(first), {
      commandId: id("a"),
      admitted: 1,
      revision: 1,
      state: "s1",
    }),
    equals(
      "latest after first",
      committedFields(latest),
      Option.some({ revision: 1, state: "s1" }),
    ),
    equals("next after first", commandIdOf(next), Option.some(id("b"))),
    equals("second revision", second.revision, 2),
    equals("next after second", drained, Option.none()),
    equals("pending after second", pending, []),
  ];
});

const advanceSharesTheClock = Effect.fn("Conformance.advanceSharesTheClock")(function* (
  store: StoreService,
) {
  const first = yield* store.advance("s1");
  yield* store.append({ commandId: id("a"), payload: "1", payloadHash: 1 });
  const receipt = yield* store.commit(id("a"), "s2");
  const third = yield* store.advance("s3");
  const latest = yield* store.latest;
  const pending = yield* store.pending;
  return [
    equals(
      "first advance",
      { revision: first.revision, state: first.state },
      {
        revision: 1,
        state: "s1",
      },
    ),
    equals("commit revision", receipt.revision, 2),
    equals("third advance revision", third.revision, 3),
    equals("latest", committedFields(latest), Option.some({ revision: 3, state: "s3" })),
    equals("pending", pending, []),
  ];
});

const receiptIsStable = Effect.fn("Conformance.receiptIsStable")(function* (store: StoreService) {
  yield* store.append({ commandId: id("a"), payload: "1", payloadHash: 1 });
  const beforeCommit = yield* store.receipt(id("a"));
  const missing = yield* store.receipt(id("missing"));
  const receipt = yield* store.commit(id("a"), "s1");
  const readOnce = yield* store.receipt(id("a"));
  const readTwice = yield* store.receipt(id("a"));
  const want = Option.some(receiptFields(receipt));
  return [
    equals("receipt before commit", beforeCommit, Option.none()),
    equals("receipt of unknown command", missing, Option.none()),
    equals("receipt after commit", Option.map(readOnce, receiptFields), want),
    equals("receipt read twice", Option.map(readTwice, receiptFields), want),
  ];
});

const drainsPendingOnReopen = Effect.fn("Conformance.drainsPendingOnReopen")(function* (
  store: StoreService,
) {
  yield* store.append({ commandId: id("a"), payload: "1", payloadHash: 1 });
  yield* store.append({ commandId: id("b"), payload: "2", payloadHash: 2 });
  const firstPending = yield* store.next;
  yield* store.commit(id("a"), "s1");
  const secondPending = yield* store.next;
  const pending = yield* store.pending;
  const latest = yield* store.latest;
  return [
    equals("first pending", commandIdOf(firstPending), Option.some(id("a"))),
    equals("second pending", commandIdOf(secondPending), Option.some(id("b"))),
    equals("pending list", pending, [id("b")]),
    isTrue("latest is present", Option.isSome(latest)),
  ];
});

interface Definition {
  readonly name: string;
  /** A case may fail; `runCase` turns any failure into a failed check. */
  readonly run: (store: StoreService) => Effect.Effect<ReadonlyArray<Check>, CommandConflict>;
}

const definitions: ReadonlyArray<Definition> = [
  { name: "starts empty", run: startsEmpty },
  { name: "append admits in order and next returns the oldest command", run: admitsInOrder },
  { name: "a duplicate append carries the stored receipt", run: duplicateCarriesReceipt },
  {
    name: "a new payload under a used ID fails with CommandConflict",
    run: conflictRejectsNewPayload,
  },
  {
    name: "commit advances one monotonic revision and updates latest",
    run: commitAdvancesRevision,
  },
  {
    name: "advance commits with no command and shares the revision clock",
    run: advanceSharesTheClock,
  },
  { name: "receipt is absent until commit and stable after it", run: receiptIsStable },
  { name: "next walks pending commands in admission order", run: drainsPendingOnReopen },
];

const runCase = Effect.fn("Conformance.runCase")(function* (
  factory: StoreFactory,
  definition: Definition,
) {
  const outcome = yield* Effect.exit(Effect.scoped(Effect.flatMap(factory, definition.run)));
  if (Exit.isFailure(outcome)) {
    return {
      name: definition.name,
      passed: false,
      detail: `the case failed: ${Cause.pretty(outcome.cause)}`,
    } satisfies ConformanceCase;
  }
  const checks = outcome.value;
  const failure = firstFailure(checks);
  return Option.match(failure, {
    onNone: (): ConformanceCase => ({
      name: definition.name,
      passed: true,
      detail: `${checks.length} checks passed`,
    }),
    onSome: (check): ConformanceCase => ({
      name: definition.name,
      passed: false,
      detail: check.detail,
    }),
  });
});

/**
 * The conformance suite every `MailboxStore` implementation must pass. The
 * factory must build a fresh, empty store, because each case runs alone. The
 * result never fails; read `passed` on each case.
 */
export const mailboxStoreConformance = Effect.fn("Conformance.mailboxStore")(function* (
  factory: StoreFactory,
) {
  return yield* Effect.forEach(definitions, (definition) => runCase(factory, definition));
});

/** Turns a layer that builds a fresh store into a factory the suite accepts. */
export const factoryFromLayer = (layer: Layer.Layer<MailboxStore>): StoreFactory =>
  // Each conformance case is its own entry point: it needs a fresh store with
  // its own lifetime, so the layer is built here and nowhere higher.
  // @effect-diagnostics-next-line strictEffectProvide:off
  Effect.provide(MailboxStore, layer);
