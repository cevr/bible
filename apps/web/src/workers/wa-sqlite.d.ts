declare module 'wa-sqlite/src/examples/OPFSAdaptiveVFS.js' {
  export class OPFSAdaptiveVFS {
    static create(name: string, module: unknown): Promise<OPFSAdaptiveVFS>;
    close(): Promise<void>;
    jAccess(name: string, flags: number, output: DataView): Promise<number>;
    jDelete(name: string, syncDirectory: number): Promise<number>;
  }
}

declare module 'wa-sqlite/src/examples/IDBBatchAtomicVFS.js' {
  export class IDBBatchAtomicVFS {
    static create(name: string, module: unknown): Promise<IDBBatchAtomicVFS>;
    close(): void;
    jAccess(name: string, flags: number, output: DataView): Promise<number>;
    jDelete(name: string, syncDirectory: number): Promise<number>;
  }
}

declare module 'wa-sqlite/src/VFS.js' {
  export const SQLITE_OK: number;
  export const SQLITE_OPEN_MAIN_DB: number;
  export const SQLITE_OPEN_CREATE: number;
  export const SQLITE_OPEN_READWRITE: number;
  export const SQLITE_LOCK_NONE: number;
  export const SQLITE_LOCK_SHARED: number;
  export const SQLITE_LOCK_RESERVED: number;
  export const SQLITE_LOCK_EXCLUSIVE: number;
  export const SQLITE_FCNTL_BEGIN_ATOMIC_WRITE: number;
  export const SQLITE_FCNTL_COMMIT_ATOMIC_WRITE: number;
  export const SQLITE_FCNTL_SYNC: number;
  export const SQLITE_SYNC_NORMAL: number;
}
