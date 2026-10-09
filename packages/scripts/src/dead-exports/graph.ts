// The export graph the dead-export check reads: each module's exports and
// what it takes from other modules, as the parser (oxc) reads them, so a
// comment or a string that looks like code names nothing. A namespace import
// and an `import()` take a module whole; a named re-export (`export { x } from`,
// `export * as ns from`) and an `export * from` pass a take through, so they
// take only what their own users take, and so does an import the module only
// exports again (`import { x } from …; export { x }`); a default is the name
// `default`, taken by a default import. A take counts only from a module a
// root reaches.

import { Array as Arr, Equivalence, Option, Order } from 'effect';
import {
  type ExportExportName,
  type ExportImportName,
  type ImportName,
  type Program,
  Visitor,
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

type StaticImport = Parsed['staticImports'][number];
type ImportEntry = StaticImport['entries'][number];
type ExportEntry = Parsed['staticExports'][number]['entries'][number];

/** Whether a statement only names its bindings to bring them in or pass them on: an import, `export { x }` and `export default x`. */
const namesOnly = (statement: Program['body'][number]): boolean => {
  if (statement.type === 'ImportDeclaration') return true;
  if (statement.type === 'ExportNamedDeclaration')
    return Option.isNone(Option.fromNullishOr(statement.declaration));
  if (statement.type === 'ExportDefaultDeclaration')
    return statement.declaration.type === 'Identifier';
  return false;
};

/**
 * Every name the module's own code mentions: each identifier outside the
 * statements that only bring a binding in or pass it on. A mention that
 * shadows an import, or a property of the same name, still counts, so the
 * check errs toward alive.
 */
const mentionsOf = (program: Program): ReadonlySet<string> => {
  const found = new Set<string>();
  new Visitor({
    Identifier: (node) => void found.add(node.name),
    JSXIdentifier: (node) => void found.add(node.name),
  }).visit({ ...program, body: program.body.filter((statement) => !namesOnly(statement)) });
  return found;
};

/** Whether `exported` passes on the binding `entry` of import `i`: `export { x }` of it, or `export default x`. */
const passesBinding = (i: StaticImport, entry: ImportEntry, exported: ExportEntry): boolean =>
  Option.match(Option.fromNullishOr(exported.moduleRequest), {
    onNone: () => exported.localName.name === entry.localName.value,
    // The parser reads `import { x } …; export { x }` as `export { x } from …`.
    onSome: (request) =>
      request.value === i.moduleRequest.value &&
      entry.importName.kind !== 'NamespaceObject' &&
      Option.makeEquivalence(Equivalence.String)(
        nameOf(exported.importName),
        nameOf(entry.importName),
      ),
  });

/** The names the module's own code mentions, read from its syntax tree only when it exports an import again. */
const mentionsFor = (parsed: ReturnType<typeof parseSync>): ReadonlySet<string> => {
  const exported = parsed.module.staticExports.flatMap((e) => e.entries);
  const passes = parsed.module.staticImports.some((i) =>
    i.entries.some((entry) => exported.some((e) => passesBinding(i, entry, e))),
  );
  if (!passes) return new Set();
  return mentionsOf(parsed.program);
};

/**
 * An `import … from`: the names the module's own code uses, or the module
 * whole for a used `import * as`. A binding the module only exports again
 * takes nothing itself: its export passes a take through like `export { x }
 * from`, so it takes only what its own name's users take.
 */
const importTake = (
  i: StaticImport,
  exported: ReadonlyArray<ExportEntry>,
  mentions: ReadonlySet<string>,
): Take => {
  const used = i.entries.filter(
    (entry) =>
      !exported.some((e) => passesBinding(i, entry, e)) || mentions.has(entry.localName.value),
  );
  if (used.some((e) => e.importName.kind === 'NamespaceObject'))
    return { from: i.moduleRequest.value, names: Option.none() };
  return {
    from: i.moduleRequest.value,
    names: Option.some(used.flatMap((e) => Option.toArray(nameOf(e.importName)))),
  };
};

/** The re-exports `export { x }` and `export default x` make of an imported binding `x` (the parser keeps them local). */
const forwardsOf = (
  imports: ReadonlyArray<StaticImport>,
  exported: ReadonlyArray<ExportEntry>,
): ReadonlyArray<Reexport> =>
  exported
    .filter((e) => Option.isNone(Option.fromNullishOr(e.moduleRequest)))
    .flatMap((e) =>
      imports.flatMap((i) =>
        i.entries
          .filter((entry) => passesBinding(i, entry, e))
          .flatMap((entry) =>
            Option.toArray(
              Option.map(nameOf(e.exportName), (name): Reexport => ({
                from: i.moduleRequest.value,
                // None for `import * as`: the export passes the module whole.
                imported: nameOf(entry.importName),
                name,
              })),
            ),
          ),
      ),
    );

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
  const parsed = parseSync(file, source, { lang: langOf(file), sourceType: 'module' });
  const { module } = parsed;
  const entries = module.staticExports.flatMap((e) => e.entries);
  const mentions = mentionsFor(parsed);
  return {
    exports: entries.flatMap((e) => Option.toArray(nameOf(e.exportName))),
    takes: [
      ...module.staticImports.map((i) => importTake(i, entries, mentions)),
      ...module.dynamicImports.flatMap((d) => dynamicTake(source, d)),
    ],
    reexports: [...entries.flatMap(reexportOf), ...forwardsOf(module.staticImports, entries)],
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
