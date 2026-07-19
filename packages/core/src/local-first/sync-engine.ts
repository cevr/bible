import { Effect, Schema } from 'effect';

import {
  ClientId,
  DomainMutationCommand,
  MutationId,
  Timestamp,
  type ChangeSet,
  type MutationEnvelope,
} from './model.js';
import type { StaleRevisionError, SyncStore, SyncStoreError } from './sync-store.js';
import type { MutationGapError, SyncTransport, TransportOfflineError } from './transport.js';

export class MutationDecodeError extends Schema.TaggedErrorClass<MutationDecodeError>()(
  'MutationDecodeError',
  { message: Schema.String, cause: Schema.optional(Schema.Unknown) },
) {}

export interface SyncEngineOptions {
  readonly clientId: ClientId;
  readonly store: SyncStore;
  readonly transport: SyncTransport;
  readonly nextMutationId: () => MutationId;
  readonly now: () => Timestamp;
  readonly publish: (
    changes: ChangeSet,
    context: { readonly source: 'local' | 'sync'; readonly mutation?: MutationEnvelope },
  ) => Effect.Effect<void>;
}

export interface SyncEngine {
  readonly mutate: (
    command: unknown,
  ) => Effect.Effect<MutationEnvelope, MutationDecodeError | SyncStoreError>;
  readonly synchronize: () => Effect.Effect<
    void,
    SyncStoreError | StaleRevisionError | TransportOfflineError | MutationGapError
  >;
}

export const makeSyncEngine = (options: SyncEngineOptions): SyncEngine => {
  const mutate = Effect.fn('SyncEngine.mutate')((input: unknown) =>
    Effect.gen(function* () {
      const command = yield* Schema.decodeUnknownEffect(DomainMutationCommand)(input).pipe(
        Effect.mapError(
          (cause) =>
            new MutationDecodeError({
              message: 'invalid domain mutation',
              cause,
            }),
        ),
      );
      const committed = yield* options.store.mutate({
        clientId: options.clientId,
        mutationId: options.nextMutationId(),
        command,
        createdAt: options.now(),
      });
      yield* options.publish(committed.changes, {
        source: 'local',
        mutation: committed.envelope,
      });
      return committed.envelope;
    }),
  );

  const synchronize = Effect.fn('SyncEngine.synchronize')(() =>
    Effect.gen(function* () {
      const pending = yield* options.store.pending;
      for (const envelope of pending) {
        const accepted = yield* options.transport.push(envelope);
        yield* options.store.markAccepted(accepted.mutationId, accepted.revision);
      }

      const revision = yield* options.store.revision;
      const patch = yield* options.transport.pull(revision);
      const changes = yield* options.store.applyPatch(patch);
      if (changes.scopes.length > 0) {
        yield* options.publish(changes, { source: 'sync' });
      }
    }),
  );

  return { mutate, synchronize };
};

export const decodeClientId = Schema.decodeSync(ClientId);
export const decodeMutationId = Schema.decodeSync(MutationId);
export const decodeTimestamp = Schema.decodeSync(Timestamp);
