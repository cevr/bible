export { buildIpc, IpcCacheError } from './proxy.js';
export { defineProcedures, mutation, query } from './procedure.js';
export type { Procedure, ProcedureKind, ProcedureNode } from './procedure.js';
export type { Arg, IpcProxy, MutationProc, QueryProc } from './types.js';
export type { QueryOptions } from './registry.js';
export { clearAll, invalidatePrefix } from './registry.js';
