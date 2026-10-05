// The film's composition root is built once (`film-services.ts`): the
// services every `film` command and the lab run with, the lab's pages, and
// the lab's start. Its deletion test: delete it, and each of its consumers
// would build the graph again, as the CLI and the studio harness did before,
// and drifted (the harness's pages lacked the assets, the CLI's source had
// stamps the harness's had not). So no module but the root builds these
// layers, and its consumers are named: the CLI (`runFilmCli`) and the app's
// studio harness, which drives the same lab over a copy of a film with a
// fake ElevenLabs. A test's own graph (`testing.ts`, `fixtures/`, a
// `*.test.ts`) is a fake's, not the app's, and is not swept.
//
// The guard reads bindings, not spellings (oxc-parser, as `lab.test.ts`'s
// `loadersReached` does): a name is followed through its import (aliased,
// a namespace's member, a re-export, a package's entry) or a top-level
// `const` alias to the module that declares it, so a layer built under
// another name is a build, and a same-named thing of a module's own is not.
// A name shadowed in an inner scope is read as the module's own binding.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Array as Arr, Effect, FileSystem, Option, Path, Predicate, Schema } from 'effect';
import {
  type CallExpression,
  type Expression,
  type MemberExpression,
  type Program,
  Visitor,
  parseSync,
} from 'oxc-parser';

/** The framework's source, recursively; the app's entries, its own top-level modules. */
const SWEPT = [
  { dir: 'packages/film/src', recursive: true },
  { dir: 'apps/animations', recursive: false },
] as const;

/** What a test builds its own graph in: a fake's, not the app's. */
const TESTS = /(^|\/)(node_modules|fixtures)\/|\.test\.tsx?$|(^|\/)testing\.ts$/;
const SOURCE = /\.tsx?$/;

/** The layers the root builds and no other module may: each service, by the member read off it to build one. */
const GUARDED: ReadonlyArray<readonly [service: string, member: string]> = [
  ...[
    'FilmRepo',
    'NotesStore',
    'FreshFilm',
    'SceneWriter',
    'SceneHead',
    'SceneSources',
    'SourceWriter',
    'RenderCatalogue',
    'Choices',
    'StudioReadings',
    'Takes',
    'Narrator',
    'Composer',
    'Mixer',
    'SoundLibrary',
    'PrivateStore',
    'Stamps',
    'LabPage',
    'Easel',
  ].map((service) => [service, 'layer'] as const),
  ['Review', 'layerConfig'],
];

/** The root's services, as it declares them. */
const SERVICES = 'filmServices';

/** Where the guard reads modules: their sources by path, and the workspace's package entries. */
interface World {
  readonly read: (file: string) => Effect.Effect<Option.Option<string>>;
  readonly packages: ReadonlyMap<string, string>;
}

/** A module as the guard reads it: its source, its tree, its records, its top-level `const A = B` aliases. */
interface Module {
  readonly source: string;
  readonly program: Program;
  readonly records: ReturnType<typeof parseSync>['module'];
  readonly aliases: ReadonlyMap<string, string>;
}

/** How the parser reads `file`: JSX only in a `.tsx`. */
const langOf = (file: string): 'ts' | 'tsx' => {
  if (file.endsWith('.tsx')) return 'tsx';
  return 'ts';
};

/** Each top-level `const A = B` (B a name), exported or not: A → B. */
const aliasesOf = (program: Program): ReadonlyMap<string, string> =>
  new Map(
    program.body
      .flatMap((statement) => {
        if (statement.type === 'VariableDeclaration') return [statement];
        if (
          statement.type === 'ExportNamedDeclaration' &&
          statement.declaration?.type === 'VariableDeclaration'
        )
          return [statement.declaration];
        return [];
      })
      .flatMap((declaration) => declaration.declarations)
      .flatMap((d) => {
        if (d.id.type === 'Identifier' && d.init?.type === 'Identifier')
          return [[d.id.name, d.init.name] as const];
        return [];
      }),
  );

/** The member `m` reads by name (`a.b`, `a['b']`); none for one computed otherwise. */
const memberName = (m: MemberExpression): Option.Option<string> => {
  if (m.type !== 'MemberExpression' || !('property' in m)) return Option.none();
  if (!m.computed && m.property.type === 'Identifier') return Option.some(m.property.name);
  if (m.computed && m.property.type === 'Literal')
    return Option.filter(Option.some(m.property.value), Predicate.isString);
  return Option.none();
};

/** The line of `source` that offset `at` falls on, from 1. */
const lineOf = (source: string, at: number) => source.slice(0, at).split('\n').length;

/**
 * The guard over `world`: each binding's origin, `file#name` of the module
 * that declares it (`file#*` for a namespace), followed through imports,
 * re-exports and `const` aliases; none for one outside the world (a
 * package of no workspace's).
 */
const bindings = (world: World, path: Path.Path) => {
  const parsed = new Map<string, Option.Option<Module>>();
  const parse = (file: string): Effect.Effect<Option.Option<Module>> =>
    Option.match(Option.fromUndefinedOr(parsed.get(file)), {
      onSome: Effect.succeed,
      onNone: () =>
        Effect.map(world.read(file), (text) => {
          const made = Option.map(text, (source) => {
            const result = parseSync(file, source, { lang: langOf(file), sourceType: 'module' });
            return {
              source,
              program: result.program,
              records: result.module,
              aliases: aliasesOf(result.program),
            };
          });
          parsed.set(file, made);
          return made;
        }),
    });
  const resolve = (from: string, specifier: string): Option.Option<string> => {
    if (specifier.startsWith('.')) return Option.some(path.resolve(path.dirname(from), specifier));
    return Option.fromUndefinedOr(world.packages.get(specifier));
  };

  /** Where `name`, as `file` exports it, is declared. */
  const exported = (
    file: string,
    name: string,
    seen: ReadonlySet<string>,
  ): Effect.Effect<Option.Option<string>> =>
    Effect.gen(function* () {
      const key = `${file}#${name}`;
      const module = yield* parse(file);
      if (seen.has(key) || Option.isNone(module)) return Option.none();
      const at = new Set([...seen, key]);
      const entries = module.value.records.staticExports
        .flatMap((e) => e.entries)
        .filter((e) => !e.isType);
      const named = Arr.findFirst(entries, (e) => e.exportName.name === name);
      if (Option.isSome(named)) {
        const entry = named.value;
        const request = Option.fromNullishOr(entry.moduleRequest);
        if (Option.isNone(request))
          return yield* local(
            file,
            Option.getOrElse(Option.fromNullishOr(entry.localName.name), () => name),
            at,
          );
        const target = resolve(file, request.value.value);
        if (Option.isNone(target)) return Option.none();
        if (entry.importName.kind === 'All') return Option.some(`${target.value}#*`);
        return yield* exported(
          target.value,
          Option.getOrElse(Option.fromNullishOr(entry.importName.name), () => 'default'),
          at,
        );
      }
      // `export * from …`: the name is the first such module's that has it.
      for (const star of entries.filter((e) => e.importName.kind === 'AllButDefault')) {
        const target = Option.flatMap(Option.fromNullishOr(star.moduleRequest), (r) =>
          resolve(file, r.value),
        );
        const found = yield* Option.match(target, {
          onNone: () => Effect.succeedNone,
          onSome: (t) => exported(t, name, at),
        });
        if (Option.isSome(found)) return found;
      }
      return Option.none();
    });

  /** What `name` names at the top of `file`: an import's origin, an alias's, else the module's own. */
  const local = (
    file: string,
    name: string,
    seen: ReadonlySet<string>,
  ): Effect.Effect<Option.Option<string>> =>
    Effect.gen(function* () {
      const key = `${file}:${name}`;
      const module = yield* parse(file);
      if (seen.has(key) || Option.isNone(module)) return Option.none();
      const at = new Set([...seen, key]);
      const imported = Arr.findFirst(
        module.value.records.staticImports.flatMap((i) =>
          i.entries.map((entry) => ({ from: i.moduleRequest.value, entry })),
        ),
        ({ entry }) => !entry.isType && entry.localName.value === name,
      );
      if (Option.isNone(imported))
        return yield* Option.match(Option.fromUndefinedOr(module.value.aliases.get(name)), {
          onNone: () => Effect.succeedSome(`${file}#${name}`),
          onSome: (aliased) => local(file, aliased, at),
        });
      const { from, entry } = imported.value;
      const target = resolve(file, from);
      if (Option.isNone(target)) return Option.none();
      if (entry.importName.kind === 'NamespaceObject') return Option.some(`${target.value}#*`);
      return yield* exported(
        target.value,
        Option.getOrElse(Option.fromNullishOr(entry.importName.name), () => 'default'),
        at,
      );
    });

  /** The origin of what `expression` names in `file`: a name, or a namespace's member (`ns.Name`). */
  const originOf = (file: string, expression: Expression): Effect.Effect<Option.Option<string>> => {
    if (expression.type === 'Identifier') return local(file, expression.name, new Set());
    if (expression.type !== 'MemberExpression' || expression.object.type !== 'Identifier')
      return Effect.succeedNone;
    const member = memberName(expression);
    return Effect.flatMap(local(file, expression.object.name, new Set()), (space) => {
      if (Option.isNone(space) || !space.value.endsWith('#*') || Option.isNone(member))
        return Effect.succeedNone;
      return exported(space.value.slice(0, -2), member.value, new Set());
    });
  };

  /** Each member read and call in `file`'s code (a type's `typeof X.y` is neither). */
  const sitesOf = (file: string) =>
    Effect.map(parse(file), (module) =>
      Option.map(module, (m) => {
        const members: Array<MemberExpression> = [];
        const calls: Array<CallExpression> = [];
        new Visitor({
          MemberExpression: (node) => {
            members.push(node);
          },
          CallExpression: (node) => {
            calls.push(node);
          },
        }).visit(m.program);
        return { source: m.source, members, calls };
      }),
    );

  return { local, originOf, sitesOf };
};

/** The sites among `files` (`path:line`) that build a layer the root builds, in order. */
const builtIn = (world: World, root: string, files: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const { local, originOf, sitesOf } = bindings(world, yield* Path.Path);
    const guarded = new Set(
      yield* Effect.forEach(GUARDED, ([service, member]) =>
        Effect.flatMap(local(root, service, new Set()), (origin) =>
          Option.match(origin, {
            onNone: () => Effect.die(`the root no longer reads ${service}`),
            onSome: (o) => Effect.succeed(`${o}.${member}`),
          }),
        ),
      ),
    );
    const found = yield* Effect.forEach(files, (file) =>
      Effect.flatMap(sitesOf(file), (sites) =>
        Option.match(sites, {
          onNone: () => Effect.succeed([]),
          onSome: ({ source, members }) =>
            Effect.map(
              Effect.forEach(members, (m) =>
                Effect.map(originOf(file, m.object), (origin) =>
                  Option.exists(Option.all([origin, memberName(m)]), ([o, name]) =>
                    guarded.has(`${o}.${name}`),
                  ),
                ),
              ),
              (built) =>
                members.filter((_, i) => built[i]).map((m) => `${file}:${lineOf(source, m.start)}`),
            ),
        }),
      ),
    );
    return found.flat();
  });

/** The files among `files` that call the root's services, in order. */
const consumersIn = (world: World, root: string, files: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const { local, originOf, sitesOf } = bindings(world, yield* Path.Path);
    const services = yield* local(root, SERVICES, new Set());
    const calling = yield* Effect.forEach(files, (file) =>
      Effect.flatMap(sitesOf(file), (sites) =>
        Option.match(sites, {
          onNone: () => Effect.succeed(false),
          onSome: ({ calls }) =>
            Effect.map(
              Effect.forEach(calls, (call) =>
                Effect.map(
                  originOf(file, call.callee),
                  (origin) => Option.isSome(services) && Option.contains(origin, services.value),
                ),
              ),
              (each) => each.some(Boolean),
            ),
        }),
      ),
    );
    return files.filter((_, i) => calling[i]).toSorted();
  });

/** The film package's entries as its `package.json` declares them. */
const PackageExports = Schema.fromJsonString(
  Schema.Struct({ exports: Schema.Record(Schema.String, Schema.String) }),
);

/** The repo's own modules, read from disk, the film package's entries, and the root. */
const disk = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const repo = path.resolve(import.meta.dir, '../../../..');
  const film = `${repo}/packages/film`;
  const { exports } = yield* Schema.decodeEffect(PackageExports)(
    yield* fs.readFileString(`${film}/package.json`),
  );
  const world: World = {
    read: (file) => Effect.option(fs.readFileString(file)),
    packages: new Map(
      Object.entries(exports).map(([entry, file]) => [
        `@bible/film${entry.slice(1)}`,
        path.resolve(film, file),
      ]),
    ),
  };
  const swept = yield* Effect.forEach(SWEPT, ({ dir, recursive }) =>
    Effect.map(fs.readDirectory(`${repo}/${dir}`, { recursive }), (files) =>
      files
        .filter((file) => SOURCE.test(file) && !TESTS.test(file))
        .map((file) => `${repo}/${dir}/${file}`),
    ),
  );
  return { world, files: swept.flat(), repo, root: `${film}/src/tools/film-services.ts` };
});

/** A world of `modules` alone, under `/w/`, beside a root of the same shape as the real one. */
const made = (modules: Readonly<Record<string, string>>) => {
  const all = {
    'film-repo.ts': 'export class FilmRepo { static layer = 1 }',
    'review.ts': 'export class Review { static layerConfig = () => 1 }',
    'index.ts':
      "export * from './film-repo.ts';\nexport { filmServices } from './film-services.ts';",
    'film-services.ts': [
      "import { FilmRepo } from './film-repo.ts';",
      "import { Review } from './review.ts';",
      'export const filmServices = () => [FilmRepo.layer, Review.layerConfig()];',
    ].join('\n'),
    ...modules,
  };
  const sources = new Map(Object.entries(all).map(([name, text]) => [`/w/${name}`, text]));
  const world: World = {
    read: (file) => Effect.succeed(Option.fromUndefinedOr(sources.get(file))),
    packages: new Map([['@w/tools', '/w/index.ts']]),
  };
  return { world, files: Object.keys(modules).map((name) => `/w/${name}`) };
};

/** What the guard finds in `modules`: the layers built, and who asks for the services. */
const findings = (modules: Readonly<Record<string, string>>) =>
  Effect.gen(function* () {
    const { world, files } = made(modules);
    return {
      built: yield* builtIn(world, '/w/film-services.ts', files),
      consumers: yield* consumersIn(world, '/w/film-services.ts', files),
    };
  }).pipe(Effect.provide(BunServices.layer));

describe("the film's composition root", () => {
  it.effect('no module but the root builds its layers', () =>
    Effect.gen(function* () {
      const { world, files, root } = yield* disk;
      const built = yield* builtIn(world, root, files);
      // The root's own builds are found: the guard reads it as it reads the rest.
      expect(built.filter((line) => line.startsWith(`${root}:`)).length).toBeGreaterThan(0);
      expect(built.filter((line) => !line.startsWith(`${root}:`))).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect('its consumers are the CLI and the studio harness', () =>
    Effect.gen(function* () {
      const { world, files, repo, root } = yield* disk;
      expect((yield* consumersIn(world, root, files)).map((f) => f.slice(repo.length + 1))).toEqual(
        ['apps/animations/studio-harness.ts', 'packages/film/src/tools/cli.ts'],
      );
    }).pipe(Effect.provide(BunServices.layer)),
  );
});

describe("the composition root's guard reads bindings, not spellings", () => {
  it.effect('a layer built through an alias, a namespace, a re-export or a const is a build', () =>
    Effect.gen(function* () {
      const { built } = yield* findings({
        'aliased.ts':
          "import { FilmRepo as Repo } from './film-repo.ts';\nexport const a = Repo.layer;",
        'spaced.ts': "import * as R from './film-repo.ts';\nexport const b = R.FilmRepo.layer;",
        'through.ts': "import { FilmRepo as F } from '@w/tools';\nexport const c = F.layer;",
        'kept.ts':
          "import { Review } from './review.ts';\nconst Kept = Review;\nexport const d = Kept.layerConfig();",
      });
      expect(built).toEqual([
        '/w/aliased.ts:2',
        '/w/spaced.ts:2',
        '/w/through.ts:2',
        '/w/kept.ts:3',
      ]);
    }),
  );

  it.effect(
    "a type, a comment, or a layer of a same-named class of the module's own is no build",
    () =>
      Effect.gen(function* () {
        const { built } = yield* findings({
          'typed.ts':
            "import type { FilmRepo } from './film-repo.ts';\n// FilmRepo.layer is the root's\nexport type L = typeof FilmRepo.layer;",
          'own.ts': 'class FilmRepo { static layer = 2 }\nexport const e = FilmRepo.layer;',
        });
        expect(built).toEqual([]);
      }),
  );

  it.effect(
    "an aliased call of the root's services consumes them; a call of another filmServices does not",
    () =>
      Effect.gen(function* () {
        const { consumers } = yield* findings({
          'aliased.ts':
            "import { filmServices as services } from './film-services.ts';\nexport const f = services();",
          'spec.ts':
            'const spec = { filmServices: () => 1 };\nexport const g = spec.filmServices();',
          'local.ts': 'const filmServices = () => 2;\nexport const h = filmServices();',
          'named.ts': "export { filmServices } from './film-services.ts';",
        });
        expect(consumers).toEqual(['/w/aliased.ts']);
      }),
  );
});
