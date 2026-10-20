// The repo's `judged` oxlint plugin: each judged rule (`src/judged/rule.ts`) is
// `judged/<id>` in `.oxlintrc.json`, its options its whole definition, and
// this reports the answers the runner (`bun run lint:judged`) has kept for it
// at their lines, at the rule's severity. It asks no model: oxlint's rules
// are synchronous and run where there is no key (CI).
//
// A file the checkout's last run read as it stands is reported from that
// run's findings (`src/judged/findings.ts`), by the file's hash and the
// rule's signature, when the run's item code is this code's and the run is
// no older than the store keeps answers, with no parse. Any other file is read item by item:
// the store is keyed by content (`src/judged/store.ts`), so each item of the
// file is hashed and its answer read by its text, wherever the text now
// lives, and a moved or copied breach reports at its new place. An item no
// answer is kept for says nothing, and so does a checkout with no kept
// answers: the rule fails open.
//
// oxlint runs its plugins in Node, so this reads both files with node's file
// system: the findings from the checkout (`settings.judged.checkout`, from
// the root oxlint runs in), the store from the git common dir
// (`settings.judged.store`), which every checkout shares. Each rule's id is
// named here once; the config test (`src/judged/config.test.ts`) holds the
// names to the config's `judged/*` entries.

import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { Clock, Effect, Option, Schema } from 'effect';
import { Diagnostic, Plugin, Rule, RuleContext, Visitor } from 'oxlint-plugin-effect/rule-bindings';

import {
  Findings,
  findingsFileOf,
  makersHash,
  ruleSignature,
  textHash,
} from '../src/judged/findings.ts';
import { SELECTORS, itemsOf, parse, selects } from '../src/judged/items.ts';
import { RuleOptions, Settings, cacheModel, ruleKey } from '../src/judged/rule.ts';
import {
  type Answer,
  MAX_AGE_DAYS,
  Store,
  cacheKey,
  dayOf,
  storeFileOf,
} from '../src/judged/store.ts';

/** A file parsed, as the selectors read it. */
type Source = ReturnType<typeof parse>;

/** The judged rules this plugin defines, by id: each needs its entry in `.oxlintrc.json`. */
export const RULE_IDS = [
  'historyComment',
  'commentClaimsCode',
  'testOracle',
  'silentDrop',
  'scriptSpeech',
] as const;

const SharedSettings = Schema.Struct({ judged: Settings });

/** The kept answers as the plugin reads them: by key. */
type Kept = ReadonlyMap<string, Answer>;

/** The store at each path, read once a process: oxlint's run is one look at the files. */
const stores = new Map<string, Option.Option<Kept>>();

/** The store at `file`, none when it is missing or does not read. */
const storeAt = (file: string): Option.Option<Kept> =>
  Option.getOrElse(Option.fromUndefinedOr(stores.get(file)), () => readStore(file));

/** Reads the store at `file` and remembers it. */
const readStore = (file: string): Option.Option<Kept> => {
  const read = Effect.runSync(
    Effect.try(() => readFileSync(file, 'utf8')).pipe(
      Effect.flatMap(Schema.decodeEffect(Store)),
      Effect.option,
    ),
  );
  const kept = Option.filter(
    Option.map(read, (store): Kept => new Map(Object.entries(store.answers))),
    (answers) => answers.size > 0,
  );
  stores.set(file, kept);
  return kept;
};

/** The last source parsed: each rule of a file reads it, so it is parsed once. */
let parsed = Option.none<Source>();

const sourceOf = (file: string, text: string): Source => {
  if (Option.isSome(parsed) && parsed.value.file === file && parsed.value.text === text)
    return parsed.value;
  const source = parse(file, text);
  parsed = Option.some(source);
  return source;
};

/** The options' JSON schema: oxlint refuses options on a rule without one. */
const OPTIONS_SCHEMA = [
  {
    type: 'object',
    properties: {
      selector: { type: 'string', enum: SELECTORS },
      subject: { type: 'string' },
      instructions: { type: 'string' },
      criteria: { type: 'object', additionalProperties: { type: 'string' } },
      reports: { type: 'string' },
      threshold: { type: 'number', minimum: 0, maximum: 1 },
      message: { type: 'string' },
      charsPerToken: { type: 'number', exclusiveMinimum: 0 },
    },
    required: [
      'selector',
      'subject',
      'instructions',
      'criteria',
      'reports',
      'threshold',
      'message',
    ],
    additionalProperties: false,
  },
];

/** The findings file at each path, read once a process. */
const findingsFiles = new Map<string, Option.Option<Findings>>();

/** The findings file at `file`, none when it is missing or does not read. */
const findingsAt = (file: string): Option.Option<Findings> =>
  Option.getOrElse(Option.fromUndefinedOr(findingsFiles.get(file)), () => {
    const read = Effect.runSync(
      Effect.try(() => readFileSync(file, 'utf8')).pipe(
        Effect.flatMap(Schema.decodeEffect(Findings)),
        Effect.option,
      ),
    );
    findingsFiles.set(file, read);
    return read;
  });

/** The last file hashed: each rule of a file reads its hash, so it is hashed once. */
let hashed = Option.none<{ readonly file: string; readonly text: string; readonly hash: string }>();

const hashOf = (file: string, text: string) => {
  if (Option.isSome(hashed) && hashed.value.file === file && hashed.value.text === text)
    return hashed.value.hash;
  const hash = textHash(text);
  hashed = Option.some({ file, text, hash });
  return hash;
};

/** A finding to report: where its item starts, and its probability. */
interface Reported {
  readonly start: number;
  readonly p: number;
}

/**
 * The findings of rule `id` (its options `options`) in `file`, whose text is
 * `text`, as the last run of the checkout at `cwd` wrote them: none when the
 * file's text, or the rule's words, selector, label, threshold or model, are
 * not what the run read, the run could not judge the rule there, the code
 * that makes the items is not the run's, or the run is more than
 * `MAX_AGE_DAYS` old (the store may have dropped its answers).
 */
const lastRunOf = (
  cwd: string,
  settings: Settings,
  id: string,
  options: RuleOptions,
  file: string,
  text: string,
): Option.Option<ReadonlyArray<Reported>> =>
  findingsAt(findingsFileOf(cwd, settings.checkout)).pipe(
    Option.filter(
      (findings) =>
        findings.makers === makersHash() &&
        dayOf(Effect.runSync(Clock.currentTimeMillis)) - findings.day <= MAX_AGE_DAYS,
    ),
    Option.filter(
      (findings) => findings.rules[id] === ruleSignature(cacheModel(settings.model), options),
    ),
    Option.flatMap((findings) => Option.fromUndefinedOr(findings.files[file])),
    Option.filter((entry) => entry.hash === hashOf(file, text)),
    Option.flatMap((entry) => Option.fromUndefinedOr(entry.rules[id])),
  );

/** The findings of a rule (its options `options`) in a file, read from its items and the store's kept answers. */
const keptOf = (
  cwd: string,
  settings: Settings,
  options: RuleOptions,
  file: string,
  text: string,
): ReadonlyArray<Reported> =>
  Option.match(storeAt(storeFileOf(cwd, settings.store)), {
    onNone: () => [],
    onSome: (kept) => {
      const model = cacheModel(settings.model);
      const rule = ruleKey(options);
      return itemsOf(options.selector, sourceOf(file, text)).flatMap((item) =>
        Option.toArray(
          Option.filter(
            Option.map(
              Option.fromUndefinedOr(kept.get(cacheKey(rule, model, item.key))),
              (answer): Reported => ({
                start: item.start,
                p: answer.probabilities[options.reports] ?? 0,
              }),
            ),
            (found) => found.p >= options.threshold,
          ),
        ),
      );
    },
  });

/**
 * The rule `judged/<id>`: each item of a file it reads whose kept answer is
 * at or over its threshold, from the checkout's last run when it read the
 * file as it stands, else from the file's items and the store.
 */
const judgedRule = (id: string) =>
  Rule.define({
    name: id,
    meta: Rule.meta({
      type: 'suggestion',
      description:
        "A judged rule's kept answers (bun run lint:judged asks the model), reported at their lines.",
      schema: OPTIONS_SCHEMA,
    }),
    options: RuleOptions,
    create: function* (options) {
      const context = yield* RuleContext;
      const file = relative(context.cwd, context.filename);
      const settings = Schema.decodeUnknownOption(SharedSettings)(context.settings);
      if (Option.isNone(settings) || !selects(options.selector, file))
        return Visitor.on('Program', () => Effect.void);
      const { judged } = settings.value;
      return Visitor.on('Program', () => {
        const text = context.sourceCode.text;
        const reported = Option.getOrElse(
          lastRunOf(context.cwd, judged, id, options, file, text),
          () => keptOf(context.cwd, judged, options, file, text),
        );
        return Effect.forEach(
          reported,
          ({ start, p }) =>
            context.report(
              Diagnostic.make({
                node: { range: [start, start] },
                message: `${options.message} p=${p.toFixed(2)}`,
              }),
            ),
          { discard: true },
        );
      });
    },
  });

export default Plugin.define({
  name: 'judged',
  rules: Object.fromEntries(RULE_IDS.map((id) => [id, judgedRule(id)])),
});
