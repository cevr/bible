// The judged rules' runner. Every item of a run the cache does not answer,
// of every rule, goes to the model in ONE request (a classify per item, each
// with its own rule's instructions and labels, keys c0…cN), split only past
// `bound` items or `budget` estimated input tokens, the parts sent eight at
// a time. A part refused for a rate limit or an overloaded host is sent again
// while its deadline allows (`retrying`). A run never fails on the model: no
// key, no credits, a request past its deadline, a rate limit or an
// overloaded host past its retries, an HTTP error or an answer that misses
// items skips the items it could not judge, and says so on one line per rule;
// a failure that says the same of every part sends none of the parts after
// it. Nor on its store:
// answers it cannot keep are asked again next run. A finding is a warning, or
// an error when its rule's severity is `error`.

import { Clock, Console, Duration, Effect, Option, Predicate, Ref, Result, Schema } from 'effect';
import { type AiError, Decision, DecisionModel } from 'effect/ai';

import { changes, keepAnswers, readCache } from './cache.js';
import { type JudgedRule, ruleKey } from './rule.js';
import { type Verdict, cacheKey, dayOf } from './store.js';

/** Why a rule judged none of some items: what its skip line says. */
type SkipReason =
  | 'no-key'
  | 'no-credits'
  | 'timeout'
  | 'rate-limit'
  | 'overloaded'
  | 'http'
  | 'incomplete'
  | 'too-big';

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
  readonly answers: ReadonlyMap<string, Verdict>;
  readonly unanswered: ReadonlyArray<Question>;
  readonly reason: Option.Option<SkipReason>;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number };
}

/**
 * The lint's limits, measured on TypeSafe's Jev (2026-10-15): one request
 * took 300 comment lines (63,887 input tokens) and 210 comment blocks
 * (65,322), and refused 215 blocks and 320 lines `max_tokens_exceeded`, so
 * its input ends near 65,536 tokens; 182 blocks took 0.4–0.9 s, so a part
 * past 5 s is a host that hangs, and the lint skips it rather than wait.
 */
export const LIMITS: Limits = { bound: 200, budget: 60_000, deadline: '5 seconds' };

const PARTS_AT_ONCE = 8;

/** Whether a failure's words say TypeSafe refused it for the account's credits (HTTP 402, `billing_error`). */
const billing = (reason: AiError.AiError['reason']) =>
  Predicate.hasProperty(reason, 'description') &&
  Predicate.isString(reason.description) &&
  reason.description.includes('billing_error');

/** Whether a failure is TypeSafe's `529 Overloaded`: a host too busy, for now, to answer. */
const overloaded = (reason: AiError.AiError['reason']) =>
  reason._tag === 'InternalProviderError' && reason.http?.response?.status === 529;

/**
 * The skip reason an `AiError` from the model is: `too-big` for a request
 * past the model's input limit, `no-credits` for an account with none left,
 * `overloaded` for a host too busy to answer.
 */
const reasonOf = (error: AiError.AiError): SkipReason => {
  if (billing(error.reason)) return 'no-credits';
  if (overloaded(error.reason)) return 'overloaded';
  switch (error.reason._tag) {
    case 'InvalidRequestError':
      if (
        Option.exists(Option.fromUndefinedOr(error.reason.description), (words) =>
          words.includes('max_tokens_exceeded'),
        )
      )
        return 'too-big';
      return 'http';
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

/** How many times a part refused for a rate limit or an overloaded host is sent again. */
const RETRIES = 3;

/** The wait before retry `n` (0, 1, 2) when the refusal names none: 250 ms, doubled each time. */
const backoff = (n: number) => Duration.millis(250 * 2 ** n);

/**
 * `request` sent again, up to `RETRIES` times, while TypeSafe refuses it
 * for a rate limit (429) or an overloaded host (529): each time after the
 * wait the refusal names (`retry-after`), else `backoff`'s, so long as the
 * wait ends before `deadline` from the first send. A wait past it is not
 * waited: the refusal is the part's, and the run halts on it (`RUN_WIDE`).
 */
const retrying = <A, R>(
  request: Effect.Effect<A, AiError.AiError, R>,
  deadline: Duration.Input,
): Effect.Effect<A, AiError.AiError, R> =>
  Effect.flatMap(Clock.currentTimeMillis, (sent) => {
    const end = sent + Duration.toMillis(Duration.fromInputUnsafe(deadline));
    const attempt = (n: number): Effect.Effect<A, AiError.AiError, R> =>
      Effect.catch(request, (error) => {
        if (n >= RETRIES || !(error.reason._tag === 'RateLimitError' || overloaded(error.reason)))
          return Effect.fail(error);
        const wait = Option.getOrElse(Option.fromUndefinedOr(error.retryAfter), () => backoff(n));
        return Effect.flatMap(Clock.currentTimeMillis, (now) => {
          if (now + Duration.toMillis(wait) >= end) return Effect.fail(error);
          return Effect.andThen(Effect.sleep(wait), attempt(n + 1));
        });
      });
    return attempt(0);
  });

/**
 * One request: each question's text under the keys c0…cN, a classify of its
 * rule's each, inside `deadline`, sent again on a rate limit or an
 * overloaded host while the deadline allows (`retrying`).
 */
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
  return retrying(DecisionModel.decide(definition, { input }), deadline).pipe(
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
                    (answer): [string, Verdict] => [
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

/** What asking one part came to: its answers by `questionKey` and its tokens, or why it went unanswered. */
type PartResult = Result.Result<
  {
    readonly answers: ReadonlyArray<readonly [string, Verdict]>;
    readonly inputTokens: number;
    readonly outputTokens: number;
  },
  { readonly reason: SkipReason; readonly questions: ReadonlyArray<Question> }
>;

/**
 * The reasons a part fails for that say the same of every part: the account
 * (no key, no credits, a rate limit still met after its retries) or a host
 * overloaded past its retries or that does not answer in time.
 */
const RUN_WIDE: ReadonlySet<SkipReason> = new Set([
  'no-key',
  'no-credits',
  'rate-limit',
  'overloaded',
  'timeout',
]);

/**
 * Asks one part; a part the model refuses as past its input limit (the
 * estimate in `tokensOf` is not the model's count) is asked again as its two
 * halves, at once, down to one question, which skips `too-big`. Once a part
 * fails for a `RUN_WIDE` reason, `halt` holds it, and every part not yet
 * sent skips for it unasked.
 */
const askSplitting = (
  questions: ReadonlyArray<Question>,
  deadline: Duration.Input,
  halt: Ref.Ref<Option.Option<SkipReason>>,
): Effect.Effect<ReadonlyArray<PartResult>, never, DecisionModel.DecisionModel> =>
  Effect.flatMap(Ref.get(halt), (halted) => {
    if (Option.isSome(halted))
      return Effect.succeed([Result.fail({ reason: halted.value, questions })]);
    return Effect.flatMap(askPart(questions, deadline), (result) => {
      if (Result.isFailure(result) && result.failure === 'too-big' && questions.length > 1) {
        const half = Math.ceil(questions.length / 2);
        return Effect.map(
          Effect.forEach(
            [questions.slice(0, half), questions.slice(half)],
            (part) => askSplitting(part, deadline, halt),
            { concurrency: 2 },
          ),
          (halves) => halves.flat(),
        );
      }
      const failed = Result.mapError(result, (reason) => ({ reason, questions }));
      if (Result.isFailure(result) && RUN_WIDE.has(result.failure))
        return Effect.as(Ref.set(halt, Option.some(result.failure)), [failed]);
      return Effect.succeed([failed]);
    });
  });

/**
 * Asks the model each question's rule's decision of its text: one request,
 * or past `bound` questions or `budget` tokens one request a part, the parts
 * sent `PARTS_AT_ONCE` at a time, and none for no questions. A part past the
 * model's input limit is asked in halves; a part that fails otherwise leaves
 * its questions unanswered, the parts after a `RUN_WIDE` failure go unsent,
 * and the first failure's reason is the run's.
 */
export const ask = Effect.fn('judged.ask')(function* (
  questions: ReadonlyArray<Question>,
  limits: Limits,
) {
  const parts = partsOf(questions, limits);
  const halt = yield* Ref.make(Option.none<SkipReason>());
  const results = yield* Effect.forEach(
    parts,
    (part) => askSplitting(part, limits.deadline, halt),
    { concurrency: PARTS_AT_ONCE },
  );
  const answers = new Map<string, Verdict>();
  const unanswered: Array<Question> = [];
  const reasons: Array<SkipReason> = [];
  let inputTokens = 0;
  let outputTokens = 0;
  for (const result of results.flat())
    Result.match(result, {
      onFailure: (failed) => {
        reasons.push(failed.reason);
        unanswered.push(...failed.questions);
      },
      onSuccess: (part) => {
        for (const [key, answer] of part.answers) answers.set(key, answer);
        inputTokens += part.inputTokens;
        outputTokens += part.outputTokens;
      },
    });
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

/** An item a judged rule reads: its rule, its file, its first line, its text and its key (`items.ts`). */
interface RuleItem {
  readonly rule: JudgedRule;
  readonly file: string;
  readonly line: number;
  readonly text: string;
  readonly key: string;
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
 * `cached + asked`; items of one key go in the request once), and its skip.
 */
interface Outcome {
  readonly rule: JudgedRule;
  readonly findings: ReadonlyArray<Finding>;
  readonly items: number;
  readonly cached: number;
  readonly asked: number;
  readonly skip: Option.Option<{ readonly reason: SkipReason; readonly items: number }>;
}

/** Where a run keeps its answers (the store every checkout shares) and which model's they are. */
interface Judging extends Limits {
  readonly model: string;
  readonly storeFile: string;
}

/**
 * Judges `items` by their rules: the store's answers first, then one request
 * for the rest of every rule, kept; answers an outcome for each of `rules`.
 * The store is every checkout's: each answer `items` read is marked seen
 * today, and an answer no run read for `MAX_AGE_DAYS` (an edited or deleted
 * item's, an old rule's or model's) is dropped (`cache.ts`).
 */
export const judge = Effect.fn('judged.judge')(function* (
  rules: ReadonlyArray<JudgedRule>,
  items: ReadonlyArray<RuleItem>,
  judging: Judging,
) {
  // Each rule's words and each question's key are hashed once a run.
  const ruleKeys = new Map(rules.map((rule) => [rule.id, ruleKey(rule)]));
  const keys = new Map<string, string>();
  const keyOf = (question: Pick<RuleItem, 'rule' | 'key'>) => {
    const name = `${question.rule.id}\0${question.key}`;
    return Option.getOrElse(Option.fromUndefinedOr(keys.get(name)), () => {
      const key = cacheKey(
        ruleKeys.get(question.rule.id) ?? ruleKey(question.rule),
        judging.model,
        question.key,
      );
      keys.set(name, key);
      return key;
    });
  };
  const cache = yield* readCache(judging.storeFile);
  const day = dayOf(yield* Clock.currentTimeMillis);
  const isCached = (item: RuleItem) => cache.has(keyOf(item));
  const fresh = [
    ...new Map(items.filter((item) => !isCached(item)).map((item) => [keyOf(item), item])).values(),
  ];
  const asked = yield* ask(fresh, judging);
  // Answers that cannot be kept are asked again next run, and their findings
  // are the runner's to print: the plugin cannot see them.
  const answered = new Map(
    fresh.flatMap((question) =>
      Option.toArray(
        Option.map(
          Option.fromUndefinedOr(asked.answers.get(questionKey(question))),
          (answer): [string, Verdict] => [keyOf(question), answer],
        ),
      ),
    ),
  );
  const keeping = { fresh: answered, read: new Set(items.map(keyOf)), day };
  const kept =
    !changes(cache, keeping) ||
    (yield* keepAnswers(judging.storeFile, keeping).pipe(
      Effect.as(true),
      Effect.catch((error) =>
        Console.error(
          `[judged] answers not kept rule=${[...new Set(fresh.map((q) => q.rule.id))].join(',')} detail=${detailOf(error)}`,
        ).pipe(Effect.as(false)),
      ),
    ));
  const answerOf = (item: RuleItem) =>
    Option.orElse(Option.fromUndefinedOr(cache.get(keyOf(item))), () =>
      Option.fromUndefinedOr(answered.get(keyOf(item))),
    );
  const freshKeys = new Map(fresh.map((item) => [questionKey(item), keyOf(item)]));
  const unanswered = new Set(
    asked.unanswered.map((question) => freshKeys.get(questionKey(question))),
  );
  return rules.map((rule): Outcome => {
    const own = items.filter((item) => item.rule.id === rule.id);
    const skipped = own.filter((item) => unanswered.has(keyOf(item))).length;
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
