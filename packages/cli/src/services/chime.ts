import { $ } from 'bun';
import { Effect, Layer, ServiceMap } from 'effect';
import type { Cause } from 'effect';
import { join } from 'path';

import { getCliRoot } from '~/src/lib/paths';

/**
 * Service for playing audio chimes/notifications.
 */
export interface ChimeService {
  /**
   * Play the done/notification chime.
   */
  readonly play: Effect.Effect<void, Cause.UnknownError>;
}

export class Chime extends ServiceMap.Service<Chime, ChimeService>()('@bible/cli/services/chime') {}

/**
 * Live implementation using Bun shell to call afplay.
 */
export const ChimeLive = Layer.succeed(Chime, {
  play: Effect.gen(function* () {
    const assetPath = join(getCliRoot(), 'assets', 'notification.mp3');

    yield* Effect.tryPromise(async () => await $`afplay ${assetPath} -v 0.15`);
  }),
});
