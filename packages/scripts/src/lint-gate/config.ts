// The two lint configs the gate derives from `.oxlintrc.json`, and the files
// its JS plugins passed, kept by content.
//
// - `nativeOnly`: oxlint's native rules alone (no JS plugin, none of their
//   rules). The native rules hold cross-file rules (`import/default`,
//   `import/namespace`), so a file's result is not a function of the file:
//   they run over every file, every run (0.4 s over the repo).
// - `withoutJudged`: every rule but the judged ones (TypeSafe Jev over the
//   network, reading a store that changes without the file changing). The JS
//   plugins (`oxlint-plugin-effect`, the `film` plugin) read no file but the
//   one they lint, so their answer on a file is kept by its content, under a
//   key of their own code (`closure.ts`).
//
// A derived config is written into a cache folder, so each JS plugin given as
// a path is made absolute; every override glob in the repo's config starts
// with `**/`, so it matches from there as from the root.

import { Array as Arr, Effect, Option, Schema } from 'effect';

/** The judged plugin's rules, by their prefix. */
const JUDGED = 'judged';

/** oxlint's native plugins that are on with no `plugins` list. */
const NATIVE_DEFAULT = ['eslint', 'oxc', 'unicorn', 'typescript'];

const Rules = Schema.Record(Schema.String, Schema.Unknown);
const Rest = [Schema.Record(Schema.String, Schema.Unknown)] as const;
const Names = Schema.Array(Schema.String);

const none = <A>(): Effect.Effect<ReadonlyArray<A>> => Effect.succeed([]);

const Override = Schema.StructWithRest(
  Schema.Struct({
    files: Names,
    rules: Rules.pipe(Schema.withDecodingDefaultKey(Effect.succeed({}))),
    plugins: Names.pipe(Schema.withDecodingDefaultKey(none<string>())),
    jsPlugins: Names.pipe(Schema.withDecodingDefaultKey(none<string>())),
  }),
  Rest,
);

/** The parts of a lint config the gate rewrites; every other key is kept as it is. */
export const LintConfig = Schema.StructWithRest(
  Schema.Struct({
    plugins: Names.pipe(Schema.withDecodingDefaultKey(none<string>())),
    jsPlugins: Names.pipe(Schema.withDecodingDefaultKey(none<string>())),
    rules: Rules.pipe(Schema.withDecodingDefaultKey(Effect.succeed({}))),
    overrides: Schema.Array(Override).pipe(
      Schema.withDecodingDefaultKey(none<typeof Override.Encoded>()),
    ),
  }),
  Rest,
);
export type LintConfig = typeof LintConfig.Type;

/** A rule's plugin: the part of its name before `/`, `eslint` for a bare name. */
const pluginOf = (rule: string) =>
  Option.getOrElse(Arr.head(rule.split('/').slice(0, -1)), () => 'eslint');

/** `rules` with only the rules `keep` takes. */
const keepRules = (rules: typeof Rules.Type, keep: (rule: string) => boolean) =>
  Object.fromEntries(Object.entries(rules).filter(([rule]) => keep(rule)));

/** `config` with its rules (top and overrides) filtered and its JS plugins mapped. */
const rewrite = (
  config: LintConfig,
  keep: (rule: string) => boolean,
  jsPlugins: (plugins: ReadonlyArray<string>) => ReadonlyArray<string>,
): LintConfig => ({
  ...config,
  jsPlugins: jsPlugins(config.jsPlugins),
  rules: keepRules(config.rules, keep),
  overrides: config.overrides.map((override) => ({
    ...override,
    rules: keepRules(override.rules, keep),
    jsPlugins: jsPlugins(override.jsPlugins),
  })),
});

/** `config` with no JS plugin and only the rules of oxlint's native plugins. */
export const nativeOnly = (config: LintConfig): LintConfig => {
  const native = new Set([
    ...NATIVE_DEFAULT,
    ...config.plugins,
    ...config.overrides.flatMap((override) => override.plugins),
  ]);
  return rewrite(
    config,
    (rule) => native.has(pluginOf(rule)),
    () => [],
  );
};

/** A JS plugin as a config in another folder names it: a path (`./…`) through `absolute`. */
const relocated = (absolute: (plugin: string) => string) => (plugin: string) => {
  if (plugin.startsWith('.')) return absolute(plugin);
  return plugin;
};

/**
 * `config` without the judged plugin (`judgedPlugin`, as the config names it)
 * and its rules; each other JS plugin given as a path is resolved by `absolute`.
 */
export const withoutJudged = (
  config: LintConfig,
  judgedPlugin: string,
  absolute: (plugin: string) => string,
): LintConfig =>
  rewrite(
    config,
    (rule) => pluginOf(rule) !== JUDGED,
    (plugins) => plugins.filter((plugin) => plugin !== judgedPlugin).map(relocated(absolute)),
  );

/** The files the JS plugins passed, each at its content's hash, under the key of what else decides their answer. */
export const Kept = Schema.Struct({
  key: Schema.String,
  files: Schema.Record(Schema.String, Schema.String),
});
export type Kept = typeof Kept.Type;

/** Whether `kept` holds `file` at `hash` under `key`. */
const holds = (kept: Kept, key: string, file: string, hash: string) =>
  kept.key === key && Option.contains(Option.fromUndefinedOr(kept.files[file]), hash);

/** The files of `hashes` (path to content hash) that `kept` does not hold as they are. */
export const unkept = (kept: Kept, key: string, hashes: ReadonlyMap<string, string>) =>
  [...hashes].filter(([file, hash]) => !holds(kept, key, file, hash)).map(([file]) => file);

/**
 * What to keep after a run: the files still kept (same key, same hash), and
 * each file of `passed` at its hash now.
 */
export const keptAfter = (
  kept: Kept,
  key: string,
  hashes: ReadonlyMap<string, string>,
  passed: ReadonlyArray<string>,
): Kept => {
  const still = [...hashes].filter(([file, hash]) => holds(kept, key, file, hash));
  const now = passed.flatMap((file) =>
    Option.toArray(
      Option.map(Option.fromUndefinedOr(hashes.get(file)), (hash) => [file, hash] as const),
    ),
  );
  return { key, files: Object.fromEntries([...still, ...now]) };
};

/** The file a line of oxlint's unix report names (`file:line:col: …`). */
const fileOf = (line: string) =>
  Option.flatMap(Option.fromNullishOr(/^([^:\s][^:]*):\d+:\d+: /.exec(line)), (match) =>
    Option.fromUndefinedOr(match[1]),
  );

/**
 * The files of a part that passed: all of them when oxlint exited 0; when it
 * exited 1 and its report (`--format=unix`, `file:line:col: …`) names some of
 * them, the others; none when it failed any other way.
 */
export const passedOf = (files: ReadonlyArray<string>, code: number, report: string) => {
  if (code === 0) return files;
  const named = new Set(report.split('\n').flatMap((line) => Option.toArray(fileOf(line))));
  const ours = files.filter((file) => named.has(file));
  if (code !== 1 || ours.length === 0) return [];
  return files.filter((file) => !named.has(file));
};
