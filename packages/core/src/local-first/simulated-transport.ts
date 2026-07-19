import { Effect, Schema } from 'effect';

import {
  INITIAL_SERVER_REVISION,
  MutationSequence,
  ServerRevision,
  type ClientId,
  type MutationEnvelope,
  type MutationId,
  type RevisionPatch,
} from './model.js';
import {
  type AcceptedMutation,
  MutationGapError,
  type SyncTransport,
  TransportOfflineError,
} from './transport.js';

interface AcceptedEntry {
  readonly envelope: MutationEnvelope;
  readonly revision: ServerRevision;
}

export interface SimulatedTransport extends SyncTransport {
  readonly setOnline: (online: boolean) => void;
  readonly acceptedCount: () => number;
}

export const makeSimulatedTransport = (): SimulatedTransport => {
  let online = true;
  const accepted: Array<AcceptedEntry> = [];
  const byMutationId = new Map<MutationId, AcceptedEntry>();
  const nextSequence = new Map<ClientId, MutationSequence>();

  const requireOnline = <A, E>(
    effect: Effect.Effect<A, E>,
  ): Effect.Effect<A, E | TransportOfflineError> =>
    online
      ? effect
      : Effect.fail(
          new TransportOfflineError({
            message: 'simulated transport is offline',
          }),
        );

  const push = Effect.fn('SimulatedTransport.push')((envelope: MutationEnvelope) =>
    requireOnline(
      Effect.gen(function* () {
        const duplicate = byMutationId.get(envelope.mutationId);
        if (duplicate) {
          return {
            mutationId: envelope.mutationId,
            revision: duplicate.revision,
            duplicate: true,
          } satisfies AcceptedMutation;
        }

        const expected =
          nextSequence.get(envelope.clientId) ?? Schema.decodeSync(MutationSequence)(1);
        if (envelope.sequence !== expected) {
          return yield* new MutationGapError({
            clientId: envelope.clientId,
            expected,
            received: envelope.sequence,
          });
        }

        const revision = Schema.decodeSync(ServerRevision)(accepted.length + 1);
        const entry = { envelope, revision };
        accepted.push(entry);
        byMutationId.set(envelope.mutationId, entry);
        nextSequence.set(envelope.clientId, Schema.decodeSync(MutationSequence)(expected + 1));

        return {
          mutationId: envelope.mutationId,
          revision,
          duplicate: false,
        };
      }),
    ),
  );

  const pull = Effect.fn('SimulatedTransport.pull')((baseRevision: ServerRevision) =>
    requireOnline(
      Effect.sync(
        (): RevisionPatch => ({
          baseRevision,
          revision: accepted.at(-1)?.revision ?? INITIAL_SERVER_REVISION,
          mutations: accepted
            .filter((entry) => entry.revision > baseRevision)
            .map((entry) => entry.envelope),
        }),
      ),
    ),
  );

  return {
    push,
    pull,
    setOnline: (value) => {
      online = value;
    },
    acceptedCount: () => accepted.length,
  };
};
