import { Context, Effect, Layer, Option, Ref } from 'effect';

export interface SettingsStorageShape {
  /** Returns `None` when no settings have been persisted yet (first launch). */
  readonly read: Effect.Effect<Option.Option<string>>;
  readonly write: (text: string) => Effect.Effect<void>;
}

/**
 * Persistence port for `ReaderSettings`. Split out so the storage backend can
 * be replaced with an in-memory layer in tests — particularly the debounce
 * test, which needs to count writes under `TestClock`.
 *
 * Production: calls through the preload `window.api.settings` bridge, which
 * writes to `app.getPath('userData')/settings.json` in the Electron main.
 */
export class SettingsStorage extends Context.Service<SettingsStorage, SettingsStorageShape>()(
  '@bible/desktop/services/SettingsStorage',
) {
  static layer = Layer.succeed(SettingsStorage, {
    read: Effect.promise(() => window.api.settings.read()).pipe(Effect.map(Option.fromNullishOr)),
    write: (text: string) => Effect.promise(() => window.api.settings.write(text)),
  });

  /**
   * In-memory storage layer for tests. The caller passes pre-made Refs so the
   * test can read them directly to assert write count / last value without
   * extending the public service shape.
   */
  static layerTest = (refs: {
    readonly current: Ref.Ref<Option.Option<string>>;
    readonly writes: Ref.Ref<number>;
  }) =>
    Layer.succeed(SettingsStorage, {
      read: Ref.get(refs.current),
      write: (text: string) =>
        Effect.gen(function* () {
          yield* Ref.set(refs.current, Option.some(text));
          yield* Ref.update(refs.writes, (n) => n + 1);
        }),
    });
}
