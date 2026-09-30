/**
 * Tried Gold on Railway, declared as an Alchemy stack.
 *
 * - `prod` adopts and retains what `cevr/tried-gold` deployed: the `tried-gold`
 *   project, its `tried-gold` service, and the `triedgold.com` custom domain.
 *   The service's source moves from a GitHub/Nixpacks build to this app's
 *   bundle. Deploying prod is the owner's call (`bun run deploy`).
 * - Every other stage (`test_$USER`, `agent-*`) is a throwaway: its own
 *   project and a generated `*.up.railway.app` URL, created and destroyed
 *   whole.
 *
 * DNS for triedgold.com is at name.com, not Cloudflare, so this stack
 * declares no DNS records. The records Railway asks for stay manual.
 *
 * Run it from this directory after `react-router build` (the package scripts
 * do both): the service ships `build/client` and bundles `build/server`.
 */
import * as Alchemy from 'alchemy';
import { CustomDomain } from 'alchemy/Railway/CustomDomain';
import { providers as railwayProviders } from 'alchemy/Railway/Providers';
import { Effect } from 'effect';

import { DOMAIN, PORT, TriedGold } from './infra/railway.ts';
import Server from './src/deploy/Server.ts';

/** The stack's providers, shared with the deploy test's harness. */
export const providers = railwayProviders();

export default Alchemy.Stack(
  'triedgold',
  { providers, state: Alchemy.localState() },
  Effect.gen(function* () {
    const { stage } = yield* Alchemy.Stack;
    const project = yield* TriedGold;
    const service = yield* Server.pipe(
      Alchemy.AdoptPolicy.adopt(stage === 'prod'),
      Alchemy.RemovalPolicy.retain(stage === 'prod'),
    );

    if (stage !== 'prod') {
      return { url: service.url, serviceId: service.serviceId };
    }

    // Found by hostname on the service, so the existing domain is adopted.
    const domain = yield* CustomDomain('Domain', {
      service,
      environment: project,
      domain: DOMAIN,
      targetPort: PORT,
    }).pipe(Alchemy.RemovalPolicy.retain());

    return {
      url: `https://${DOMAIN}`,
      serviceId: service.serviceId,
      deploymentStatus: service.deploymentStatus,
      certificateStatus: domain.certificateStatus,
    };
  }),
);
