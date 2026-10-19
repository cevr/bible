// Which TypeScript files of a package its tsconfig's program leaves out, so
// `tsc --noEmit` never checks them, and which are declaration files, whose own
// errors `skipLibCheck` hides.

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

/**
 * A declaration file, by TypeScript's rule (`GetDeclarationFileExtension`): its
 * base name ends `.d.ts`, `.d.mts` or `.d.cts`, or ends `.ts` and holds `.d.`
 * anywhere (`style.d.css.ts`). Case counts; the directories do not.
 */
const isDeclaration = (file: string) => {
  const base = file.slice(file.lastIndexOf('/') + 1);
  return /\.d\.[cm]?ts$/.test(base) || (base.endsWith('.ts') && base.includes('.d.'));
};

/** The declaration files of `files`, outside installed packages, sorted. */
export const declarations = (files: ReadonlyArray<string>) =>
  files.filter((file) => isDeclaration(file) && !installed(file)).toSorted();
