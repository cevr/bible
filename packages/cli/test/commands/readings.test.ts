import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';

import { readings } from '../../src/commands/readings.js';
import { getOutputsPath } from '../../src/lib/paths.js';
import { expectContains, expectSequence, runCli } from '../lib/run-cli.js';

describe('readings commands', () => {
  describe('sync command', () => {
    it.effect('should update existing Apple Note when apple_note_id present', () =>
      Effect.gen(function* () {
        const result = yield* runCli(readings, ['sync', '--files', '/path/to/chapter-1.md'], {
          files: {
            files: {
              '/path/to/chapter-1.md':
                '---\ncreated_at: "2024-01-01"\nchapter: 1\napple_note_id: "note-123"\n---\n\n# Study\n\nContent...',
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
        const result = yield* runCli(readings, ['sync', '--files', '/path/to/chapter-1.md'], {
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
      }),
    );
  });

  describe('list command', () => {
    it.effect('should list all readings', () =>
      Effect.gen(function* () {
        const result = yield* runCli(readings, ['list'], {
          files: {
            files: {
              [getOutputsPath('readings', 'chapter-1.md')]: 'content',
              [getOutputsPath('readings', 'chapter-2.md')]: 'content',
            },
            directories: [getOutputsPath('readings')],
          },
        });

        expect(result.success).toBe(true);
        expectSequence(result.calls, [{ _tag: 'FileSystem.readDirectory' }]);
      }),
    );

    it.effect('should handle empty readings directory', () =>
      Effect.gen(function* () {
        const result = yield* runCli(readings, ['list'], {
          files: {
            files: {},
            directories: [getOutputsPath('readings')],
          },
        });

        expect(result.success).toBe(true);
        expectSequence(result.calls, [{ _tag: 'FileSystem.readDirectory' }]);
      }),
    );

    it.effect('should output JSON when --json flag is used', () =>
      Effect.gen(function* () {
        const result = yield* runCli(readings, ['list', '--json'], {
          files: {
            files: {
              [getOutputsPath('readings', 'chapter-1.md')]: 'content',
            },
            directories: [getOutputsPath('readings')],
          },
        });

        expect(result.success).toBe(true);
        expectSequence(result.calls, [{ _tag: 'FileSystem.readDirectory' }]);
      }),
    );
  });
});
