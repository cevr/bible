import { describe, expect, it } from 'bun:test';
import { BunServices } from '@effect/platform-bun';
import { Effect, FileSystem, Match, Option, Schema, Stream } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

import { check } from './check.js';
import { tscScript } from './tsc.js';

const encodeTsconfig = Schema.encodeEffect(
  Schema.fromJsonString(
    Schema.Struct({
      compilerOptions: Schema.Struct({
        noEmit: Schema.Boolean,
        skipLibCheck: Schema.Boolean,
        strict: Schema.Boolean,
        module: Schema.String,
        moduleResolution: Schema.String,
        preserveSymlinks: Schema.Boolean,
        types: Schema.Array(Schema.String),
      }),
      include: Schema.Array(Schema.String),
      files: Schema.optionalKey(Schema.Array(Schema.String)),
    }),
  ),
);

/** A package in a temp dir, and what lies beside it. */
interface Fixture {
  /** The package's directory name in the temp dir. */
  readonly root?: string;
  /** The package's files, relative to it. */
  readonly files: Record<string, string>;
  /** Its tsconfig's `files` entry; its wildcard reads `**\/*.ts` either way. */
  readonly listed?: ReadonlyArray<string>;
  /** Files beside the package, relative to the temp dir. */
  readonly elsewhere?: Record<string, string>;
  /** Symlinks, each a path to its target, both relative to the temp dir. */
  readonly links?: Record<string, string>;
  /** Its tsconfig's `preserveSymlinks`. */
  readonly preserveSymlinks?: boolean;
}

const directoryOf = (file: string) => file.slice(0, file.lastIndexOf('/'));

const write = (at: string, source: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.makeDirectory(directoryOf(at), { recursive: true });
    yield* fs.writeFileString(at, source);
  });

const fixture = ({
  root: name = 'pkg',
  files,
  listed,
  elsewhere = {},
  links = {},
  preserveSymlinks = false,
}: Fixture) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const root = `${dir}/${name}`;
    yield* fs.makeDirectory(root);
    const compilerOptions = {
      noEmit: true,
      skipLibCheck: true,
      strict: true,
      module: 'ESNext',
      moduleResolution: 'bundler',
      preserveSymlinks,
      types: [],
    };
    yield* fs.writeFileString(
      `${root}/tsconfig.json`,
      yield* encodeTsconfig({
        compilerOptions,
        include: ['**/*.ts'],
        ...Option.match(Option.fromNullishOr(listed), {
          onNone: () => ({}),
          onSome: (entry) => ({ files: entry }),
        }),
      }),
    );
    const writes = [
      ...Object.entries(files).map(([file, source]) => [`${root}/${file}`, source] as const),
      ...Object.entries(elsewhere).map(([file, source]) => [`${dir}/${file}`, source] as const),
    ];
    yield* Effect.forEach(writes, ([file, source]) => write(file, source), { concurrency: 32 });
    for (const [link, target] of Object.entries(links)) {
      yield* fs.makeDirectory(directoryOf(`${dir}/${link}`), { recursive: true });
      yield* fs.symlink(`${dir}/${target}`, `${dir}/${link}`);
    }
    return root;
  });

const verdict = (files: Record<string, string>) =>
  fixture({ files }).pipe(Effect.flatMap(check), Effect.flip, Effect.scoped);

const text = <E>(stream: Stream.Stream<Uint8Array, E>) =>
  Stream.mkString(Stream.decodeText(stream));

/**
 * `tsc --noEmit` over the package at `root`: whether it exits non-zero, and
 * each line of its errors, at a place in a file or not.
 */
const tscOver = (root: string) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner;
    const child = yield* spawner.spawn(
      ChildProcess.make(process.execPath, [yield* tscScript, '-p', '.', '--pretty', 'false'], {
        cwd: root,
        forceKillAfter: '5 seconds',
      }),
    );
    const [stdout, , code] = yield* Effect.all(
      [text(child.stdout), text(child.stderr), child.exitCode],
      { concurrency: 3 },
    );
    const errors = stdout.split('\n').filter((line) => /(?:^|: )error TS\d+/.test(line));
    return { refused: Number(code) !== 0, errors };
  }).pipe(Effect.scoped);

/** Each error tsc reports at a place in a file, as `<file> <code>`, the file as tsc spells it. */
const located = (errors: ReadonlyArray<string>) =>
  errors.flatMap((line) =>
    Option.toArray(
      Option.map(
        Option.fromNullishOr(/^(.*)\(\d+,\d+\): error (TS\d+)/.exec(line)),
        (match) => `${String(match[1])} ${String(match[2])}`,
      ),
    ),
  );

/** The check's verdict, said in a line. */
const said = (outcome: Option.Option<Effect.Error<ReturnType<typeof check>>>) =>
  Option.match(outcome, {
    onNone: () => 'pass',
    onSome: Match.valueTags({
      Unchecked: (error) => `Unchecked ${error.files.join(' ')}`,
      Uncovered: (error) => `Uncovered ${error.files.join(' ')}`,
      ListFailed: (error) => error._tag,
      PlatformError: (error) => error._tag,
      SchemaError: (error) => error._tag,
    }),
  });

/** The package's typecheck over one fixture: tsc's answer, and the check's verdict. */
const typecheck = (setup: Fixture) =>
  Effect.gen(function* () {
    const root = yield* fixture(setup);
    const [tsc, outcome] = yield* Effect.all(
      [tscOver(root), check(root).pipe(Effect.flip, Effect.option)],
      { concurrency: 2 },
    );
    return { tsc, check: said(outcome) };
  }).pipe(Effect.scoped);

/** A way a disk can find a name under another spelling. */
type Fold = 'case' | 'long s' | 'normalization';

const folds: ReadonlyArray<Fold> = ['case', 'long s', 'normalization'];

/** Which folds the temp dir's file system makes: it finds `found` as `asked`. */
const foldsOfTempDir = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const dir = yield* fs.makeTempDirectoryScoped();
  const folds = (found: string, asked: string) =>
    Effect.gen(function* () {
      yield* fs.writeFileString(`${dir}/${found}`, '');
      return yield* fs.exists(`${dir}/${asked}`);
    });
  return {
    case: yield* folds('probe', 'PROBE'),
    'long s': yield* folds('xſ', 'xs'),
    normalization: yield* folds('café', 'café'),
  } satisfies Record<Fold, boolean>;
}).pipe(Effect.scoped);

const importer = (specifier: string) =>
  `import { broken } from '${specifier}';\nexport const used: string = broken;\n`;
const declaration = 'export declare const broken: NotAType;\n';

describe('the coverage check over a package', () => {
  it("names a nested file that tsc's wildcard skips", () =>
    Effect.gen(function* () {
      // tsc's `**` skips dot-directories, so only a walk of every level finds it.
      const error = yield* verdict({
        'src/a.ts': 'export const a = 1;\n',
        'src/.hidden/x.ts': 'export const x = 1;\n',
      });
      expect(error._tag).toBe('Uncovered');
      expect(error._tag === 'Uncovered' && error.files).toEqual(['src/.hidden/x.ts']);
    }).pipe(Effect.provide(BunServices.layer), Effect.runPromise));

  it('refuses a declaration file in the program', () =>
    Effect.gen(function* () {
      const error = yield* verdict({
        'src/a.ts': 'export const a = 1;\n',
        'src/decl.d.ts': 'export declare const broken: string;\n',
      });
      expect(error._tag).toBe('Unchecked');
      expect(error._tag === 'Unchecked' && error.files).toEqual(['src/decl.d.ts']);
    }).pipe(Effect.provide(BunServices.layer), Effect.runPromise));

  it("refuses a declaration file by the rule's wider form", () =>
    Effect.gen(function* () {
      const error = yield* verdict({
        'src/a.ts': 'export const a = 1;\n',
        'src/style.d.css.ts': 'export declare const broken: NotAType;\n',
      });
      expect(error._tag).toBe('Unchecked');
      expect(error._tag === 'Unchecked' && error.files).toEqual(['src/style.d.css.ts']);
    }).pipe(Effect.provide(BunServices.layer), Effect.runPromise));

  it('passes symlinked sources that tsc checks, and a declaration file whose real path is outside the package or inside node_modules', () =>
    Effect.gen(function* () {
      const outcome = yield* typecheck({
        files: {
          'src/real.ts': 'export const real = 1;\n',
          'node_modules/x/index.d.ts': 'export declare const d: string;\n',
        },
        elsewhere: {
          'outside/lib/x.ts': 'export const x = 1;\n',
          'outside/types.d.ts': 'export declare const t: string;\n',
        },
        links: {
          'pkg/src/alias.ts': 'pkg/src/real.ts',
          'pkg/src/vendor': 'outside/lib',
          'pkg/src/types.d.ts': 'outside/types.d.ts',
          'pkg/src/dep.d.ts': 'pkg/node_modules/x/index.d.ts',
        },
      });
      expect(outcome).toEqual({ tsc: { refused: false, errors: [] }, check: 'pass' });
    }).pipe(Effect.provide(BunServices.layer), Effect.runPromise));

  it('passes a dangling link inside node_modules, which no program reads', () =>
    Effect.gen(function* () {
      const outcome = yield* typecheck({
        files: { 'src/a.ts': 'export const a = 1;\n' },
        links: { 'pkg/node_modules/x/gone.ts': 'pkg/node_modules/x/nowhere.ts' },
      });
      expect(outcome).toEqual({ tsc: { refused: false, errors: [] }, check: 'pass' });
    }).pipe(Effect.provide(BunServices.layer), Effect.runPromise));
});

/*
 * The census. A program file is the package's when its real path is under the
 * root and outside `node_modules`: the rule has two edges. tsc can spell a
 * package file across either edge, and fold a part of its name, so the census
 * is generated. A cell is an edge (or none), a way tsc crosses it, and a
 * spelling: the disk's own, or one part of the name (the head, a directory,
 * the base name, the extension) folded by case, the long s or normalization.
 * It runs with each loader its way allows (an import, a reference, a `files`
 * entry), and a folded extension with each form of the rule. A cell loads a
 * declaration file whose own error `skipLibCheck` hides, from a dot-directory
 * (`src/.c`) that tsc's wildcard skips, so the cell's route is the one way the
 * file enters the program; the cells share one program. Where the host's disk
 * makes a cell's fold, the check must name the file by its disk spelling;
 * where it does not, tsc must refuse it. A cell no host can express is named,
 * with why.
 */

/** The package's directory name, and the directory and base name of each cell's file. Each holds a capital, a long s and a composed é, so one name answers every fold. */
const packageName = 'Pſé';
const directoryName = 'Dſé';
const baseName = 'Bſé';

/** A link beside the package; one in a `node_modules` above it; one in its own `node_modules`. */
const outsideLink = 'Oſé';
const aboveLink = 'Uſé';
const installedLink = 'Iſé';

/** The links the ways cross by, each to the cells' directory, relative to the temp dir. */
const censusLinks = {
  [outsideLink]: `${packageName}/src/.c`,
  [`node_modules/${aboveLink}`]: `${packageName}/src/.c`,
  [`${packageName}/node_modules/${installedLink}`]: `${packageName}/src/.c`,
};

/** Why no host can express a cell. */
const climbsNoLink =
  'tsc drops each `..` from its spelling, so a path keeps no `node_modules` part it climbs out of; only a link leaves one';
const rootUnspelled =
  "tsc spells the root as the tsconfig's own path, so only a path that leaves the package spells it";
const extensionUndecomposed = 'no TypeScript extension holds a letter that decomposes';

/** How a package leads tsc to a file. */
type Loader = 'import' | 'reference' | 'files entry';

/** Where the cells' directory, `src/.c`, is found from one way. */
interface Cells {
  /** The root, or the link, that tsc's spelling passes through, as the disk stores it. */
  readonly head: string;
  /** The cells' directory as the package names it, given the head as spelled: a path relative to the root, or a bare name. */
  readonly path: (head: string) => string;
  /** The loaders that can name it. */
  readonly loaders: ReadonlyArray<Loader>;
  /** The name an importer in `src` gives for a name the package gives. */
  readonly fromSource: (name: string) => string;
}

/** A path relative to the root: any loader names it; an importer in `src` climbs to the root first. */
const byPath = (head: string, path: (head: string) => string): Cells => ({
  head,
  path,
  loaders: ['import', 'reference', 'files entry'],
  fromSource: (name) => `../${name}`,
});

/** A bare name: only an import names it. */
const byBareName = (head: string): Cells => ({
  head,
  path: (spelled) => spelled,
  loaders: ['import'],
  fromSource: (name) => name,
});

/** One way tsc reaches the cells' directory across one edge, or why no way can. */
interface Way {
  readonly edge: 'no edge' | 'the root' | 'node_modules';
  readonly crossing:
    | 'a path in the package'
    | 'a climbing path'
    | 'a link by path'
    | 'a link by bare name';
  readonly cells: Option.Option<Cells>;
  /** Why no host can express the way, when it has no cells. */
  readonly why: string;
}

const ways: ReadonlyArray<Way> = [
  {
    edge: 'no edge',
    crossing: 'a path in the package',
    cells: Option.some(byPath(packageName, () => 'src/.c')),
    why: '',
  },
  {
    edge: 'the root',
    crossing: 'a climbing path',
    cells: Option.some(byPath(packageName, (head) => `../${head}/src/.c`)),
    why: '',
  },
  {
    edge: 'the root',
    crossing: 'a link by path',
    cells: Option.some(byPath(outsideLink, (head) => `../${head}`)),
    why: '',
  },
  {
    edge: 'the root',
    crossing: 'a link by bare name',
    cells: Option.some(byBareName(aboveLink)),
    why: '',
  },
  {
    edge: 'node_modules',
    crossing: 'a climbing path',
    cells: Option.none(),
    why: climbsNoLink,
  },
  {
    edge: 'node_modules',
    crossing: 'a link by path',
    cells: Option.some(byPath(installedLink, (head) => `node_modules/${head}`)),
    why: '',
  },
  {
    edge: 'node_modules',
    crossing: 'a link by bare name',
    cells: Option.some(byBareName(installedLink)),
    why: '',
  },
];

/** The part of tsc's spelling a fold changes: the head is the root, or the link tsc passes through. */
type Part = 'head' | 'directory' | 'base name' | 'extension';

const parts: ReadonlyArray<Part> = ['head', 'directory', 'base name', 'extension'];

/** How tsc spells a stored name under one fold. */
const refold = (stored: string, fold: Fold) =>
  Match.value(fold).pipe(
    Match.when('case', () => stored.toLowerCase()),
    Match.when('long s', () => stored.replaceAll('ſ', 's')),
    Match.when('normalization', () => stored.normalize('NFD')),
    Match.exhaustive,
  );

/** The forms of TypeScript's rule, each with the extension an import names it by. */
const forms = [
  { form: '.d.ts', imported: '.js' },
  { form: '.d.mts', imported: '.mjs' },
  { form: '.d.cts', imported: '.cjs' },
  { form: '.d.css.ts', imported: '.d.css.js' },
];

/** A `.d.ts` file the disk stores as tsc spells it. */
const plain = { form: '.d.ts', imported: '.js', stored: '.d.ts' };

/**
 * What a disk may store for a form that tsc asks for in lower case, under one
 * fold: each run of letters capitalised in turn; the last `s` long.
 */
const storedExtensions = (form: string, fold: Fold): ReadonlyArray<string> =>
  Match.value(fold).pipe(
    Match.when('case', () => {
      const runs = form.split('.');
      return runs
        .map((run, index) => runs.with(index, run.toUpperCase()).join('.'))
        .filter((stored) => stored !== form);
    }),
    Match.when('long s', () => {
      const at = form.lastIndexOf('s');
      return [`${form.slice(0, at)}ſ${form.slice(at + 1)}`];
    }),
    Match.when('normalization', () => []),
    Match.exhaustive,
  );

/** A spelling: the disk's own, or one part folded. */
type Spelling = Option.Option<{ readonly part: Part; readonly fold: Fold }>;

const spellings: ReadonlyArray<Spelling> = [
  Option.none(),
  ...parts.flatMap((part) => folds.map((fold) => Option.some({ part, fold }))),
];

const spellingName = (spelling: Spelling) =>
  Option.match(spelling, {
    onNone: () => 'as stored',
    onSome: ({ part, fold }) => `${part} by ${fold}`,
  });

/** Why no host can express a cell, or none: the cell runs. */
const unexpressed = (way: Way, spelling: Spelling) =>
  Option.match(way.cells, {
    onNone: () => Option.some(way.why),
    onSome: () =>
      Option.flatMap(spelling, ({ part, fold }) =>
        Match.value({ part, fold, edge: way.edge }).pipe(
          Match.when({ part: 'head', edge: 'no edge' }, () => Option.some(rootUnspelled)),
          Match.when({ part: 'extension', fold: 'normalization' }, () =>
            Option.some(extensionUndecomposed),
          ),
          Match.orElse(() => Option.none<string>()),
        ),
      ),
  });

/** One run of a cell: a loader, a form and what the disk stores. */
interface Case {
  readonly name: string;
  readonly id: string;
  /** The folds a disk must make for tsc to find the file. */
  readonly folds: ReadonlyArray<Fold>;
  /** The declaration file as the disk stores it, relative to the root. */
  readonly disk: string;
  /** The package's files for this case, relative to the root. */
  readonly files: Record<string, string>;
  readonly listed: ReadonlyArray<string>;
}

/** One cell of the census: an edge, a way tsc crosses it, a spelling. */
interface Cell {
  readonly way: Way;
  readonly spelling: Spelling;
}

const cellName = ({ way, spelling }: Cell) =>
  `${way.edge}, ${way.crossing}, ${spellingName(spelling)}`;

/** A stored name as the cell's spelling spells it. */
const spelledIn = (spelling: Spelling, part: Part, stored: string) =>
  Option.match(
    Option.filter(spelling, (folded) => folded.part === part),
    {
      onNone: () => stored,
      onSome: ({ fold }) => refold(stored, fold),
    },
  );

/** The extensions a cell's declaration file has: each form's stored ones when the cell folds the extension. */
const extensionsOf = (spelling: Spelling) =>
  Option.match(
    Option.filter(spelling, ({ part }) => part === 'extension'),
    {
      onNone: () => [plain],
      onSome: ({ fold }) =>
        forms.flatMap((form) =>
          storedExtensions(form.form, fold).map((stored) => ({ ...form, stored })),
        ),
    },
  );

/** How a loader leads tsc to the name the package gives: the files it adds, and its `files` entries. */
const lead = (loader: Loader, id: string, cells: Cells, name: string, imported: string) =>
  Match.value(loader).pipe(
    Match.when('import', () => ({
      files: { [`src/${id}.ts`]: importer(`${cells.fromSource(name)}${imported}`) },
      listed: [],
    })),
    Match.when('reference', () => ({
      files: {
        [`src/${id}.ts`]: `/// <reference path="${cells.fromSource(name)}" />\nexport {};\n`,
      },
      listed: [],
    })),
    Match.when('files entry', () => ({ files: {}, listed: [name] })),
    Match.exhaustive,
  );

/** The cases of one cell: each loader its way allows, with each extension its spelling stores. */
const casesOf = (cell: Cell, cells: Cells, at: number): ReadonlyArray<Case> =>
  cells.loaders
    .flatMap((loader) => extensionsOf(cell.spelling).map((extension) => ({ loader, ...extension })))
    .map(({ loader, form, imported, stored }, index) => {
      const id = `c${String(at)}-${String(index)}`;
      const head = cells.path(spelledIn(cell.spelling, 'head', cells.head));
      const spelled = `${head}/${id}/${spelledIn(cell.spelling, 'directory', directoryName)}/${spelledIn(cell.spelling, 'base name', baseName)}`;
      const disk = `src/.c/${id}/${directoryName}/${baseName}${stored}`;
      const led = Match.value(loader).pipe(
        Match.when('import', () => lead(loader, id, cells, spelled, imported)),
        Match.orElse(() => lead(loader, id, cells, `${spelled}${form}`, imported)),
      );
      return {
        name: `${cellName(cell)}, ${loader}: ${baseName}${stored}`,
        id,
        folds: Option.match(cell.spelling, { onNone: () => [], onSome: ({ fold }) => [fold] }),
        disk,
        files: { ...led.files, [disk]: declaration },
        listed: led.listed,
      };
    });

/** Every cell of edge × crossing × spelling. */
const cells: ReadonlyArray<Cell> = ways.flatMap((way) =>
  spellings.map((spelling) => ({ way, spelling })),
);

/** The cases the census runs, and the cells no host can express, each with why. */
const census = {
  cases: cells.flatMap((cell, at) =>
    Option.match(
      Option.filter(cell.way.cells, () => Option.isNone(unexpressed(cell.way, cell.spelling))),
      { onNone: () => [], onSome: (found) => casesOf(cell, found, at) },
    ),
  ),
  skipped: cells.flatMap((cell) =>
    Option.toArray(
      Option.map(unexpressed(cell.way, cell.spelling), (why) => `${cellName(cell)}: ${why}`),
    ),
  ),
};

/** The census's package over some of its cases. */
const censusPackage = (cases: ReadonlyArray<Case>) =>
  fixture({
    root: packageName,
    files: Object.assign({ 'node_modules/.keep': '' }, ...cases.map((each) => each.files)),
    listed: cases.flatMap((each) => each.listed),
    links: censusLinks,
    preserveSymlinks: true,
  });

/** What the check's verdict says of one file: it names the file, or it does not. */
const checkSays = (
  outcome: Option.Option<Effect.Error<ReturnType<typeof check>>>,
  disk: string,
) => {
  const [verdict, ...files] = said(outcome).split(' ');
  if (files.includes(disk)) return `check: ${String(verdict)} ${disk}`;
  return `check: ${String(verdict)}, not naming it`;
};

/** The declaration files the check names, when it names any. */
const unchecked = (outcome: Option.Option<Effect.Error<ReturnType<typeof check>>>) =>
  Option.match(outcome, {
    onNone: (): ReadonlyArray<string> => [],
    onSome: Match.valueTags({
      Unchecked: (error): ReadonlyArray<string> => error.files,
      Uncovered: () => [],
      ListFailed: () => [],
      PlatformError: () => [],
      SchemaError: () => [],
    }),
  });

/** Whether tsc refuses a case: it exits non-zero, with an error at the case's importer or naming a path through its directory. */
const tscSays = (
  tsc: { readonly refused: boolean; readonly errors: ReadonlyArray<string> },
  each: Case,
) => {
  const named = tsc.errors.some(
    (line) => line.startsWith(`src/${each.id}.ts(`) || line.includes(`/${each.id}/`),
  );
  if (tsc.refused && named) return 'tsc: refuses';
  return 'tsc: passes it';
};

describe("the package's typecheck over a file tsc spells its own way", () => {
  it("refuses each cell of the census: the check names the file by its disk spelling where the disk makes the cell's fold, and tsc refuses where it does not", () =>
    Effect.gen(function* () {
      const folded = yield* foldsOfTempDir;
      const found = (each: Case) => each.folds.every((fold) => folded[fold]);
      const checked = census.cases.filter(found);
      const lost = census.cases.filter((each) => !found(each));
      // A `files` entry tsc cannot find stops it before it reports any other
      // error, so the lost cases led by one go in a package apart.
      const lostApart = [
        lost.filter((each) => each.listed.length === 0),
        lost.filter((each) => each.listed.length > 0),
      ].filter((group) => group.length > 0);
      const [outcome, refusals] = yield* Effect.all(
        [
          censusPackage(checked).pipe(
            Effect.flatMap((root) => check(root).pipe(Effect.flip, Effect.option)),
            Effect.scoped,
          ),
          Effect.forEach(
            lostApart,
            (group) =>
              censusPackage(group).pipe(
                Effect.flatMap(tscOver),
                Effect.scoped,
                Effect.map((tsc) => group.map((each) => [each.name, tscSays(tsc, each)])),
              ),
            { concurrency: 2 },
          ),
        ],
        { concurrency: 2 },
      );
      const disks = new Set(checked.map((each) => each.disk));
      const seen = [
        ...checked.map((each) => [each.name, checkSays(outcome, each.disk)]),
        ...refusals.flat(),
        ['named beyond the census', unchecked(outcome).filter((file) => !disks.has(file))],
      ];
      expect(seen).toEqual([
        ...checked.map((each) => [each.name, `check: Unchecked ${each.disk}`]),
        ...lostApart.flat().map((each) => [each.name, 'tsc: refuses']),
        ['named beyond the census', []],
      ]);
    }).pipe(Effect.provide(BunServices.layer), Effect.runPromise));

  it('names each cell the census skips, and why no host can express it', () => {
    const climbs = (spelling: string) =>
      `node_modules, a climbing path, ${spelling}: ${climbsNoLink}`;
    expect(census.skipped).toEqual([
      `no edge, a path in the package, head by case: ${rootUnspelled}`,
      `no edge, a path in the package, head by long s: ${rootUnspelled}`,
      `no edge, a path in the package, head by normalization: ${rootUnspelled}`,
      `no edge, a path in the package, extension by normalization: ${extensionUndecomposed}`,
      `the root, a climbing path, extension by normalization: ${extensionUndecomposed}`,
      `the root, a link by path, extension by normalization: ${extensionUndecomposed}`,
      `the root, a link by bare name, extension by normalization: ${extensionUndecomposed}`,
      climbs('as stored'),
      climbs('head by case'),
      climbs('head by long s'),
      climbs('head by normalization'),
      climbs('directory by case'),
      climbs('directory by long s'),
      climbs('directory by normalization'),
      climbs('base name by case'),
      climbs('base name by long s'),
      climbs('base name by normalization'),
      climbs('extension by case'),
      climbs('extension by long s'),
      climbs('extension by normalization'),
      `node_modules, a link by path, extension by normalization: ${extensionUndecomposed}`,
      `node_modules, a link by bare name, extension by normalization: ${extensionUndecomposed}`,
    ]);
  });

  it('passes foo.TS, which is not a declaration file: tsc reports its error where the disk folds case, and cannot find it where the disk does not', () =>
    Effect.gen(function* () {
      const folded = yield* foldsOfTempDir;
      const outcome = yield* typecheck({
        files: {
          'src/a.ts': importer('./foo.js'),
          'src/foo.TS': 'export const broken: NotAType = 1 as never;\n',
        },
      });
      const errors = Match.value(folded.case).pipe(
        Match.when(true, () => ['src/foo.ts TS2304']),
        Match.orElse(() => ['src/a.ts TS2307']),
      );
      expect({ ...outcome, tsc: { ...outcome.tsc, errors: located(outcome.tsc.errors) } }).toEqual({
        tsc: { refused: true, errors },
        check: 'pass',
      });
    }).pipe(Effect.provide(BunServices.layer), Effect.runPromise));
});
