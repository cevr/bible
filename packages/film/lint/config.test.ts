// The repo's lint config (.oxlintrc.json), read against what it guards.
//
// - The host bans: `effect/noGlobals`' `members` list in the film's host
//   block. A page reaches no host name it may not use, and no host object's
//   banned member (`performance.now`), bare, through any name of the global
//   object (`window.`, `top.`, `document.defaultView.`) or a chain of them
//   (`globalThis.window.location`), through an alias or a destructure, and it
//   holds none where the rule cannot follow it (`{ w: window }`). oxlint
//   lints a probe of every such form, built from the bans themselves, with
//   the block's own options: each line is red. The URL's names are among
//   them, and no page file is let off them: every page reaches the address
//   bar through `@bible/url-state`'s Location. `Reflect.get(window,
//   'history')`, a name no ban can see, is `effect/noReflectGet`'s, on in the
//   same block.
// - The purity rule: a block that keeps a layer's folder (`**/lab/**`) out
//   also keeps out every package export that resolves into it
//   (`@bible/film/review` is the lab's).
// - The film's rules: `Visitor.accumulate`, which copies its list on every
//   node it keeps, is refused to them, and `nodes.ts`'s `collect` is not.
// - The First the Blade site's sources: oxlint lints a probe with the
//   site's block's own options, and refuses each `?inline` import and data
//   URL, an image the build walk would not read, and passes a URL import.

import { BunServices } from '@effect/platform-bun';
import { JSONC } from 'bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path, Schema, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

/** The timeout of a test here that spawns (oxlint): a cold start's time is the machine's (effect/requireSpawnBudget). */
const SPAWNS_MS = 30_000;

/** The names a host name is reached through: the global object's, and chains of them. */
const QUALIFIERS: ReadonlyArray<string> = [
  'window',
  'globalThis',
  'self',
  'top',
  'parent',
  'frames',
  'document.defaultView',
  'globalThis.window',
];

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
 * banned name (every chain but `Reflect.get`, which is `effect/noReflectGet`'s).
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
  '{ const w = window; w.history; }',
  '{ const { history: h } = window; h.back(); }',
  '{ const { defaultView } = document; defaultView.fetch(url); }',
];

/**
 * A host global held under a name or a place of the page's own: an alias the
 * rule follows to its banned use, or a hold it cannot follow, refused itself.
 * Each line is a block of its own, so the names never meet.
 */
const HOLDS: ReadonlyArray<string> = [
  '{ const perf = performance; perf.now(); }',
  '{ const { now } = performance; now(); }',
  '{ const sure = navigator!; sure.sendBeacon(url); }',
  '{ const cast = window as Window; cast.innerWidth; }',
  '{ let later: Window; later = window; }',
  '{ const held = { w: window }; }',
  '{ const answered = () => performance; }',
  '{ const defaulted = (w = window) => w.name; }',
  '{ const listed = [document]; }',
  '{ const either = mine ?? window; }',
  '{ function returned() { return navigator; } }',
];

/** The film's host names called and constructed: read as the names are. */
const CALLS: ReadonlyArray<string> = [
  'window.performance.now();',
  'new window.Audio();',
  'self.requestAnimationFrame(() => {});',
  'globalThis.setInterval(() => {}, 1);',
];

const Allow = Schema.Struct({ allow: Schema.optionalKey(Schema.Array(Schema.String)) });

/** Every way oxlint lets a rule's severity be spelled: a rule's options are read under any of them. */
const SEVERITIES = ['error', 'deny', 2, 'warn', 1, 'off', 'allow', 0] as const;
const Severity = Schema.Literals(SEVERITIES);
/** A rule's config with its options. */
const withOptions = <S extends Schema.Top>(options: S) =>
  Schema.TupleWithRest(Schema.Tuple([Severity]), [options]);

/** One of `effect/noGlobals`' bans on a global: all of its members, or the listed `properties`. */
const MemberBan = Schema.Struct({
  properties: Schema.optionalKey(Schema.Array(Schema.String)),
  use: Schema.String,
});
const NoGlobals = Schema.Struct({
  builtins: Schema.optionalKey(Schema.Boolean),
  members: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.Union([MemberBan, Schema.Array(MemberBan)])),
  ),
});
type NoGlobals = typeof NoGlobals.Type;
const Property = Schema.Struct({
  object: Schema.String,
  property: Schema.String,
  message: Schema.String,
});
type Property = typeof Property.Type;
/** A property ban of `no-restricted-properties`: on any object when it names none. */
const AnyProperty = Schema.Struct({
  object: Schema.optionalKey(Schema.String),
  property: Schema.String,
  message: Schema.String,
});
/** The config oxlint runs a probe of property bans with. */
const PropertiesConfig = Schema.fromJsonString(
  Schema.Struct({
    rules: Schema.Struct({ 'no-restricted-properties': withOptions(AnyProperty) }),
  }),
);
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

/** The config oxlint runs a probe of a block's own rules with. */
const RulesConfig = Schema.fromJsonString(
  Schema.Struct({
    jsPlugins: Schema.Array(Schema.String),
    rules: Schema.Record(Schema.String, Schema.Unknown),
  }),
);

/** The config oxlint runs the probe with: only the host bans and the brands. */
const ProbeConfig = Schema.fromJsonString(
  Schema.Struct({
    jsPlugins: Schema.Array(Schema.String),
    rules: Schema.Struct({
      'effect/noGlobals': withOptions(NoGlobals),
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

/** A block's host bans: `effect/noGlobals`' options (none when it keeps the built-in list only). */
const hostBans = (o: Override): NoGlobals => optionsIn(o, 'effect/noGlobals', NoGlobals)[0] ?? {};

/** A block's bans, one a line: `global name` for a whole global, `object.property` for a member. */
interface Ban {
  readonly ban: string;
  readonly form: string;
  readonly use: string;
}

const bansOf = (options: NoGlobals): ReadonlyArray<Ban> =>
  Object.entries(options.members ?? {}).flatMap(([object, bans]) =>
    [bans].flat().flatMap(({ properties, use }) =>
      Option.match(Option.fromUndefinedOr(properties), {
        onNone: () => [{ ban: `global ${object}`, form: object, use }],
        onSome: (listed) =>
          listed.map((property) => ({
            ban: `${object}.${property}`,
            form: `${object}.${property}`,
            use,
          })),
      }),
    ),
  );

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
 * `@bible/url-state`'s and egw-search's, and egw-search's scroll adapter), and
 * the blocks that let files hear some host events themselves.
 */
const hostBlocks = (config: typeof Config.Type) => {
  const adapterRule = (o: Override) => ruleIn(o, 'film/host-events-through-adapter');
  const banned = config.overrides.find((o) => Option.contains(adapterRule(o), 'error'));
  const allowing = config.overrides.filter((o) =>
    Option.exists(adapterRule(o), (rule) => Array.isArray(rule)),
  );
  const url = config.overrides.filter((o) =>
    bansOf(hostBans(o)).some((b) => URL_NAMES.some((name) => b.ban === `global ${name}`)),
  );
  expect(banned).toBeDefined();
  return { banned: banned as Override, url, allowing };
};

/** Whether a ban keeps the address bar out of a page. */
const isUrl = (ban: Ban) => ban.use.includes("@bible/url-state's Location");

/** The film block's URL bans a block lacks, as `global name` or `object.property`. */
const urlBansMissing = (film: Override, block: Override): ReadonlyArray<string> => {
  const held = new Set(bansOf(hostBans(block)).map((b) => b.ban));
  return bansOf(hostBans(film))
    .filter(isUrl)
    .map((b) => b.ban)
    .filter((ban) => !held.has(ban));
};

/** Every form a page could reach a banned host name in, one statement a line. */
const probeOf = (options: NoGlobals): ReadonlyArray<string> =>
  bansOf(options).flatMap(({ form }) => [`${form};`, ...QUALIFIERS.map((q) => `${q}.${form};`)]);

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

/** The 1-based lines oxlint reported one of `rules` on (by the name it prints, `noGlobals`), in `--format unix`. */
const reportedLines = (
  out: string,
  rules: ReadonlyArray<string> = ['noGlobals', 'no-restricted-properties'],
): ReadonlySet<number> =>
  new Set(
    out
      .split('\n')
      .flatMap((line) =>
        Option.toArray(
          Option.map(
            Option.fromNullishOr(/probe\.ts:(\d+):\d+: .*\(([\w-]+)\)\]$/.exec(line)),
            (m) => ({ line: Number(m[1]), rule: m[2] ?? '' }),
          ),
        ),
      )
      .filter((report) => rules.includes(report.rule))
      .map((report) => report.line),
  );

/** The plugin's build as the repo installs it. */
const PLUGIN = Effect.map(Effect.all([Path.Path, ROOT]), ([path, root]) =>
  path.join(root, 'node_modules', 'oxlint-plugin-effect', 'dist', 'plugin.js'),
);

/** oxlint over `source` as `probe.ts` with the oxlint.json `config`: what it reported. */
const oxlintOver = Effect.fn('test.lintConfig.oxlintOver')(function* (
  config: string,
  source: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const oxlint = path.join(yield* ROOT, 'node_modules', '.bin', 'oxlint');
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const cwd = yield* fs.makeTempDirectoryScoped();
      yield* fs.writeFileString(path.join(cwd, 'probe.ts'), source);
      yield* fs.writeFileString(path.join(cwd, 'oxlint.json'), config);
      const handle = yield* spawner.spawn(
        ChildProcess.make(oxlint, ['-c', 'oxlint.json', '--format', 'unix', 'probe.ts'], {
          cwd,
          forceKillAfter: '5 seconds',
        }),
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

/** oxlint over `source` with only the host bans `options` and the brands `properties` on: what it reported. */
const lint = Effect.fn('test.lintConfig.lint')(function* (
  options: NoGlobals,
  properties: ReadonlyArray<Property>,
  source: string,
) {
  const config = yield* Schema.encodeEffect(ProbeConfig)({
    jsPlugins: [yield* PLUGIN],
    rules: {
      'effect/noGlobals': ['error', options],
      'no-restricted-properties': ['error', ...properties],
    },
  });
  return yield* oxlintOver(config, source);
});

/** The probe's lines oxlint left unreported. */
const unreported = Effect.fn('test.lintConfig.unreported')(function* (
  options: NoGlobals,
  properties: ReadonlyArray<Property>,
  probe: ReadonlyArray<string>,
) {
  const reported = reportedLines(yield* lint(options, properties, `${probe.join('\n')}\n`));
  return probe.filter((_, i) => !reported.has(i + 1));
});

describe('the lint config', () => {
  it.effect.layer(BunServices.layer)(
    'bans every host name however a page reaches it, and refuses one held where it cannot be followed',
    () =>
      Effect.gen(function* () {
        const { banned, allowing } = hostBlocks(yield* readJson('.oxlintrc.json', Config));
        const options = hostBans(banned);
        expect(bansOf(options).length).toBeGreaterThan(0);
        const probe = [...probeOf(options), ...CHAINS, ...HOLDS, ...CALLS];
        expect(yield* unreported(options, [], probe)).toEqual([]);
        // The URL's names are banned whole, and no block lets a file off its events.
        expect(bansOf(options).map((b) => b.ban)).toEqual(
          expect.arrayContaining([
            ...URL_NAMES.map((name) => `global ${name}`),
            'document.location',
            'document.URL',
            'document.documentURI',
          ]),
        );
        expect(urlEventsAllowed(allowing)).toEqual([]);
      }),
    SPAWNS_MS,
  );

  it.effect.layer(BunServices.layer)(
    "bans the host's storage, idle and width names a page has an adapter for",
    () =>
      Effect.gen(function* () {
        const { banned } = hostBlocks(yield* readJson('.oxlintrc.json', Config));
        expect(bansOf(hostBans(banned)).map((b) => b.ban)).toEqual(
          expect.arrayContaining([
            'global indexedDB',
            'global requestIdleCallback',
            'global innerWidth',
            'global outerWidth',
            'document.cookie',
            'navigator.sendBeacon',
          ]),
        );
      }),
  );

  it.effect.layer(BunServices.layer)(
    "bans the URL in every block that bans it as the film's block does, every form red",
    () =>
      Effect.gen(function* () {
        const { banned, url } = hostBlocks(yield* readJson('.oxlintrc.json', Config));
        // The film's, url-state's with egw-search's, and egw-search's scroll adapter's.
        expect(url.length).toBeGreaterThan(2);
        for (const block of url) {
          expect(urlBansMissing(banned, block)).toEqual([]);
          const options = hostBans(block);
          const urlChains = CHAINS.filter((chain) =>
            URL_NAMES.some((name) => chain.includes(name)),
          );
          expect(yield* unreported(options, [], [...probeOf(options), ...urlChains])).toEqual([]);
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
        // The brands' own block, and any later one that replaces its list.
        expect(listing.length).toBeGreaterThan(0);
        expect(listing.map((o) => [o.files[0], brandsUnbanned(o)])).toEqual(
          listing.map((o) => [o.files[0], []]),
        );
        for (const block of listing) {
          const properties = optionsIn(block, 'no-restricted-properties', Property);
          expect(
            yield* unreported({ builtins: false }, properties, brandsMade(properties)),
          ).toEqual([]);
        }
      }),
    SPAWNS_MS,
  );

  it.effect.layer(BunServices.layer)(
    "refuses Visitor.accumulate to the film's rules, and leaves the rest of Visitor",
    () =>
      Effect.gen(function* () {
        const config = yield* readJson('.oxlintrc.json', Config);
        const block = config.overrides.find((o) =>
          o.files.includes('**/packages/film/lint/**/*.ts'),
        );
        expect(block).toBeDefined();
        const properties = Option.match(Option.fromUndefinedOr(block), {
          onNone: () => [],
          onSome: (o) => optionsIn(o, 'no-restricted-properties', AnyProperty),
        });
        const probe = [
          "import { Visitor } from 'oxlint-plugin-effect/rule-bindings';",
          "Visitor.accumulate('Identifier', keep, analyze);",
          "Visitor.on('Identifier', visit);",
          'Visitor.merge(one, two);',
        ];
        const out = yield* oxlintOver(
          yield* Schema.encodeEffect(PropertiesConfig)({
            rules: { 'no-restricted-properties': ['error', ...properties] },
          }),
          `${probe.join('\n')}\n`,
        );
        expect([...reportedLines(out, ['no-restricted-properties'])]).toEqual([2]);
      }),
    SPAWNS_MS,
  );

  it.effect.layer(BunServices.layer)(
    "refuses an inlined import and a data URL in the First the Blade site's sources, and passes a URL import and prose",
    () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const config = yield* readJson('.oxlintrc.json', Config);
        const block = config.overrides.find((o) =>
          o.files.includes('**/apps/firsttheblade/src/**/*.ts'),
        );
        expect(block).toBeDefined();
        const rules = ['no-restricted-imports', 'film/no-data-url'].flatMap((key) =>
          Option.toArray(
            Option.map(
              Option.flatMap(Option.fromUndefinedOr(block), (o) => ruleIn(o, key)),
              (value) => [key, value] as const,
            ),
          ),
        );
        expect(rules.map(([key]) => key)).toEqual(['no-restricted-imports', 'film/no-data-url']);
        const probe = [
          "import a from './a.png?inline';",
          "import b from './b.png?url&inline';",
          "export const c = () => import('./c.webp?inline');",
          "export { d } from './d.svg?inline';",
          "export const e = 'data:image/png;base64,iVBORw0KGgo=';",
          "import f from './f.png?url';",
          "import g from './inline.png';",
          "import h from './h.png?inlined';",
          "export const i = 'the pages as data: where each is served';",
          'export const used = [a, b, f, g, h];',
        ];
        const out = yield* oxlintOver(
          yield* Schema.encodeEffect(RulesConfig)({
            jsPlugins: [path.join(yield* ROOT, 'packages', 'film', 'lint', 'plugin.ts')],
            rules: Object.fromEntries(rules),
          }),
          `${probe.join('\n')}\n`,
        );
        expect(
          [...reportedLines(out, ['no-restricted-imports', 'no-data-url'])].toSorted(
            (x, y) => x - y,
          ),
        ).toEqual([1, 2, 3, 4, 5]);
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
      const location = "@bible/url-state's Location";
      const film: Override = {
        files: ['film'],
        rules: {
          'effect/noGlobals': [
            'error',
            {
              members: {
                onhashchange: { use: location },
                document: [
                  { properties: ['location'], use: location },
                  { properties: ['cookie'], use: 'a store' },
                ],
              },
            },
          ],
        },
      };
      const narrower: Override = {
        files: ['egw'],
        rules: { 'effect/noGlobals': ['error', { members: { history: { use: location } } }] },
      };
      expect(urlBansMissing(film, narrower)).toEqual(['global onhashchange', 'document.location']);
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
