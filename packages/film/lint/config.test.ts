// The repo's lint config (.oxlintrc.json), read against what it guards.
//
// - The host bans: a page reaches each host name it may not use neither bare
//   nor under a global (`window.`, `globalThis.`, `self.`), and neither a host
//   object's banned member (`performance.now`) through a global
//   (`window.performance.now`), and neither through a chain of the global
//   object's own names (`globalThis.window.location`, `parent.location`,
//   `document.defaultView?.matchMedia`). oxlint lints a probe of every such
//   form, built from the bans themselves, with the bans' own options: each
//   line is red. The URL's names are among them, and no page file is let off
//   them: every page reaches the address bar through `@bible/url-state`'s
//   Location. `Reflect.get(window, 'history')`, a name no property ban can
//   see, is `effect/noReflectGet`'s, on in the same block.
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

/** The URL's names: banned to every page, reached through Location. */
const URL_NAMES: ReadonlyArray<string> = [
  'history',
  'location',
  'onpopstate',
  'onhashchange',
  'navigation',
];

/** The ids made unique (`uniqueId`), never by hand: module names, not the host's, so never under a global. */
const BRANDS: ReadonlyArray<string> = ['ChangeId', 'RequestId', 'OpId'];

/** The URL's events: heard only through Location. */
const URL_EVENTS: ReadonlyArray<string> = ['popstate', 'hashchange'];

/**
 * The global object reached through a chain or an alias of itself, then a
 * banned name (every chain but `Reflect.get`, which is `effect/noReflectGet`'s):
 * each is red on its first hop, however the name after it is spelled.
 */
const CHAINS: ReadonlyArray<string> = [
  'globalThis.window.location;',
  'window.self.fetch(url);',
  'window.window.history;',
  'window.top?.location;',
  'parent.location;',
  'top.history;',
  'document.defaultView?.location;',
  'frames.location;',
  'globalThis.window.matchMedia(query);',
  'self.globalThis.localStorage;',
  'window.parent.requestAnimationFrame(step);',
];

const Allow = Schema.Struct({ allow: Schema.optionalKey(Schema.Array(Schema.String)) });

/** Every way oxlint lets a rule's severity be spelled: a rule's options are read under any of them. */
const SEVERITIES = ['error', 'deny', 2, 'warn', 1, 'off', 'allow', 0] as const;
const Severity = Schema.Literals(SEVERITIES);
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

/** Each URL event a block lets its files hear themselves, with the block's files. */
const urlEventsAllowed = (overrides: ReadonlyArray<Override>) =>
  overrides.flatMap((o) =>
    optionsIn(o, 'film/host-events-through-adapter', Allow).flatMap(({ allow = [] }) =>
      allow.filter((event) => URL_EVENTS.includes(event)).map((event) => [o.files, event]),
    ),
  );

/**
 * The film's host bans' block, every block that bans a URL name (the film's,
 * and `@bible/url-state`'s and egw-search's), and the blocks that let files
 * hear some host events themselves.
 */
const hostBlocks = (config: typeof Config.Type) => {
  const adapterRule = (o: Override) => ruleIn(o, 'film/host-events-through-adapter');
  const banned = config.overrides.find((o) => Option.contains(adapterRule(o), 'error'));
  const allowing = config.overrides.filter((o) =>
    Option.exists(adapterRule(o), (rule) => Array.isArray(rule)),
  );
  const url = config.overrides.filter((o) =>
    optionsIn(o, 'no-restricted-globals', Global).some((g) => URL_NAMES.includes(g.name)),
  );
  expect(banned).toBeDefined();
  return { banned: banned as Override, url, allowing };
};

/** Whether a ban keeps the address bar, or a hop of the global object to itself, out of a page. */
const urlOrHop = (message: string) =>
  message.includes("@bible/url-state's Location") ||
  message.startsWith('Reach the global object') ||
  message.startsWith('Reach `document` bare');

/** The film block's URL and hop bans a block lacks, as `global name` or `object.property`. */
const urlBansMissing = (film: Override, block: Override): ReadonlyArray<string> => {
  const names = (o: Override) => optionsIn(o, 'no-restricted-globals', Global);
  const members = (o: Override) => optionsIn(o, 'no-restricted-properties', Property);
  const held = new Set([
    ...names(block).map((g) => `global ${g.name}`),
    ...members(block).map((p) => `${p.object}.${p.property}`),
  ]);
  return [
    ...names(film)
      .filter((g) => urlOrHop(g.message))
      .map((g) => `global ${g.name}`),
    ...members(film)
      .filter((p) => urlOrHop(p.message))
      .map((p) => `${p.object}.${p.property}`),
  ].filter((ban) => !held.has(ban));
};

/** Every form a page could reach a banned host name in, one statement a line. */
const probeOf = (
  globals: ReadonlyArray<Global>,
  properties: ReadonlyArray<Property>,
): ReadonlyArray<string> => {
  const bareMembers = properties.filter(
    (p) => !QUALIFIERS.includes(p.object) && !BRANDS.includes(p.object),
  );
  return [
    ...globals.flatMap(({ name }) => [`${name};`, ...QUALIFIERS.map((q) => `${q}.${name};`)]),
    ...bareMembers.flatMap(({ object, property }) => [
      `${object}.${property};`,
      ...QUALIFIERS.map((q) => `${q}.${object}.${property};`),
    ]),
    ...brandsMade(properties),
    ...CHAINS,
  ];
};

/** Each brand a block bans minting, minted by hand. */
const brandsMade = (properties: ReadonlyArray<Property>): ReadonlyArray<string> =>
  properties.filter((p) => BRANDS.includes(p.object)).map((p) => `${p.object}.${p.property}('x');`);

/** Whether a block's files reach the film's or the films' source. */
const overFilmSource = (o: Override) =>
  o.files.some((f) => f.includes('packages/film/src/') || f.includes('apps/animations/src/'));

/** The brands a block that lists no-restricted-properties over the film's source leaves mintable. */
const brandsUnbanned = (o: Override): ReadonlyArray<string> => {
  const held = optionsIn(o, 'no-restricted-properties', Property)
    .filter((p) => p.property === 'make')
    .map((p) => p.object);
  return BRANDS.filter((brand) => !held.includes(brand));
};

/** The film's host names called and constructed: read as the names are. */
const CALLS: ReadonlyArray<string> = [
  'window.performance.now();',
  'new window.Audio();',
  'self.requestAnimationFrame(() => {});',
  'globalThis.setInterval(() => {}, 1);',
];

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
        const { banned, allowing } = hostBlocks(yield* readJson('.oxlintrc.json', Config));
        const globals = optionsIn(banned, 'no-restricted-globals', Global);
        const properties = optionsIn(banned, 'no-restricted-properties', Property);
        expect(globals.length).toBeGreaterThan(0);
        const probe = [...probeOf(globals, properties), ...CALLS];
        const reported = reportedLines(yield* lint(globals, properties, `${probe.join('\n')}\n`));
        expect(probe.filter((_, i) => !reported.has(i + 1))).toEqual([]);
        // The URL's names are banned, and no block lets a file off its events.
        expect(globals.map((g) => g.name)).toEqual(expect.arrayContaining([...URL_NAMES]));
        expect(urlEventsAllowed(allowing)).toEqual([]);
      }),
    SPAWNS_MS,
  );

  it.effect.layer(BunServices.layer)(
    "bans the URL in every block that bans it as the film's block does, every form red",
    () =>
      Effect.gen(function* () {
        const { banned, url } = hostBlocks(yield* readJson('.oxlintrc.json', Config));
        // The film's, and url-state's with egw-search's.
        expect(url.length).toBeGreaterThan(1);
        for (const block of url) {
          expect(urlBansMissing(banned, block)).toEqual([]);
          const globals = optionsIn(block, 'no-restricted-globals', Global);
          const properties = optionsIn(block, 'no-restricted-properties', Property);
          expect(globals.map((g) => g.name)).toEqual(expect.arrayContaining([...URL_NAMES]));
          const probe = probeOf(globals, properties);
          const reported = reportedLines(yield* lint(globals, properties, `${probe.join('\n')}\n`));
          expect(probe.filter((_, i) => !reported.has(i + 1))).toEqual([]);
        }
      }),
    SPAWNS_MS,
  );

  it.effect.layer(BunServices.layer)(
    "bans minting a brand by hand in every block that lists the film's property bans",
    () =>
      Effect.gen(function* () {
        const config = yield* readJson('.oxlintrc.json', Config);
        const listing = config.overrides.filter(
          (o) => overFilmSource(o) && optionsIn(o, 'no-restricted-properties', Property).length > 0,
        );
        // The brands' own block, and the film's host block that replaces it.
        expect(listing.length).toBeGreaterThan(1);
        expect(listing.map((o) => [o.files[0], brandsUnbanned(o)])).toEqual(
          listing.map((o) => [o.files[0], []]),
        );
        for (const block of listing) {
          const properties = optionsIn(block, 'no-restricted-properties', Property);
          const probe = brandsMade(properties);
          const reported = reportedLines(yield* lint([], properties, `${probe.join('\n')}\n`));
          expect(probe.filter((_, i) => !reported.has(i + 1))).toEqual([]);
        }
      }),
    SPAWNS_MS,
  );

  it.effect('finds a block over the film that leaves a brand mintable', () =>
    Effect.sync(() => {
      const block: Override = {
        files: ['**/packages/film/src/lab/**/*.ts'],
        rules: {
          'no-restricted-properties': [
            'error',
            { object: 'ChangeId', property: 'make', message: 'uniqueId' },
          ],
        },
      };
      expect(overFilmSource(block)).toBe(true);
      expect(brandsUnbanned(block)).toEqual(['RequestId', 'OpId']);
    }),
  );

  it.effect('finds a URL ban the film block holds and another block lacks', () =>
    Effect.sync(() => {
      const film: Override = {
        files: ['film'],
        rules: {
          'no-restricted-globals': [
            'error',
            { name: 'onhashchange', message: "Use @bible/url-state's Location." },
          ],
          'no-restricted-properties': [
            'error',
            { object: 'self', property: 'history', message: "Use @bible/url-state's Location." },
          ],
        },
      };
      const narrower: Override = { files: ['egw'], rules: { 'no-restricted-globals': ['error'] } };
      expect(urlBansMissing(film, narrower)).toEqual(['global onhashchange', 'self.history']);
      expect(urlBansMissing(film, film)).toEqual([]);
    }),
  );

  it.effect("finds a block that allows the URL's events, whatever severity spelling it uses", () =>
    Effect.sync(() => {
      const found = SEVERITIES.map((severity) =>
        urlEventsAllowed([
          {
            files: ['**/page.ts'],
            rules: { 'film/host-events-through-adapter': [severity, { allow: ['popstate'] }] },
          },
        ]),
      );
      expect(found).toEqual(SEVERITIES.map(() => [[['**/page.ts'], 'popstate']]));
    }),
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
