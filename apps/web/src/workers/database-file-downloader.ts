import * as VFS from 'wa-sqlite/src/VFS.js';

export interface DatabaseFileDownloader {
  readonly download: (
    url: string,
    filename: string,
    onProgress: (progress: number) => void,
  ) => Promise<void>;
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
  readonly abort: (reason?: unknown) => Promise<void>;
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

/** Replace one OPFS database file from a streamed HTTP response. */
export const makeDatabaseFileDownloader = (options?: {
  readonly fetch?: (url: string) => Promise<Response>;
  readonly getStorageRoot?: () => Promise<DatabaseFileDirectory>;
}): DatabaseFileDownloader => {
  const fetchResponse = options?.fetch ?? globalThis.fetch;
  const getStorageRoot = options?.getStorageRoot ?? (() => navigator.storage.getDirectory());

  const download = async (
    url: string,
    filename: string,
    onProgress: (progress: number) => void,
  ): Promise<void> => {
    const response = await fetchResponse(url);
    if (!response.ok) throw new Error(`Failed to download ${filename}: ${response.statusText}`);
    if (response.body === null) throw new Error(`No response body for ${filename} download`);

    const contentLength = Number(response.headers.get('Content-Length') ?? 0);
    const root = await getStorageRoot();
    const fileHandle = await root.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    const reader = response.body.getReader();
    let received = 0;

    try {
      // eslint-disable-next-line no-constant-condition -- stream termination is signaled by done
      while (true) {
        // eslint-disable-next-line no-await-in-loop -- response chunks must be written in order
        const { done, value } = await reader.read();
        if (done) break;
        // eslint-disable-next-line no-await-in-loop -- OPFS writes must preserve response order
        await writable.write(value);
        received += value.byteLength;
        if (contentLength > 0) {
          onProgress(Math.round((received / contentLength) * 100));
        }
      }
      await writable.close();
    } catch (error) {
      await writable.abort(error);
      throw error;
    }
  };

  return { download };
};

const SQLITE_MAGIC = 'SQLite format 3\0';

const checkVfsResult = async (
  operation: string,
  result: number | Promise<number>,
): Promise<void> => {
  const code = await result;
  if (code !== VFS.SQLITE_OK) {
    throw new Error(`${operation} failed with SQLite VFS code ${String(code)}`);
  }
};

/** Stream a SQLite file into the IndexedDB VFS one validated database page at a time. */
export const makeIndexedDbDatabaseFileDownloader = (
  vfs: IndexedDbImportVfs,
  options?: { readonly fetch?: (url: string) => Promise<Response> },
): DatabaseFileDownloader => {
  const fetchResponse = options?.fetch ?? globalThis.fetch;

  const download = async (
    url: string,
    filename: string,
    onProgress: (progress: number) => void,
  ): Promise<void> => {
    const response = await fetchResponse(url);
    if (!response.ok) throw new Error(`Failed to download ${filename}: ${response.statusText}`);
    if (response.body === null) throw new Error(`No response body for ${filename} download`);

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bufferedBytes = 0;
    const readUntil = async (size: number): Promise<void> => {
      while (bufferedBytes < size) {
        // eslint-disable-next-line no-await-in-loop -- stream chunks are ordered
        const { done, value } = await reader.read();
        if (done) throw new Error(`Unexpected end of ${filename}`);
        chunks.push(value);
        bufferedBytes += value.byteLength;
      }
    };
    const take = async (size: number): Promise<Uint8Array> => {
      await readUntil(size);
      const output = new Uint8Array(size);
      let offset = 0;
      while (offset < size) {
        const chunk = chunks[0];
        if (chunk === undefined) throw new Error(`Missing buffered data for ${filename}`);
        const length = Math.min(chunk.byteLength, size - offset);
        output.set(chunk.subarray(0, length), offset);
        offset += length;
        bufferedBytes -= length;
        if (length === chunk.byteLength) chunks.shift();
        else chunks[0] = chunk.subarray(length);
      }
      return output;
    };

    const headerBytes = await take(32);
    const header = new DataView(headerBytes.buffer);
    if (new TextDecoder().decode(headerBytes.subarray(0, 16)) !== SQLITE_MAGIC) {
      throw new Error(`${filename} is not a SQLite database`);
    }
    const encodedPageSize = header.getUint16(16);
    const pageSize = encodedPageSize === 1 ? 65_536 : encodedPageSize;
    const pageCount = header.getUint32(28);
    if (pageSize === 0 || pageCount === 0)
      throw new Error(`${filename} has an empty SQLite header`);
    chunks.unshift(headerBytes);
    bufferedBytes += headerBytes.byteLength;

    const fileId = Math.floor(Math.random() * 0x1_0000_0000);
    const outFlags = new DataView(new ArrayBuffer(4));
    const controlArgument = new DataView(new ArrayBuffer(4));
    const cleanup: Array<() => number | Promise<number>> = [];
    let lastProgress = -1;
    try {
      await checkVfsResult(
        'open imported database',
        vfs.jOpen(
          filename,
          fileId,
          VFS.SQLITE_OPEN_MAIN_DB | VFS.SQLITE_OPEN_CREATE | VFS.SQLITE_OPEN_READWRITE,
          outFlags,
        ),
      );
      cleanup.push(() => vfs.jClose(fileId));
      await checkVfsResult('acquire shared import lock', vfs.jLock(fileId, VFS.SQLITE_LOCK_SHARED));
      cleanup.push(() => vfs.jUnlock(fileId, VFS.SQLITE_LOCK_NONE));
      await checkVfsResult(
        'acquire reserved import lock',
        vfs.jLock(fileId, VFS.SQLITE_LOCK_RESERVED),
      );
      cleanup.push(() => vfs.jUnlock(fileId, VFS.SQLITE_LOCK_SHARED));
      await checkVfsResult(
        'acquire exclusive import lock',
        vfs.jLock(fileId, VFS.SQLITE_LOCK_EXCLUSIVE),
      );
      await checkVfsResult(
        'begin atomic import',
        vfs.jFileControl(fileId, VFS.SQLITE_FCNTL_BEGIN_ATOMIC_WRITE, controlArgument),
      );
      await checkVfsResult('truncate imported database', vfs.jTruncate(fileId, 0));

      for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
        // eslint-disable-next-line no-await-in-loop -- SQLite pages must retain file order
        const page = await take(pageSize);
        // eslint-disable-next-line no-await-in-loop -- VFS writes share one atomic transaction
        await checkVfsResult(
          `write imported page ${String(pageIndex + 1)}`,
          vfs.jWrite(fileId, page, pageIndex * pageSize),
        );
        const progress = Math.round(((pageIndex + 1) / pageCount) * 100);
        if (progress !== lastProgress) {
          lastProgress = progress;
          onProgress(progress);
        }
      }
      await checkVfsResult(
        'commit atomic import',
        vfs.jFileControl(fileId, VFS.SQLITE_FCNTL_COMMIT_ATOMIC_WRITE, controlArgument),
      );
      // IDBBatchAtomicVFS publishes here, then delegates to the base VFS,
      // whose SQLITE_NOTFOUND return only means the advisory control is not
      // consumed further. The import demo intentionally ignores this code.
      await vfs.jFileControl(fileId, VFS.SQLITE_FCNTL_SYNC, controlArgument);
      await checkVfsResult('sync imported database', vfs.jSync(fileId, VFS.SQLITE_SYNC_NORMAL));

      const trailing = await reader.read();
      if (!trailing.done || bufferedBytes > 0) {
        throw new Error(`${filename} contains data beyond its declared SQLite pages`);
      }
    } finally {
      for (const release of cleanup.reverse()) {
        // eslint-disable-next-line no-await-in-loop -- locks and file handles unwind in reverse order
        await checkVfsResult('release import resource', release());
      }
    }
  };

  return { download };
};
