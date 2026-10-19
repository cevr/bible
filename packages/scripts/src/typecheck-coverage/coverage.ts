// Which TypeScript files of a package its tsconfig's program leaves out, so
// `tsc --noEmit` never checks them, and which program files are declaration
// files, whose own errors `skipLibCheck` hides. A file is known by its disk
// spelling, its real path: tsc may spell a program file otherwise (a relative
// import on a disk that folds case, a path through a symlink), and so may the
// package's listing (a symlinked source). TypeScript's rule reads tsc's
// spelling.

/** A TypeScript source, by its extension (a declaration file included). */
const isTypeScript = (file: string) => /\.(?:[cm]?ts|tsx)$/.test(file);

/** A path inside an installed package, which no program of ours is meant to check. */
const installed = (file: string) => file.split('/').includes('node_modules');

/** A listed TypeScript file outside installed packages: one the program must hold. */
export const isSource = (file: string) => isTypeScript(file) && !installed(file);

/** A path relative to the package that leaves it. */
const outside = (file: string) => file === '..' || file.startsWith('../');

/** The files `tsc --listFilesOnly` prints, one path a line. */
export const listedFiles = (stdout: string) =>
  stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

/** A file of the package's listing: its listed path, and its real path. */
interface ListedFile {
  readonly listed: string;
  readonly disk: string;
}

/**
 * The listed paths of the sources in `files` (each one `isSource` holds) whose
 * real path no file of `program` has, sorted; `program` holds real paths.
 * Every path is relative to the package, with `/` between its parts.
 */
export const uncovered = (files: ReadonlyArray<ListedFile>, program: ReadonlyArray<string>) => {
  const held = new Set(program);
  return files
    .filter(({ disk }) => !held.has(disk))
    .map(({ listed }) => listed)
    .toSorted();
};

/**
 * A declaration file, by TypeScript's rule (`GetDeclarationFileExtension`) on
 * the name as tsc spells it: its base name ends `.d.ts`, `.d.mts` or `.d.cts`,
 * or ends `.ts` and holds `.d.` anywhere (`style.d.css.ts`). Case counts; the
 * directories do not.
 */
const isDeclaration = (spelled: string) => {
  const base = spelled.slice(spelled.lastIndexOf('/') + 1);
  return /\.d\.[cm]?ts$/.test(base) || (base.endsWith('.ts') && base.includes('.d.'));
};

/**
 * A file of tsc's program: tsc's spelling of it, as tsc prints it, and the
 * disk's (its real path), relative to the package with `/` between its parts.
 */
interface ProgramFile {
  readonly spelled: string;
  readonly disk: string;
}

/**
 * The declaration files of `program` that belong to the package, each named by
 * its disk spelling, sorted: TypeScript's rule holds on tsc's spelling, and
 * the disk spelling, relative to the package, is under it and outside
 * installed packages.
 */
export const declarations = (program: ReadonlyArray<ProgramFile>) => [
  ...new Set(
    program
      .filter(({ spelled, disk }) => isDeclaration(spelled) && !outside(disk) && !installed(disk))
      .map(({ disk }) => disk)
      .toSorted(),
  ),
];
