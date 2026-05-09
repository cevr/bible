import { beforeEach, it } from 'bun:test';
import { describe, expect } from 'effect-bun-test';

import { messages } from '../../src/commands/messages.js';
import { expectContains, expectSequence, runCli } from '../lib/run-cli.js';

describe('messages commands', () => {
  beforeEach(() => {
    // Reset test state
  });

  describe('sync command', () => {
    it('should update existing Apple Note when apple_note_id present', async () => {
      const result = await runCli(messages, ['sync', '--files', '/path/to/message.md'], {
        files: {
          files: {
            '/path/to/message.md':
              '---\ncreated_at: "2024-01-01"\ntopic: Test\napple_note_id: "note-123"\n---\n\n# Message\n\nContent...',
          },
        },
      });

      expect(result.success).toBe(true);
      expectContains(result.calls, [{ _tag: 'FileSystem.readFile' }, { _tag: 'AppleScript.exec' }]);
    });

    it('should create new Apple Note and write ID back when no apple_note_id', async () => {
      const result = await runCli(messages, ['sync', '--files', '/path/to/message.md'], {
        files: {
          files: {
            '/path/to/message.md':
              '---\ncreated_at: "2024-01-01"\ntopic: Test\n---\n\n# Message\n\nContent...',
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
    it('should list all messages', async () => {
      const result = await runCli(messages, ['list'], {
        files: {
          files: {
            [`${process.cwd()}/outputs/messages/2024-01-01-faith.md`]: 'content',
            [`${process.cwd()}/outputs/messages/2024-01-02-hope.md`]: 'content',
            [`${process.cwd()}/outputs/messages/2024-01-03-love.md`]: 'content',
          },
          directories: [`${process.cwd()}/outputs/messages`],
        },
      });

      expect(result.success).toBe(true);
      expectSequence(result.calls, [{ _tag: 'FileSystem.readDirectory' }]);
    });

    it('should handle empty messages directory', async () => {
      const result = await runCli(messages, ['list'], {
        files: {
          files: {},
          directories: [`${process.cwd()}/outputs/messages`],
        },
      });

      expect(result.success).toBe(true);
      expectSequence(result.calls, [{ _tag: 'FileSystem.readDirectory' }]);
    });

    it('should output JSON when --json flag is used', async () => {
      const result = await runCli(messages, ['list', '--json'], {
        files: {
          files: {
            [`${process.cwd()}/outputs/messages/2024-01-01-faith.md`]: 'content',
          },
          directories: [`${process.cwd()}/outputs/messages`],
        },
      });

      expect(result.success).toBe(true);
      expectSequence(result.calls, [{ _tag: 'FileSystem.readDirectory' }]);
    });
  });
});
