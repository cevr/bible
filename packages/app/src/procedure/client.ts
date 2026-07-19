import type { BibleProcedureGroup } from '@bible/core/procedure';
import type { RpcClient } from 'effect/unstable/rpc';

export type RawProcedureClient = RpcClient.FromGroup<typeof BibleProcedureGroup>;

type OptionalInputCall<Call> = Call extends (
  input: infer Input,
  options?: infer Options,
) => infer Result
  ? (input?: Input, options?: Options) => Result
  : never;

type OptionalInputProcedure = 'v1.reading.writingsCatalog.get' | 'v1.preferences.reading.get';

export type ProcedureClient = Omit<RawProcedureClient, OptionalInputProcedure> & {
  readonly [Tag in OptionalInputProcedure]: OptionalInputCall<RawProcedureClient[Tag]>;
};

export const createProcedureClient = (raw: RawProcedureClient): ProcedureClient => ({
  ...raw,
  'v1.reading.writingsCatalog.get': (input = {}, options) =>
    raw['v1.reading.writingsCatalog.get'](input, options),
  'v1.preferences.reading.get': (input = {}, options) =>
    raw['v1.preferences.reading.get'](input, options),
});
