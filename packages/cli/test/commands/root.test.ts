import { describe, expect, it } from 'bun:test';
import { Reference } from '@bible/core/bible';

import { rootCommand } from '../../src/commands/root.js';
import { runCli } from '../lib/run-cli.js';

describe('root command graph', () => {
  it('opens the Bible reader by default', async () => {
    const result = await runCli(rootCommand, []);

    expect(result.success).toBe(true);
    expect(result.calls).toContainEqual({
      _tag: 'InteractiveReader.open',
      destination: { _tag: 'bible' },
    });
  });

  it('routes a Bible reference through the open subcommand', async () => {
    const result = await runCli(rootCommand, ['open', 'john', '3:16']);

    expect(result.success).toBe(true);
    expect(result.calls).toContainEqual({
      _tag: 'InteractiveReader.open',
      destination: {
        _tag: 'bible',
        reference: Reference.verse(43, 3, 16),
      },
    });
  });

  it('routes EGW open through the same graph', async () => {
    const result = await runCli(rootCommand, ['egw', 'open', 'DA', '1']);

    expect(result.success).toBe(true);
    expect(result.calls).toContainEqual({
      _tag: 'InteractiveReader.open',
      destination: {
        _tag: 'egw',
        location: { _tag: 'page', bookCode: 'DA', page: 1 },
      },
    });
  });

  it('rejects search text as an interactive Bible location', async () => {
    const result = await runCli(rootCommand, ['open', 'faith', 'without', 'works']);

    expect(result.success).toBe(false);
    expect(result.calls).not.toContainEqual({
      _tag: 'InteractiveReader.open',
      destination: { _tag: 'bible' },
    });
  });
});
