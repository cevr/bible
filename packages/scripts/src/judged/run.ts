// The judged rules' runner. Every item of a run the cache does not answer
// goes to the model in ONE request (a classify per item, keys c0…cN), split
// only past `bound` items or `budget` estimated input tokens, the parts sent
// at once. A run never fails on the model: no key, a request past its
// deadline, a rate limit, an HTTP error or an answer that misses items skips
// the items it could not judge, and says so on one line per rule. Nor on its
// cache: answers it cannot keep are asked again next run. A finding is a
// warning.

import type { Duration } from 'effect';
import { Console, Effect, Option, Result, Schema } from 'effect';
import { type AiError, Decision, DecisionModel } from 'effect/ai';

import { type Answer, cacheKey, keepAnswers, readCache } from './cache.js';
import type { CommentItem } from './comments.js';
import type { JudgedRule } from './rule.js';

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

/** The model's answers for the texts it was asked about, and why the rest went unanswered. */
interface Asked {
  readonly answers: ReadonlyMap<string, Answer>;
  readonly unanswered: ReadonlyArray<string>;
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
const instructionsFor = <Label extends string>(rule: JudgedRule<Label>, id: string) =>
  `Judge the ${rule.subject} under key ${id}. ${rule.decision.instructions}`;

/** One request: `texts` under the keys c0…cN, a classify of `rule`'s each, inside `deadline`. */
const askPart = <Label extends string>(
  rule: JudgedRule<Label>,
  texts: ReadonlyArray<string>,
  deadline: Duration.Input,
) => {
  const ids = texts.map((_, i) => `c${i}`);
  const definition = Decision.make({
    input: Input,
    decisions: Object.fromEntries(
      ids.map((id): [string, Decision.Classify<Label>] => [
        id,
        {
          ...rule.decision,
          instructions: instructionsFor(rule, id),
        },
      ]),
    ),
  });
  const input = Object.fromEntries(ids.map((id, i) => [id, texts[i] ?? '']));
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
              answers: texts.flatMap((text, i) =>
                Option.toArray(
                  Option.map(
                    Option.fromUndefinedOr(answers[`c${i}`]),
                    (answer): [string, Answer] => [
                      text,
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

/**
 * A text's share of a request's input tokens, from its characters and its
 * classify's: 3.2 ASCII characters a token, and a token for each UTF-16
 * unit past ASCII. Over what TypeSafe's Jev counted: 55,326 tokens for the
 * corpus' 182 comment blocks (an estimate of 58,800), 38,716 for their lines
 * (39,500), and about 0.9 a letter for Greek, which at 3.2 a token it
 * counted 1.655 times the estimate (24,828 for 15,000).
 */
const tokensOf = <Label extends string>(rule: JudgedRule<Label>, text: string) => {
  const criteria = Object.entries(rule.decision.criteria).reduce(
    (n, [label, words]) => n + label.length + String(words).length,
    0,
  );
  const wide = text.split('').filter((unit) => unit.charCodeAt(0) > 0x7f).length;
  const ascii = instructionsFor(rule, 'c000').length + criteria + text.length - wide;
  return Math.ceil(ascii / 3.2) + wide + 8;
};

/** `texts` in order, cut into parts of at most `bound` texts and `budget` estimated tokens. */
export const partsOf = <Label extends string>(
  rule: JudgedRule<Label>,
  texts: ReadonlyArray<string>,
  limits: Pick<Limits, 'bound' | 'budget'>,
) => {
  const parts: Array<Array<string>> = [];
  let part: Array<string> = [];
  let tokens = 0;
  for (const text of texts) {
    const cost = tokensOf(rule, text);
    if (part.length > 0 && (part.length >= limits.bound || tokens + cost > limits.budget)) {
      parts.push(part);
      part = [];
      tokens = 0;
    }
    part.push(text);
    tokens += cost;
  }
  if (part.length > 0) parts.push(part);
  return parts;
};

/**
 * Asks the model `rule`'s decision for each of `texts`: one request, or past
 * `bound` texts or `budget` tokens one request a part, the parts sent at
 * once, and none for no texts. A part that fails leaves its texts
 * unanswered, and the first failure's reason is the run's.
 */
export const ask = Effect.fn('judged.ask')(function* <Label extends string>(
  rule: JudgedRule<Label>,
  texts: ReadonlyArray<string>,
  limits: Limits,
) {
  const parts = partsOf(rule, texts, limits);
  const results = yield* Effect.forEach(parts, (part) => askPart(rule, part, limits.deadline), {
    concurrency: PARTS_AT_ONCE,
  });
  const answers = new Map<string, Answer>();
  const unanswered: Array<string> = [];
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
        for (const [text, answer] of part.answers) answers.set(text, answer);
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

/** An item the rule reports, with the model's probability for the reporting label. */
interface Finding {
  readonly file: string;
  readonly line: number;
  readonly p: number;
}

/**
 * What a rule's run came to: its findings, how many items it read, how many
 * of those the cache answered and how many it asked about (`items` is
 * `cached + asked`; items of one text go in the request once), and its skip.
 */
interface Outcome {
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

/** Judges `items` by `rule`: the cache's answers first, then one request for the rest, kept. */
export const judge = Effect.fn('judged.judge')(function* <Label extends string>(
  rule: JudgedRule<Label>,
  items: ReadonlyArray<CommentItem>,
  judging: Judging,
) {
  const keyOf = (text: string) => cacheKey(`${rule.id}@${rule.version}`, judging.model, text);
  const cache = yield* readCache(judging.cacheFile);
  const fresh = [...new Set(items.map((item) => item.text))].filter(
    (text) => !cache.has(keyOf(text)),
  );
  const asked = yield* ask(rule, fresh, judging);
  // Answers that cannot be kept are asked again next run; the findings still print.
  if (asked.answers.size > 0)
    yield* keepAnswers(
      judging.cacheFile,
      new Map([...asked.answers].map(([text, answer]) => [keyOf(text), answer])),
    ).pipe(
      Effect.catch((error) =>
        Console.error(`[judged] answers not kept rule=${rule.id} detail=${detailOf(error)}`),
      ),
    );
  const answerOf = (text: string) =>
    Option.orElse(Option.fromUndefinedOr(cache.get(keyOf(text))), () =>
      Option.fromUndefinedOr(asked.answers.get(text)),
    );
  const findings = items.flatMap((item) =>
    Option.toArray(
      Option.flatMap(answerOf(item.text), (answer) =>
        Option.liftPredicate(
          { file: item.file, line: item.line, p: answer.probabilities[rule.reports] ?? 0 },
          (finding) => finding.p >= rule.threshold,
        ),
      ),
    ),
  );
  const unanswered = new Set(asked.unanswered);
  const outcome: Outcome = {
    findings,
    items: items.length,
    cached: items.filter((item) => cache.has(keyOf(item.text))).length,
    asked: items.filter((item) => !cache.has(keyOf(item.text))).length,
    skip: Option.map(asked.reason, (reason) => ({
      reason,
      items: items.filter((item) => unanswered.has(item.text)).length,
    })),
  };
  return outcome;
});

/** A finding's line: `file:line warning judged(<rule>): <message> p=<p>`. */
export const findingLine = <Label extends string>(rule: JudgedRule<Label>, finding: Finding) =>
  `${finding.file}:${finding.line} warning judged(${rule.id}): ${rule.message} p=${finding.p.toFixed(2)}`;

/** A run's one `[judged]` line: its skip, or what it read when it judged them all. */
export const runLine = <Label extends string>(rule: JudgedRule<Label>, outcome: Outcome) =>
  Option.match(outcome.skip, {
    onSome: (skip) => `[judged] skipped rule=${rule.id} reason=${skip.reason} items=${skip.items}`,
    onNone: () =>
      `[judged] rule=${rule.id} items=${outcome.items} cached=${outcome.cached} asked=${outcome.asked} findings=${outcome.findings.length}`,
  });
