// An ask: a guided review an agent composes for the owner, as data. The
// agent writes a small state machine (`Ask`): each step a page built only of
// the lab's primitives (a heading, prose, an image, a choice, a free text)
// and the material it is about, shown in place by reference (a set's
// document, a film's or a draft's script, the Board, a video, a take), and
// where the owner's answer takes the ask next, by a guard on a choice; a
// guided review walks the flow's order, one titled step per piece of
// material, its questions under it. An end step closes it. The lab checks the machine before it renders
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
  Order,
  Predicate,
  Record,
  Result,
  Schema,
  SchemaParser,
  SchemaTransformation,
} from 'effect';
import { Event, Machine, State } from 'effect-machine';
import { repoJson } from './schema.ts';
import { Segment } from './segment.ts';

/** How large an ask may be: its steps, a step's blocks and ways on, a choice's options. */
const ASK_LIMITS = { steps: 12, blocks: 12, next: 12, options: 12 } as const;

/** Text of at most `max` characters, not blank. */
const Text = (max: number) =>
  Schema.String.check(
    Schema.makeFilter((text) => text.trim().length > 0 || 'not blank'),
    Schema.isMaxLength(max, { message: `at most ${max} characters` }),
  );

/**
 * A step's or an answer's name: lowercase, a letter first (`pick`, `why_7`).
 * Steps and answers key records, so it is a `Segment` first: never
 * `constructor` or `prototype`, which every object answers to.
 */
export const AskName = Segment.check(
  Schema.isPattern(/^[a-z][a-z0-9_-]{0,39}$/, {
    message: 'a name of lowercase letters, digits, - and _, a letter first, at most 40',
  }),
);
export type AskName = typeof AskName.Type;

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

/**
 * One option of a choice: the value its answer carries, its label, its
 * picture, and whether it is the asker's recommendation (`recommended`, at
 * most one per choice: the page lists it first and marks it), with the
 * reason for it (`why`, said under the options; only the recommended one).
 */
const AskOption = Schema.Struct({
  value: Text(80),
  label: Text(200),
  image: Schema.optionalKey(AskImage),
  recommended: Schema.optionalKey(Schema.Boolean),
  why: Schema.optionalKey(
    Text(200).annotate({
      description:
        'Why the asker recommends this option, in one line: only on the recommended one.',
    }),
  ),
});
type AskOption = typeof AskOption.Type;

/** A choice's options as the page lists them: the recommended one first, the rest as written. */
export const optionsShown = (options: ReadonlyArray<AskOption>): ReadonlyArray<AskOption> => [
  ...options.filter((o) => o.recommended === true),
  ...options.filter((o) => o.recommended !== true),
];

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

// ---------------------------------------------------------------------------
// Material: what a step shows the owner, in place, by reference. Each names
// its material as the lab names it (a film, a series' draft, a review ref, a
// panel's id), never a path on the box; the lab finds it through the read its
// own view makes (`tools/ask-materials.ts` when the ask is made, the view's
// parts when it is shown).

/** A film's, a series' or a draft's name: a folder's name, never a path. */
const LabName = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/, {
    message: 'a name as the lab lists it (letters, digits, - _ .), never a path',
  }),
);

/**
 * A file the review serves, by its ref: its root's label, then its path
 * under the root (`p5/rbf-script-2026-10-14/script.md`). Every segment
 * starts with a letter, a digit or `_`, so no `.`, `..`, empty or absolute
 * segment, and no other host.
 */
const ReviewRef = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9_][^/\\\0?#]*(\/[A-Za-z0-9_][^/\\\0?#]*)+$/, {
    message:
      'a review ref: its root, then its path under the root (`p5/<folder>/<file>`), as `sets` and the review list them',
  }),
);

/** A beat's id, or a panel's (`<beat>.<mark>`). */
const BeatId = Text(80);

/** A Markdown file a set holds (`<set ref>/<file>.md`), read in place as the set's page reads it. */
const Document = Schema.Struct({
  kind: Schema.Literal('document'),
  ref: ReviewRef,
  caption: Schema.optionalKey(Text(300)),
});
/** A key the other variant of a block names, which this one never does. */
const none = Schema.optionalKey(Schema.Never);

/**
 * A script, in the Script reader: a film's (`film`) or a series draft's
 * (`series` and `draft`), never both, every beat or the `beats` named, each
 * with its staging take where one is ready and its delivery marks, written
 * in place. A script under review is always this block, never a `document`;
 * one per ask.
 */
const FilmScript = Schema.Struct({
  kind: Schema.Literal('script'),
  film: LabName,
  series: none,
  draft: none,
  beats: Schema.optionalKey(Schema.Array(BeatId)),
});
const DraftScript = Schema.Struct({
  kind: Schema.Literal('script'),
  series: LabName,
  draft: LabName,
  film: none,
  beats: Schema.optionalKey(Schema.Array(BeatId)),
});
const ScriptBlock = Schema.Union([FilmScript, DraftScript]);
/** A script block: a film's, or a series draft's. */
type ScriptBlock = typeof ScriptBlock.Type;

/** A script block's source: the film's name, or the series and its draft. */
type ScriptSource =
  | { readonly _tag: 'Film'; readonly film: string }
  | { readonly _tag: 'Draft'; readonly series: string; readonly draft: string };

const isFilmScript = (block: ScriptBlock): block is typeof FilmScript.Type =>
  Predicate.isNotUndefined(block.film);

/** Where `block`'s script is read from: a film, or a series draft. */
export const scriptSource = (block: ScriptBlock): ScriptSource => {
  if (isFilmScript(block)) return { _tag: 'Film', film: block.film };
  return { _tag: 'Draft', series: block.series, draft: block.draft };
};
/** A film's Board: every panel, or the `panels` named (`<beat>.<mark>`), each as the Board shows it. */
const BoardBlock = Schema.Struct({
  kind: Schema.Literal('board'),
  film: LabName,
  panels: Schema.optionalKey(Schema.Array(BeatId)),
});
/** A video the review serves (a render, a set's video), in the review's player, from `at` seconds. */
const Video = Schema.Struct({
  kind: Schema.Literal('video'),
  ref: ReviewRef,
  at: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))),
  caption: Schema.optionalKey(Text(300)),
});
/** A recorded take of a film's beat: its kept take, or the attempt named (`attempt`, its file). */
const Audio = Schema.Struct({
  kind: Schema.Literal('audio'),
  film: LabName,
  beat: BeatId,
  attempt: Schema.optionalKey(Text(200)),
  caption: Schema.optionalKey(Text(300)),
});

/** One of the primitives a step is built of. */
export const AskBlock = Schema.Union([
  Heading,
  Prose,
  Picture,
  Choose,
  FreeText,
  Document,
  ScriptBlock,
  BoardBlock,
  Video,
  Audio,
]);
export type AskBlock = typeof AskBlock.Type;

/** A block that shows material by reference. */
export type Material = Extract<
  AskBlock,
  { readonly kind: 'document' | 'script' | 'board' | 'video' | 'audio' }
>;

const MATERIAL: ReadonlySet<AskBlock['kind']> = new Set([
  'document',
  'script',
  'board',
  'video',
  'audio',
]);

/** Whether `block` shows material by reference. */
const isMaterial = (block: AskBlock): block is Material => MATERIAL.has(block.kind);

/** The video files the review plays. */
const VIDEO_FILE = /\.(mp4|webm|mov|m4v)$/i;

/** `problem` when `wrong` holds, else nothing. */
const problemIf = (wrong: boolean, problem: string): ReadonlyArray<string> =>
  Bool.match(wrong, { onFalse: () => [], onTrue: () => [problem] });

/** What is wrong with a material block's shape, before the lab looks for it. */
const materialProblems = (where: string, block: Material): ReadonlyArray<string> =>
  Match.value(block).pipe(
    Match.discriminatorsExhaustive('kind')({
      document: (d) =>
        problemIf(
          !d.ref.endsWith('.md'),
          `${where}: document ${d.ref} is not a Markdown file (.md)`,
        ),
      script: (s) => namedProblems(where, 'beats', Option.fromUndefinedOr(s.beats)),
      board: (b) => namedProblems(where, 'panels', Option.fromUndefinedOr(b.panels)),
      video: (v) =>
        problemIf(
          !VIDEO_FILE.test(v.ref),
          `${where}: video ${v.ref} is not a video (.mp4, .webm, .mov, .m4v)`,
        ),
      audio: () => [],
    }),
  );

/** What is wrong with a list of beats or panels named: none named, or one named twice. */
const namedProblems = (
  where: string,
  what: string,
  named: Option.Option<ReadonlyArray<string>>,
): ReadonlyArray<string> =>
  Option.match(named, {
    onNone: () => [],
    onSome: (list) => [
      ...problemIf(list.length === 0, `${where}: ${what} names none: leave it out for all`),
      ...problemIf(new Set(list).size !== list.length, `${where}: ${what} names one twice`),
    ],
  });

/** Every material block in `ask`, by the step that shows it. */
export const materialsIn = (
  ask: Ask,
): ReadonlyArray<{ readonly step: AskName; readonly block: Material }> =>
  Record.toEntries(ask.steps).flatMap(([step, s]) =>
    blocksOf(s)
      .filter(isMaterial)
      .map((block) => ({ step, block })),
  );

/** A block the owner answers. */
export type Asking = Extract<AskBlock, { readonly id: string }>;

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

/**
 * A section of the ask's one page: its blocks, and its ways on, the first
 * that holds taken (the last holds always). A `title` heads the section
 * (`2 of 3 · The Board`): a guided review gives each section one, its material
 * first, then its questions. The page shows every section the owner's
 * answers so far reach (`sectionsOf`), one Send under them all.
 */
const PageStep = Schema.Struct({
  title: Schema.optionalKey(Text(80)),
  blocks: Schema.Array(AskBlock),
  next: Schema.Array(AskNext),
});
/** The end: the ask is answered; `text` thanks or says what happens next. */
const EndStep = Schema.Struct({ end: Schema.Literal(true), text: Schema.optionalKey(Text(400)) });

const AskStep = Schema.Union([PageStep, EndStep]);
type AskStep = typeof AskStep.Type;
type PageStep = typeof PageStep.Type;

/** A key read as a step's name: the name, or why it is not one. */
const decodeAskName = SchemaParser.decodeUnknownResult(AskName);

/**
 * A machine's steps by name. A record keyed by `AskName` sets aside a key the
 * name refuses as an excess property, and a decode ignores those: so every key
 * is read as written first, and each one `AskName` refuses is refused by its
 * own path with the name's reason, the rest then branded.
 */
const AskSteps = Schema.Record(Schema.String, AskStep)
  .check(
    Schema.makeFilter((steps) =>
      Arr.filterMap(Object.keys(steps), (key) =>
        Result.match(decodeAskName(key), {
          onFailure: (issue) => Result.succeed({ path: [key], issue }),
          onSuccess: () => Result.failVoid,
        }),
      ),
    ),
  )
  .pipe(
    Schema.decodeTo(
      Schema.Record(AskName, Schema.toType(AskStep)),
      SchemaTransformation.passthrough(),
    ),
  );

/** An ask's machine: where it starts, and its steps by name. */
export const Ask = Schema.Struct({
  start: AskName,
  steps: AskSteps,
});
export type Ask = typeof Ask.Type;

/** A step that is a page, not the end. */
const pageOf = (step: AskStep): Option.Option<PageStep> =>
  Option.liftPredicate(step, (s): s is PageStep => 'blocks' in s);

/** The blocks a step shows: a page's, none at an end. */
export const blocksOf = (step: AskStep): ReadonlyArray<AskBlock> =>
  Option.match(pageOf(step), { onNone: () => [], onSome: (page) => page.blocks });

/** A step's title, heading its section of the page, when it has one. */
export const titleOf = (step: AskStep): Option.Option<string> =>
  Option.flatMap(pageOf(step), (page) => Option.fromUndefinedOr(page.title));

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

/** The one-page ask's two steps: its page and its end. */
const ONE_PAGE = AskName.make('ask');
const ONE_END = AskName.make('done');

/** The one-page ask: `blocks` and then its end, the shape a single question takes. */
export const oneQuestion = (blocks: ReadonlyArray<AskBlock>, thanks?: string): Ask => ({
  start: ONE_PAGE,
  steps: {
    [ONE_PAGE]: { blocks, next: [{ to: ONE_END }] },
    [ONE_END]: {
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
const onFrom = (ask: Ask, name: AskName): ReadonlyArray<AskName> =>
  Option.match(Option.flatMap(Record.get(ask.steps, name), pageOf), {
    onNone: () => [],
    onSome: (page) => page.next.map((n) => n.to),
  });

/** The steps reached from the start. */
const reached = (ask: Ask): ReadonlySet<string> => {
  const seen = new Set<string>();
  const walk = (name: AskName): void => {
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
    name: AskName,
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
        document: (m) => problems.push(...materialProblems(`step ${name}`, m)),
        script: (m) => problems.push(...materialProblems(`step ${name}`, m)),
        board: (m) => problems.push(...materialProblems(`step ${name}`, m)),
        video: (m) => problems.push(...materialProblems(`step ${name}`, m)),
        audio: (m) => problems.push(...materialProblems(`step ${name}`, m)),
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
          if (c.options.filter((o) => o.recommended === true).length > 1)
            problems.push(`${c.id} recommends more than one option: recommend one`);
          c.options
            .filter((o) => Predicate.isNotUndefined(o.why) && o.recommended !== true)
            .forEach((o) =>
              problems.push(
                `${c.id}'s option ${o.value} says why but is not recommended: why goes on the recommended option`,
              ),
            );
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
  // Each Script reader owns the page's word commands and highlights: two on one page would cross.
  const scripts = materialsIn(ask).filter((m) => m.block.kind === 'script');
  if (scripts.length > 1)
    problems.push(
      `the ask shows ${scripts.length} scripts (steps ${scripts.map((s) => s.step).join(', ')}): one script per ask; ask about the next in an ask of its own`,
    );
  const seen = reached(ask);
  names
    .filter((name) => !seen.has(name))
    .forEach((name) => problems.push(`step ${name} is never reached from ${ask.start}`));
  Option.map(loopIn(ask), (path) => problems.push(`the steps loop: ${path.join(' → ')}`));
  return [...new Set(problems)];
};

/**
 * Each choice in `ask` that recommends none of its options, as the problem
 * an agent fixes it by: the owner rule (choices first, with a
 * recommendation) for an ask an agent makes now. A stored ask is never
 * checked again, so one made before keeps reading.
 */
export const unrecommended = (ask: Ask): ReadonlyArray<string> =>
  Record.toEntries(ask.steps).flatMap(([name, step]) =>
    askedIn(step)
      .filter((b): b is typeof Choose.Type => b.kind === 'choose' && b.options.length >= 2)
      .filter((c) => !c.options.some((o) => o.recommended === true))
      .map(
        (c) => `step ${name}: ${c.id} recommends none of its options: mark one recommended: true`,
      ),
  );

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
  Asking: { step: AskName, answers: Answers },
  Answered: { step: AskName, answers: Answers },
  /** `at`: when it was closed (ISO); a record with none still reads (its withdrawal is then filed at the time it is filed). */
  Closed: { answers: Answers, why: Schema.String, at: Schema.optionalKey(Schema.String) },
});
export type AskState = typeof AskState.Type;

export const AskEvent = Event({
  /** The owner's answers to step `step`. */
  Answer: { step: AskName, values: StepValues },
  /** The agent closes the ask (withdrawn, or filed once answered), at `at` (ISO). */
  Close: { why: Schema.String, at: Schema.optionalKey(Schema.String) },
});
export type AskEvent = typeof AskEvent.Type;

/** An ask's first state: at its start, nothing answered. */
export const askStart = (ask: Ask): AskState => AskState.Asking({ step: ask.start, answers: {} });

/** What the owner is told of a question he must answer and has not: by its label, never its id. */
export const unansweredText = (b: Asking): string => `${b.label} needs ${neededOf(b)}`;

/** What an open question needs, said by its field, where its label is in sight. */
export const neededText = (b: Asking): string => `Needs ${neededOf(b)}`;

const neededOf = (b: Asking): string =>
  Match.value(b).pipe(
    Match.discriminatorsExhaustive('kind')({
      choose: () => 'a choice',
      free_text: () => 'your words',
    }),
  );

/** One asked block's answer from `value` (none: left empty), or why it has none. */
const answerOf = (b: Asking, value: Option.Option<string>): Result.Result<AskAnswer, string> =>
  Match.value(b).pipe(
    Match.discriminatorsExhaustive('kind')({
      free_text: (t): Result.Result<AskAnswer, string> =>
        Option.match(value, {
          onNone: () =>
            Bool.match(requiredOf(t), {
              onTrue: () => Result.fail(unansweredText(t)),
              onFalse: () => Result.succeed({ kind: 'skipped' }),
            }),
          onSome: (text) => Result.succeed({ kind: 'free_text', text: text.trim() }),
        }),
      choose: (c): Result.Result<AskAnswer, string> =>
        Option.match(value, {
          onNone: () => Result.fail(unansweredText(c)),
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
const stepOf = (ask: Ask, name: AskName): Option.Option<AskStep> => Record.get(ask.steps, name);

/**
 * Why the owner's `values` for step `step` cannot move `state` on, or none
 * when they can: the ask is answered or closed, it is at another step, an
 * answer is missing, unknown, or not one of its choice's options.
 */
export const answerRefusal = (
  ask: Ask,
  state: AskState,
  step: AskName,
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

/** The way on `page` takes with `answers`: the first whose guard holds; none when none holds. */
const wayOn = (page: PageStep, answers: AskAnswers): Option.Option<AskName> =>
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
  const to = Option.flatMap(page, (p) => wayOn(p, answers));
  return Option.match(
    Option.filter(to, (t) => Option.isSome(Option.flatMap(stepOf(ask, t), pageOf))),
    {
      // An end, or (in a machine never checked) no way on: answered where the run stands.
      onNone: () => AskState.Answered({ step: Option.getOrElse(to, () => state.step), answers }),
      onSome: (step) => AskState.Asking({ step, answers }),
    },
  );
};

/** One section of an ask's page: a step the owner's answers reach, and the owner's draft of its answers. */
export interface Section {
  readonly name: AskName;
  readonly step: AskStep;
  readonly values: StepValues;
}

/** The choices `draft` makes in `step` that are its options, as the answers a guard reads. */
const chosenIn = (step: AskStep, draft: StepValues): AskAnswers =>
  Record.fromEntries(
    askedIn(step).flatMap((b) =>
      Match.value(b).pipe(
        Match.discriminatorsExhaustive('kind')({
          choose: (c): ReadonlyArray<readonly [string, AskAnswer]> =>
            Option.toArray(
              Option.flatMap(Record.get(draft, c.id), (v) =>
                Option.map(
                  Arr.findFirst(c.options, (o) => o.value === v),
                  (o) => [c.id, { kind: 'choose', value: o.value, label: o.label }] as const,
                ),
              ),
            ),
          free_text: () => [],
        }),
      ),
    ),
  );

/**
 * The ask's one page, from where its run is: each section the owner's
 * `draft` (every answer drafted, by its id) reaches, in order, to the end.
 * A section a guard leads to appears once its choice is made, and goes
 * again when the choice changes; the run itself moves only on Send. None
 * when the ask is answered or closed.
 */
export const sectionsOf = (
  ask: Ask,
  state: AskState,
  draft: StepValues,
): ReadonlyArray<Section> => {
  const sections: Array<Section> = [];
  let at = Match.value(state).pipe(
    Match.tag('Asking', (s) => Option.some({ step: s.step, answers: s.answers })),
    Match.orElse(() => Option.none<{ readonly step: AskName; readonly answers: AskAnswers }>()),
  );
  // Bounded by the steps: a checked ask has no loop, a stored one is never trusted to.
  while (Option.isSome(at) && sections.length < Record.size(ask.steps)) {
    const { step: name, answers } = at.value;
    const page = Option.flatMap(stepOf(ask, name), pageOf);
    if (Option.isNone(page)) break;
    const values = Record.filter(draft, (_, id) => askedIn(page.value).some((b) => b.id === id));
    sections.push({ name, step: page.value, values });
    const reached = { ...answers, ...chosenIn(page.value, draft) };
    at = Option.map(
      Option.filter(wayOn(page.value, reached), (to) => !sections.some((s) => s.name === to)),
      (step) => ({ step, answers: reached }),
    );
  }
  return sections;
};

/** A question the page asks the owner to answer, by its section, and whether the draft answers it. */
export interface Question {
  readonly step: AskName;
  readonly block: Asking;
  readonly answered: boolean;
}

/**
 * The questions `sections` must have answered before Send, in page order:
 * every choice, and words only where they are required. What the page
 * counts ("2 of 3 answered") and where a Send with one open takes the owner.
 */
export const questionsOf = (sections: ReadonlyArray<Section>): ReadonlyArray<Question> =>
  sections.flatMap((s) =>
    askedIn(s.step)
      .filter(requiredOf)
      .map((block) => ({
        step: s.name,
        block,
        answered: Option.isSome(Record.get(filled(s.values), block.id)),
      })),
  );

/**
 * Why the page cannot go as drafted, or none when it can: each section's
 * answers checked as the lab will check them (`answerRefusal`), in order,
 * the run moved by each before the next, the section named by its title.
 */
export const pageRefusal = (
  ask: Ask,
  state: AskState,
  sections: ReadonlyArray<{ readonly step: AskName; readonly values: StepValues }>,
): Option.Option<string> => {
  let run = state;
  for (const section of sections) {
    const why = answerRefusal(ask, run, section.step, filled(section.values));
    if (Option.isSome(why))
      return Option.some(
        Option.match(Option.flatMap(stepOf(ask, section.step), titleOf), {
          onNone: () => why.value,
          onSome: (title) => `${title}: ${why.value}`,
        }),
      );
    if (run._tag !== 'Asking') return Option.none();
    run = answered(ask, run, filled(section.values));
  }
  return Option.none();
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
      AskState.Closed({
        answers: state.answers,
        why: event.why,
        ...Option.match(Option.fromUndefinedOr(event.at), {
          onNone: () => ({}),
          onSome: (at) => ({ at }),
        }),
      }),
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
  step: AskName,
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
  /**
   * The ask whose page this one joined (made while that page still asked),
   * by its id; none: it opened its own page. An ask kept before pages is a
   * page of one.
   */
  page: Schema.optionalKey(AskName),
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

// ---------------------------------------------------------------------------
// A page of asks

/**
 * The page `record` is on, by the id of the ask that opened it: its own
 * when it opened one. A page has no record of its own: it is the asks that
 * name it, so nothing about it can disagree with them.
 */
export const pageIdOf = (record: Pick<AskRecord, 'id' | 'page'>): AskName =>
  Option.getOrElse(Option.fromUndefinedOr(record.page), () => record.id);

/** The asks on one page, in the order made: the one that opened it first. */
export const AsksPage = Schema.Struct({ page: AskName, asks: Schema.Array(AskRecord) });
export type AsksPage = typeof AsksPage.Type;

/**
 * The asks of `all` on page `page`, in the order made: by when each was
 * made, the one that opened it first of two made at one instant.
 */
export const asksOnPage = <R extends Pick<AskRecord, 'id' | 'page' | 'created'>>(
  all: ReadonlyArray<R>,
  page: string,
): ReadonlyArray<R> =>
  Arr.sort(
    all.filter((r) => pageIdOf(r) === page),
    Order.combine(
      Order.mapInput(Order.String, (r: R) => r.created),
      Order.mapInput(Order.Boolean, (r: R) => r.id !== page),
    ),
  );

/** Whether the owner still has `record` to answer. */
const waiting = (record: Pick<AskRecord, 'state'>): boolean => record.state._tag === 'Asking';

/** How far a page is answered, in asks. */
interface PageCount {
  /** How many asks the owner has answered. */
  readonly answered: number;
  /** How many he is to answer. */
  readonly of: number;
}

/**
 * How far a page is answered: of its asks the owner is to answer (one
 * withdrawn before he answered it is not), how many he has. A closed ask he
 * answered to its end counts as answered.
 */
export const pageCount = (
  asks: ReadonlyArray<Pick<AskRecord, 'ask' | 'state' | 'answered'>>,
): PageCount => {
  const asked = asks.filter((r) => r.state._tag !== 'Closed' || answeredToEnd(r));
  return { answered: asked.filter((r) => !waiting(r)).length, of: asked.length };
};

/** A page's count in words: `2 of 3 answered`. */
export const pageCountText = (count: PageCount): string =>
  `${count.answered} of ${count.of} answered`;

/** The first ask on a page the owner still has to answer: where the page takes him. */
export const nextAsking = (asks: ReadonlyArray<AskRecord>): Option.Option<AskRecord> =>
  Arr.findFirst(asks, waiting);

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
