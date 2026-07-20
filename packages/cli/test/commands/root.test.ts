import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';

import { rootCommand } from '../../src/commands/root.js';
import { runCli } from '../lib/run-cli.js';

describe('root command graph', () => {
  it.effect('renders help instead of opening an interactive application', () =>
    Effect.gen(function* () {
      const result = yield* runCli(rootCommand, []);

      expect(result.success).toBe(true);
    }),
  );

  it.effect('supports explicit help', () =>
    Effect.gen(function* () {
      const result = yield* runCli(rootCommand, ['--help']);

      expect(result.success).toBe(true);
    }),
  );
});
