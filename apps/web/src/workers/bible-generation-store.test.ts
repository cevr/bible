import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';

import { makeBibleGenerationStore } from './bible-generation-store.js';
import type { GenerationRegistry, GenerationRegistryStore } from './generation-marker.js';
import type { SqliteDatabase, SqliteDatabaseFamily } from './sqlite-database.js';

const database: SqliteDatabase = {
  isOpen: true,
  open: () => Effect.runPromise(Effect.void),
  close: () => Effect.runPromise(Effect.void),
  query: () => Effect.runPromise(Effect.succeed([])),
  values: () => Effect.runPromise(Effect.succeed([])),
  write: () => Effect.runPromise(Effect.succeed(0)),
  exec: () => Effect.runPromise(Effect.void),
};

const harness = (initial: GenerationRegistry) => {
  const events: string[] = [];
  let state = initial;
  let activeFilename: string | undefined;
  let failNextWrite = false;
  const databases: SqliteDatabaseFamily = {
    active: database,
    candidate: () => database,
    activate: (filename) =>
      Effect.runPromise(
        Effect.sync(() => {
          events.push(`activate:${filename}`);
          activeFilename = filename;
        }),
      ),
    deactivate: () =>
      Effect.runPromise(
        Effect.sync(() => {
          events.push('deactivate');
          activeFilename = undefined;
        }),
      ),
    get activeFilename() {
      return activeFilename;
    },
  };
  const registry: GenerationRegistryStore = {
    read: () => Effect.runPromise(Effect.succeed(state)),
    write: (next) =>
      Effect.runPromise(
        Effect.gen(function* () {
          if (failNextWrite) {
            failNextWrite = false;
            return yield* Effect.fail(new Error('registry write failed'));
          }
          events.push(`registry:${next.active ?? 'none'}:${next.managed.join(',')}`);
          state = next;
        }),
      ),
  };
  const store = makeBibleGenerationStore({
    databases,
    registry,
    discard: (filename) =>
      Effect.runPromise(
        Effect.sync(() => {
          events.push(`discard:${filename}`);
        }),
      ),
  });
  return {
    events,
    store,
    state: () => state,
    failRegistryWrite: () => {
      failNextWrite = true;
    },
  };
};

describe('browser Bible generation store', () => {
  it.effect('reconciles every registered inactive generation on startup', () =>
    Effect.gen(function* () {
      const active = 'bible-db-v2-e72244f576be.db';
      const interrupted = 'bible-db-v3-aaaaaaaaaaaa.db';
      const stale = 'bible-db-v1-111111111111.db';
      const fixture = harness({ active, managed: [stale, active, interrupted] });

      expect(yield* Effect.tryPromise(() => fixture.store.openActive())).toBe(true);
      expect(fixture.events).toContain(`activate:${active}`);
      expect(fixture.events).toContain(`discard:${stale}`);
      expect(fixture.events).toContain(`discard:${interrupted}`);
      expect(fixture.state()).toEqual({ active, managed: [active] });
    }),
  );

  it.effect('rolls the reader back when durable activation cannot commit', () =>
    Effect.gen(function* () {
      const previous = 'bible-db-v1-111111111111.db';
      const candidate = 'bible-db-v2-e72244f576be.db';
      const fixture = harness({ active: previous, managed: [previous] });
      yield* Effect.tryPromise(() => fixture.store.openActive());
      yield* Effect.tryPromise(() => fixture.store.reserve(candidate));
      fixture.failRegistryWrite();

      const failure = yield* Effect.flip(
        Effect.tryPromise(() => fixture.store.activateVerified(candidate)),
      );

      expect(failure).toBeInstanceOf(Error);
      expect(fixture.events.slice(-3)).toEqual([
        `activate:${previous}`,
        `discard:${candidate}`,
        `registry:${previous}:${previous}`,
      ]);
      expect(fixture.state()).toEqual({ active: previous, managed: [previous] });
    }),
  );

  it.effect('records a candidate before acquisition so a restarted store can retire it', () =>
    Effect.gen(function* () {
      const active = 'bible-db-v1-111111111111.db';
      const candidate = 'bible-db-v2-e72244f576be.db';
      const fixture = harness({ active, managed: [active] });

      yield* Effect.tryPromise(() => fixture.store.reserve(candidate));
      expect(fixture.state().managed).toContain(candidate);
      expect(yield* Effect.tryPromise(() => fixture.store.openActive())).toBe(true);
      expect(fixture.events).toContain(`discard:${candidate}`);
      expect(fixture.state()).toEqual({ active, managed: [active] });
    }),
  );

  it.effect('allocates an inactive slot when refresh requests the active identity', () =>
    Effect.gen(function* () {
      const active = 'bible-db-v2-e72244f576be.db';
      const fixture = harness({ active, managed: [active] });

      const reserved = yield* Effect.tryPromise(() => fixture.store.reserve(active));

      expect(reserved.filename).toBe('bible-db-v2-e72244f576be-next.db');
      expect(reserved.filename).not.toBe(active);
      expect(fixture.state()).toEqual({ active, managed: [active, reserved.filename] });
    }),
  );
});
