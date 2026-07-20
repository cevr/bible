import { Effect } from 'effect';

export const moduleDirectory = import.meta.dir;

export const globFiles = (root: string, pattern: string): Effect.Effect<readonly string[]> =>
  Effect.sync(() =>
    // oxlint-disable-next-line effect/noGlobals -- Bun.Glob has no Effect platform equivalent.
    [...new Bun.Glob(pattern).scanSync({ cwd: root, dot: true, onlyFiles: true })].sort(),
  );
