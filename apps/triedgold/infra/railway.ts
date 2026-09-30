/**
 * The Railway project Tried Gold runs in, and the rules that protect what
 * production already has.
 *
 * `prod` is the existing `tried-gold` project, which `cevr/tried-gold` built
 * with Nixpacks from GitHub. The prod stack adopts it (its name does not match
 * Alchemy's generated-name pattern, so without `adopt` its `read` returns it
 * as unowned) and retains it (`alchemy destroy` only forgets it). Every other
 * stage gets its own generated project, which it creates and destroys, so a
 * throwaway stage never touches production.
 */
import * as Alchemy from 'alchemy';
// Subpath imports: the `alchemy/Railway` index re-exports `Website`, whose
// framework adapters statically import the optional peer
// `@alchemy.run/frontend-frameworks`, which this app does not install.
import { Project } from 'alchemy/Railway/Project';

/** Railway ids observed with read-only `railway` commands on 2026-09-30. */
export const Ids = {
  workspace: 'e7bf0e51-695c-4c12-aea3-d46949594a0f',
  project: 'c2424d4c-beaf-4d2c-81b7-7e9e11f9b6f4',
  /** `production`, the project's only environment. */
  environment: 'f52e223c-a4e6-4239-b1d2-030a94cd51c8',
  service: '820405e8-1a11-4bf6-aedc-d4821808dca9',
  /** `triedgold.com` on the service, targeting port 8080. */
  customDomain: '350aa794-1a93-4552-94a2-289d0be40639',
};

/** The port the server listens on. `triedgold.com` already targets it. */
export const PORT = 8080;

/** The public hostname. Its DNS is on Cloudflare (`infra/domains.ts`). */
export const DOMAIN = 'triedgold.com';

/** True on the one stage that owns production. */
export const isProd = Alchemy.Stack.useSync((stack) => stack.stage === 'prod');

/** Production's service name. Other stages let Alchemy generate one. */
export const serviceName = (stage: string) => {
  if (stage === 'prod') return { name: 'tried-gold' };
  return {};
};

/**
 * `tried-gold` in prod, found by name in the pinned workspace. A different
 * `workspaceId` is the one prop change that replaces a project, so it stays
 * pinned to the value the project already has.
 */
export const TriedGold = Project(
  'TriedGold',
  Alchemy.Stack.useSync((stack) => {
    if (stack.stage === 'prod') return { name: 'tried-gold', workspaceId: Ids.workspace };
    return { workspaceId: Ids.workspace };
  }),
).pipe(Alchemy.AdoptPolicy.adopt(isProd), Alchemy.RemovalPolicy.retain(isProd));
