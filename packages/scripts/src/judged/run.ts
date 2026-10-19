// The judged rules' runner. Every item of a run the cache does not answer,
// of every rule, goes to the model in ONE request (a classify per item, each
// with its own rule's instructions and labels, keys c0…cN), split only past
// `bound` items or `budget` estimated input tokens, the parts sent at once.
// A run never fails on the model: no key, a request past its deadline, a
// rate limit, an HTTP error or an answer that misses items skips the items it
// could not judge, and says so on one line per rule. Nor on its cache:
// answers it cannot keep are asked again next run. A finding is a warning, or
// an error when its rule's severity is `error`.

import type { Duration } from 'effect';
import { Console, Effect, Option, Result, Schema } from 'effect';
import { type AiError, Decision, DecisionModel } from 'effect/ai';

import { keepAnswers, readCache } from './cache.js';
import { type JudgedRule, versionedId } from './rule.js';
import { type Answer, cacheKey } from './store.js';

/** Why a rule judged none of some items: what its skip line says. */
type SkipReason = 'no-key' | 'timeout' | 'rate-limit' | 'http' | 'incomplete';

/**
 * How many items one request holds at most, how many input tokens (as
 * `partsOf` estimates them), and how long one request may take.
 */
interface Limits {
  readonly bound: number;
  readonly budget: number;
  readonly deadline: Duration.Input;
}

/** One item's question: the rule that asks it and the item's text. */
interface Question {
  readonly rule: JudgedRule;
  readonly text: string;
}

/** A question's name among a run's answers: its rule and its text. */
export const questionKey = (question: Question) => `${question.rule.id}\0${question.text}`;

/** The model's answers for the questions it was asked (by `questionKey`), and why the rest went unanswered. */
interface Asked {
  readonly answers: ReadonlyMap<string, Answer>;
  readonly unanswered: ReadonlyArray<Question>;
  readonly reason: Option.Option<SkipReason>;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number };
}

/**
 * The lint's limits, measured on TypeSafe's Jev (2026-10-15): one request
 * took 300 comment lines (63,887 input tokens) and 210 comment blocks
 * (65,322), and refused 215 blocks and 320 lines `max_tokens_exceeded`, so
 * its input ends near 65,536 tokens; 182 blocks took 0.4–0.9 s.
 */
export const LIMITS: Limits = { bound: 200, budget: 60_000, deadline: '20 seconds' };

const PARTS_AT_ONCE = 8;

/** The skip reason an `AiError` from the model is. */
const reasonOf = (error: AiError.AiError): SkipReason => {
  switch (error.reason._tag) {
    case 'RateLimitError':
    case 'QuotaExhaustedError':
      return 'rate-limit';
    case 'InvalidOutputError':
    case 'StructuredOutputError':
      return 'incomplete';
    case 'AuthenticationError':
      if (error.reason.kind === 'MissingKey') return 'no-key';
      return 'http';
    default:
      return 'http';
  }
};

const Input = Schema.Record(Schema.String, Schema.String);

/** The instructions of the classify for the item under `id`: they name its key, as the measured request did. */
const instructionsFor = (rule: JudgedRule, id: string) =>
  `Judge the ${rule.subject} under key ${id}. ${rule.instructions}`;

/** One request: each question's text under the keys c0…cN, a classify of its rule's each, inside `deadline`. */
const askPart = (questions: ReadonlyArray<Question>, deadline: Duration.Input) => {
  const ids = questions.map((_, i) => `c${i}`);
  const definition = Decision.make({
    input: Input,
    decisions: Object.fromEntries(
      questions.map(({ rule }, i): [string, Decision.Classify<string>] => [
        `c${i}`,
        Decision.classify({
          instructions: instructionsFor(rule, `c${i}`),
          criteria: rule.criteria,
        }),
      ]),
    ),
  });
  const input = Object.fromEntries(ids.map((id, i) => [id, questions[i]?.text ?? '']));
  return DecisionModel.decide(definition, { input }).pipe(
    Effect.timeoutOption(deadline),
    Effect.result,
    Effect.map((result) =>
      Result.match(result, {
        onFailure: (error) => Result.fail(reasonOf(error)),
        onSuccess: Option.match({
          onNone: () => Result.fail<SkipReason>('timeout'),
          onSome: ({ answers, usage }) =>
            Result.succeed({
              answers: questions.flatMap((question, i) =>
                Option.toArray(
                  Option.map(
                    Option.fromUndefinedOr(answers[`c${i}`]),
                    (answer): [string, Answer] => [
                      questionKey(question),
                      { label: answer.label, probabilities: { ...answer.probabilities } },
                    ],
                  ),
                ),
              ),
              inputTokens: usage.inputTokens ?? 0,
              outputTokens: usage.outputTokens ?? 0,
            }),
        }),
      }),
    ),
  );
};

/** The tokens a UTF-16 unit past ASCII costs in `tokensOf`. */
const WIDE = 1.3;

/**
 * A text's share of a request's input tokens, from its characters and its
 * classify's: 3.2 ASCII characters a token, and `WIDE` tokens for each
 * UTF-16 unit past ASCII. Over what TypeSafe's Jev counted: 55,326 tokens
 * for the corpus' 182 comment blocks (an estimate of 58,800), 38,716 for
 * their lines (39,500), and 24,828 for 50 Greek-dense blocks, which hold
 * 10,700 units past ASCII: at 1 a unit the estimate was 22,350, so a unit
 * cost about 1.23. At 1.3 the estimate is 25,550, a little over the count,
 * so a part stays under the limit.
 */
const tokensOf = ({ rule, text }: Question) => {
  const criteria = Object.entries(rule.criteria).reduce(
    (n, [label, words]) => n + label.length + String(words).length,
    0,
  );
  const wide = text.split('').filter((unit) => unit.charCodeAt(0) > 0x7f).length;
  const ascii = instructionsFor(rule, 'c000').length + criteria + text.length - wide;
  return Math.ceil(ascii / 3.2 + wide * WIDE) + 8;
};

/** `questions` in order, cut into parts of at most `bound` questions and `budget` estimated tokens. */
export const partsOf = (
  questions: ReadonlyArray<Question>,
  limits: Pick<Limits, 'bound' | 'budget'>,
) => {
  const parts: Array<Array<Question>> = [];
  let part: Array<Question> = [];
  let tokens = 0;
  for (const question of questions) {
    const cost = tokensOf(question);
    if (part.length > 0 && (part.length >= limits.bound || tokens + cost > limits.budget)) {
      parts.push(part);
      part = [];
      tokens = 0;
    }
    part.push(question);
    tokens += cost;
  }
  if (part.length > 0) parts.push(part);
  return parts;
};

/**
 * Asks the model each question's rule's decision of its text: one request,
 * or past `bound` questions or `budget` tokens one request a part, the parts
 * sent at once, and none for no questions. A part that fails leaves its
 * questions unanswered, and the first failure's reason is the run's.
 */
export const ask = Effect.fn('judged.ask')(function* (
  questions: ReadonlyArray<Question>,
  limits: Limits,
) {
  const parts = partsOf(questions, limits);
  const results = yield* Effect.forEach(parts, (part) => askPart(part, limits.deadline), {
    concurrency: PARTS_AT_ONCE,
  });
  const answers = new Map<string, Answer>();
  const unanswered: Array<Question> = [];
  const reasons: Array<SkipReason> = [];
  let inputTokens = 0;
  let outputTokens = 0;
  results.forEach((result, i) =>
    Result.match(result, {
      onFailure: (reason) => {
        reasons.push(reason);
        unanswered.push(...(parts[i] ?? []));
      },
      onSuccess: (part) => {
        for (const [key, answer] of part.answers) answers.set(key, answer);
        inputTokens += part.inputTokens;
        outputTokens += part.outputTokens;
      },
    }),
  );
  const asked: Asked = {
    answers,
    unanswered,
    reason: Option.fromUndefinedOr(reasons[0]),
    usage: { inputTokens, outputTokens },
  };
  return asked;
});

const TaggedReason = Schema.Struct({ reason: Schema.Struct({ _tag: Schema.String }) });

/**
 * A failure's name on a skip line: its tag, with its reason's when that is
 * tagged too (`PlatformError.AlreadyExists`).
 */
export const detailOf = (error: { readonly _tag: string }) =>
  Option.match(Schema.decodeUnknownOption(TaggedReason)(error), {
    onNone: () => error._tag,
    onSome: ({ reason }) => `${error._tag}.${reason._tag}`,
  });

/** An item a judged rule reads: its rule, its file, its first line and its text. */
interface RuleItem {
  readonly rule: JudgedRule;
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

/**
 * An item the rule reports, with the model's probability for the reporting
 * label, and whether its answer is in the store, where the plugin reads it.
 */
interface Finding {
  readonly file: string;
  readonly line: number;
  readonly p: number;
  readonly kept: boolean;
}

/**
 * What a rule's run came to: its findings, how many items it read, how many
 * of those the cache answered and how many it asked about (`items` is
 * `cached + asked`; items of one text go in the request once), and its skip.
 */
interface Outcome {
  readonly rule: JudgedRule;
  readonly findings: ReadonlyArray<Finding>;
  readonly items: number;
  readonly cached: number;
  readonly asked: number;
  readonly skip: Option.Option<{ readonly reason: SkipReason; readonly items: number }>;
}

/** Where a run keeps its answers and which model's they are. */
interface Judging extends Limits {
  readonly model: string;
  readonly cacheFile: string;
}

/**
 * Judges `items` by their rules: the cache's answers first, then one request
 * for the rest of every rule, kept; answers an outcome for each of `rules`.
 */
export const judge = Effect.fn('judged.judge')(function* (
  rules: ReadonlyArray<JudgedRule>,
  items: ReadonlyArray<RuleItem>,
  judging: Judging,
) {
  const keyOf = (question: Question) =>
    cacheKey(versionedId(question.rule), judging.model, question.text);
  const cache = yield* readCache(judging.cacheFile);
  const isCached = (item: RuleItem) => cache.answers.has(keyOf(item));
  const fresh = [
    ...new Map(
      items.filter((item) => !isCached(item)).map((item) => [questionKey(item), item]),
    ).values(),
  ].map(({ rule, text }) => ({ rule, text }));
  const asked = yield* ask(fresh, judging);
  // Answers that cannot be kept are asked again next run, and their findings
  // are the runner's to print: the plugin cannot see them.
  let kept = true;
  if (asked.answers.size > 0) {
    const answered = fresh.filter((question) => asked.answers.has(questionKey(question)));
    const judged = new Map<string, Set<string>>();
    for (const item of items)
      if (isCached(item) || asked.answers.has(questionKey(item)))
        judged.set(item.file, new Set([...(judged.get(item.file) ?? []), item.rule.id]));
    kept = yield* keepAnswers(
      judging.cacheFile,
      new Map(
        answered.flatMap((question) =>
          Option.toArray(
            Option.map(
              Option.fromUndefinedOr(asked.answers.get(questionKey(question))),
              (answer): [string, Answer] => [keyOf(question), answer],
            ),
          ),
        ),
      ),
      judged,
    ).pipe(
      Effect.as(true),
      Effect.catch((error) =>
        Console.error(
          `[judged] answers not kept rule=${[...new Set(answered.map((q) => q.rule.id))].join(',')} detail=${detailOf(error)}`,
        ).pipe(Effect.as(false)),
      ),
    );
  }
  const answerOf = (item: RuleItem) =>
    Option.orElse(Option.fromUndefinedOr(cache.answers.get(keyOf(item))), () =>
      Option.fromUndefinedOr(asked.answers.get(questionKey(item))),
    );
  const unanswered = new Set(asked.unanswered.map(questionKey));
  return rules.map((rule): Outcome => {
    const own = items.filter((item) => item.rule.id === rule.id);
    const skipped = own.filter((item) => unanswered.has(questionKey(item))).length;
    return {
      rule,
      findings: own.flatMap((item) =>
        Option.toArray(
          Option.flatMap(answerOf(item), (answer) =>
            Option.liftPredicate(
              {
                file: item.file,
                line: item.line,
                p: answer.probabilities[rule.reports] ?? 0,
                kept: isCached(item) || kept,
              },
              (finding) => finding.p >= rule.threshold,
            ),
          ),
        ),
      ),
      items: own.length,
      cached: own.filter(isCached).length,
      asked: own.filter((item) => !isCached(item)).length,
      skip: Option.flatMap(asked.reason, (reason) =>
        Option.liftPredicate({ reason, items: skipped }, () => skipped > 0),
      ),
    };
  });
});

/** The word a finding's line names its weight by: oxlint's own, `warning` or `error`. */
const weightOf = (rule: JudgedRule) => {
  if (rule.severity === 'error') return 'error';
  return 'warning';
};

/** A finding's line: `file:line warning judged(<rule>): <message> p=<p>`. */
export const findingLine = (rule: JudgedRule, finding: Finding) =>
  `${finding.file}:${finding.line} ${weightOf(rule)} judged(${rule.id}): ${rule.message} p=${finding.p.toFixed(2)}`;

/** A run's one `[judged]` line for a rule: its skip, or what it read when it judged them all. */
export const runLine = (outcome: Outcome) =>
  Option.match(outcome.skip, {
    onSome: (skip) =>
      `[judged] skipped rule=${outcome.rule.id} reason=${skip.reason} items=${skip.items}`,
    onNone: () =>
      `[judged] rule=${outcome.rule.id} items=${outcome.items} cached=${outcome.cached} asked=${outcome.asked} findings=${outcome.findings.length}`,
  });
