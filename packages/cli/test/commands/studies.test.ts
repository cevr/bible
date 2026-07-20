import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';

import { studies } from '../../src/commands/studies.js';
import { getOutputsPath } from '../../src/lib/paths.js';
import { expectContains, expectSequence, runCli } from '../lib/run-cli.js';

describe('studies commands', () => {
  describe('sync command', () => {
    it.effect('should update existing Apple Note when apple_note_id present', () =>
      Effect.gen(function* () {
        const result = yield* runCli(studies, ['sync', '--files', '/path/to/study.md'], {
          files: {
            files: {
              '/path/to/study.md':
                '---\ncreated_at: "2024-01-01"\ntopic: Test\napple_note_id: "note-123"\n---\n\n# Study\n\nContent...',
            },
          },
        });

        expect(result.success).toBe(true);
        expectSequence(result.calls, [
          { _tag: 'FileSystem.readFile' },
          { _tag: 'AppleScript.exec' },
        ]);
      }),
    );

    it.effect('should create new Apple Note and write ID back when no apple_note_id', () =>
      Effect.gen(function* () {
        const result = yield* runCli(studies, ['sync', '--files', '/path/to/study.md'], {
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
      }),
    );
  });

  describe('list command', () => {
    it.effect('should list all studies', () =>
      Effect.gen(function* () {
        const result = yield* runCli(studies, ['list'], {
          files: {
            files: {
              [getOutputsPath('studies', '2024-01-01-sanctuary.md')]: 'content',
              [getOutputsPath('studies', '2024-01-02-prophecy.md')]: 'content',
            },
            directories: [getOutputsPath('studies')],
          },
        });

        expect(result.success).toBe(true);
        expectSequence(result.calls, [{ _tag: 'FileSystem.readDirectory' }]);
      }),
    );

    it.effect('should handle empty studies directory', () =>
      Effect.gen(function* () {
        const result = yield* runCli(studies, ['list'], {
          files: {
            files: {},
            directories: [getOutputsPath('studies')],
          },
        });

        expect(result.success).toBe(true);
        expectSequence(result.calls, [{ _tag: 'FileSystem.readDirectory' }]);
      }),
    );

    it.effect('should output JSON when --json flag is used', () =>
      Effect.gen(function* () {
        const result = yield* runCli(studies, ['list', '--json'], {
          files: {
            files: {
              [getOutputsPath('studies', '2024-01-01-study.md')]: 'content',
            },
            directories: [getOutputsPath('studies')],
          },
        });

        expect(result.success).toBe(true);
        expectSequence(result.calls, [{ _tag: 'FileSystem.readDirectory' }]);
      }),
    );
  });
});
