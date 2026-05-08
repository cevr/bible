import { Effect, FileSystem, Layer, Option, PlatformError, Ref, Stream } from 'effect';

import { CallSequence, type ServiceCall } from './sequence-recorder.js';

/**
 * Create a file system error for testing.
 */
const createFileError = (method: string, path: string, message: string) =>
  PlatformError.systemError({
    _tag: 'NotFound',
    module: 'FileSystem',
    method,
    pathOrDescriptor: path,
    description: message,
  });

/**
 * Configuration for the mock file system.
 */
export interface MockFileSystemConfig {
  /** Initial files in the mock file system. path -> content */
  files: Record<string, string | Uint8Array>;
  /** Initial directories that exist */
  directories?: string[];
}

/**
 * Mutable state for tracking file system changes during tests.
 */
export interface MockFileSystemState {
  files: Map<string, string | Uint8Array>;
  directories: Set<string>;
}

/**
 * Create a mock FileSystem layer that records all calls.
 *
 * The layer requires `CallSequence` (which is provided alongside it in
 * test-layer.ts), and bakes the ref into each method so individual method
 * effects don't carry the `CallSequence` requirement.
 */
export const createMockFileSystemLayer = (config: MockFileSystemConfig) => {
  // Mutable state for the mock - JS is single-threaded so this is safe in tests
  const state: MockFileSystemState = {
    files: new Map(Object.entries(config.files)),
    directories: new Set(config.directories ?? []),
  };

  // Add parent directories for all files
  for (const path of state.files.keys()) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      state.directories.add(parts.slice(0, i).join('/'));
    }
  }

  const layer = Layer.effect(
    FileSystem.FileSystem,
    Effect.gen(function* () {
      const callRef = yield* CallSequence;
      const recordCallSync = (call: ServiceCall): Effect.Effect<void> =>
        Ref.update(callRef, (calls) => [...calls, call]);

      const baseFs = FileSystem.make({
        access: () => Effect.void,
        chmod: () => Effect.void,
        chown: () => Effect.void,
        copy: () => Effect.void,
        copyFile: () => Effect.void,
        link: () => Effect.void,
        symlink: () => Effect.void,
        readLink: () => Effect.succeed(''),
        realPath: (path) => Effect.succeed(path),
        rename: () => Effect.void,
        stat: (path) =>
          Effect.gen(function* () {
            const exists = state.files.has(path) || state.directories.has(path);
            if (!exists) {
              return yield* createFileError('stat', path, `File not found: ${path}`);
            }
            const isDirectory = state.directories.has(path);
            const size = isDirectory ? 0 : (state.files.get(path)?.length ?? 0);
            return {
              type: isDirectory ? ('Directory' as const) : ('File' as const),
              mtime: Option.some(new Date()),
              atime: Option.some(new Date()),
              birthtime: Option.some(new Date()),
              dev: 0,
              ino: Option.some(0),
              mode: 0o644,
              nlink: Option.some(1),
              uid: Option.some(0),
              gid: Option.some(0),
              rdev: Option.some(0),
              size: FileSystem.Size(size),
              blksize: Option.some(FileSystem.Size(4096)),
              blocks: Option.some(1),
            };
          }),
        truncate: () => Effect.void,
        utimes: () => Effect.void,
        watch: () => Stream.die('watch not implemented in mock'),
        open: () => Effect.die('open not implemented in mock'),

        readFile: (path: string) =>
          Effect.gen(function* () {
            yield* recordCallSync({ _tag: 'FileSystem.readFile', path });
            const content = state.files.get(path);
            if (content === undefined) {
              return yield* createFileError('readFile', path, `File not found: ${path}`);
            }
            return content instanceof Uint8Array ? content : new TextEncoder().encode(content);
          }),

        writeFile: (path: string, data: Uint8Array) =>
          Effect.gen(function* () {
            yield* recordCallSync({ _tag: 'FileSystem.writeFile', path });
            state.files.set(path, data);
            // Ensure parent directories exist
            const parts = path.split('/');
            for (let i = 1; i < parts.length; i++) {
              state.directories.add(parts.slice(0, i).join('/'));
            }
          }),

        makeDirectory: (path: string) =>
          Effect.gen(function* () {
            yield* recordCallSync({ _tag: 'FileSystem.makeDirectory', path });
            state.directories.add(path);
          }),

        makeTempDirectory: () => Effect.succeed('/tmp/test-temp'),
        makeTempDirectoryScoped: () => Effect.succeed('/tmp/test-temp-scoped'),
        makeTempFile: () => Effect.succeed('/tmp/test-temp-file'),
        makeTempFileScoped: () => Effect.succeed('/tmp/test-temp-file-scoped'),

        readDirectory: (path: string) =>
          Effect.gen(function* () {
            yield* recordCallSync({ _tag: 'FileSystem.readDirectory', path });
            const entries: string[] = [];
            const prefix = path.endsWith('/') ? path : `${path}/`;

            // Find all files in this directory
            for (const filePath of state.files.keys()) {
              if (filePath.startsWith(prefix)) {
                const relativePath = filePath.slice(prefix.length);
                const firstPart = relativePath.split('/')[0];
                if (firstPart && !entries.includes(firstPart)) {
                  entries.push(firstPart);
                }
              }
            }

            // Find all subdirectories
            for (const dirPath of state.directories) {
              if (dirPath.startsWith(prefix)) {
                const relativePath = dirPath.slice(prefix.length);
                const firstPart = relativePath.split('/')[0];
                if (firstPart && !entries.includes(firstPart)) {
                  entries.push(firstPart);
                }
              }
            }

            return entries;
          }),

        remove: (path: string) =>
          Effect.gen(function* () {
            yield* recordCallSync({ _tag: 'FileSystem.remove', path });
            state.files.delete(path);
            state.directories.delete(path);
          }),
      });

      // Override `exists`, `readFileString`, `writeFileString` to record their calls
      // (FileSystem.make would otherwise derive these from access/readFile/writeFile).
      const mockFs: FileSystem.FileSystem = {
        ...baseFs,
        exists: (path) =>
          Effect.gen(function* () {
            yield* recordCallSync({ _tag: 'FileSystem.exists', path });
            return state.files.has(path) || state.directories.has(path);
          }),
        readFileString: (path) =>
          Effect.gen(function* () {
            yield* recordCallSync({ _tag: 'FileSystem.readFileString', path });
            const content = state.files.get(path);
            if (content === undefined) {
              return yield* createFileError('readFileString', path, `File not found: ${path}`);
            }
            return content instanceof Uint8Array ? new TextDecoder().decode(content) : content;
          }),
        writeFileString: (path, content) =>
          Effect.gen(function* () {
            yield* recordCallSync({
              _tag: 'FileSystem.writeFileString',
              path,
              content,
            });
            state.files.set(path, content);
            // Ensure parent directories exist
            const parts = path.split('/');
            for (let i = 1; i < parts.length; i++) {
              state.directories.add(parts.slice(0, i).join('/'));
            }
          }),
      };

      return mockFs;
    }),
  );

  return {
    layer,
    state,
  };
};
