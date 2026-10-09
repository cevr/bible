// The export graph the dead-export check reads: each module's exports and
// what it takes from other modules, as the parser (oxc) reads them, so a
// comment or a string that looks like code names nothing. A namespace import,
// an `import()` and an `export * as` take a module whole; an `export * from`
// passes a name through; a default is the name `default`, taken by a default import.

import { Array as Arr, Option, Order } from 'effect';
import {
  type ExportExportName,
  type ExportImportName,
  type ImportName,
  parseSync,
} from 'oxc-parser';

/** What one import or re-export takes from `from`: some of its names, or (None) the module whole. */
export interface Take {
  readonly from: string;
  readonly names: Option.Option<ReadonlyArray<string>>;
}

/** A module's imports and exports. */
export interface ModuleRecord {
  /** The names it exports (as renamed): declarations, `export { … }` and re-exports. */
  readonly exports: ReadonlyArray<string>;
  /** Its `import`s, `import()`s and `export … from`s. */
  readonly takes: ReadonlyArray<Take>;
  /** Its `export * from` sources: a name taken from it is taken from them too. */
  readonly stars: ReadonlyArray<string>;
}

type Parsed = ReturnType<typeof parseSync>['module'];

/** A name as an import or export entry spells it; a default is `default`. */
const nameOf = (entry: ImportName | ExportImportName | ExportExportName): Option.Option<string> => {
  if (entry.kind === 'Default') return Option.some('default');
  return Option.fromNullishOr(entry.name);
};

/** An `import … from`: its names, or the module whole for `import * as`. */
const importTake = (i: Parsed['staticImports'][number]): Take => {
  if (i.entries.some((e) => e.importName.kind === 'NamespaceObject'))
    return { from: i.moduleRequest.value, names: Option.none() };
  return {
    from: i.moduleRequest.value,
    names: Option.some(i.entries.flatMap((e) => Option.toArray(nameOf(e.importName)))),
  };
};

/** An `export … from` but `export *`: its one name, or the module whole for `export * as`. */
const reexportTake = (e: Parsed['staticExports'][number]['entries'][number]): ReadonlyArray<Take> =>
  Option.toArray(
    Option.map(
      Option.filter(
        Option.fromNullishOr(e.moduleRequest),
        () => e.importName.kind !== 'AllButDefault',
      ),
      (request): Take => ({
        from: request.value,
        names: Option.map(nameOf(e.importName), (name) => [name]),
      }),
    ),
  );

/** How the parser reads `file`: JSX only in a `.tsx`. */
const langOf = (file: string): 'ts' | 'tsx' => {
  if (file.endsWith('.tsx')) return 'tsx';
  return 'ts';
};

/** An `import('…')` with a literal specifier: the module whole. */
const dynamicTake = (source: string, d: Parsed['dynamicImports'][number]): ReadonlyArray<Take> =>
  Option.toArray(
    Option.map(
      Option.fromNullishOr(
        /^['"`]([^'"`]*)['"`]$/.exec(source.slice(d.moduleRequest.start, d.moduleRequest.end))?.[1],
      ),
      (from): Take => ({ from, names: Option.none() }),
    ),
  );

/** `file`'s exports and takes, read from its `source`. */
export const recordOf = (file: string, source: string): ModuleRecord => {
  const { module } = parseSync(file, source, { lang: langOf(file), sourceType: 'module' });
  const entries = module.staticExports.flatMap((e) => e.entries);
  return {
    exports: entries.flatMap((e) => Option.toArray(nameOf(e.exportName))),
    takes: [
      ...module.staticImports.map(importTake),
      ...entries.flatMap(reexportTake),
      ...module.dynamicImports.flatMap((d) => dynamicTake(source, d)),
    ],
    stars: entries.flatMap((e) =>
      Option.toArray(
        Option.filter(
          Option.map(Option.fromNullishOr(e.moduleRequest), (r) => r.value),
          () => e.importName.kind === 'AllButDefault',
        ),
      ),
    ),
  };
};

/** The key a module is marked used under when something takes it whole. */
const WHOLE = '*';

/** Where a specifier points: a file of the workspace (relative to its root), or none (a dependency). */
export type Resolve = (user: string, from: string) => Option.Option<string>;

/** The workspace: each file's record, who may consume, what is checked, and what is public. */
export interface Workspace {
  readonly records: ReadonlyMap<string, ModuleRecord>;
  readonly resolve: Resolve;
  /** Whether `file` is code that uses its imports for real (not a test, a fixture or a lint rule). */
  readonly consumes: (file: string) => boolean;
  /** Whether `file`'s exports are checked. */
  readonly checked: (file: string) => boolean;
  /** A file whose exports are public API, by the reason it is. */
  readonly entries: ReadonlyMap<string, string>;
}

/**
 * Every `module#name` another consuming module takes, a name taken from a
 * module that passes it on (`export *`) taken from the module behind it too,
 * and `module#*` for a module taken whole.
 */
const takenNames = (workspace: Workspace): ReadonlySet<string> => {
  const { records, resolve, consumes } = workspace;
  const stars = new Map<string, ReadonlyArray<string>>(
    [...records].map(([file, record]) => [
      file,
      record.stars.flatMap((from) => Option.toArray(resolve(file, from))),
    ]),
  );
  const used = new Set<string>();
  const mark = (module: string, name: string, seen: ReadonlySet<string>): void => {
    used.add(`${module}#${name}`);
    for (const star of Option.getOrElse(Option.fromUndefinedOr(stars.get(module)), () => []))
      if (!seen.has(star)) mark(star, name, new Set([...seen, module]));
  };
  for (const [user, record] of records)
    if (consumes(user))
      for (const { names, from } of record.takes)
        for (const module of Option.toArray(resolve(user, from)))
          if (module !== user)
            for (const name of Option.getOrElse(names, () => [WHOLE]))
              mark(module, name, new Set());
  return used;
};

/**
 * Each export of a checked module that no other consuming module takes, as
 * `file name`: a name its own file alone reads, or only a test reads, is
 * not exported. A public entry's names stand for their users beyond the
 * workspace.
 */
export const deadExports = (workspace: Workspace): ReadonlyArray<string> => {
  const { records, checked, entries } = workspace;
  const used = takenNames(workspace);
  return Arr.sort(
    [...records]
      .filter(([file]) => checked(file) && !entries.has(file))
      .flatMap(([file, record]) =>
        record.exports
          .filter((name) => !used.has(`${file}#${name}`) && !used.has(`${file}#${WHOLE}`))
          .map((name) => `${file} ${name}`),
      ),
    Order.String,
  );
};
