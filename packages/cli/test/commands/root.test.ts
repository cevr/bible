import { describe, expect, it } from 'bun:test';

import { rootCommand } from '../../src/commands/root.js';
import { runCli } from '../lib/run-cli.js';

describe('root command graph', () => {
  it('renders help instead of opening an interactive application', async () => {
    const result = await runCli(rootCommand, []);

    expect(result.success).toBe(true);
  });

  it('supports explicit help', async () => {
    const result = await runCli(rootCommand, ['--help']);

    expect(result.success).toBe(true);
  });
});
