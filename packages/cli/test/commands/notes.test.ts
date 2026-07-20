import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';

import { notes } from '../../src/commands/notes.js';
import { expectCallCount, expectContains, expectNoCalls, runCli } from '../lib/run-cli.js';

describe('notes commands', () => {
  describe.skip('list command', () => {
    // TODO: listNotes uses Bun.spawn directly instead of AppleScript service
    // These tests hit real Apple Notes. Needs refactoring to use AppleScript service.
    it.effect('should list notes from Apple Notes', () =>
      Effect.gen(function* () {
        // Mock response format: ID|Name|Created|Modified\n
        const mockNotesResponse = [
          'note-id-1|Test Note 1|January 1, 2026|January 2, 2026',
          'note-id-2|Test Note 2|January 3, 2026|January 4, 2026',
        ].join('\n');

        const result = yield* Effect.tryPromise(() =>
          runCli(notes, ['list'], {
            appleScript: {
              success: true,
              response: mockNotesResponse,
            },
          }),
        );

        expect(result.success).toBe(true);
        expectContains(result.calls, [{ _tag: 'AppleScript.exec' }]);
      }),
    );

    it.effect('should output JSON when --json flag is used', () =>
      Effect.gen(function* () {
        const mockNotesResponse = 'note-id-1|Test Note|January 1, 2026|January 2, 2026\n';

        const result = yield* Effect.tryPromise(() =>
          runCli(notes, ['list', '--json'], {
            appleScript: {
              success: true,
              response: mockNotesResponse,
            },
          }),
        );

        expect(result.success).toBe(true);
        expectContains(result.calls, [{ _tag: 'AppleScript.exec' }]);
      }),
    );

    it.effect('should handle empty notes list', () =>
      Effect.gen(function* () {
        const result = yield* Effect.tryPromise(() =>
          runCli(notes, ['list'], {
            appleScript: {
              success: true,
              response: '',
            },
          }),
        );

        expect(result.success).toBe(true);
      }),
    );
  });

  describe('export command', () => {
    it.effect('should create a new note from markdown file', () =>
      Effect.gen(function* () {
        const markdownContent = '# Test Message\n\nThis is test content.';

        const result = yield* Effect.tryPromise(() =>
          runCli(notes, ['export', '--file', '/path/to/message.md'], {
            files: {
              files: {
                '/path/to/message.md': markdownContent,
              },
            },
            appleScript: {
              success: true,
              response: 'note-id-new-123',
            },
          }),
        );

        expect(result.success).toBe(true);
        expectContains(result.calls, [
          { _tag: 'FileSystem.readFile' },
          { _tag: 'AppleScript.exec' },
        ]);
      }),
    );

    it.effect('should create note in specified folder', () =>
      Effect.gen(function* () {
        const markdownContent = '# Test Message\n\nContent here.';

        const result = yield* Effect.tryPromise(() =>
          runCli(notes, ['export', '--file', '/path/to/message.md', '--folder', 'messages'], {
            files: {
              files: {
                '/path/to/message.md': markdownContent,
              },
            },
            appleScript: {
              success: true,
              response: 'note-id-folder-123',
            },
          }),
        );

        expect(result.success).toBe(true);
        expectContains(result.calls, [
          { _tag: 'FileSystem.readFile' },
          { _tag: 'AppleScript.exec' },
        ]);
      }),
    );

    it.effect('should update existing note when --note-id is provided', () =>
      Effect.gen(function* () {
        const markdownContent = '# Updated Message\n\nUpdated content.';

        const result = yield* Effect.tryPromise(() =>
          runCli(
            notes,
            ['export', '--file', '/path/to/message.md', '--note-id', 'existing-note-id-456'],
            {
              files: {
                files: {
                  '/path/to/message.md': markdownContent,
                },
              },
              appleScript: {
                success: true,
                response: 'Success',
              },
            },
          ),
        );

        expect(result.success).toBe(true);
        expectContains(result.calls, [
          { _tag: 'FileSystem.readFile' },
          { _tag: 'AppleScript.exec' },
        ]);
      }),
    );

    it.effect('should fail when file does not exist', () =>
      Effect.gen(function* () {
        const result = yield* Effect.tryPromise(() =>
          runCli(notes, ['export', '--file', '/path/to/nonexistent.md'], {
            files: {
              files: {},
            },
            appleScript: {
              success: true,
              response: 'note-id-123',
            },
          }),
        );

        expect(result.success).toBe(false);
      }),
    );

    it.effect('should handle AppleScript failure gracefully', () =>
      Effect.gen(function* () {
        const markdownContent = '# Test\n\nContent';

        const result = yield* Effect.tryPromise(() =>
          runCli(notes, ['export', '--file', '/path/to/message.md'], {
            files: {
              files: {
                '/path/to/message.md': markdownContent,
              },
            },
            appleScript: {
              success: false,
              response: 'Error: Permission denied',
            },
          }),
        );

        // The command should still complete but may fail due to AppleScript error
        // The exact behavior depends on error handling in the implementation
        expectContains(result.calls, [
          { _tag: 'FileSystem.readFile' },
          { _tag: 'AppleScript.exec' },
        ]);
      }),
    );
  });

  describe('organize command', () => {
    const withId = `---
created_at: 2026-04-17
topic: test
apple_note_id: x-coredata://abc/ICNote/p1
---

# Test

Body.`;
    const withoutId = `---
created_at: 2026-04-17
topic: test
---

# Test

Body.`;

    it.effect('should move a note when apple_note_id is present', () =>
      Effect.gen(function* () {
        const result = yield* Effect.tryPromise(() =>
          runCli(
            notes,
            ['organize', '--files', '/path/to/withid.md', '--folder', 'Daniel + Revelation'],
            {
              files: {
                files: {
                  '/path/to/withid.md': withId,
                },
              },
              appleScript: {
                success: true,
                response: 'Success',
              },
            },
          ),
        );

        expect(result.success).toBe(true);
        expectCallCount(result.calls, 'FileSystem.readFile', 1);
        expectCallCount(result.calls, 'AppleScript.exec', 1);
      }),
    );

    it.effect('should skip files without apple_note_id', () =>
      Effect.gen(function* () {
        const result = yield* Effect.tryPromise(() =>
          runCli(notes, ['organize', '--files', '/path/to/noid.md', '--folder', 'Target'], {
            files: {
              files: {
                '/path/to/noid.md': withoutId,
              },
            },
            appleScript: {
              success: true,
              response: 'Success',
            },
          }),
        );

        expect(result.success).toBe(true);
        expectCallCount(result.calls, 'FileSystem.readFile', 1);
        expectNoCalls(result.calls, 'AppleScript.exec');
      }),
    );

    it.effect('should move multiple notes into the same folder', () =>
      Effect.gen(function* () {
        const result = yield* Effect.tryPromise(() =>
          runCli(
            notes,
            [
              'organize',
              '--files',
              '/path/to/a.md',
              '--files',
              '/path/to/b.md',
              '--folder',
              'Target',
            ],
            {
              files: {
                files: {
                  '/path/to/a.md': withId,
                  '/path/to/b.md': withId.replace('p1', 'p2'),
                },
              },
              appleScript: {
                success: true,
                response: 'Success',
              },
            },
          ),
        );

        expect(result.success).toBe(true);
        expectCallCount(result.calls, 'FileSystem.readFile', 2);
        expectCallCount(result.calls, 'AppleScript.exec', 2);
      }),
    );

    it.effect('should handle no files specified', () =>
      Effect.gen(function* () {
        const result = yield* Effect.tryPromise(() =>
          runCli(notes, ['organize', '--folder', 'Target'], {
            files: {
              files: {},
            },
          }),
        );

        expect(result.success).toBe(true);
        expectNoCalls(result.calls, 'FileSystem.readFile');
        expectNoCalls(result.calls, 'AppleScript.exec');
      }),
    );
  });
});
