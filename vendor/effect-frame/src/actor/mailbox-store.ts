import { Context, Effect, Layer, Option, Ref } from "effect";
import type { CommandId } from "./vocabulary.js";
import { CommandConflict } from "./vocabulary.js";

/** A command the actor accepted but has not committed. */
export interface PendingCommand {
  readonly commandId: CommandId;
  readonly admitted: number;
  readonly payload: string;
  readonly payloadHash: number;
}

/** The committed outcome of one command. `state` is the encoded state after it. */
export interface StoredReceipt {
  readonly commandId: CommandId;
  readonly admitted: number;
  readonly revision: number;
  readonly state: string;
}

/** The latest committed state and its revision. */
export interface Committed {
  readonly revision: number;
  readonly state: string;
}

export interface AppendInput {
  readonly commandId: CommandId;
  readonly payload: string;
  readonly payloadHash: number;
}

export interface Admitted {
  readonly _tag: "Admitted";
  readonly admitted: number;
}

export interface Duplicate {
  readonly _tag: "Duplicate";
  readonly admitted: number;
  readonly receipt: Option.Option<StoredReceipt>;
}

export type Appended = Admitted | Duplicate;

/**
 * The durable mailbox. One store serves one actor. Every implementation must
 * pass the same conformance suite. The interface uses only operations that
 * every host can provide: a keyed read, a keyed write, and one local
 * transaction for `commit`.
 */
export class MailboxStore extends Context.Service<
  MailboxStore,
  {
    /** Admit a command. Same ID and payload returns `Duplicate`. Same ID and a different payload fails. */
    readonly append: (input: AppendInput) => Effect.Effect<Appended, CommandConflict>;
    /** The oldest command without a receipt. */
    readonly next: Effect.Effect<Option.Option<PendingCommand>>;
    /** Commit the next state and the receipt in one step and advance the revision. */
    readonly commit: (commandId: CommandId, state: string) => Effect.Effect<StoredReceipt>;
    readonly receipt: (commandId: CommandId) => Effect.Effect<Option.Option<StoredReceipt>>;
    readonly pending: Effect.Effect<ReadonlyArray<CommandId>>;
    readonly latest: Effect.Effect<Option.Option<Committed>>;
    /** Commit a state the behavior reached on its own and advance the revision. No command, no receipt. */
    readonly advance: (state: string) => Effect.Effect<Committed>;
  }
>()("effect-frame/src/actor/mailbox-store/MailboxStore") {
  static readonly layerMemory: Layer.Layer<MailboxStore> = Layer.effect(MailboxStore, makeMemory());
}

interface Entry {
  readonly command: PendingCommand;
  readonly receipt: Option.Option<StoredReceipt>;
}

interface Log {
  readonly entries: ReadonlyArray<Entry>;
  readonly nextAdmission: number;
  readonly committed: Option.Option<Committed>;
}

const emptyLog: Log = { entries: [], nextAdmission: 1, committed: Option.none() };

type AppendOutcome = Appended | CommandConflict;

const appendToLog = (log: Log, input: AppendInput): readonly [AppendOutcome, Log] => {
  const existing = Option.fromNullishOr(
    log.entries.find((entry) => entry.command.commandId === input.commandId),
  );
  return Option.match(existing, {
    onSome: (entry): readonly [AppendOutcome, Log] => {
      if (entry.command.payloadHash !== input.payloadHash) {
        return [CommandConflict.make({ commandId: input.commandId }), log];
      }
      return [{ _tag: "Duplicate", admitted: entry.command.admitted, receipt: entry.receipt }, log];
    },
    onNone: (): readonly [AppendOutcome, Log] => {
      const admitted = log.nextAdmission;
      const entry: Entry = {
        command: { ...input, admitted },
        receipt: Option.none(),
      };
      return [
        { _tag: "Admitted", admitted },
        { ...log, entries: [...log.entries, entry], nextAdmission: admitted + 1 },
      ];
    },
  });
};

const commitToLog = (
  log: Log,
  commandId: CommandId,
  state: string,
): readonly [Option.Option<StoredReceipt>, Log] => {
  const index = log.entries.findIndex((entry) => entry.command.commandId === commandId);
  const entry = Option.fromNullishOr(log.entries[index]);
  return Option.match(entry, {
    onNone: (): readonly [Option.Option<StoredReceipt>, Log] => [Option.none(), log],
    onSome: (found): readonly [Option.Option<StoredReceipt>, Log] => {
      const revision = Option.match(log.committed, {
        onNone: () => 1,
        onSome: (committed) => committed.revision + 1,
      });
      const receipt: StoredReceipt = {
        commandId,
        admitted: found.command.admitted,
        revision,
        state,
      };
      const entries = log.entries.map((candidate, position) => {
        if (position === index) {
          return { ...candidate, receipt: Option.some(receipt) };
        }
        return candidate;
      });
      return [
        Option.some(receipt),
        { ...log, entries, committed: Option.some({ revision, state }) },
      ];
    },
  });
};

function makeMemory() {
  return Effect.gen(function* () {
    const log = yield* Ref.make(emptyLog);

    const append = Effect.fn("MailboxStore.append")(function* (input: AppendInput) {
      const outcome = yield* Ref.modify(log, (current) => appendToLog(current, input));
      if (outcome._tag === "CommandConflict") {
        return yield* outcome;
      }
      return outcome;
    });

    const next = Effect.map(Ref.get(log), (current) =>
      Option.map(
        Option.fromNullishOr(current.entries.find((entry) => Option.isNone(entry.receipt))),
        (entry) => entry.command,
      ),
    );

    const commit = Effect.fn("MailboxStore.commit")(function* (
      commandId: CommandId,
      state: string,
    ) {
      const receipt = yield* Ref.modify(log, (current) => commitToLog(current, commandId, state));
      return yield* Option.match(receipt, {
        onNone: () => Effect.die(`MailboxStore.commit: unknown command ${commandId}`),
        onSome: Effect.succeed,
      });
    });

    const receipt = (commandId: CommandId) =>
      Effect.map(Ref.get(log), (current) =>
        Option.flatMap(
          Option.fromNullishOr(
            current.entries.find((entry) => entry.command.commandId === commandId),
          ),
          (entry) => entry.receipt,
        ),
      );

    const pending = Effect.map(Ref.get(log), (current) =>
      current.entries
        .filter((entry) => Option.isNone(entry.receipt))
        .map((entry) => entry.command.commandId),
    );

    const latest = Effect.map(Ref.get(log), (current) => current.committed);

    const advance = (state: string) =>
      Ref.modify(log, (current): readonly [Committed, Log] => {
        const revision = Option.match(current.committed, {
          onNone: () => 1,
          onSome: (committed) => committed.revision + 1,
        });
        const committed: Committed = { revision, state };
        return [committed, { ...current, committed: Option.some(committed) }];
      });

    return MailboxStore.of({ append, next, commit, receipt, pending, latest, advance });
  });
}
