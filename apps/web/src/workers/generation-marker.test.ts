import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';

import { makeGenerationMarkerStore } from './generation-marker.js';

describe('canonical generation marker', () => {
  it.effect('publishes exactly one active-generation record after the atomic write completes', () =>
    Effect.gen(function* () {
      const records = new Map<string, string>();
      const events: string[] = [];
      const marker = makeGenerationMarkerStore({
        read: (key) => Effect.runPromise(Effect.sync(() => records.get(key))),
        write: (key, value) =>
          Effect.runPromise(
            Effect.sync(() => {
              events.push(`begin:${key}`);
              records.set(key, value);
              events.push(`commit:${key}`);
            }),
          ),
      });

      yield* Effect.tryPromise(() => marker.write('user-state-v1-0123456789ab'));

      expect(yield* Effect.tryPromise(() => marker.read())).toBe('user-state-v1-0123456789ab');
      expect(records).toEqual(new Map([['active-generation', 'user-state-v1-0123456789ab']]));
      expect(events).toEqual(['begin:active-generation', 'commit:active-generation']);
    }),
  );
});
