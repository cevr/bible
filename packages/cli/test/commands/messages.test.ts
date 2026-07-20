import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';

import { messages } from '../../src/commands/messages.js';
import { getOutputsPath } from '../../src/lib/paths.js';
import { expectContains, expectSequence, runCli } from '../lib/run-cli.js';

describe('messages commands', () => {
  describe('sync command', () => {
    it.effect('should update existing Apple Note when apple_note_id present', () =>
      Effect.gen(function* () {
        const result = yield* runCli(messages, ['sync', '--files', '/path/to/message.md'], {
          files: {
            files: {
              '/path/to/message.md':
                '---\ncreated_at: "2024-01-01"\ntopic: Test\napple_note_id: "note-123"\n---\n\n# Message\n\nContent...',
            },
          },
        });

        expect(result.success).toBe(true);
        expectContains(result.calls, [
          { _tag: 'FileSystem.readFile' },
          { _tag: 'AppleScript.exec' },
        ]);
      }),
    );

    it.effect('should create new Apple Note and write ID back when no apple_note_id', () =>
      Effect.gen(function* () {
        const result = yield* runCli(messages, ['sync', '--files', '/path/to/message.md'], {
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
      }),
    );
  });

  describe('list command', () => {
    it.effect('should list all messages', () =>
      Effect.gen(function* () {
        const result = yield* runCli(messages, ['list'], {
          files: {
            files: {
              [getOutputsPath('messages', '2024-01-01-faith.md')]: 'content',
              [getOutputsPath('messages', '2024-01-02-hope.md')]: 'content',
              [getOutputsPath('messages', '2024-01-03-love.md')]: 'content',
            },
            directories: [getOutputsPath('messages')],
          },
        });

        expect(result.success).toBe(true);
        expectSequence(result.calls, [{ _tag: 'FileSystem.readDirectory' }]);
      }),
    );

    it.effect('should handle empty messages directory', () =>
      Effect.gen(function* () {
        const result = yield* runCli(messages, ['list'], {
          files: {
            files: {},
            directories: [getOutputsPath('messages')],
          },
        });

        expect(result.success).toBe(true);
        expectSequence(result.calls, [{ _tag: 'FileSystem.readDirectory' }]);
      }),
    );

    it.effect('should output JSON when --json flag is used', () =>
      Effect.gen(function* () {
        const result = yield* runCli(messages, ['list', '--json'], {
          files: {
            files: {
              [getOutputsPath('messages', '2024-01-01-faith.md')]: 'content',
            },
            directories: [getOutputsPath('messages')],
          },
        });

        expect(result.success).toBe(true);
        expectSequence(result.calls, [{ _tag: 'FileSystem.readDirectory' }]);
      }),
    );
  });
});
