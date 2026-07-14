import { describe, expect, it } from 'bun:test';

import {
  makeDatabaseFileDownloader,
  type DatabaseFileDirectory,
} from './database-file-downloader.js';

const makeDirectory = (events: string[], chunks: Uint8Array[]): DatabaseFileDirectory => ({
  getFileHandle: async (filename) => {
    events.push(`file:${filename}`);
    return {
      createWritable: async () => ({
        write: async (chunk) => {
          chunks.push(chunk);
        },
        close: async () => {
          events.push('close');
        },
        abort: async () => {
          events.push('abort');
        },
      }),
    };
  },
});

describe('database file downloader', () => {
  it('streams a successful response into the named OPFS file', async () => {
    const events: string[] = [];
    const chunks: Uint8Array[] = [];
    const progress: number[] = [];
    const body = new Uint8Array([1, 2, 3, 4]);
    const downloader = makeDatabaseFileDownloader({
      fetch: async () => new Response(body, { headers: { 'Content-Length': '4' } }),
      getStorageRoot: async () => makeDirectory(events, chunks),
    });

    await downloader.download('/database', 'bible.db', (value) => progress.push(value));

    expect(events).toEqual(['file:bible.db', 'close']);
    expect(Array.from(chunks[0] ?? [])).toEqual([1, 2, 3, 4]);
    expect(progress).toEqual([100]);
  });

  it('rejects an HTTP failure before touching OPFS', async () => {
    let opened = false;
    const downloader = makeDatabaseFileDownloader({
      fetch: async () => new Response(null, { status: 503, statusText: 'Unavailable' }),
      getStorageRoot: async () => {
        opened = true;
        return makeDirectory([], []);
      },
    });

    const error = await downloader
      .download('/database', 'bible.db', () => {})
      .then(
        () => undefined,
        (cause: unknown) => cause,
      );
    expect(error).toEqual(new Error('Failed to download bible.db: Unavailable'));
    expect(opened).toBe(false);
  });
});
