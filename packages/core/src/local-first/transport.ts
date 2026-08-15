import { Schema, type Effect } from 'effect';

import type { MutationEnvelope, MutationId, RevisionPatch, ServerRevision } from './model.js';

export class TransportOfflineError extends Schema.TaggedError<TransportOfflineError>()(
  'TransportOfflineError',
  { message: Schema.String },
) {}

export class MutationGapError extends Schema.TaggedError<MutationGapError>()('MutationGapError', {
  clientId: Schema.String,
  expected: Schema.Finite,
  received: Schema.Finite,
}) {}

export interface AcceptedMutation {
  readonly mutationId: MutationId;
  readonly revision: ServerRevision;
  readonly duplicate: boolean;
}

export interface SyncTransport {
  readonly push: (
    envelope: MutationEnvelope,
  ) => Effect.Effect<AcceptedMutation, TransportOfflineError | MutationGapError>;
  readonly pull: (revision: ServerRevision) => Effect.Effect<RevisionPatch, TransportOfflineError>;
}
