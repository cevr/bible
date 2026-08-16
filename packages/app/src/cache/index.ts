/**
 * The cache's public surface.
 *
 * Only `ProcedureClient` crosses the package boundary: a host starts its own
 * transport and hands the finished client to `ApplicationBootstrap`, so the
 * type has to be nameable from outside. Everything else here — the reactivity
 * key derivation, the `AtomRpc` service, the settled-mutation index — is how
 * the reading data layer is built, not how it is used, and is imported
 * directly by its neighbours inside this package.
 *
 * Narrow deliberately. A barrel that re-exports a module wholesale turns every
 * internal helper into API that a future change has to keep working.
 */
export type { ProcedureClient } from './reading-rpc.js';
