// The repo's lint config (.oxlintrc.json), read against what it guards.
//
// - The host bans: a page reaches each host name it may not use neither bare
//   nor under a global (`window.`, `globalThis.`, `self.`), and neither a host
//   object's banned member (`performance.now`) through a global
//   (`window.performance.now`). oxlint lints a probe of every such form, built
//   from the bans themselves, with the bans' own options: each line is red.
//   The files still allowed the URL ban every other name the pages do.
// - The purity rule: a block that keeps a layer's folder (`**/lab/**`) out
//   also keeps out every package export that resolves into it
//   (`@bible/film/review` is the lab's).

import { BunServices } from '@effect/platform-bun';
import { JSONC } from 'bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path, Schema, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

/** The timeout of a test here that spawns (oxlint): a cold start's time is the machine's (film/spawn-budget). */
const SPAWNS_MS = 30_000;

/** The globals a qualified host name is reached through. */
const QUALIFIERS: ReadonlyArray<string> = ['window', 'globalThis', 'self'];

/** The names the allowlisted files still reach: the URL's. */
const URL_NAMES: ReadonlyArray<string> = ['history', 'location', 'onpopstate'];

const Severity = Schema.Literals(['error', 'warn', 'off']);
/** A rule's config with its options. */
const withOptions = <S extends Schema.Top>(options: S) =>
  Schema.TupleWithRest(Schema.Tuple([Severity]), [options]);

const Global = Schema.Struct({ name: Schema.String, message: Schema.String });
type Global = typeof Global.Type;
const Property = Schema.Struct({
  object: Schema.String,
  property: Schema.String,
  message: Schema.String,
});
type Property = typeof Property.Type;
const Imports = Schema.Struct({
  patterns: Schema.optionalKey(Schema.Array(Schema.Struct({ group: Schema.Array(Schema.String) }))),
});

const Override = Schema.Struct({
  files: Schema.Array(Schema.String),
  rules: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
});
type Override = typeof Override.Type;
const Config = Schema.Struct({ overrides: Schema.Array(Override) });
const Package = Schema.Struct({ exports: Schema.Record(Schema.String, Schema.String) });

/** The config oxlint runs the probe with: only the host bans. */
const ProbeConfig = Schema.fromJsonString(
  Schema.Struct({
    rules: Schema.Struct({
      'no-restricted-globals': withOptions(Global),
      'no-restricted-properties': withOptions(Property),
    }),
  }),
);

/** The rule `key`'s value in `o`. */
const ruleIn = (o: Override, key: string) =>
  Option.flatMap(Option.fromUndefinedOr(o.rules), (rules) => Option.fromUndefinedOr(rules[key]));

/** The options of the rule `key` in `o`, read as `schema`: none when it is only a severity, or absent. */
const optionsIn = <A>(o: Override, key: string, schema: Schema.Decoder<A>): ReadonlyArray<A> =>
  Option.match(Option.flatMap(ruleIn(o, key), Schema.decodeUnknownOption(withOptions(schema))), {
    onNone: () => [],
    onSome: ([, ...options]) => options,
  });

const ROOT = Effect.map(Path.Path, (path) => path.join(import.meta.dir, '..', '..', '..'));

/** A repo file (JSON, with comments) read as `schema`. */
const readJson = Effect.fn('test.lintConfig.readJson')(function* <A>(
  repoPath: string,
  schema: Schema.Decoder<A>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const text = yield* fs.readFileString(path.join(yield* ROOT, repoPath));
  return yield* Schema.decodeUnknownEffect(schema)(JSONC.parse(text));
});

/** The host bans' block, and the block of the files still allowed the URL. */
const hostBlocks = (config: typeof Config.Type) => {
  const adapterRule = (o: Override) => ruleIn(o, 'film/host-events-through-adapter');
  const banned = config.overrides.find((o) => Option.contains(adapterRule(o), 'error'));
  const allowlisted = config.overrides.find((o) =>
    Option.exists(adapterRule(o), (rule) => Array.isArray(rule)),
  );
  expect(banned).toBeDefined();
  expect(allowlisted).toBeDefined();
  return { banned: banned as Override, allowlisted: allowlisted as Override };
};

/** Every form a page could reach a banned host name in, one statement a line. */
const probeOf = (
  globals: ReadonlyArray<Global>,
  properties: ReadonlyArray<Property>,
): ReadonlyArray<string> => {
  const bareMembers = properties.filter((p) => !QUALIFIERS.includes(p.object));
  return [
    ...globals.flatMap(({ name }) => [`${name};`, ...QUALIFIERS.map((q) => `${q}.${name};`)]),
    ...bareMembers.flatMap(({ object, property }) => [
      `${object}.${property};`,
      ...QUALIFIERS.map((q) => `${q}.${object}.${property};`),
    ]),
    // Calls and constructions read the same names.
    'window.performance.now();',
    'new window.Audio();',
    'self.requestAnimationFrame(() => {});',
    'globalThis.setInterval(() => {}, 1);',
  ];
};

/** The 1-based lines oxlint reported a restricted global or property on, in `--format unix`. */
const reportedLines = (out: string): ReadonlySet<number> =>
  new Set(
    out
      .split('\n')
      .flatMap((line) =>
        Option.toArray(
          Option.map(
            Option.fromNullishOr(
              /probe\.ts:(\d+):\d+: .*\(no-restricted-(?:globals|properties)\)\]$/.exec(line),
            ),
            (m) => Number(m[1]),
          ),
        ),
      ),
  );

/** oxlint over `source` with only the host bans `globals` and `properties` on: what it reported. */
const lint = Effect.fn('test.lintConfig.lint')(function* (
  globals: ReadonlyArray<Global>,
  properties: ReadonlyArray<Property>,
  source: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const oxlint = path.join(yield* ROOT, 'node_modules', '.bin', 'oxlint');
  const config = yield* Schema.encodeEffect(ProbeConfig)({
    rules: {
      'no-restricted-globals': ['error', ...globals],
      'no-restricted-properties': ['error', ...properties],
    },
  });
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const cwd = yield* fs.makeTempDirectoryScoped();
      yield* fs.writeFileString(path.join(cwd, 'probe.ts'), source);
      yield* fs.writeFileString(path.join(cwd, 'oxlint.json'), config);
      const handle = yield* spawner.spawn(
        ChildProcess.make(oxlint, ['-c', 'oxlint.json', '--format', 'unix', 'probe.ts'], { cwd }),
      );
      const [stdout, stderr] = yield* Effect.all(
        [
          Stream.mkString(Stream.decodeText(handle.stdout)),
          Stream.mkString(Stream.decodeText(handle.stderr)),
          handle.exitCode,
        ],
        { concurrency: 3 },
      );
      return `${stdout}${stderr}`;
    }),
  );
});

describe('the lint config', () => {
  it.effect.layer(BunServices.layer)(
    'bans every host name bare and under each global, and a host object through a global',
    () =>
      Effect.gen(function* () {
        const { banned, allowlisted } = hostBlocks(yield* readJson('.oxlintrc.json', Config));
        const globals = optionsIn(banned, 'no-restricted-globals', Global);
        const properties = optionsIn(banned, 'no-restricted-properties', Property);
        expect(globals.length).toBeGreaterThan(0);
        const probe = probeOf(globals, properties);
        const reported = reportedLines(yield* lint(globals, properties, `${probe.join('\n')}\n`));
        expect(probe.filter((_, i) => !reported.has(i + 1))).toEqual([]);
        // The allowlisted files ban every name the pages do but the URL's.
        const allowed = optionsIn(allowlisted, 'no-restricted-globals', Global);
        expect(allowed.map((g) => g.name).sort()).toEqual(
          globals
            .map((g) => g.name)
            .filter((name) => !URL_NAMES.includes(name))
            .sort(),
        );
      }),
    SPAWNS_MS,
  );

  it.effect.layer(BunServices.layer)(
    'keeps out every package export that resolves into a folder a block keeps out',
    () =>
      Effect.gen(function* () {
        const config = yield* readJson('.oxlintrc.json', Config);
        const pkg = yield* readJson('packages/film/package.json', Package);
        const aliases = Object.entries(pkg.exports).map(([key, target]) => ({
          alias: `@bible/film/${key.replace(/^\.\//, '')}`,
          folder: Option.fromNullishOr(/^\.\/src\/([\w-]+)\//.exec(target)?.[1]),
        }));
        expect(aliases.map((a) => a.alias)).toContain('@bible/film/review');
        const missing = config.overrides.flatMap((o) =>
          optionsIn(o, 'no-restricted-imports', Imports).flatMap((options) =>
            (options.patterns ?? []).flatMap(({ group }) => {
              if (group.includes('@bible/film/*')) return [];
              const kept = group.flatMap((g) =>
                Option.toArray(Option.fromNullishOr(/^\*\*\/([\w-]+)\/\*\*$/.exec(g)?.[1])),
              );
              return aliases
                .filter((a) => Option.exists(a.folder, (f) => kept.includes(f)))
                .filter((a) => !group.includes(a.alias))
                .map((a) => `${o.files.join(', ')}: ${a.alias}`);
            }),
          ),
        );
        expect(missing).toEqual([]);
      }),
  );
});
