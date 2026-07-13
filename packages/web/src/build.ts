/**
 * Build The Sure Word static site into packages/web/dist/.
 *
 *   bun run src/build.ts
 *
 * Reads the curated handbook markdowns from packages/cli/outputs/studies (see
 * content.ts), renders them with Bun.markdown in the Sure Word design system,
 * and copies the original comparison pages verbatim. The emitted dist/ is a
 * fully static site served by src/server.ts.
 */

import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Effect, Layer } from 'effect';

import { Builder } from './builder.js';
import * as ReferenceLinks from './reference-links.js';

Builder.Service.use((builder) => builder.build()).pipe(
  Effect.flatMap((summary) => Effect.logInfo('done', summary)),
  Effect.provide(
    Builder.layer.pipe(Layer.provideMerge(ReferenceLinks.layer), Layer.provide(BunServices.layer)),
  ),
  BunRuntime.runMain,
);
