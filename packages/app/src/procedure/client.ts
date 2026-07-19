import {
  BibleProcedureGroup,
  expectedRuntimeConnection,
  type RuntimeConnection,
} from '@bible/core/procedure';
import { Context, Effect, Layer } from 'effect';
import { RpcClient } from 'effect/unstable/rpc';
import type { RpcClientError } from 'effect/unstable/rpc/RpcClientError';

export type RawProcedureClient = RpcClient.FromGroup<typeof BibleProcedureGroup, RpcClientError>;

type OptionalInputCall<Call> = Call extends (
  input: infer Input,
  options?: infer Options,
) => infer Result
  ? (input?: Input, options?: Options) => Result
  : never;

type OptionalInputProcedure =
  | 'v1.reading.writingsCatalog.get'
  | 'v1.preferences.reading.get'
  | 'v1.library.collections.get'
  | 'v1.library.plans.get'
  | 'v1.library.practice.get';

export type ProcedureClient = Omit<RawProcedureClient, OptionalInputProcedure> & {
  readonly [Tag in OptionalInputProcedure]: OptionalInputCall<RawProcedureClient[Tag]>;
};

export const createProcedureClient = (raw: RawProcedureClient): ProcedureClient => ({
  ...raw,
  'v1.reading.writingsCatalog.get': (input = {}, options) =>
    raw['v1.reading.writingsCatalog.get'](input, options),
  'v1.preferences.reading.get': (input = {}, options) =>
    raw['v1.preferences.reading.get'](input, options),
  'v1.library.collections.get': (input = {}, options) =>
    raw['v1.library.collections.get'](input, options),
  'v1.library.plans.get': (input = {}, options) => raw['v1.library.plans.get'](input, options),
  'v1.library.practice.get': (input = {}, options) =>
    raw['v1.library.practice.get'](input, options),
});

export interface ProcedureHostShape {
  readonly connection: RuntimeConnection;
  readonly procedures: ProcedureClient;
}

export class ProcedureHost extends Context.Service<ProcedureHost, ProcedureHostShape>()(
  '@bible/app/procedure/ProcedureHost',
) {}

const makeProcedureHost = Effect.gen(function* () {
  const raw = yield* RpcClient.make(BibleProcedureGroup);
  const procedures = createProcedureClient(raw);
  const connection = yield* procedures['v1.runtime.connect'](expectedRuntimeConnection);
  return ProcedureHost.of({ connection, procedures });
});

/**
 * Transport-neutral, scoped procedure client. Platform hosts provide only an
 * `RpcClient.Protocol`; the shared application owns compatibility negotiation
 * and the client lifetime.
 */
export const ProcedureHostLive = Layer.effect(ProcedureHost, makeProcedureHost);
