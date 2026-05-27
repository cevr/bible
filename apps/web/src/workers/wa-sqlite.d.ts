declare module 'wa-sqlite/src/examples/OPFSCoopSyncVFS.js' {
  export class OPFSCoopSyncVFS {
    static create(name: string, module: unknown): Promise<OPFSCoopSyncVFS>;
    close(): Promise<void>;
  }
}
