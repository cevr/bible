import type * as PlatformError from 'effect/PlatformError';
import { Effect, Layer, Path, Context } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

import { getCliRoot } from '~/src/lib/paths';

/**
 * Service for playing audio chimes/notifications.
 */
export interface ChimeService {
  /**
   * Play the done/notification chime.
   */
  readonly play: Effect.Effect<void, PlatformError.PlatformError>;
}

export class Chime extends Context.Service<Chime, ChimeService>()('@bible/cli/services/chime') {}

/**
 * Live implementation using the Effect child-process service.
 */
export const ChimeLive = Layer.effect(
  Chime,
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const assetPath = path.join(getCliRoot(), 'assets', 'notification.mp3');
    const play = spawner
      .exitCode(ChildProcess.make('afplay', [assetPath, '-v', '0.15']))
      .pipe(Effect.asVoid);
    return Chime.of({ play });
  }),
);
