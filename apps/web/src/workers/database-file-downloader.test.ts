import { describe, expect, it } from 'bun:test';

import {
  makeDatabaseFileDownloader,
  makeIndexedDbDatabaseFileDownloader,
  type DatabaseFileDirectory,
  type IndexedDbImportVfs,
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

  it('validates and imports SQLite pages through the IndexedDB VFS', async () => {
    const bytes = new Uint8Array(512);
    bytes.set(new TextEncoder().encode('SQLite format 3\0'));
    const header = new DataView(bytes.buffer);
    header.setUint16(16, 512);
    header.setUint32(28, 1);
    const writes: Array<{ readonly offset: number; readonly bytes: Uint8Array }> = [];
    const events: string[] = [];
    const vfs: IndexedDbImportVfs = {
      jOpen: (filename) => {
        events.push(`open:${filename}`);
        return 0;
      },
      jClose: () => {
        events.push('close');
        return 0;
      },
      jLock: (_fileId, lock) => {
        events.push(`lock:${String(lock)}`);
        return 0;
      },
      jUnlock: (_fileId, lock) => {
        events.push(`unlock:${String(lock)}`);
        return 0;
      },
      jFileControl: (_fileId, operation) => {
        events.push(`control:${String(operation)}`);
        return 0;
      },
      jTruncate: () => 0,
      jWrite: (_fileId, page, offset) => {
        writes.push({ offset, bytes: page.slice() });
        return 0;
      },
      jSync: () => 0,
    };
    const progress: number[] = [];
    const downloader = makeIndexedDbDatabaseFileDownloader(vfs, {
      fetch: async () => new Response(bytes),
    });

    await downloader.download('/database', 'bible.db', (value) => progress.push(value));

    expect(events[0]).toBe('open:bible.db');
    expect(events.at(-1)).toBe('close');
    expect(writes).toHaveLength(1);
    expect(writes[0]?.offset).toBe(0);
    expect(writes[0]?.bytes).toEqual(bytes);
    expect(progress).toEqual([100]);
  });
});
