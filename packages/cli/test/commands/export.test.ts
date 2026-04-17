import { beforeEach, describe, expect, it } from 'bun:test';

import { exportOutput } from '../../src/commands/export.js';
import { expectCallCount, expectNoCalls, expectSequence, runCli } from '../lib/run-cli.js';

describe('export command', () => {
  beforeEach(() => {
    // Reset any test state between tests
  });

  describe('export files to Apple Notes', () => {
    it('should export a single file to Apple Notes', async () => {
      const result = await runCli(exportOutput, ['--files', '/path/to/message.md'], {
        files: {
          files: {
            '/path/to/message.md': '# Test Message\n\nThis is a test message.',
          },
        },
        bun: {
          appleScriptSuccess: true,
        },
      });

      expect(result.success).toBe(true);
      expectSequence(result.calls, [
        { _tag: 'FileSystem.readFile', path: '/path/to/message.md' },
        { _tag: 'AppleScript.exec' },
      ]);
    });

    it('should export multiple files to Apple Notes', async () => {
      const result = await runCli(
        exportOutput,
        ['--files', '/path/to/file1.md', '--files', '/path/to/file2.md'],
        {
          files: {
            files: {
              '/path/to/file1.md': '# File 1\n\nContent 1',
              '/path/to/file2.md': '# File 2\n\nContent 2',
            },
          },
          bun: {
            appleScriptSuccess: true,
          },
        },
      );

      expect(result.success).toBe(true);
      expectCallCount(result.calls, 'FileSystem.readFile', 2);
      expectCallCount(result.calls, 'AppleScript.exec', 2);
    });

    it('should handle no files specified', async () => {
      const result = await runCli(exportOutput, [], {
        files: {
          files: {},
        },
      });

      expect(result.success).toBe(true);
      // No file operations should happen
      expectNoCalls(result.calls, 'FileSystem.readFile');
      expectNoCalls(result.calls, 'AppleScript.exec');
    });

    it('should fail when file does not exist', async () => {
      const result = await runCli(exportOutput, ['--files', '/path/to/nonexistent.md'], {
        files: {
          files: {},
        },
      });

      expect(result.success).toBe(false);
    });

    it('should update an existing note when apple_note_id is present in frontmatter', async () => {
      const existing = `---
created_at: 2026-04-16
topic: test
apple_note_id: x-coredata://abc/ICNote/p1
---

# Test

Body.`;
      const result = await runCli(exportOutput, ['--files', '/path/to/withid.md'], {
        files: {
          files: {
            '/path/to/withid.md': existing,
          },
        },
        bun: {
          appleScriptSuccess: true,
        },
      });

      expect(result.success).toBe(true);
      expectCallCount(result.calls, 'FileSystem.readFile', 1);
      expectCallCount(result.calls, 'AppleScript.exec', 1);
      expectNoCalls(result.calls, 'FileSystem.writeFile');
    });

    it('should create a new note when --force-create is set even if id present', async () => {
      const existing = `---
created_at: 2026-04-16
topic: test
apple_note_id: x-coredata://abc/ICNote/p1
---

# Test

Body.`;
      const result = await runCli(
        exportOutput,
        ['--files', '/path/to/withid.md', '--force-create'],
        {
          files: {
            files: {
              '/path/to/withid.md': existing,
            },
          },
          bun: {
            appleScriptSuccess: true,
          },
        },
      );

      expect(result.success).toBe(true);
      expectCallCount(result.calls, 'FileSystem.writeFile', 1);
    });
  });
});
