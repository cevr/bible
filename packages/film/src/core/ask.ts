// An ask: a decision page an agent composes for the owner, as data. The
// agent writes a small state machine (`Ask`): each step a page built only of
// the lab's primitives (a heading, prose, an image, a choice, a free text),
// and where the owner's answer takes the ask next, by a guard on a choice;
// an end step closes it. The lab checks the machine before it renders
// (`askProblems`: bounded, every step reached, no loop, every guard on a
// choice the step asks), then interprets it as an effect-machine machine
// (`askMachine`): the state is the step the owner is on and the answers so
// far, the event is a step's answers, and the end hands back every answer,
// typed by the block that asked it. A choice is always answered; words are
// optional unless asked for (`required`, on a step with no choice), and an
// optional field left empty is answered `skipped`. Nothing an agent writes
// runs: the machine is data, its guards the one form `when: { answer, is }`.
// Pure and DOM-free.

import {
  Array as Arr,
  Boolean as Bool,
  Match,
  Option,
  Predicate,
  Record,
  Result,
  Schema,
} from 'effect';
import { Event, Machine, State } from 'effect-machine';
import { repoJson } from './schema.ts';

/** How large an ask may be: its steps, a step's blocks and ways on, a choice's options. */
const ASK_LIMITS = { steps: 12, blocks: 12, next: 12, options: 12 } as const;

/** Text of at most `max` characters, not blank. */
const Text = (max: number) =>
  Schema.String.check(
    Schema.makeFilter((text) => text.trim().length > 0 || 'not blank'),
    Schema.isMaxLength(max, { message: `at most ${max} characters` }),
  );

/** A step's or an answer's name: lowercase, a letter first (`pick`, `why_7`). */
const AskName = Schema.String.check(
  Schema.isPattern(/^[a-z][a-z0-9_-]{0,39}$/, {
    message: 'a name of lowercase letters, digits, - and _, a letter first, at most 40',
  }),
);

/** A path the lab serves, under `/api/` (a board try's image, a set's file): never another host. */
const LabPath = Schema.String.check(
  Schema.isPattern(/^\/api\/(?!.*\.\.)[A-Za-z0-9_.~%/=&?+-]+$/, {
    message: "a path the lab serves, starting /api/ (a board try's image, a set's file)",
  }),
);

/** A board try: its film, its panel (`<beat>.<mark>`) and its number. */
export const BoardTryRef = Schema.Struct({
  film: Schema.String,
  panel: Schema.String,
  try: Schema.Int,
});
export type BoardTryRef = typeof BoardTryRef.Type;

/**
 * An image: a board try (`board`), which the lab finds the file of, or a
 * path the lab serves (`src`). As stored, every image has its `src`.
 */
export const AskImage = Schema.Struct({
  src: Schema.optionalKey(LabPath),
  board: Schema.optionalKey(BoardTryRef),
  caption: Schema.optionalKey(Text(300)),
});
export type AskImage = typeof AskImage.Type;

/** One option of a choice: the value its answer carries, its label, and its picture. */
const AskOption = Schema.Struct({
  value: Text(80),
  label: Text(200),
  image: Schema.optionalKey(AskImage),
});

/** A title over what follows. */
const Heading = Schema.Struct({ kind: Schema.Literal('heading'), text: Text(200) });
/** Words: the context the owner decides in. */
const Prose = Schema.Struct({ kind: Schema.Literal('prose'), text: Text(4000) });
/** A picture: a still, a board try. */
const Picture = Schema.Struct({ kind: Schema.Literal('image'), image: AskImage });
/** Choose one of the options; its answer is the option's value. */
const Choose = Schema.Struct({
  kind: Schema.Literal('choose'),
  id: AskName,
  label: Text(300),
  options: Schema.Array(AskOption),
});
/**
 * Free text; its answer is the words. The owner may leave it empty (its
 * answer `skipped`) unless it is `required`, which only a step with no
 * choice may ask: a choice is the cheap answer, words beside it are extra.
 */
const FreeText = Schema.Struct({
  kind: Schema.Literal('free_text'),
  id: AskName,
  label: Text(300),
  placeholder: Schema.optionalKey(Text(200)),
  required: Schema.optionalKey(
    Schema.Boolean.annotate({
      description:
        'true: the owner must write something before Send (refused on a step with a choose). Left out, the field is optional and the page says so.',
    }),
  ),
});

/** One of the primitives a step is built of. */
export const AskBlock = Schema.Union([Heading, Prose, Picture, Choose, FreeText]);
export type AskBlock = typeof AskBlock.Type;

/** A block the owner answers. */
type Asking = Extract<AskBlock, { readonly id: string }>;

/** Whether the owner must answer `block` before the step goes: a choice always, words only when asked to. */
export const requiredOf = (block: Asking): boolean =>
  Match.value(block).pipe(
    Match.discriminatorsExhaustive('kind')({
      choose: () => true,
      free_text: (t) => t.required === true,
    }),
  );

/** A way on from a step: to `to`, when the choice `answer` is one of `is` (none: always). */
const AskNext = Schema.Struct({
  to: AskName,
  when: Schema.optionalKey(Schema.Struct({ answer: AskName, is: Schema.Array(Text(80)) })),
});

/** A page of blocks, and its ways on, the first that holds taken (the last holds always). */
const PageStep = Schema.Struct({
  blocks: Schema.Array(AskBlock),
  next: Schema.Array(AskNext),
});
/** The end: the ask is answered; `text` thanks or says what happens next. */
const EndStep = Schema.Struct({ end: Schema.Literal(true), text: Schema.optionalKey(Text(400)) });

export const AskStep = Schema.Union([PageStep, EndStep]);
export type AskStep = typeof AskStep.Type;
type PageStep = typeof PageStep.Type;

/** An ask's machine: where it starts, and its steps by name. */
export const Ask = Schema.Struct({
  start: AskName,
  steps: Schema.Record(AskName, AskStep),
});
export type Ask = typeof Ask.Type;

/** A step that is a page, not the end. */
const pageOf = (step: AskStep): Option.Option<PageStep> =>
  Option.liftPredicate(step, (s): s is PageStep => 'blocks' in s);

/** The blocks a step shows: a page's, none at an end. */
export const blocksOf = (step: AskStep): ReadonlyArray<AskBlock> =>
  Option.match(pageOf(step), { onNone: () => [], onSome: (page) => page.blocks });

/** What an end step says, when it says something. */
export const endText = (step: AskStep): Option.Option<string> =>
  Option.flatMap(
    Option.liftPredicate(step, (s): s is typeof EndStep.Type => 'end' in s),
    (end) => Option.fromUndefinedOr(end.text),
  );

/** The blocks of `step` the owner answers. */
export const askedIn = (step: AskStep): ReadonlyArray<Asking> =>
  Option.match(pageOf(step), {
    onNone: () => [],
    onSome: (page) => page.blocks.filter((b): b is Asking => 'id' in b),
  });

/** The one-page ask: `blocks` and then its end, the shape a single question takes. */
export const oneQuestion = (blocks: ReadonlyArray<AskBlock>, thanks?: string): Ask => ({
  start: 'ask',
  steps: {
    ask: { blocks, next: [{ to: 'done' }] },
    done: {
      end: true,
      ...Option.match(Option.fromUndefinedOr(thanks), {
        onNone: () => ({}),
        onSome: (text) => ({ text }),
      }),
    },
  },
});

/** `block` with each of its images (its own, or its options') as `f` makes it. */
const blockImages = (block: AskBlock, f: (image: AskImage) => AskImage): AskBlock =>
  Match.value(block).pipe(
    Match.discriminator('kind')('image', (b): AskBlock => ({ ...b, image: f(b.image) })),
    Match.discriminator('kind')('choose', (b): AskBlock => ({
      ...b,
      options: b.options.map((o) =>
        Option.match(Option.fromUndefinedOr(o.image), {
          onNone: () => o,
          onSome: (image) => ({ ...o, image: f(image) }),
        }),
      ),
    })),
    Match.orElse((b) => b),
  );

/** `ask` with every image in it as `f` makes it. */
export const mapImages = (ask: Ask, f: (image: AskImage) => AskImage): Ask => ({
  ...ask,
  steps: Record.map(ask.steps, (step) =>
    Option.match(pageOf(step), {
      onNone: () => step,
      onSome: (page): AskStep => ({ ...page, blocks: page.blocks.map((b) => blockImages(b, f)) }),
    }),
  ),
});

/** Every image in `ask`, its options' among them. */
export const imagesIn = (ask: Ask): ReadonlyArray<AskImage> => {
  const all: Array<AskImage> = [];
  mapImages(ask, (image) => {
    all.push(image);
    return image;
  });
  return all;
};

// ---------------------------------------------------------------------------
// The check before an ask renders

/** The steps `name` goes on to. */
const onFrom = (ask: Ask, name: string): ReadonlyArray<string> =>
  Option.match(Option.flatMap(Record.get(ask.steps, name), pageOf), {
    onNone: () => [],
    onSome: (page) => page.next.map((n) => n.to),
  });

/** The steps reached from the start. */
const reached = (ask: Ask): ReadonlySet<string> => {
  const seen = new Set<string>();
  const walk = (name: string): void => {
    if (seen.has(name) || !Record.has(ask.steps, name)) return;
    seen.add(name);
    onFrom(ask, name).forEach(walk);
  };
  walk(ask.start);
  return seen;
};

/** A step that can come back to itself, the first found, by its path. */
const loopIn = (ask: Ask): Option.Option<ReadonlyArray<string>> => {
  const done = new Set<string>();
  const visit = (
    name: string,
    path: ReadonlyArray<string>,
  ): Option.Option<ReadonlyArray<string>> => {
    if (path.includes(name)) return Option.some([...path, name]);
    if (done.has(name)) return Option.none();
    const loop = Option.firstSomeOf(onFrom(ask, name).map((to) => visit(to, [...path, name])));
    done.add(name);
    return loop;
  };
  return Option.firstSomeOf(Record.keys(ask.steps).map((name) => visit(name, [])));
};

/** How many times the answer `id` is asked across the ask. */
const timesAsked = (ids: ReadonlyMap<string, number>, id: string): number =>
  Option.getOrElse(Option.fromUndefinedOr(ids.get(id)), () => 0);

/** What is wrong with one page step `name`. */
const pageProblems = (name: string, page: PageStep, ids: ReadonlyMap<string, number>) => {
  const problems: Array<string> = [];
  if (page.blocks.length === 0) problems.push(`step ${name} has no blocks`);
  if (page.blocks.length > ASK_LIMITS.blocks)
    problems.push(`step ${name} has ${page.blocks.length} blocks, at most ${ASK_LIMITS.blocks}`);
  if (page.next.length === 0)
    problems.push(`step ${name} has no next: name where it goes, or end it`);
  if (page.next.length > ASK_LIMITS.next)
    problems.push(`step ${name} has ${page.next.length} ways on, at most ${ASK_LIMITS.next}`);
  page.next.forEach((n, i) => {
    const last = i === page.next.length - 1;
    if (n.to === name) problems.push(`step ${name} goes on to itself`);
    Option.match(Option.fromUndefinedOr(n.when), {
      onNone: () => {
        if (!last)
          problems.push(
            `step ${name}: next ${i + 1} has no when, so the ways after it are never taken`,
          );
      },
      onSome: (when) => {
        if (last)
          problems.push(
            `step ${name}: its last next must have no when, so the step always goes on`,
          );
        const choice = Arr.findFirst(
          page.blocks,
          (b): b is typeof Choose.Type => b.kind === 'choose' && b.id === when.answer,
        );
        Option.match(choice, {
          onNone: () =>
            problems.push(
              `step ${name}: when names ${when.answer}, which is not a choice in this step`,
            ),
          onSome: (c) =>
            when.is
              .filter((v) => !c.options.some((o) => o.value === v))
              .forEach((v) => problems.push(`step ${name}: ${v} is not an option of ${c.id}`)),
        });
      },
    });
  });
  const chooses = page.blocks.some((b) => b.kind === 'choose');
  page.blocks.forEach((b) =>
    Match.value(b).pipe(
      Match.discriminatorsExhaustive('kind')({
        heading: () => {},
        prose: () => {},
        free_text: (t) => {
          if (timesAsked(ids, t.id) > 1) problems.push(`the answer ${t.id} is asked twice`);
          if (requiredOf(t) && chooses)
            problems.push(
              `step ${name}: ${t.id} is required beside a choice: leave it optional (drop required), or ask it on a step of its own`,
            );
        },
        image: (p) => problems.push(...imageProblems(`step ${name}'s image`, p.image)),
        choose: (c) => {
          if (timesAsked(ids, c.id) > 1) problems.push(`the answer ${c.id} is asked twice`);
          if (c.options.length < 2)
            problems.push(`${c.id} offers ${c.options.length} option, at least 2`);
          if (c.options.length > ASK_LIMITS.options)
            problems.push(
              `${c.id} offers ${c.options.length} options, at most ${ASK_LIMITS.options}`,
            );
          const values = c.options.map((o) => o.value);
          if (new Set(values).size !== values.length)
            problems.push(`${c.id} offers one value twice`);
          c.options.forEach((o) =>
            Option.map(Option.fromUndefinedOr(o.image), (image) =>
              problems.push(...imageProblems(`${c.id}'s option ${o.value}`, image)),
            ),
          );
        },
      }),
    ),
  );
  return problems;
};

/** What is wrong with an image: it names neither a board try nor a path, or both. */
const imageProblems = (where: string, image: AskImage): ReadonlyArray<string> => {
  const has = [Predicate.isNotUndefined(image.src), Predicate.isNotUndefined(image.board)];
  if (has.every((h) => !h)) return [`${where} names neither a board try (board) nor a path (src)`];
  return [];
};

/**
 * What is wrong with `ask`, in words the agent fixes it by; none when it
 * may render. Bounded (at most `ASK_LIMITS`), every step reached from the
 * start and none coming back to itself, so every run ends within the
 * steps; every way on named, the last always taken, every guard on a choice
 * of its own step and one of its options; every answer's name used once.
 */
export const askProblems = (ask: Ask): ReadonlyArray<string> => {
  const names = Record.keys(ask.steps);
  const problems: Array<string> = [];
  if (!Record.has(ask.steps, ask.start))
    problems.push(`start names ${ask.start}, which is not a step`);
  if (names.length > ASK_LIMITS.steps)
    problems.push(`${names.length} steps, at most ${ASK_LIMITS.steps}`);
  const ids = new Map<string, number>();
  names.forEach((name) =>
    Option.map(Record.get(ask.steps, name), (step) =>
      askedIn(step).forEach((b) => ids.set(b.id, timesAsked(ids, b.id) + 1)),
    ),
  );
  const dangling = names.flatMap((name) =>
    onFrom(ask, name)
      .filter((to) => !Record.has(ask.steps, to))
      .map((to) => `step ${name} goes on to ${to}, which is not a step`),
  );
  problems.push(...dangling);
  names.forEach((name) =>
    Option.map(Option.flatMap(Record.get(ask.steps, name), pageOf), (page) =>
      problems.push(...pageProblems(name, page, ids)),
    ),
  );
  if (!names.some((name) => Option.isNone(Option.flatMap(Record.get(ask.steps, name), pageOf))))
    problems.push('no step ends the ask: add one with end: true');
  const seen = reached(ask);
  names
    .filter((name) => !seen.has(name))
    .forEach((name) => problems.push(`step ${name} is never reached from ${ask.start}`));
  Option.map(loopIn(ask), (path) => problems.push(`the steps loop: ${path.join(' → ')}`));
  return [...new Set(problems)];
};

// ---------------------------------------------------------------------------
// The machine the lab runs an ask by

/**
 * An answer, typed by the block that asked it: a choice's option, the words,
 * or `skipped`, an optional question the owner saw and left empty (one on a
 * step the run never reached has no answer at all).
 */
export const AskAnswer = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('choose'), value: Schema.String, label: Schema.String }),
  Schema.Struct({ kind: Schema.Literal('free_text'), text: Schema.String }),
  Schema.Struct({ kind: Schema.Literal('skipped') }),
]);
export type AskAnswer = typeof AskAnswer.Type;

const Answers = Schema.Record(Schema.String, AskAnswer);
export type AskAnswers = typeof Answers.Type;

/** The answers the owner gave: every one but those skipped. */
export const givenAnswers = (answers: AskAnswers): AskAnswers =>
  Record.filter(answers, (a) => a.kind !== 'skipped');

/** What a step's page sends: each answer's raw value (a choice's option value, the words) by its name. */
export const StepValues = Schema.Record(
  Schema.String,
  Schema.String.check(Schema.isMaxLength(4000)),
);
export type StepValues = typeof StepValues.Type;

/** `values` with the blank ones left out: a field left empty is not answered, wherever it was sent from. */
export const filled = (values: StepValues): StepValues =>
  Record.filter(values, (v) => v.trim() !== '');

/** Where an ask is: at a step, answered (at its end), or closed by the agent. */
export const AskState = State({
  Asking: { step: Schema.String, answers: Answers },
  Answered: { step: Schema.String, answers: Answers },
  Closed: { answers: Answers, why: Schema.String },
});
export type AskState = typeof AskState.Type;

export const AskEvent = Event({
  /** The owner's answers to step `step`. */
  Answer: { step: Schema.String, values: StepValues },
  /** The agent closes the ask (withdrawn, or filed once answered). */
  Close: { why: Schema.String },
});
export type AskEvent = typeof AskEvent.Type;

/** An ask's first state: at its start, nothing answered. */
export const askStart = (ask: Ask): AskState => AskState.Asking({ step: ask.start, answers: {} });

/** One asked block's answer from `value` (none: left empty), or why it has none. */
const answerOf = (b: Asking, value: Option.Option<string>): Result.Result<AskAnswer, string> =>
  Match.value(b).pipe(
    Match.discriminatorsExhaustive('kind')({
      free_text: (t): Result.Result<AskAnswer, string> =>
        Option.match(value, {
          onNone: () =>
            Bool.match(requiredOf(t), {
              onTrue: () => Result.fail(`${t.id} is not answered`),
              onFalse: () => Result.succeed({ kind: 'skipped' }),
            }),
          onSome: (text) => Result.succeed({ kind: 'free_text', text: text.trim() }),
        }),
      choose: (c): Result.Result<AskAnswer, string> =>
        Option.match(value, {
          onNone: () => Result.fail(`${c.id} is not answered`),
          onSome: (v) =>
            Option.match(
              Arr.findFirst(c.options, (o) => o.value === v),
              {
                onNone: () => Result.fail(`${v} is not an option of ${c.id}`),
                onSome: (o) => Result.succeed({ kind: 'choose', value: o.value, label: o.label }),
              },
            ),
        }),
    }),
  );

/** `values` typed by the blocks of `step` that asked them, or why they do not fit. */
const typedIn = (
  step: AskStep,
  values: StepValues,
): Result.Result<AskAnswers, ReadonlyArray<string>> => {
  const asked = askedIn(step);
  const unknown = Record.keys(values)
    .filter((k) => !asked.some((b) => b.id === k))
    .map((k) => `this step asks no ${k}`);
  const given = filled(values);
  const typed = asked.map((b) =>
    Result.map(answerOf(b, Record.get(given, b.id)), (a) => [b.id, a] as const),
  );
  const problems = [
    ...unknown,
    ...typed.flatMap((r) => Result.match(r, { onSuccess: () => [], onFailure: (p) => [p] })),
  ];
  if (problems.length > 0) return Result.fail(problems);
  return Result.succeed(
    Record.fromEntries(
      typed.flatMap((r) => Result.match(r, { onSuccess: (e) => [e], onFailure: () => [] })),
    ),
  );
};

/** Step `name` of `ask`; none when it has no such step. */
const stepOf = (ask: Ask, name: string): Option.Option<AskStep> => Record.get(ask.steps, name);

/**
 * Why the owner's `values` for step `step` cannot move `state` on, or none
 * when they can: the ask is answered or closed, it is at another step, an
 * answer is missing, unknown, or not one of its choice's options.
 */
export const answerRefusal = (
  ask: Ask,
  state: AskState,
  step: string,
  values: StepValues,
): Option.Option<string> =>
  Match.value(state).pipe(
    Match.tagsExhaustive({
      Answered: () => Option.some('the ask is answered'),
      Closed: (s) => Option.some(`the ask is closed: ${s.why}`),
      Asking: (s) => {
        if (s.step !== step) return Option.some(`the ask is at step ${s.step}, not ${step}`);
        return Option.match(stepOf(ask, step), {
          onNone: () => Option.some(`the ask has no step ${step}`),
          onSome: (at) =>
            Result.match(typedIn(at, values), {
              onSuccess: () => Option.none(),
              onFailure: (problems) => Option.some(problems.join('; ')),
            }),
        });
      },
    }),
  );

/** The way on `page` takes with `answers`: the first whose guard holds. */
const wayOn = (page: PageStep, answers: AskAnswers): string =>
  Option.getOrElse(
    Option.map(
      Arr.findFirst(page.next, (n) =>
        Option.match(Option.fromUndefinedOr(n.when), {
          onNone: () => true,
          onSome: (when) =>
            Option.exists(
              Record.get(answers, when.answer),
              (a) => a.kind === 'choose' && when.is.includes(a.value),
            ),
        }),
      ),
      (n) => n.to,
    ),
    () => '',
  );

/** Where `state` (at step `step`, answered `values`, checked by `answerRefusal`) moves. */
const answered = (
  ask: Ask,
  state: AskState & { readonly _tag: 'Asking' },
  values: StepValues,
): AskState => {
  const page = Option.flatMap(stepOf(ask, state.step), pageOf);
  const typed = Option.flatMap(stepOf(ask, state.step), (step) =>
    Result.getSuccess(typedIn(step, values)),
  );
  const answers = { ...state.answers, ...Option.getOrElse(typed, () => ({})) };
  const to = Option.match(page, { onNone: () => state.step, onSome: (p) => wayOn(p, answers) });
  return Option.match(Option.flatMap(stepOf(ask, to), pageOf), {
    onNone: () => AskState.Answered({ step: to, answers }),
    onSome: () => AskState.Asking({ step: to, answers }),
  });
};

/**
 * The machine an ask runs by, from `from`: an answer to the step it is at
 * (and only one that fits, `answerRefusal`) moves it to the step its guards
 * choose, or to Answered at an end; Close closes it from anywhere it is
 * open, keeping what was answered. Closed is final.
 */
export const askMachine = (ask: Ask, from: AskState = askStart(ask)) =>
  Machine.make({ state: AskState, event: AskEvent, initial: from })
    .when(
      AskState.Asking,
      AskEvent.Answer,
      ({ state, event }) => Option.isNone(answerRefusal(ask, state, event.step, event.values)),
      ({ state, event }) => answered(ask, state, event.values),
    )
    .on([AskState.Asking, AskState.Answered], AskEvent.Close, ({ state, event }) =>
      AskState.Closed({ answers: state.answers, why: event.why }),
    )
    .final(AskState.Closed);

/**
 * Whether the owner's answers took the ask to its end: its answered steps
 * replayed through its machine from the start, so a close (which keeps the
 * answers, not the step) still tells an answered ask from a withdrawn one.
 */
export const answeredToEnd = (record: Pick<AskRecord, 'ask' | 'answered'>): boolean =>
  record.answered.reduce((state: AskState, a) => {
    if (state._tag !== 'Asking') return state;
    if (Option.isSome(answerRefusal(record.ask, state, a.step, a.values))) return state;
    return answered(record.ask, state, a.values);
  }, askStart(record.ask))._tag === 'Answered';

/** Where `state` is, in a word: asking, answered or closed. */
export const askStatus = (state: AskState): 'asking' | 'answered' | 'closed' =>
  Match.value(state).pipe(
    Match.tagsExhaustive({
      Asking: () => 'asking' as const,
      Answered: () => 'answered' as const,
      Closed: () => 'closed' as const,
    }),
  );

// ---------------------------------------------------------------------------
// An ask as the lab keeps it

/** An answered step, as the owner sent it: what the run was moved by, and when. */
const AskStepAnswer = Schema.Struct({
  step: Schema.String,
  values: StepValues,
  at: Schema.String,
});

/**
 * One ask, as `FILMS_LAB/asks/<id>.json` keeps it: who asked, why, by when;
 * its machine as it was checked (its images found); where its run is; and
 * every step answered, in order.
 */
export const AskRecord = Schema.Struct({
  id: AskName,
  title: Text(200),
  /** Why the agent asks: what the answer decides. */
  why: Text(2000),
  /** Who asked: the agent's name. */
  by: Text(80),
  /** The film it is about, when it is about one. */
  film: Schema.optionalKey(Schema.String),
  /** The production its answer is filed on, and the set (a ref) it is about: the timeline's seam. */
  production: Schema.optionalKey(Schema.String),
  set: Schema.optionalKey(Schema.String),
  /** The choice in that set it is about: a pick there answers it on the timeline too. */
  point: Schema.optionalKey(Schema.String),
  /** ISO time it was made. */
  created: Schema.String,
  /** ISO time after which it takes no answer. */
  deadline: Schema.optionalKey(Schema.String),
  ask: Ask,
  state: AskState,
  answered: Schema.Array(AskStepAnswer),
});
export type AskRecord = typeof AskRecord.Type;

export const AskRecordJson = repoJson(AskRecord);

/** Answers in one line, each by its name: `try: Try 7 · why: the light · more: (skipped)`. */
export const answersLine = (answers: AskAnswers): string =>
  Record.toEntries(answers)
    .map(([id, a]) =>
      Match.value(a).pipe(
        Match.discriminatorsExhaustive('kind')({
          choose: (c) => `${id}: ${c.label}`,
          free_text: (t) => `${id}: ${t.text}`,
          skipped: () => `${id}: (skipped)`,
        }),
      ),
    )
    .join(' · ');
