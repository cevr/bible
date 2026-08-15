import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { Effect, Exit, Option, Predicate, Schema, Stream } from 'effect';
import * as VFS from 'wa-sqlite/src/VFS.js';

export class DatabaseFileDownloadError extends Schema.TaggedError<DatabaseFileDownloadError>()(
  'DatabaseFileDownloadError',
  {
    operation: Schema.String,
    cause: Schema.Unknown,
  },
) {}

export interface DatabaseFileDownloader {
  readonly install: (
    bytes: Stream.Stream<Uint8Array, unknown>,
    filename: string,
    onProgress: (progress: number) => void,
  ) => Effect.Effect<{ readonly bytes: number; readonly digest: string }, unknown>;
}

export interface IndexedDbImportVfs {
  readonly jOpen: (
    path: string,
    fileId: number,
    flags: number,
    outFlags: DataView,
  ) => number | Promise<number>;
  readonly jClose: (fileId: number) => number | Promise<number>;
  readonly jLock: (fileId: number, lock: number) => number | Promise<number>;
  readonly jUnlock: (fileId: number, lock: number) => number | Promise<number>;
  readonly jFileControl: (
    fileId: number,
    operation: number,
    argument: DataView,
  ) => number | Promise<number>;
  readonly jTruncate: (fileId: number, size: number) => number | Promise<number>;
  readonly jWrite: (fileId: number, data: Uint8Array, offset: number) => number | Promise<number>;
  readonly jSync: (fileId: number, flags: number) => number | Promise<number>;
}

interface DatabaseFileWriter {
  readonly write: (data: Uint8Array) => Promise<void>;
  readonly close: () => Promise<void>;
  readonly abort: (cause?: unknown) => Promise<void>;
}

interface DatabaseFileHandle {
  readonly createWritable: () => Promise<DatabaseFileWriter>;
}

export interface DatabaseFileDirectory {
  readonly getFileHandle: (
    filename: string,
    options: { readonly create: true },
  ) => Promise<DatabaseFileHandle>;
}

const hostPromise = <A>(operation: string, evaluate: () => Promise<A>) =>
  Effect.tryPromise({
    try: evaluate,
    catch: (cause) => DatabaseFileDownloadError.make({ operation, cause }),
  });

const defaultStorageRoot = (): Promise<DatabaseFileDirectory> =>
  navigator.storage.getDirectory().then((root) => ({
    getFileHandle: (filename, options) =>
      root.getFileHandle(filename, options).then((handle) => ({
        createWritable: () =>
          handle.createWritable().then((writable) => ({
            write: (data) => writable.write(Uint8Array.from(data)),
            close: () => writable.close(),
            abort: (cause) => writable.abort(cause),
          })),
      })),
  }));

/** Replace one OPFS database file from a streamed HTTP response. */
export const makeDatabaseFileDownloader = (options?: {
  readonly getStorageRoot?: () => Promise<DatabaseFileDirectory>;
}): DatabaseFileDownloader => {
  const getStorageRoot = options?.getStorageRoot ?? defaultStorageRoot;
  const install: DatabaseFileDownloader['install'] = (bytes, filename, onProgress) =>
    Effect.gen(function* () {
      const root = yield* hostPromise('open-storage-root', getStorageRoot);
      const fileHandle = yield* hostPromise('open-database-file', () =>
        root.getFileHandle(filename, { create: true }),
      );
      return yield* Effect.acquireUseRelease(
        hostPromise('create-database-writer', () => fileHandle.createWritable()),
        (writable) => {
          let received = 0;
          const hasher = sha256.create();
          return bytes.pipe(
            Stream.runForEach((value) =>
              hostPromise('write-database-file', () => writable.write(value)).pipe(
                Effect.tap(() =>
                  Effect.sync(() => {
                    received += value.byteLength;
                    hasher.update(value);
                  }),
                ),
              ),
            ),
            Effect.tap(() => Effect.sync(() => onProgress(100))),
            Effect.map(() => ({
              bytes: received,
              digest: `sha256:${bytesToHex(hasher.digest())}`,
            })),
          );
        },
        (writable, exit) => {
          if (Exit.isSuccess(exit)) {
            return hostPromise('close-database-writer', () => writable.close()).pipe(Effect.ignore);
          }
          return hostPromise('abort-database-writer', () => writable.abort(exit.cause)).pipe(
            Effect.ignore,
          );
        },
      );
    });
  return { install };
};

const SQLITE_MAGIC = 'SQLite format 3\0';

const checkVfsResult = Effect.fn('DatabaseFileDownloader.checkVfsResult')(function* (
  operation: string,
  evaluate: () => number | Promise<number>,
) {
  // The VFS call may complete synchronously or return a Promise; Promise.resolve flattens both.
  // oxlint-disable-next-line effect/noNewPromise -- wa-sqlite VFS calls return number | Promise<number>; Promise.resolve flattens both
  const code = yield* hostPromise(operation, () => Promise.resolve(evaluate()));
  if (code !== VFS.SQLITE_OK) {
    return yield* DatabaseFileDownloadError.make({
      operation,
      cause: `SQLite VFS code ${String(code)}`,
    });
  }
});

/** Stream a SQLite file into the IndexedDB VFS one validated database page at a time. */
export const makeIndexedDbDatabaseFileDownloader = (
  vfs: IndexedDbImportVfs,
): DatabaseFileDownloader => {
  const install: DatabaseFileDownloader['install'] = (bytes, filename, onProgress) =>
    Effect.gen(function* () {
      const chunks: Uint8Array[] = [];
      let bufferedBytes = 0;
      let receivedBytes = 0;
      const hasher = sha256.create();
      let header: Option.Option<{ readonly pageSize: number; readonly pageCount: number }> =
        Option.none();
      let writtenPages = 0;
      let lastProgress = -1;
      const fileId = Math.floor(Math.random() * 0x1_0000_0000);
      const outFlags = new DataView(new ArrayBuffer(4));
      const controlArgument = new DataView(new ArrayBuffer(4));
      const cleanup: Array<() => Effect.Effect<void, unknown>> = [];

      const take = (size: number): Effect.Effect<Uint8Array, DatabaseFileDownloadError> => {
        if (bufferedBytes < size) {
          return Effect.fail(
            DatabaseFileDownloadError.make({
              operation: 'read-buffered-database-bytes',
              cause: `Unexpected end of ${filename}`,
            }),
          );
        }
        const output = new Uint8Array(size);
        let offset = 0;
        while (offset < size) {
          const chunk = chunks[0];
          if (Predicate.isUndefined(chunk)) {
            return Effect.fail(
              DatabaseFileDownloadError.make({
                operation: 'read-buffered-database-bytes',
                cause: `Missing buffered data for ${filename}`,
              }),
            );
          }
          const length = Math.min(chunk.byteLength, size - offset);
          output.set(chunk.subarray(0, length), offset);
          offset += length;
          bufferedBytes -= length;
          if (length === chunk.byteLength) chunks.shift();
          else chunks[0] = chunk.subarray(length);
        }
        return Effect.succeed(output);
      };

      const initializeImport = Effect.fn('DatabaseFileDownloader.initializeImport')(function* () {
        const headerBytes = yield* take(32);
        const headerView = new DataView(headerBytes.buffer);
        if (new TextDecoder().decode(headerBytes.subarray(0, 16)) !== SQLITE_MAGIC) {
          return yield* DatabaseFileDownloadError.make({
            operation: 'validate-sqlite-header',
            cause: `${filename} is not a SQLite database`,
          });
        }
        const encodedPageSize = headerView.getUint16(16);
        let pageSize = encodedPageSize;
        if (encodedPageSize === 1) pageSize = 65_536;
        const pageCount = headerView.getUint32(28);
        if (pageSize === 0 || pageCount === 0) {
          return yield* DatabaseFileDownloadError.make({
            operation: 'validate-sqlite-header',
            cause: `${filename} has an empty SQLite header`,
          });
        }
        header = Option.some({ pageSize, pageCount });
        chunks.unshift(headerBytes);
        bufferedBytes += headerBytes.byteLength;

        yield* checkVfsResult('open imported database', () =>
          vfs.jOpen(
            filename,
            fileId,
            VFS.SQLITE_OPEN_MAIN_DB | VFS.SQLITE_OPEN_CREATE | VFS.SQLITE_OPEN_READWRITE,
            outFlags,
          ),
        );
        cleanup.push(() => checkVfsResult('close imported database', () => vfs.jClose(fileId)));
        yield* checkVfsResult('acquire shared import lock', () =>
          vfs.jLock(fileId, VFS.SQLITE_LOCK_SHARED),
        );
        cleanup.push(() =>
          checkVfsResult('release shared import lock', () =>
            vfs.jUnlock(fileId, VFS.SQLITE_LOCK_NONE),
          ),
        );
        yield* checkVfsResult('acquire reserved import lock', () =>
          vfs.jLock(fileId, VFS.SQLITE_LOCK_RESERVED),
        );
        cleanup.push(() =>
          checkVfsResult('release reserved import lock', () =>
            vfs.jUnlock(fileId, VFS.SQLITE_LOCK_SHARED),
          ),
        );
        yield* checkVfsResult('acquire exclusive import lock', () =>
          vfs.jLock(fileId, VFS.SQLITE_LOCK_EXCLUSIVE),
        );
        yield* checkVfsResult('begin atomic import', () =>
          vfs.jFileControl(fileId, VFS.SQLITE_FCNTL_BEGIN_ATOMIC_WRITE, controlArgument),
        );
        yield* checkVfsResult('truncate imported database', () => vfs.jTruncate(fileId, 0));
      });

      const writeAvailablePages = Effect.fn('DatabaseFileDownloader.writePages')(function* () {
        if (Option.isNone(header)) return;
        const { pageSize: currentPageSize, pageCount } = header.value;
        const remainingPages = pageCount - writtenPages;
        const availablePages = Math.floor(bufferedBytes / currentPageSize);
        const pagesToWrite = Math.min(remainingPages, availablePages);
        for (let index = 0; index < pagesToWrite; index += 1) {
          const page = yield* take(currentPageSize);
          yield* checkVfsResult(`write imported page ${String(writtenPages + 1)}`, () =>
            vfs.jWrite(fileId, page, writtenPages * currentPageSize),
          );
          writtenPages += 1;
          const progress = Math.round((writtenPages / pageCount) * 100);
          if (progress !== lastProgress) {
            lastProgress = progress;
            onProgress(progress);
          }
        }
      });

      const importBytes = bytes.pipe(
        Stream.runForEach((value) =>
          Effect.gen(function* () {
            chunks.push(value);
            bufferedBytes += value.byteLength;
            receivedBytes += value.byteLength;
            hasher.update(value);
            if (Option.isNone(header) && bufferedBytes >= 32) yield* initializeImport();
            yield* writeAvailablePages();
          }),
        ),
        Effect.flatMap(() => {
          const complete = Option.exists(
            header,
            ({ pageCount }) => writtenPages === pageCount && bufferedBytes === 0,
          );
          if (!complete) {
            return Effect.fail(
              DatabaseFileDownloadError.make({
                operation: 'validate-imported-database-length',
                cause: `${filename} does not match its declared SQLite pages`,
              }),
            );
          }
          return Effect.void;
        }),
        Effect.andThen(
          checkVfsResult('commit atomic import', () =>
            vfs.jFileControl(fileId, VFS.SQLITE_FCNTL_COMMIT_ATOMIC_WRITE, controlArgument),
          ),
        ),
        Effect.andThen(
          // jFileControl may complete synchronously or return a Promise; Promise.resolve flattens both.
          Effect.tryPromise({
            try: () =>
              // oxlint-disable-next-line effect/noNewPromise -- wa-sqlite VFS calls return number | Promise<number>; Promise.resolve flattens both
              Promise.resolve(vfs.jFileControl(fileId, VFS.SQLITE_FCNTL_SYNC, controlArgument)),
            catch: (cause) =>
              DatabaseFileDownloadError.make({ operation: 'publish imported database', cause }),
          }),
        ),
        Effect.andThen(
          checkVfsResult('sync imported database', () => vfs.jSync(fileId, VFS.SQLITE_SYNC_NORMAL)),
        ),
        Effect.map(() => ({
          bytes: receivedBytes,
          digest: `sha256:${bytesToHex(hasher.digest())}`,
        })),
      );

      return yield* importBytes.pipe(
        Effect.ensuring(
          Effect.suspend(() =>
            Effect.forEach([...cleanup].reverse(), (release) => release(), {
              concurrency: 1,
              discard: true,
            }).pipe(Effect.ignore),
          ),
        ),
      );
    });

  return { install };
};
