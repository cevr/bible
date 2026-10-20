// The judged rules' runner. Every item of a run the cache does not answer,
// of every rule, goes to the model in ONE request (a classify per item, each
// with its own rule's instructions and labels, keys c0…cN), split only past
// `bound` items, `budget` estimated input tokens or `perQuestion` for the
// state and its longest question, the parts sent eight at a time. A part refused for a rate limit or an overloaded host is sent again
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
import type { JudgedRule } from './rule.js';
import { type Verdict, dayOf } from './store.js';

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
 * `partsOf` estimates them) in all and for any one question (its state, the
 * part's texts, and its own words), and how long one request may take.
 */
interface Limits {
  readonly bound: number;
  readonly budget: number;
  readonly perQuestion: number;
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
 * TypeSafe also holds the state and any one question to 32,768 tokens (its
 * models page, "per-question context"): a cold fill sent 56 testOracle parts
 * under the 60,000 budget and had 23 refused, so a part's state is held
 * under 30,000 with its longest question.
 */
export const LIMITS: Limits = {
  bound: 200,
  budget: 60_000,
  perQuestion: 30_000,
  deadline: '5 seconds',
};

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

/** The ASCII characters a token of a rule's own words (its instructions and criteria) holds. */
const RULE_CHARS_PER_TOKEN = 3.2;

/** The tokens an item's key (`c17`) and its place in the state cost, beyond its text. */
const KEY_TOKENS = 9;

/**
 * A question's share of a request's input tokens: its text in the state,
 * and its classify's words. Its text at its rule's `charsPerToken` ASCII
 * characters a token (measured per rule, 2026-10-19: a seeded sample of
 * each rule's items as the state under one tiny question, Jev counting
 * historyComment's at 3.79, scriptSpeech's 3.64, silentDrop's 3.42,
 * commentClaimsCode's 3.41 and testOracle's 3.37; 3.2 when a rule names
 * none), `WIDE` tokens for each UTF-16 unit past ASCII, and `KEY_TOKENS`
 * (its key cost 7.8 to 8.7); the classify's words at 3.2 a token. Jev
 * counted 24,828 tokens for 50 Greek-dense comment blocks, which hold 10,700
 * units past ASCII: at 1 a unit the estimate was 22,350, so a unit cost
 * about 1.23; at 1.3 the estimate is a little over the count.
 */
const tokensOf = ({ rule, text }: Question) => {
  const criteria = Object.entries(rule.criteria).reduce(
    (n, [label, words]) => n + label.length + String(words).length,
    0,
  );
  const wide = text.split('').filter((unit) => unit.charCodeAt(0) > 0x7f).length;
  const perToken = rule.charsPerToken ?? RULE_CHARS_PER_TOKEN;
  return {
    state: Math.ceil((text.length - wide) / perToken + wide * WIDE) + KEY_TOKENS,
    question: Math.ceil((instructionsFor(rule, 'c000').length + criteria) / RULE_CHARS_PER_TOKEN),
  };
};

/**
 * `questions` in order, cut into parts of at most `bound` questions, `budget`
 * estimated tokens in all (the state and every question), and `perQuestion`
 * for the state with its longest question.
 */
export const partsOf = (
  questions: ReadonlyArray<Question>,
  limits: Pick<Limits, 'bound' | 'budget' | 'perQuestion'>,
) => {
  const parts: Array<Array<Question>> = [];
  let part: Array<Question> = [];
  let state = 0;
  let asked = 0;
  let longest = 0;
  for (const question of questions) {
    const cost = tokensOf(question);
    const full =
      part.length >= limits.bound ||
      state + cost.state + asked + cost.question > limits.budget ||
      state + cost.state + Math.max(longest, cost.question) > limits.perQuestion;
    if (part.length > 0 && full) {
      parts.push(part);
      part = [];
      state = 0;
      asked = 0;
      longest = 0;
    }
    part.push(question);
    state += cost.state;
    asked += cost.question;
    longest = Math.max(longest, cost.question);
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

/**
 * An item a judged rule reads: its rule, its file, its first line and its
 * offset, and its key in the store (`store.ts`'s `cacheKey` of the rule's
 * words, the model and the item's own key). Its text is read only when the
 * store does not answer it (`Judging.textsOf`).
 */
interface RuleItem {
  readonly rule: JudgedRule;
  readonly file: string;
  readonly line: number;
  readonly start: number;
  readonly key: string;
}

/**
 * An item the rule reports, with the model's probability for the reporting
 * label, and whether its answer is in the store, where the plugin reads it.
 */
interface Finding {
  readonly file: string;
  readonly line: number;
  readonly start: number;
  readonly p: number;
  readonly kept: boolean;
}

/**
 * What a rule's run came to: its findings, how many items it read, how many
 * of those the cache answered and how many it asked about (`items` is
 * `cached + asked`; items of one key go in the request once), its skip, and
 * the files of the items whose answer the store does not keep (unanswered,
 * or answered and not kept), every file of the rule's when the store could
 * not be written.
 */
interface Outcome {
  readonly rule: JudgedRule;
  readonly findings: ReadonlyArray<Finding>;
  readonly items: number;
  readonly cached: number;
  readonly asked: number;
  readonly skip: Option.Option<{ readonly reason: SkipReason; readonly items: number }>;
  readonly unkept: ReadonlySet<string>;
}

/**
 * Where a run keeps its answers (the store every checkout shares), which
 * model's they are, and how it reads the texts of the items it asks about:
 * one text for each item, in their order.
 */
interface Judging<E> extends Limits {
  readonly model: string;
  readonly storeFile: string;
  readonly textsOf: (items: ReadonlyArray<RuleItem>) => Effect.Effect<ReadonlyArray<string>, E>;
}

/**
 * Judges `items` by their rules: the store's answers first, then one request
 * for the rest of every rule, their texts read then, kept; answers an
 * outcome for each of `rules`, the tokens the model read and wrote, and the
 * day it marks the answers it read seen. The store is every checkout's: each answer
 * `items` read is marked seen today, and an answer no run read for
 * `MAX_AGE_DAYS` (an edited or deleted item's, an old rule's or model's) is
 * dropped (`cache.ts`).
 */
export const judge = Effect.fn('judged.judge')(function* <E>(
  rules: ReadonlyArray<JudgedRule>,
  items: ReadonlyArray<RuleItem>,
  judging: Judging<E>,
) {
  const cache = yield* readCache(judging.storeFile);
  const day = dayOf(yield* Clock.currentTimeMillis);
  const isCached = (item: RuleItem) => cache.has(item.key);
  const fresh = [
    ...new Map(items.filter((item) => !isCached(item)).map((item) => [item.key, item])).values(),
  ];
  const texts = yield* judging.textsOf(fresh);
  if (texts.length !== fresh.length)
    return yield* Effect.die(`textsOf read ${texts.length} texts of ${fresh.length} items`);
  const questions = fresh.map((item, at) => ({ item, rule: item.rule, text: texts[at] ?? '' }));
  const asked = yield* ask(questions, judging);
  // Answers that cannot be kept are asked again next run, and their findings
  // are the runner's to print: the plugin cannot see them.
  const answered = new Map(
    questions.flatMap((question) =>
      Option.toArray(
        Option.map(
          Option.fromUndefinedOr(asked.answers.get(questionKey(question))),
          (answer): [string, Verdict] => [question.item.key, answer],
        ),
      ),
    ),
  );
  const keeping = { fresh: answered, read: new Set(items.map((item) => item.key)), day };
  // The store as kept: an answer another run kept or dropped for a key
  // meanwhile is what this run reports, as the store does. None when the
  // write failed: then the store's answers are those it held when read.
  let store: Option.Option<ReadonlyMap<string, Verdict>> = Option.some(cache);
  if (changes(cache, keeping))
    store = yield* keepAnswers(judging.storeFile, keeping).pipe(
      Effect.asSome,
      Effect.catch((error) =>
        Console.error(
          `[judged] answers not kept rule=${[...new Set(items.map((item) => item.rule.id))].join(',')} detail=${detailOf(error)}`,
        ).pipe(Effect.as(Option.none<ReadonlyMap<string, Verdict>>())),
      ),
    );
  const held = Option.getOrElse(store, () => cache);
  const renewed = Option.isSome(store);
  /** An item's answer, and whether the store keeps it: the store's, else this run's own, not kept. */
  const answerOf = (item: RuleItem): Option.Option<{ answer: Verdict; kept: boolean }> =>
    Option.orElse(
      Option.map(Option.fromUndefinedOr(held.get(item.key)), (answer) => ({ answer, kept: true })),
      () =>
        Option.map(
          Option.orElse(Option.fromUndefinedOr(answered.get(item.key)), () =>
            Option.fromUndefinedOr(cache.get(item.key)),
          ),
          (answer) => ({ answer, kept: false }),
        ),
    );
  const keyOfQuestion = new Map(questions.map((question) => [questionKey(question), question]));
  const unanswered = new Set(
    asked.unanswered.flatMap((question) =>
      Option.toArray(
        Option.map(
          Option.fromUndefinedOr(keyOfQuestion.get(questionKey(question))),
          (asking) => asking.item.key,
        ),
      ),
    ),
  );
  const outcomes = rules.map((rule): Outcome => {
    const own = items.filter((item) => item.rule.id === rule.id);
    const left = own.filter((item) => unanswered.has(item.key));
    return {
      rule,
      findings: own.flatMap((item) =>
        Option.toArray(
          Option.flatMap(answerOf(item), ({ answer, kept }) =>
            Option.liftPredicate(
              {
                file: item.file,
                line: item.line,
                start: item.start,
                p: answer.probabilities[rule.reports] ?? 0,
                kept,
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
        Option.liftPredicate({ reason, items: left.length }, () => left.length > 0),
      ),
      // A write that failed renewed no answer's day, so the store may drop one
      // this run read before a findings file of today's expires: every file is unkept.
      unkept: new Set(
        own
          .filter((item) => !renewed || !Option.exists(answerOf(item), ({ kept }) => kept))
          .map((item) => item.file),
      ),
    };
  });
  return { outcomes, usage: asked.usage, day };
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
