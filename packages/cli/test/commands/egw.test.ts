import { describe, expect, it } from 'bun:test';

import { egwOpen, egwWithSubcommands } from '../../src/commands/egw.js';
import { runCli } from '../lib/run-cli.js';

describe('egw commands', () => {
  describe('egw command', () => {
    it('should show help when no query provided', async () => {
      const result = await runCli(egwWithSubcommands, []);

      expect(result.success).toBe(true);
    });

    it('should parse single paragraph reference', async () => {
      const result = await runCli(egwWithSubcommands, ['PP', '351.1']);

      expect(result.success).toBe(true);
    });

    it('should parse paragraph range reference', async () => {
      const result = await runCli(egwWithSubcommands, ['PP', '351.1-5']);

      expect(result.success).toBe(true);
    });

    it('should parse page reference', async () => {
      const result = await runCli(egwWithSubcommands, ['PP', '351']);

      expect(result.success).toBe(true);
    });

    it('should parse page range reference', async () => {
      const result = await runCli(egwWithSubcommands, ['PP', '351-355']);

      expect(result.success).toBe(true);
    });

    it('should parse book reference', async () => {
      const result = await runCli(egwWithSubcommands, ['PP']);

      expect(result.success).toBe(true);
    });

    it('should handle numbered book codes', async () => {
      const result = await runCli(egwWithSubcommands, ['1BC', '1111.2']);

      expect(result.success).toBe(true);
    });

    it('should handle search queries', async () => {
      const result = await runCli(egwWithSubcommands, ['great', 'controversy']);

      expect(result.success).toBe(true);
    });

    it('should handle quoted reference', async () => {
      const result = await runCli(egwWithSubcommands, ['PP 351.1']);

      expect(result.success).toBe(true);
    });
  });

  describe('egw open command', () => {
    it('should open the EGW reader when no query is provided', async () => {
      const result = await runCli(egwOpen, []);

      expect(result.success).toBe(true);
      expect(result.calls).toContainEqual({
        _tag: 'InteractiveReader.open',
        destination: { _tag: 'egw' },
      });
    });

    it('should accept reference for TUI launch', async () => {
      const result = await runCli(egwOpen, ['PP', '351.1']);

      expect(result.success).toBe(true);
      expect(result.calls).toContainEqual({
        _tag: 'InteractiveReader.open',
        destination: {
          _tag: 'egw',
          location: { _tag: 'paragraph', bookCode: 'PP', page: 351, paragraph: 1 },
        },
      });
    });
  });

  describe('egwWithSubcommands', () => {
    it('should show help when no args', async () => {
      const result = await runCli(egwWithSubcommands, []);

      expect(result.success).toBe(true);
    });

    it('should handle lookup at top level', async () => {
      const result = await runCli(egwWithSubcommands, ['PP', '351.1']);

      expect(result.success).toBe(true);
    });

    it('should handle search at top level', async () => {
      const result = await runCli(egwWithSubcommands, ['faith', 'and', 'works']);

      expect(result.success).toBe(true);
    });

    it('should route to open subcommand', async () => {
      const result = await runCli(egwWithSubcommands, ['open', 'PP', '351.1']);

      expect(result.success).toBe(true);
      expect(result.calls).toContainEqual({
        _tag: 'InteractiveReader.open',
        destination: {
          _tag: 'egw',
          location: { _tag: 'paragraph', bookCode: 'PP', page: 351, paragraph: 1 },
        },
      });
    });
  });
});
