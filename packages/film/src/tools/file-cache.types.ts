// Compile-time checks of the file caches' key, run by the package typecheck.
// What is read or made from a file is kept under the file as it stands, its
// path and mtime (`AtMtime`): a cache keyed by the path alone hands back what
// was read before the file was rewritten in place. Each line marked below
// fails the typecheck if a cache read, a cache, or a cache file's name takes
// a bare path again.

import { Cache, Effect } from 'effect';
import { AtMtime, fileCache, madeFromName } from './file-cache.ts';

declare const lengths: Effect.Success<ReturnType<typeof fileCache<number, never, never>>>;

// @ts-expect-error a read by the path alone: the file as it was when first read
export const byPath = Cache.get(lengths, '/nonexistent/loop-probe.mp4');

// @ts-expect-error a cache whose lookup takes a path: its key is the path alone
export const keyedByPath = fileCache((file: string) => Effect.succeed(file.length), 1);

// @ts-expect-error a cache file's name from the path alone
export const namedByPath = madeFromName('/nonexistent/loop-probe.mp4', []);

// @ts-expect-error a file with no mtime is not a file as it stands
export const noMtime = new AtMtime({ file: '/nonexistent/loop-probe.mp4' });

/** A read by the file as it stands. */
export const standing = Cache.get(
  lengths,
  new AtMtime({ file: '/nonexistent/loop-probe.mp4', mtime: 0 }),
);

/** A cache file's name from the file as it stands, with a time and a width. */
export const named = madeFromName(new AtMtime({ file: '/nonexistent/loop-probe.mp4', mtime: 0 }), [
  '1.000',
  640,
]);
