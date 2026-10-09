// The export graph the dead-export check reads: each module's exports and
// what it takes from other modules, as the parser (oxc) reads them, so a
// comment or a string that looks like code names nothing. A namespace import
// and an `import()` take a module whole; a named re-export (`export { x } from`,
// `export * as ns from`) and an `export * from` pass a take through, so they
// take only what their own users take; a default is the name `default`, taken
// by a default import. A take counts only from a module a root reaches.

import { Array as Arr, Option, Order } from 'effect';
import {
  type ExportExportName,
  type ExportImportName,
  type ImportName,
  parseSync,
} from 'oxc-parser';

/** What one import takes from `from`: some of its names, or (None) the module whole. */
interface Take {
  readonly from: string;
  readonly names: Option.Option<ReadonlyArray<string>>;
}

/** An `export { imported as name } from from`, or (`imported` None) `export * as name from from`. */
interface Reexport {
  readonly from: string;
  readonly imported: Option.Option<string>;
  readonly name: string;
}

/** A module's imports and exports. */
export interface ModuleRecord {
  /** The names it exports (as renamed): declarations, `export { … }` and re-exports. */
  readonly exports: ReadonlyArray<string>;
  /** Its `import`s and `import()`s. */
  readonly takes: ReadonlyArray<Take>;
  /** Its named re-exports: each takes only what its own name's users take. */
  readonly reexports: ReadonlyArray<Reexport>;
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

/** An `export … from` but `export *`: the one name it passes on, or the module whole for `export * as`. */
const reexportOf = (
  e: Parsed['staticExports'][number]['entries'][number],
): ReadonlyArray<Reexport> =>
  Option.toArray(
    Option.flatMap(
      Option.filter(
        Option.fromNullishOr(e.moduleRequest),
        () => e.importName.kind !== 'AllButDefault',
      ),
      (request) =>
        Option.map(nameOf(e.exportName), (name): Reexport => ({
          from: request.value,
          imported: nameOf(e.importName),
          name,
        })),
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
      ...module.dynamicImports.flatMap((d) => dynamicTake(source, d)),
    ],
    reexports: entries.flatMap(reexportOf),
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

/** The workspace: each file's record, who may consume, what is checked, and where it is run from. */
export interface Workspace {
  readonly records: ReadonlyMap<string, ModuleRecord>;
  readonly resolve: Resolve;
  /** Whether `file` is code that uses its imports for real (not a test, a fixture or a lint rule). */
  readonly consumes: (file: string) => boolean;
  /** Whether `file`'s exports are checked. */
  readonly checked: (file: string) => boolean;
  /**
   * The files something outside the module graph runs: an app, a bin, a
   * script, a worker. A root that is not checked has its exports loaded whole.
   */
  readonly roots: ReadonlySet<string>;
}

/** The modules `file` imports, re-exports or passes through; none for a file that is no consumer. */
const reachesFrom = (workspace: Workspace, file: string): ReadonlyArray<string> => {
  const { records, resolve, consumes } = workspace;
  return Option.match(Option.fromUndefinedOr(records.get(file)), {
    onNone: () => [],
    onSome: (record) => {
      if (!consumes(file)) return [];
      return [
        ...record.takes.map((t) => t.from),
        ...record.reexports.map((r) => r.from),
        ...record.stars,
      ].flatMap((from) => Option.toArray(resolve(file, from)));
    },
  });
};

/** Every module a consuming module reachable from the roots imports, re-exports or passes through. */
const reachable = (workspace: Workspace): ReadonlySet<string> => {
  const reached = new Set<string>();
  const visit = (file: string): void => {
    if (reached.has(file)) return;
    reached.add(file);
    for (const module of reachesFrom(workspace, file)) visit(module);
  };
  for (const root of workspace.roots) visit(root);
  return reached;
};

/** What a name taken from `module` also takes from the modules that pass it on. */
const passedOn = (
  { records, resolve }: Workspace,
  module: string,
  name: string,
): ReadonlyArray<readonly [module: string, name: string]> =>
  Option.match(Option.fromUndefinedOr(records.get(module)), {
    onNone: () => [],
    onSome: (record) => [
      ...record.stars.flatMap((star) =>
        Option.toArray(Option.map(resolve(module, star), (behind) => [behind, name] as const)),
      ),
      ...record.reexports
        .filter((reexport) => name === WHOLE || reexport.name === name)
        .flatMap((reexport) =>
          Option.toArray(
            Option.map(
              resolve(module, reexport.from),
              (behind) => [behind, Option.getOrElse(reexport.imported, () => WHOLE)] as const,
            ),
          ),
        ),
    ],
  });

/** Each `module, name` that a consuming module in `reached` imports from another module. */
const importsOf = (
  workspace: Workspace,
  reached: ReadonlySet<string>,
): ReadonlyArray<readonly [module: string, name: string]> =>
  [...workspace.records]
    .filter(([user]) => reached.has(user) && workspace.consumes(user))
    .flatMap(([user, record]) =>
      record.takes.flatMap(({ names, from }) =>
        Option.toArray(workspace.resolve(user, from))
          .filter((module) => module !== user)
          .flatMap((module) =>
            Option.getOrElse(names, () => [WHOLE]).map((name) => [module, name] as const),
          ),
      ),
    );

/**
 * Every `module#name` a consuming module reachable from a root takes, a name
 * taken from a module that passes it on (`export *`, `export { x } from`)
 * taken from the module behind it too, and `module#*` for a module taken whole.
 */
const takenNames = (workspace: Workspace): ReadonlySet<string> => {
  const { consumes, checked, roots } = workspace;
  const used = new Set<string>();
  const mark = (module: string, name: string): void => {
    const key = `${module}#${name}`;
    if (used.has(key)) return;
    used.add(key);
    for (const [behind, taken] of passedOn(workspace, module, name)) mark(behind, taken);
  };
  // What runs a root outside the checked source loads its exports whole: an
  // app's `lab.server.tsx` is read for its default, a re-export of a framework page.
  for (const root of roots) if (consumes(root) && !checked(root)) mark(root, WHOLE);
  for (const [module, name] of importsOf(workspace, reachable(workspace))) mark(module, name);
  return used;
};

/**
 * Each export of a checked module that no other consuming module reachable
 * from a root takes, as `file name`: a name its own file alone reads, or only
 * a test reads, or only an unreachable cycle reads, is not exported. A
 * package's entry is checked like any module: every package is private, so
 * its exports have no user beyond the workspace.
 */
export const deadExports = (workspace: Workspace): ReadonlyArray<string> => {
  const { records, checked } = workspace;
  const used = takenNames(workspace);
  return Arr.sort(
    [...records]
      .filter(([file]) => checked(file))
      .flatMap(([file, record]) =>
        record.exports
          .filter((name) => !used.has(`${file}#${name}`) && !used.has(`${file}#${WHOLE}`))
          .map((name) => `${file} ${name}`),
      ),
    Order.String,
  );
};
