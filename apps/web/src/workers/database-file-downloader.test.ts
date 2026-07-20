import { describe, expect, it } from 'effect-bun-test';
import { Effect, Schema, Stream } from 'effect';

import {
  makeDatabaseFileDownloader,
  makeIndexedDbDatabaseFileDownloader,
  type DatabaseFileDirectory,
  type IndexedDbImportVfs,
} from './database-file-downloader.js';

const makeDirectory = (events: string[], chunks: Uint8Array[]): DatabaseFileDirectory => ({
  getFileHandle: (filename) =>
    Effect.runPromise(
      Effect.sync(() => {
        events.push(`file:${filename}`);
        return {
          createWritable: () =>
            Effect.runPromise(
              Effect.succeed({
                write: (chunk: Uint8Array) =>
                  Effect.runPromise(Effect.sync(() => chunks.push(chunk)).pipe(Effect.asVoid)),
                close: () =>
                  Effect.runPromise(Effect.sync(() => events.push('close')).pipe(Effect.asVoid)),
                abort: () =>
                  Effect.runPromise(Effect.sync(() => events.push('abort')).pipe(Effect.asVoid)),
              }),
            ),
        };
      }),
    ),
});

class DownloadUnavailable extends Schema.TaggedErrorClass<DownloadUnavailable>()(
  'DownloadUnavailable',
  { message: Schema.String },
) {}

describe('database file downloader', () => {
  it.effect('streams a successful response into the named OPFS file', () =>
    Effect.gen(function* () {
      const events: string[] = [];
      const chunks: Uint8Array[] = [];
      const progress: number[] = [];
      const body = new Uint8Array([1, 2, 3, 4]);
      const downloader = makeDatabaseFileDownloader({
        getStorageRoot: () => Effect.runPromise(Effect.succeed(makeDirectory(events, chunks))),
      });

      const installed = yield* downloader.install(Stream.make(body), 'bible.db', (value) =>
        progress.push(value),
      );

      expect(events).toEqual(['file:bible.db', 'close']);
      expect(Array.from(chunks[0] ?? [])).toEqual([1, 2, 3, 4]);
      expect(progress).toEqual([100]);
      expect(installed.bytes).toBe(4);
      expect(installed.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    }),
  );

  it.effect('aborts an OPFS replacement when its Artifact stream fails', () =>
    Effect.gen(function* () {
      const events: string[] = [];
      const downloader = makeDatabaseFileDownloader({
        getStorageRoot: () => Effect.runPromise(Effect.succeed(makeDirectory(events, []))),
      });
      const unavailable = new DownloadUnavailable({ message: 'Unavailable' });

      const error = yield* Effect.flip(
        downloader.install(Stream.fail(unavailable), 'bible.db', () => {}),
      );

      expect(error).toEqual(unavailable);
      expect(events).toEqual(['file:bible.db', 'abort']);
    }),
  );

  it.effect('validates and imports SQLite pages through the IndexedDB VFS', () =>
    Effect.gen(function* () {
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
      const downloader = makeIndexedDbDatabaseFileDownloader(vfs);

      const installed = yield* downloader.install(Stream.make(bytes), 'bible.db', (value) =>
        progress.push(value),
      );

      expect(events[0]).toBe('open:bible.db');
      expect(events.at(-1)).toBe('close');
      expect(writes).toHaveLength(1);
      expect(writes[0]?.offset).toBe(0);
      expect(writes[0]?.bytes).toEqual(bytes);
      expect(progress).toEqual([100]);
      expect(installed.bytes).toBe(512);
      expect(installed.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    }),
  );
});
