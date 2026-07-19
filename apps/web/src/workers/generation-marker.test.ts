import { describe, expect, test } from 'bun:test';

import { makeGenerationMarkerStore } from './generation-marker.js';

describe('canonical generation marker', () => {
  test('publishes exactly one active-generation record after the atomic write completes', async () => {
    const records = new Map<string, string>();
    const events: string[] = [];
    const marker = makeGenerationMarkerStore({
      read: async (key) => records.get(key),
      write: async (key, value) => {
        events.push(`begin:${key}`);
        records.set(key, value);
        events.push(`commit:${key}`);
      },
    });

    await marker.write('user-state-v1-0123456789ab');

    expect(await marker.read()).toBe('user-state-v1-0123456789ab');
    expect(records).toEqual(new Map([['active-generation', 'user-state-v1-0123456789ab']]));
    expect(events).toEqual(['begin:active-generation', 'commit:active-generation']);
  });
});
