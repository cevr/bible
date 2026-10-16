import { describe, expect, test } from 'bun:test';
import { Effect, Exit, Option } from 'effect';

import { type CorpusSyncPayload, corpusSyncInput } from './Sync.ts';

const read = (payload: CorpusSyncPayload) =>
  Effect.runSync(Effect.exit(corpusSyncInput(Option.some(payload))));

describe("the sync's input", () => {
  test('a scheduled instance, with no payload, asks nothing', () => {
    expect(Effect.runSync(Effect.exit(corpusSyncInput(Option.none())))).toEqual(Exit.succeed({}));
  });

  test('a request to plan reads the same as an object or as its JSON', () => {
    expect(read({ mode: 'plan' })).toEqual(Exit.succeed({ mode: 'plan' }));
    expect(read('{"mode":"plan"}')).toEqual(Exit.succeed({ mode: 'plan' }));
  });

  test('a payload that reads as neither fails rather than syncing', () => {
    expect(Exit.isFailure(read('{"mode":"plna"}'))).toBe(true);
    expect(Exit.isFailure(read('mode=plan'))).toBe(true);
  });
});
