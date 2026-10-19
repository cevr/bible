// The repo's `judged` oxlint plugin: each judged rule (`src/judged/rule.ts`) is
// `judged/<id>` in `.oxlintrc.json`, its options its whole definition, and
// this reports the answers the runner (`bun run lint:judged`) has kept for it
// at their lines, at the rule's severity. It asks no model: oxlint's rules
// are synchronous and run where there is no key (CI). The store is keyed by
// content (`src/judged/store.ts`), so each item of the file is hashed and
// its answer read by its text, wherever the text now lives: a moved or
// copied breach reports at its new place. An item no answer is kept for
// says nothing, and so does a checkout with no kept answers: the rule fails
// open.
//
// oxlint runs its plugins in Node, so this reads the store with node's file
// system, from the folder oxlint runs in (the repo's root, where the config's
// `settings.judged.cache` is rooted). Each rule's id is named here once; the
// config test (`src/judged/config.test.ts`) holds the names to the config's
// `judged/*` entries.

import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { Effect, Option, Schema } from 'effect';
import { Diagnostic, Plugin, Rule, RuleContext, Visitor } from 'oxlint-plugin-effect/rule-bindings';

import { SELECTORS, itemsOf, parse, selects } from '../src/judged/items.ts';
import { RuleOptions, Settings, cacheModel, ruleKey } from '../src/judged/rule.ts';
import { type Answer, Store, cacheKey } from '../src/judged/store.ts';

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

/** The rule `judged/<id>`: each item of a file it reads whose kept answer is at or over its threshold. */
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
      const kept = Option.flatMap(settings, ({ judged }) =>
        storeAt(resolve(context.cwd, judged.cache)),
      );
      if (Option.isNone(kept) || Option.isNone(settings) || !selects(options.selector, file))
        return Visitor.on('Program', () => Effect.void);
      const model = cacheModel(settings.value.judged.model);
      const rule = ruleKey(options);
      return Visitor.on('Program', () =>
        Effect.forEach(
          itemsOf(options.selector, sourceOf(file, context.sourceCode.text)),
          (item) =>
            Option.match(
              Option.filter(
                Option.map(
                  Option.fromUndefinedOr(kept.value.get(cacheKey(rule, model, item.key))),
                  (answer) => answer.probabilities[options.reports] ?? 0,
                ),
                (p) => p >= options.threshold,
              ),
              {
                onNone: () => Effect.void,
                onSome: (p) =>
                  context.report(
                    Diagnostic.make({
                      node: { range: [item.start, item.start] },
                      message: `${options.message} p=${p.toFixed(2)}`,
                    }),
                  ),
              },
            ),
          { discard: true },
        ),
      );
    },
  });

export default Plugin.define({
  name: 'judged',
  rules: Object.fromEntries(RULE_IDS.map((id) => [id, judgedRule(id)])),
});
