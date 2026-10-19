// Which TypeScript files of a package its tsconfig's program leaves out, so
// `tsc --noEmit` never checks them.

/** A TypeScript source, by its extension (a declaration file included). */
const isTypeScript = (file: string) => /\.(?:[cm]?ts|tsx)$/.test(file);

/** A path inside an installed package, which no program of ours is meant to check. */
const installed = (file: string) => file.split('/').includes('node_modules');

/** The files `tsc --listFilesOnly` prints, one path a line. */
export const listedFiles = (stdout: string) =>
  stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

/**
 * The TypeScript files of `files` that `program` does not hold, sorted; every
 * path in both is relative to the package, with `/` between its parts.
 */
export const uncovered = (files: ReadonlyArray<string>, program: ReadonlyArray<string>) => {
  const held = new Set(program);
  return files
    .filter((file) => isTypeScript(file) && !installed(file) && !held.has(file))
    .toSorted();
};
