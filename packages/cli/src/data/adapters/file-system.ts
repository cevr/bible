import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';

import { StorageAdapter, StorageError } from '@bible/core/adapters';
import { Effect, Layer } from 'effect';

/**
 * File system implementation of StorageAdapter.
 * Stores content as files in a base directory.
 */
export const FileSystemStorageLive = (baseDir: string) =>
  Layer.succeed(
    StorageAdapter,
    StorageAdapter.of({
      read: (key) =>
        Effect.tryPromise({
          try: () => {
            const filePath = join(baseDir, key);
            return Bun.file(filePath).text();
          },
          catch: (cause) => new StorageError({ key, operation: 'read', cause }),
        }),

      write: (key, content) =>
        Effect.tryPromise({
          try: () => {
            const filePath = join(baseDir, key);
            const dir = dirname(filePath);
            if (!existsSync(dir)) {
              mkdirSync(dir, { recursive: true });
            }
            return Bun.write(filePath, content);
          },
          catch: (cause) => new StorageError({ key, operation: 'write', cause }),
        }),

      exists: (key) =>
        Effect.sync(() => {
          const filePath = join(baseDir, key);
          return existsSync(filePath);
        }),

      remove: (key) =>
        Effect.try({
          try: () => {
            const filePath = join(baseDir, key);
            if (existsSync(filePath)) {
              unlinkSync(filePath);
            }
          },
          catch: (cause) => new StorageError({ key, operation: 'delete', cause }),
        }),

      list: (prefix) =>
        Effect.sync(() => {
          const dirPath = join(baseDir, prefix);
          if (!existsSync(dirPath)) {
            return [];
          }
          try {
            return readdirSync(dirPath).map((f) => join(prefix, f));
          } catch {
            return [];
          }
        }),
    }),
  );
