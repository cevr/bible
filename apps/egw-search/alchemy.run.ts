/**
 * EGW Search on Railway, declared as an Alchemy stack.
 *
 * It adopts what `railway up` used to deploy by hand: the `bible-studies`
 * project, the `egw-search` service, and the `egw.cvr.im` custom domain. It
 * also owns the new `egw-celld` bucket. `alchemy.bucket.ts` is the same stack
 * with only the project and the bucket, for a first deploy that touches
 * nothing else. See `./infra/railway.ts` for the adoption and retention rules
 * and for why the `/data` volume stays undeclared.
 *
 * The build keeps the Railpack build's shape: the Docker context is the repo
 * root, and `turbo prune @bible/egw-search` runs inside the image
 * (`./infra/Dockerfile`).
 */
import * as Alchemy from 'alchemy';
import { providers } from 'alchemy/Railway/Providers';
import { CustomDomain } from 'alchemy/Railway/CustomDomain';
import { Service } from 'alchemy/Railway/Service';
import * as Config from 'effect/Config';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import { fileURLToPath } from 'node:url';

import { BibleStudies, EgwCelld, PORT, bucketOutputs } from './infra/railway.ts';

/** The monorepo root: Railway builds from here, as `railway up` did. */
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/**
 * An EGW API credential, synced only when the deploy's environment supplies
 * it. When it is absent, the value already on Railway stays as it is. Alchemy
 * drops `undefined` env entries before it upserts anything
 * (`alchemy/src/Railway/hosted.ts:269-277`), and it never deletes a variable
 * it was not given (`ServiceProvider.ts:802-826`).
 */
const optionalSecret = (name: string) =>
  Config.option(Config.Redacted(name)).pipe(Effect.map(Option.getOrUndefined));

export default Alchemy.Stack(
  'egw-search',
  { providers: providers(), state: Alchemy.localState() },
  Effect.gen(function* () {
    const project = yield* BibleStudies;
    const bucket = yield* EgwCelld;
    const egwClientId = yield* optionalSecret('EGW_CLIENT_ID');
    const egwClientSecret = yield* optionalSecret('EGW_CLIENT_SECRET');

    // Found by `name` in the project (`ServiceProvider.ts:941-1010`). Only a
    // different project or environment id replaces a service
    // (`ServiceProvider.ts:907-916`), and both come from the adopted project.
    const service = yield* Service('EgwSearch', {
      project,
      name: 'egw-search',
      context: REPO_ROOT,
      dockerfilePath: 'apps/egw-search/infra/Dockerfile',
      port: PORT,
      // The service is reached through egw.cvr.im only. `false` stops Alchemy
      // from adding a generated `*.up.railway.app` domain, and it removes a
      // domain only when state recorded one (`ServiceDomain.ts:135-142`).
      publicDomain: false,
      // Today's start command. The image keeps Railpack's `/app/out` layout,
      // so it is unchanged.
      startCommand: 'cd out && bun apps/egw-search/server/main.ts',
      healthcheck: '/health',
      healthcheckTimeout: 300,
      restartPolicyType: 'ON_FAILURE',
      restartPolicyMaxRetries: 10,
      env: {
        BIBLE_CORPUS_DIR: '/data',
        BIBLE_MODEL_CACHE: '/data/models',
        EGW_TOKEN_FILE: '/data/tokens.json',
        EGW_CLIENT_ID: egwClientId,
        EGW_CLIENT_SECRET: egwClientSecret,
      },
    }).pipe(Alchemy.AdoptPolicy.adopt(true), Alchemy.RemovalPolicy.retain());

    // Found by hostname on the service (`CustomDomain.ts:294-335`). Reconcile
    // looks the hostname up again before it would create one
    // (`CustomDomain.ts:472-500`).
    const domain = yield* CustomDomain('EgwDomain', {
      service,
      environment: project,
      domain: 'egw.cvr.im',
      targetPort: PORT,
    }).pipe(Alchemy.RemovalPolicy.retain());

    return {
      url: 'https://egw.cvr.im',
      serviceId: service.serviceId,
      deploymentStatus: service.deploymentStatus,
      certificateStatus: domain.certificateStatus,
      bucket: bucketOutputs(bucket),
    };
  }),
);
