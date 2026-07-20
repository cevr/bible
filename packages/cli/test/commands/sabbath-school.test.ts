import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';

import { sabbathSchool } from '../../src/commands/sabbath-school.js';
import { getOutputsPath } from '../../src/lib/paths.js';
import { expectContains, expectNoCalls, runCli } from '../lib/run-cli.js';

describe('sabbath-school commands', () => {
  describe('sync command', () => {
    it.effect('should update existing Apple Note when apple_note_id present', () =>
      Effect.gen(function* () {
        const result = yield* runCli(sabbathSchool, ['sync', '--files', '/path/to/2024-Q1-W1.md'], {
          files: {
            files: {
              '/path/to/2024-Q1-W1.md':
                '---\ncreated_at: "2024-01-01"\nyear: 2024\nquarter: 1\nweek: 1\napple_note_id: "note-123"\n---\n\n# Outline\n\nContent...',
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
        const result = yield* runCli(sabbathSchool, ['sync', '--files', '/path/to/2024-Q1-W1.md'], {
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
      }),
    );
  });

  describe('export command', () => {
    it.effect('should export outline to Apple Notes', () =>
      Effect.gen(function* () {
        const result = yield* runCli(
          sabbathSchool,
          ['export', '--year', '2024', '--quarter', '1', '--week', '1'],
          {
            files: {
              files: {
                [getOutputsPath('sabbath-school', '2024-Q1-W1.md')]:
                  '# Outline to Export\n\nContent to export...',
              },
              directories: [getOutputsPath('sabbath-school')],
            },
          },
        );

        expect(result.success).toBe(true);
        expectContains(result.calls, [
          { _tag: 'FileSystem.exists' },
          { _tag: 'FileSystem.readFile' },
          { _tag: 'AppleScript.exec' },
        ]);
      }),
    );

    it.effect('should handle missing file for export', () =>
      Effect.gen(function* () {
        const result = yield* runCli(
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
      }),
    );
  });
});
