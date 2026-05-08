import { beforeEach, it } from 'bun:test';
import { describe, expect } from 'effect-bun-test';

import { messages } from '../../src/commands/messages.js';
import { expectContains, expectSequence, runCli } from '../lib/run-cli.js';

describe('messages commands', () => {
  beforeEach(() => {
    // Reset test state
  });

  describe('generate command', () => {
    it('should generate a message from topic', async () => {
      const result = await runCli(
        messages,
        ['generate', '--topic', 'Faith and Works', '--model', 'gemini'],
        {
          files: {
            files: {
              [`${process.cwd()}/src/prompts/messages/generate.md`]:
                'You are a Bible study assistant...',
            },
            directories: [],
          },
          ai: {
            responses: {
              high: ['# Faith and Works\n\nA message about faith and works...'],
              low: ['faith-and-works'],
            },
          },
        },
      );

      expect(result.success).toBe(true);
      // Check all expected calls are present (order varies due to async)
      expectContains(result.calls, [
        { _tag: 'AI.generateText', model: 'high' }, // generate content
        { _tag: 'AI.generateText', model: 'low' }, // generate filename
        { _tag: 'Chime.play' }, // done chime
        { _tag: 'FileSystem.makeDirectory' }, // ensure dir exists
        { _tag: 'FileSystem.writeFile' }, // write message
        { _tag: 'AppleScript.exec' }, // export to Apple Notes
      ]);
    });

    it('should create messages directory if it does not exist', async () => {
      const result = await runCli(messages, ['generate', '--topic', 'Grace', '--model', 'gemini'], {
        files: {
          files: {
            [`${process.cwd()}/src/prompts/messages/generate.md`]: 'System prompt...',
          },
          directories: [],
        },
        ai: {
          responses: {
            high: ['# Grace\n\nContent about grace...'],
            low: ['grace-message'],
          },
        },
      });

      expect(result.success).toBe(true);
      expectContains(result.calls, [
        { _tag: 'FileSystem.makeDirectory' },
        { _tag: 'FileSystem.writeFile' },
      ]);
    });
  });

  describe('revise command', () => {
    it('should revise an existing message', async () => {
      const result = await runCli(
        messages,
        [
          'revise',
          '--file',
          '/path/to/message.md',
          '--instructions',
          'Add more scripture references',
          '--model',
          'gemini',
        ],
        {
          files: {
            files: {
              '/path/to/message.md': '# Original Message\n\nOriginal content...',
              [`${process.cwd()}/src/prompts/messages/generate.md`]: 'System prompt...',
            },
          },
          ai: {
            responses: {
              high: ['# Revised Message\n\nImproved content with scriptures...'],
              low: [],
            },
          },
        },
      );

      expect(result.success).toBe(true);
      expectContains(result.calls, [
        { _tag: 'FileSystem.readFile' }, // read message
        { _tag: 'AI.generateText' }, // revise
        { _tag: 'Chime.play' }, // done chime
        { _tag: 'FileSystem.writeFile' }, // write revised
      ]);
    });

    it('should fail when message file does not exist', async () => {
      const result = await runCli(
        messages,
        [
          'revise',
          '--file',
          '/path/to/nonexistent.md',
          '--instructions',
          'Fix it',
          '--model',
          'gemini',
        ],
        {
          files: {
            files: {
              [`${process.cwd()}/src/prompts/messages/generate.md`]: 'System prompt...',
            },
          },
          ai: {
            responses: { high: [], low: [] },
          },
        },
      );

      expect(result.success).toBe(false);
    });
  });

  describe('generate-topic command', () => {
    it('should generate topic suggestions', async () => {
      const result = await runCli(messages, ['generate-topic', '--model', 'gemini'], {
        files: {
          files: {
            [`${process.cwd()}/outputs/messages/2024-01-01-faith.md`]: 'content',
            [`${process.cwd()}/outputs/messages/2024-01-02-hope.md`]: 'content',
          },
          directories: [`${process.cwd()}/outputs/messages`],
        },
        ai: {
          responses: {
            high: ['1. The Power of Prayer\n2. Walking in the Spirit\n3. Biblical Stewardship'],
            low: [],
          },
        },
      });

      expect(result.success).toBe(true);
      expectContains(result.calls, [
        { _tag: 'FileSystem.readDirectory' }, // list existing messages
        { _tag: 'AI.generateText' }, // generate topics
      ]);
    });
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
