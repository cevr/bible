import { beforeEach, it } from 'bun:test';
import { describe, expect } from 'effect-bun-test';

import { sabbathSchool } from '../../src/commands/sabbath-school.js';
import { expectContains, expectNoCalls, runCli } from '../lib/run-cli.js';

describe('sabbath-school commands', () => {
  beforeEach(() => {
    // Reset test state
  });

  describe('sync command', () => {
    it('should update existing Apple Note when apple_note_id present', async () => {
      const result = await runCli(sabbathSchool, ['sync', '--files', '/path/to/2024-Q1-W1.md'], {
        files: {
          files: {
            '/path/to/2024-Q1-W1.md':
              '---\ncreated_at: "2024-01-01"\nyear: 2024\nquarter: 1\nweek: 1\napple_note_id: "note-123"\n---\n\n# Outline\n\nContent...',
          },
        },
      });

      expect(result.success).toBe(true);
      expectContains(result.calls, [{ _tag: 'FileSystem.readFile' }, { _tag: 'AppleScript.exec' }]);
    });

    it('should create new Apple Note and write ID back when no apple_note_id', async () => {
      const result = await runCli(sabbathSchool, ['sync', '--files', '/path/to/2024-Q1-W1.md'], {
        files: {
          files: {
            '/path/to/2024-Q1-W1.md':
              '---\ncreated_at: "2024-01-01"\nyear: 2024\nquarter: 1\nweek: 1\n---\n\n# Outline\n\nContent...',
          },
        },
      });

      expect(result.success).toBe(true);
      expectContains(result.calls, [
        { _tag: 'FileSystem.readFile' },
        { _tag: 'AppleScript.exec' },
        { _tag: 'FileSystem.writeFile' },
      ]);
    });
  });

  describe('export command', () => {
    it('should export outline to Apple Notes', async () => {
      const result = await runCli(
        sabbathSchool,
        ['export', '--year', '2024', '--quarter', '1', '--week', '1'],
        {
          files: {
            files: {
              [`${process.cwd()}/outputs/sabbath-school/2024-Q1-W1.md`]:
                '# Outline to Export\n\nContent to export...',
            },
            directories: [`${process.cwd()}/outputs/sabbath-school`],
          },
        },
      );

      expect(result.success).toBe(true);
      expectContains(result.calls, [
        { _tag: 'FileSystem.exists' },
        { _tag: 'FileSystem.readFile' },
        { _tag: 'AppleScript.exec' },
      ]);
    });

    it('should handle missing file for export', async () => {
      const result = await runCli(
        sabbathSchool,
        ['export', '--year', '2024', '--quarter', '1', '--week', '1'],
        {
          files: {
            files: {},
            directories: [],
          },
        },
      );

      expect(result.success).toBe(true);
      expectNoCalls(result.calls, 'AppleScript.exec');
    });
  });
});
