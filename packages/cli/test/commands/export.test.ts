import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';

import { exportOutput } from '../../src/commands/export.js';
import { expectCallCount, expectNoCalls, expectSequence, runCli } from '../lib/run-cli.js';

describe('export command', () => {
  describe('export files to Apple Notes', () => {
    it.effect('should export a single file to Apple Notes', () =>
      Effect.gen(function* () {
        const result = yield* Effect.tryPromise(() =>
          runCli(exportOutput, ['--files', '/path/to/message.md'], {
            files: {
              files: {
                '/path/to/message.md': '# Test Message\n\nThis is a test message.',
              },
            },
            appleScript: {
              success: true,
            },
          }),
        );

        expect(result.success).toBe(true);
        expectSequence(result.calls, [
          { _tag: 'FileSystem.readFile', path: '/path/to/message.md' },
          { _tag: 'AppleScript.exec' },
        ]);
      }),
    );

    it.effect('should export multiple files to Apple Notes', () =>
      Effect.gen(function* () {
        const result = yield* Effect.tryPromise(() =>
          runCli(exportOutput, ['--files', '/path/to/file1.md', '--files', '/path/to/file2.md'], {
            files: {
              files: {
                '/path/to/file1.md': '# File 1\n\nContent 1',
                '/path/to/file2.md': '# File 2\n\nContent 2',
              },
            },
            appleScript: {
              success: true,
            },
          }),
        );

        expect(result.success).toBe(true);
        expectCallCount(result.calls, 'FileSystem.readFile', 2);
        expectCallCount(result.calls, 'AppleScript.exec', 2);
      }),
    );

    it.effect('should handle no files specified', () =>
      Effect.gen(function* () {
        const result = yield* Effect.tryPromise(() =>
          runCli(exportOutput, [], {
            files: {
              files: {},
            },
          }),
        );

        expect(result.success).toBe(true);
        // No file operations should happen
        expectNoCalls(result.calls, 'FileSystem.readFile');
        expectNoCalls(result.calls, 'AppleScript.exec');
      }),
    );

    it.effect('should fail when file does not exist', () =>
      Effect.gen(function* () {
        const result = yield* Effect.tryPromise(() =>
          runCli(exportOutput, ['--files', '/path/to/nonexistent.md'], {
            files: {
              files: {},
            },
          }),
        );

        expect(result.success).toBe(false);
      }),
    );

    it.effect('should update an existing note when apple_note_id is present in frontmatter', () =>
      Effect.gen(function* () {
        const existing = `---
created_at: 2026-04-16
topic: test
apple_note_id: x-coredata://abc/ICNote/p1
---

# Test

Body.`;
        const result = yield* Effect.tryPromise(() =>
          runCli(exportOutput, ['--files', '/path/to/withid.md'], {
            files: {
              files: {
                '/path/to/withid.md': existing,
              },
            },
            appleScript: {
              success: true,
            },
          }),
        );

        expect(result.success).toBe(true);
        expectCallCount(result.calls, 'FileSystem.readFile', 1);
        expectCallCount(result.calls, 'AppleScript.exec', 1);
        expectNoCalls(result.calls, 'FileSystem.writeFile');
      }),
    );

    it.effect('should create a new note when --force-create is set even if id present', () =>
      Effect.gen(function* () {
        const existing = `---
created_at: 2026-04-16
topic: test
apple_note_id: x-coredata://abc/ICNote/p1
---

# Test

Body.`;
        const result = yield* Effect.tryPromise(() =>
          runCli(exportOutput, ['--files', '/path/to/withid.md', '--force-create'], {
            files: {
              files: {
                '/path/to/withid.md': existing,
              },
            },
            appleScript: {
              success: true,
            },
          }),
        );

        expect(result.success).toBe(true);
        expectCallCount(result.calls, 'FileSystem.writeFile', 1);
      }),
    );
  });
});
