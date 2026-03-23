import { Data, Effect, FileSystem, Layer, pipe } from 'effect';

import { recordCall } from './sequence-recorder.js';

/**
 * Simple error class for mock file system errors.
 */
class MockFileSystemError extends Data.TaggedError('MockFileSystemError')<{
  reason: string;
  module: string;
  method: string;
  pathOrDescriptor: string;
  message: string;
}> {}

/**
 * Create a file system error for testing.
 */
const createFileError = (method: string, path: string, message: string) =>
  new MockFileSystemError({
    reason: 'NotFound',
    module: 'FileSystem',
    method,
    pathOrDescriptor: path,
    message,
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

  const mockFs: FileSystem.FileSystem = {
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
    sink: () => Effect.die('sink not implemented in mock'),
    stat: (path) =>
      Effect.gen(function* () {
        const exists = state.files.has(path) || state.directories.has(path);
        if (!exists) {
          return yield* Effect.fail(createFileError('stat', path, `File not found: ${path}`));
        }
        const isDirectory = state.directories.has(path);
        return {
          type: isDirectory ? ('Directory' as const) : ('File' as const),
          mtime: new Date(),
          atime: new Date(),
          ctime: new Date(),
          birthtime: new Date(),
          dev: 0,
          ino: 0,
          mode: 0o644,
          nlink: 1,
          uid: 0,
          gid: 0,
          rdev: 0,
          size: isDirectory ? 0 : (state.files.get(path)?.length ?? 0),
          blksize: 4096,
          blocks: 1,
        };
      }),
    stream: () => Effect.die('stream not implemented in mock'),
    truncate: () => Effect.void,
    utimes: () => Effect.void,
    watch: () => Effect.die('watch not implemented in mock'),
    open: () => Effect.die('open not implemented in mock'),

    exists: (path) =>
      pipe(
        recordCall({ _tag: 'FileSystem.exists', path }),
        Effect.map(() => state.files.has(path) || state.directories.has(path)),
      ),

    readFile: (path) =>
      Effect.gen(function* () {
        yield* recordCall({ _tag: 'FileSystem.readFile', path });
        const content = state.files.get(path);
        if (content === undefined) {
          return yield* Effect.fail(createFileError('readFile', path, `File not found: ${path}`));
        }
        return content instanceof Uint8Array ? content : new TextEncoder().encode(content);
      }),

    readFileString: (path) =>
      Effect.gen(function* () {
        yield* recordCall({ _tag: 'FileSystem.readFileString', path });
        const content = state.files.get(path);
        if (content === undefined) {
          return yield* Effect.fail(
            createFileError('readFileString', path, `File not found: ${path}`),
          );
        }
        return content instanceof Uint8Array ? new TextDecoder().decode(content) : content;
      }),

    writeFile: (path, data) =>
      Effect.gen(function* () {
        yield* recordCall({ _tag: 'FileSystem.writeFile', path });
        state.files.set(path, data);
        // Ensure parent directories exist
        const parts = path.split('/');
        for (let i = 1; i < parts.length; i++) {
          state.directories.add(parts.slice(0, i).join('/'));
        }
      }),

    writeFileString: (path, content) =>
      Effect.gen(function* () {
        yield* recordCall({
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

    makeDirectory: (path) =>
      Effect.gen(function* () {
        yield* recordCall({ _tag: 'FileSystem.makeDirectory', path });
        state.directories.add(path);
      }),

    makeTempDirectory: () => Effect.succeed('/tmp/test-temp'),
    makeTempDirectoryScoped: () => Effect.succeed('/tmp/test-temp-scoped'),
    makeTempFile: () => Effect.succeed('/tmp/test-temp-file'),
    makeTempFileScoped: () => Effect.succeed('/tmp/test-temp-file-scoped'),

    readDirectory: (path) =>
      Effect.gen(function* () {
        yield* recordCall({ _tag: 'FileSystem.readDirectory', path });
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

    remove: (path) =>
      Effect.gen(function* () {
        yield* recordCall({ _tag: 'FileSystem.remove', path });
        state.files.delete(path);
        state.directories.delete(path);
      }),
  };

  return {
    layer: Layer.succeed(FileSystem.FileSystem, mockFs),
    state,
  };
};
