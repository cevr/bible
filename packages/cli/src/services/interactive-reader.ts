import type { EGWLocation } from '@bible/core/egw';
import { Context, Effect, Layer, Schema } from 'effect';

import type { ReaderReference } from '../app/reader-reference.js';
import { trace, traceAsync } from '../instrumentation/trace.js';

/** The reader route requested by a CLI command. */
export type ReaderDestination =
  | { readonly _tag: 'bible'; readonly reference?: ReaderReference }
  | { readonly _tag: 'egw'; readonly location?: EGWLocation };

export class InteractiveReaderError extends Schema.TaggedErrorClass<InteractiveReaderError>()(
  'InteractiveReaderError',
  {
    cause: Schema.Unknown,
  },
) {}

export class InvalidReaderReference extends Schema.TaggedErrorClass<InvalidReaderReference>()(
  'InvalidReaderReference',
  {
    reader: Schema.Literals(['bible', 'egw']),
    input: Schema.String,
  },
) {}

export interface InteractiveReaderService {
  readonly open: (destination: ReaderDestination) => Effect.Effect<void, InteractiveReaderError>;
}

/**
 * Boundary between command routing and the interactive application.
 *
 * Commands describe a destination; the adapter owns expensive TUI and model
 * discovery imports so non-interactive commands keep their fast startup path.
 */
export class InteractiveReader extends Context.Service<
  InteractiveReader,
  InteractiveReaderService
>()('@bible/cli/services/interactive-reader/InteractiveReader') {
  static readonly layer = Layer.succeed(
    InteractiveReader,
    InteractiveReader.of({
      open: Effect.fn('InteractiveReader.open')((destination) =>
        Effect.tryPromise({
          try: async () => {
            trace('loading TUI dependencies');

            const [{ tui }, { detectSystemThemeAsync }, { discoverProviders }] = await Promise.all([
              traceAsync('import tui', () => import('../tui/app.js')),
              traceAsync('import themes', () => import('../tui/themes/index.js')),
              traceAsync('import AI providers', () => import('@bible/core/ai')),
            ]);

            trace('TUI dependencies loaded');
            await traceAsync('detectSystemTheme', detectSystemThemeAsync);

            const [provider] = await Effect.runPromise(discoverProviders());
            const model = provider === undefined ? null : { models: provider.models };
            await traceAsync('tui', () => {
              if (destination._tag === 'bible') {
                return tui(
                  destination.reference === undefined
                    ? { model }
                    : { initialRef: destination.reference, model },
                );
              }

              return tui({ initialEgw: destination.location ?? true, model });
            });
          },
          catch: (cause) => new InteractiveReaderError({ cause }),
        }),
      ),
    }),
  );
}
