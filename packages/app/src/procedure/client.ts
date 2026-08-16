import {
  BibleProcedureGroup,
  expectedRuntimeConnection,
  type RuntimeConnection,
} from '@bible/core/procedure';
import { Context, Effect, Layer } from 'effect';
import { RpcClient } from 'effect/unstable/rpc';

import type { ProcedureClient } from '../cache/reading-rpc.js';

export interface ProcedureHostApi {
  readonly connection: RuntimeConnection;
  readonly procedures: ProcedureClient;
}

export class ProcedureHost extends Context.Service<ProcedureHost, ProcedureHostApi>()(
  '@bible/app/procedure/ProcedureHost',
) {}

/**
 * The client is built flattened — one call taking a procedure tag and its
 * payload — because that is the shape the reading cache's atom families
 * consume. The flattened form also takes every payload explicitly, which
 * retired the per-procedure wrappers that used to default the empty payloads
 * of the argument-less procedures.
 */
const makeProcedureHost = Effect.gen(function* () {
  const procedures = yield* RpcClient.make(BibleProcedureGroup, { flatten: true });
  const connection = yield* procedures('v1.runtime.connect', expectedRuntimeConnection);
  return ProcedureHost.of({ connection, procedures });
});

/**
 * Transport-neutral, scoped procedure client. Platform hosts provide only an
 * `RpcClient.Protocol`; the shared application owns compatibility negotiation
 * and the client lifetime.
 */
export const ProcedureHostLive = Layer.effect(ProcedureHost, makeProcedureHost);
