import type { BibleProcedureGroup } from '@bible/core/procedure';
import type { RpcClient } from 'effect/unstable/rpc';

export type ProcedureClient = RpcClient.FromGroup<typeof BibleProcedureGroup>;
