import { beforeEach, it } from 'bun:test';
import { describe, expect } from 'effect-bun-test';

import { readings } from '../../src/commands/readings.js';
import { expectContains, expectSequence, runCli } from '../lib/run-cli.js';

describe('readings commands', () => {
  beforeEach(() => {
    // Reset test state
  });

  describe('sync command', () => {
    it('should update existing Apple Note when apple_note_id present', async () => {
      const result = await runCli(readings, ['sync', '--files', '/path/to/chapter-1.md'], {
        files: {
          files: {
            '/path/to/chapter-1.md':
              '---\ncreated_at: "2024-01-01"\nchapter: 1\napple_note_id: "note-123"\n---\n\n# Study\n\nContent...',
          },
        },
      });

      expect(result.success).toBe(true);
      expectContains(result.calls, [{ _tag: 'FileSystem.readFile' }, { _tag: 'AppleScript.exec' }]);
    });

    it('should create new Apple Note and write ID back when no apple_note_id', async () => {
      const result = await runCli(readings, ['sync', '--files', '/path/to/chapter-1.md'], {
        files: {
          files: {
            '/path/to/chapter-1.md':
              '---\ncreated_at: "2024-01-01"\nchapter: 1\n---\n\n# Study\n\nContent...',
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

  describe('list command', () => {
    it('should list all readings', async () => {
      const result = await runCli(readings, ['list'], {
        files: {
          files: {
            [`${process.cwd()}/outputs/readings/chapter-1.md`]: 'content',
            [`${process.cwd()}/outputs/readings/chapter-2.md`]: 'content',
          },
          directories: [`${process.cwd()}/outputs/readings`],
        },
      });

      expect(result.success).toBe(true);
      expectSequence(result.calls, [{ _tag: 'FileSystem.readDirectory' }]);
    });

    it('should handle empty readings directory', async () => {
      const result = await runCli(readings, ['list'], {
        files: {
          files: {},
          directories: [`${process.cwd()}/outputs/readings`],
        },
      });

      expect(result.success).toBe(true);
      expectSequence(result.calls, [{ _tag: 'FileSystem.readDirectory' }]);
    });

    it('should output JSON when --json flag is used', async () => {
      const result = await runCli(readings, ['list', '--json'], {
        files: {
          files: {
            [`${process.cwd()}/outputs/readings/chapter-1.md`]: 'content',
          },
          directories: [`${process.cwd()}/outputs/readings`],
        },
      });

      expect(result.success).toBe(true);
      expectSequence(result.calls, [{ _tag: 'FileSystem.readDirectory' }]);
    });
  });
});
