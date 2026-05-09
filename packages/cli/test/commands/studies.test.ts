import { beforeEach, it } from 'bun:test';
import { describe, expect } from 'effect-bun-test';

import { studies } from '../../src/commands/studies.js';
import { expectContains, expectSequence, runCli } from '../lib/run-cli.js';

describe('studies commands', () => {
  beforeEach(() => {
    // Reset test state
  });

  describe('sync command', () => {
    it('should update existing Apple Note when apple_note_id present', async () => {
      const result = await runCli(studies, ['sync', '--files', '/path/to/study.md'], {
        files: {
          files: {
            '/path/to/study.md':
              '---\ncreated_at: "2024-01-01"\ntopic: Test\napple_note_id: "note-123"\n---\n\n# Study\n\nContent...',
          },
        },
      });

      expect(result.success).toBe(true);
      expectSequence(result.calls, [{ _tag: 'FileSystem.readFile' }, { _tag: 'AppleScript.exec' }]);
    });

    it('should create new Apple Note and write ID back when no apple_note_id', async () => {
      const result = await runCli(studies, ['sync', '--files', '/path/to/study.md'], {
        files: {
          files: {
            '/path/to/study.md':
              '---\ncreated_at: "2024-01-01"\ntopic: Test\n---\n\n# Study\n\nContent...',
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
    it('should list all studies', async () => {
      const result = await runCli(studies, ['list'], {
        files: {
          files: {
            [`${process.cwd()}/outputs/studies/2024-01-01-sanctuary.md`]: 'content',
            [`${process.cwd()}/outputs/studies/2024-01-02-prophecy.md`]: 'content',
          },
          directories: [`${process.cwd()}/outputs/studies`],
        },
      });

      expect(result.success).toBe(true);
      expectSequence(result.calls, [{ _tag: 'FileSystem.readDirectory' }]);
    });

    it('should handle empty studies directory', async () => {
      const result = await runCli(studies, ['list'], {
        files: {
          files: {},
          directories: [`${process.cwd()}/outputs/studies`],
        },
      });

      expect(result.success).toBe(true);
      expectSequence(result.calls, [{ _tag: 'FileSystem.readDirectory' }]);
    });

    it('should output JSON when --json flag is used', async () => {
      const result = await runCli(studies, ['list', '--json'], {
        files: {
          files: {
            [`${process.cwd()}/outputs/studies/2024-01-01-study.md`]: 'content',
          },
          directories: [`${process.cwd()}/outputs/studies`],
        },
      });

      expect(result.success).toBe(true);
      expectSequence(result.calls, [{ _tag: 'FileSystem.readDirectory' }]);
    });
  });
});
