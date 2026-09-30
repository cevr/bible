/**
 * Tried Gold on Railway, declared as an Alchemy stack.
 *
 * - `prod` adopts and retains what `cevr/tried-gold` deployed: the `tried-gold`
 *   project, its `tried-gold` service, and the `triedgold.com` custom domain.
 *   The service's source moves from a GitHub/Nixpacks build to this app's
 *   bundle. Deploying prod is the owner's call (`bun run deploy`).
 * - `prod` also owns the hostnames (`infra/domains.ts`): the apex and `www`
 *   as Railway custom domains, in the Cloudflare zone it adopts and retains,
 *   with the DNS-only CNAME records Railway asks for.
 * - Every other stage (`test_$USER`, `agent-*`) is a throwaway: its own
 *   project and a generated `*.up.railway.app` URL, created and destroyed
 *   whole. It declares no zone, domain or DNS record.
 *
 * Run it from this directory after `react-router build` (the package scripts
 * do both): the service ships `build/client` and bundles `build/server`.
 */
import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { providers as railwayProviders } from 'alchemy/Railway/Providers';
import { Effect, Layer } from 'effect';

import { Domains } from './infra/domains.ts';
import { TriedGold } from './infra/railway.ts';
import Server from './src/deploy/Server.ts';

/** The stack's providers, shared with the deploy test's harness. */
export const providers = Cloudflare.providers().pipe(Layer.provideMerge(railwayProviders()));

export default Alchemy.Stack(
  'triedgold',
  { providers, state: Alchemy.localState() },
  Effect.gen(function* () {
    const { stage } = yield* Alchemy.Stack;
    yield* TriedGold;
    const service = yield* Server.pipe(
      Alchemy.AdoptPolicy.adopt(stage === 'prod'),
      Alchemy.RemovalPolicy.retain(stage === 'prod'),
    );

    if (stage !== 'prod') {
      return { url: service.url, serviceId: service.serviceId };
    }

    const { apex, www } = yield* Domains(service);

    return {
      url: apex.url,
      serviceId: service.serviceId,
      deploymentStatus: service.deploymentStatus,
      certificateStatus: { apex: apex.certificateStatus, www: www.certificateStatus },
    };
  }),
);
