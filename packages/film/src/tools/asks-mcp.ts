// The lab MCP's asks and the owner's word (`lab-mcp.ts` serves them): a
// decision page an agent composes from the lab's primitives as a small
// machine (`ask`), on a page of asks (one made while the same asker's
// earlier ask still asks joins that one's page, so asks made in sequence
// share one page and one link), answered by the owner on any device, each step's answers
// heard as `ask.step` changes; read (`ask_read`, `asks`) and closed
// (`close_ask`), its words filed on its production's timeline once by its id
// (by `AskStore`, through `ProductionStore`; `core/ask.ts`). The owner's word
// from chat filed there (`decide`, `note`), and the production moved forward
// on his filed decision (`forward`), each through `ProductionStore`.

import { Clock, Effect, Layer, Match, Option, Schema, Struct } from 'effect';
import { McpServer, Tool, Toolkit } from 'effect/ai';
import { pageHref } from '../core/api.ts';
import {
  Ask,
  AskAnswer,
  AskBlock,
  type AskRecord,
  NEW_PAGE,
  askStatus,
  asksOnPage,
  oneQuestion,
  pageIdOf,
} from '../core/ask.ts';
import { LabLinks, linksAt } from '../core/lab-events.ts';
import {
  type OwnerWord,
  ProductionId,
  Said,
  VersionNumber,
  currentVersion,
  forwardOnDecision,
  versionAt,
} from '../core/production.ts';
import { AskStore } from './ask-store.ts';
import { LabRefused, type LabMcpOptions, refused } from './lab-mcp-parts.ts';
import { logged } from './mcp-calls.ts';
import { ProductionStore } from './production-store.ts';
import { setsReads } from './sets-mcp.ts';

// ---------------------------------------------------------------------------
// What the tools answer, and the tools

/** An ask as an agent reads it: where its run is and what the owner answered, typed. */
export const AskRead = Schema.Struct({
  ask: Schema.String,
  title: Schema.String,
  by: Schema.String,
  status: Schema.Literals(['asking', 'answered', 'closed']),
  /** The step the run is on while it asks, or the end it reached. */
  step: Schema.optionalKey(Schema.String),
  /** Every answer so far, by the name of the block that asked it. */
  answers: Schema.Record(Schema.String, AskAnswer),
  /** Each step answered, in order, with when. */
  answered: Schema.Array(Schema.Struct({ step: Schema.String, at: Schema.String })),
  /** Why it was closed, once it is. */
  closed: Schema.optionalKey(Schema.String),
  deadline: Schema.optionalKey(Schema.String),
  production: Schema.optionalKey(Schema.String),
  set: Schema.optionalKey(Schema.String),
  point: Schema.optionalKey(Schema.String),
  /** The ask's own links: they open its page, at this ask. */
  links: LabLinks,
  /** The page it is on (by the id of the ask that opened it), and the page's links. */
  page: Schema.Struct({ id: Schema.String, links: LabLinks }),
});
export type AskRead = typeof AskRead.Type;

/** What `ask` answers: the ask as `ask_read` reads it, and whether it opened its page or joined one. */
const AskMade = Schema.Struct({
  ...AskRead.fields,
  /** `opened page a…` or `joined page a…, 2 asks`. */
  onPage: Schema.String,
});

export const AskTool = Tool.make('ask', {
  description: [
    "Ask the owner to review something and decide, on one scrolling page made for it: answered on the laptop or the phone, the answers typed. A guided review has one section per piece of material, in the flow's order (script → concept → Board → voice → animatic → Rive scenes → sound → render → shorts), each section the material itself first, then its questions; one Send under them all. Give `blocks` for one section, or `machine` for several: `{start, steps}`, each step a section (`title`, its heading, e.g. 'The Board'; `blocks`; then `next`: `[{to, when?: {answer, is: [values]}}, …, {to}]`, the first whose `when` holds, the last unguarded) or an end (`{end: true, text?}`). Every section the owner's answers reach shows on the page; a guarded one appears once its choice is made.",
    "Show the material in place, by reference, never prose that points elsewhere: `{kind: 'script', film}` or `{kind: 'script', series, draft}` (the Script reader, its staging takes playable and its delivery marks editable in place; `beats` for some), `{kind: 'board', film, panels?}` (the Board's panels, each with its kept try), `{kind: 'video', ref, at?}` (a set's or a render's video in the review's player, from `at` seconds), `{kind: 'audio', film, beat, attempt?}` (a recorded take, the kept one unless named), `{kind: 'document', ref}` (a set's Markdown). A script under review is a `script` block, never a `document` of its Markdown, and an ask shows one script (ask about the next in an ask of its own); a new script that is no film's yet is written as a series draft first (`series/<series>/scripts/<draft>.md`), then named in a `script` block. A `ref` is a file as `sets` lists it (`<root>/<folder>/<file>`). Each is found when the ask is made; one the lab cannot show is refused, named. Other blocks: a heading, prose (context only), an image (`{src}`, a lab URL `/api/…`, or `{board: {film, panel, try}}`), a choose, a free_text; each question names its answer by `id`. The machine is checked before anything is kept (every step reachable, no loops, guards on the step's own choices, every material found, one script, one recommendation per choose), and a refusal lists every problem.",
    'Ask with a `choose` (the cheap answer: the owner taps one) and mark your recommendation: `recommended: true` on exactly one option (a choose of two or more without one is refused); the page lists it first and marks it; say on it `why` (what makes it the one, said under the options; only the recommended option takes a `why`). Add an optional `free_text` for anything else rather than asking for words. A choose is always answered. A free_text is optional: the page marks it so (write no "(optional)" in its label), and left empty it is answered `{kind: \'skipped\'}`; `required: true` makes the owner write, and only a step with no choose may ask it.',
    'Say `why` (what the answer decides) and `by` (who you are); a `deadline` (ISO time) after which it takes no answer; `production` (and the `set` ref it is about, and the `point`, its choice) to file it on that timeline: it waits there until closed (or, with a `point`, a pick there).',
    `Asks made in sequence share one page: an ask made while an earlier ask of the same \`by\` still asks joins that ask's page; otherwise it opens a new one. \`page\` names an ask whose page to join (that page must still ask), or \`"${NEW_PAGE}"\` opens a new page. Each ask on a page is answered, read and closed on its own; the page shows them in the order made, each with its own Send.`,
    "Answers its links (`local` on this machine, `phone` from the owner's phone when the lab listens there), the page's (`page.links`) and `onPage` (`opened page a…`, or `joined page a…, 2 asks`): hand the owner the page's link he will open it on, once per page (an ask that joined a page he has open shows there once he sends or reloads). Each section the owner sends is an `ask.step` change on `changes` (its answers typed), and `ask.answered` once the end is reached; read it with `ask_read`, and `close_ask` it once acted on. To wait for the answer, run `bun cli.ts ask wait <ask>` (or `ask wait --page <id>` for every ask on a page) from apps/animations in the background: it exits once the owner has answered and prints the answers; act when it exits, and never ask the owner to say he answered.",
  ].join(' '),
  parameters: Schema.Struct({
    title: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(200)),
    why: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(2000)),
    by: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(80)),
    film: Schema.optionalKey(Schema.String),
    deadline: Schema.optionalKey(Schema.String),
    production: Schema.optionalKey(ProductionId),
    set: Schema.optionalKey(Schema.String),
    /** The choice in that set it is about (a point id): a pick there answers it too. */
    point: Schema.optionalKey(Schema.String),
    blocks: Schema.optionalKey(Schema.Array(AskBlock)),
    /** The words the one page ends on, for `blocks`. */
    thanks: Schema.optionalKey(Schema.String),
    machine: Schema.optionalKey(Ask),
    /** The page it goes on: an ask's id (that ask's page, still asking), or `new`. */
    page: Schema.optionalKey(Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(40))),
  }),
  success: AskMade,
  failure: LabRefused,
});

const AskReadTool = Tool.make('ask_read', {
  description:
    "An ask: where its run is, every answer so far (typed: a choose's value and label, a free_text's words, `skipped` for an optional one left empty), each step answered, its links, and its page (`page.id`, `page.links`).",
  parameters: Schema.Struct({ ask: Schema.String }),
  success: AskRead,
  failure: LabRefused,
}).annotate(Tool.Readonly, true);

export const AsksTool = Tool.make('asks', {
  description:
    'Every ask, the newest first, each with its page (`page.id`: asks that share one were made in sequence and are answered on one page): `status` narrows them (`asking`: what waits on the owner).',
  parameters: Schema.Struct({
    status: Schema.optionalKey(Schema.Literals(['asking', 'answered', 'closed'])),
  }),
  success: Schema.Struct({ asks: Schema.Array(AskRead) }),
  failure: LabRefused,
}).annotate(Tool.Readonly, true);

const CloseAsk = Tool.make('close_ask', {
  description:
    "Close an ask, saying `why` (acted on, withdrawn): it takes no more answers and keeps what it has. With a production, it is filed on its timeline once: answered, as the owner's decision; withdrawn, as a note. Closing again with the same `why` answers it as it is (and files what a failed filing left out).",
  parameters: Schema.Struct({
    ask: Schema.String,
    why: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(2000)),
  }),
  success: AskRead,
  failure: LabRefused,
}).annotate(Tool.Idempotent, true);

/**
 * What the owner said in chat, as `decide` and `note` file it: plainly, in
 * his own words (required, never blank: the words are what shows he said
 * it), who heard it, and what it is about.
 */
const OwnerWordParams = Schema.Struct({
  production: ProductionId.annotate({
    description:
      "The production, by name: a film's, or a track such as `look` (`film production list` names them). It must keep a ledger",
  }),
  text: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(2000)).annotate({
    description: 'What the owner said, plainly, in a line',
  }),
  quote: Schema.String.check(
    Schema.makeFilter(
      (quote) =>
        quote.trim().length > 0 ||
        "the owner's own words, verbatim from the chat: a word filed without them is refused",
    ),
    Schema.isMaxLength(4000),
  ).annotate({
    description: "The owner's own words that said it, verbatim from the chat: required",
  }),
  by: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(80)).annotate({
    description: 'Who files it: your name',
  }),
  set: Schema.optionalKey(
    Schema.String.annotate({
      description:
        'The set it is about: its ref, as `sets` lists it, or its folder under its root, as the timeline names it',
    }),
  ),
  point: Schema.optionalKey(
    Schema.String.annotate({
      description: 'The choice in that set it is about, by its id (e.g. render:cold)',
    }),
  ),
  variant: Schema.optionalKey(
    Schema.String.annotate({ description: 'The variant of that choice the owner chose' }),
  ),
});

/** What `decide` and `note` answer: the word as filed, the version it landed in, and the timeline's link there. */
const WordFiled = Schema.Struct({
  production: Schema.String,
  version: Schema.Int,
  said: Said,
  links: LabLinks,
});

const DecideTool = Tool.make('decide', {
  description:
    "File a decision the owner has already made in chat on a production's timeline, as `film production decide` does: `text` says it plainly, `quote` is his own words verbatim (required: never file a decision he did not make; what is still his to choose is an `ask`), `by` is who you are. With a `set` it is a decision on that set (with a `point`, on that choice; a `variant`, the one he chose), and it answers the questions waiting there. It lands in the version open now. Answers the word as filed and the timeline's link.",
  parameters: OwnerWordParams,
  success: WordFiled,
  failure: LabRefused,
});

const NoteTool = Tool.make('note', {
  description:
    "File a note the owner gave in chat on a production's timeline, as `film production note` does: his feedback, which decides nothing and answers no question waiting there. `text`, `quote` (his own words verbatim, required) and `by` as for `decide`; a `set`, its `point` and a `variant` say what it is about. Answers the word as filed and the timeline's link.",
  parameters: OwnerWordParams,
  success: WordFiled,
  failure: LabRefused,
});

/** What `forward` moves a production by: the version the agent read as current, what the next is for, and the decision of the owner's it moves on. */
const ForwardParams = Schema.Struct({
  production: OwnerWordParams.fields.production,
  after: VersionNumber.annotate({
    description:
      'The version you read as current (`overview`, or the timeline): refused when the production has moved since',
  }),
  title: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(200)).annotate({
    description: 'What the next version is for, in a line',
  }),
  decision: Schema.Finite.annotate({
    description:
      "The owner's decision the move is on, by its `at` as the ledger files it (`decide` answers it as `said.at`; a refusal lists the version's decisions with theirs): his word to move on, in the version open now",
  }),
});

/** What `forward` answers: the version opened, the decision it opened on, and the timeline's link there. */
const MovedForward = Schema.Struct({
  production: Schema.String,
  version: Schema.Int,
  title: Schema.String,
  because: Schema.String,
  links: LabLinks,
});

const ForwardTool = Tool.make('forward', {
  description:
    "Move a production forward, as `film production forward` does: its next version opens now, after `after` (the one you read as current), for `title`, because of `decision`. Only on the owner's word to move on: `decision` names one decision of his in the version open now (filed with `decide` from chat, or by an ask he answered) by its `at`, and the timeline records that one as the reason. With no decision of his in the version it is refused (file or ask it first); a `decision` the version does not hold is refused, naming those it holds. Answers the version opened and the timeline's link.",
  parameters: ForwardParams,
  success: MovedForward,
  failure: LabRefused,
});

const AsksToolkit = Toolkit.make(
  AskTool,
  AskReadTool,
  AsksTool,
  CloseAsk,
  DecideTool,
  NoteTool,
  ForwardTool,
);

// ---------------------------------------------------------------------------
// The reads and writes, over the asks and the productions' ledgers

/** The asks and the timelines as the tools read and write them. */
const asksReads = Effect.fn('LabMcp.asksReads')(function* (options: LabMcpOptions) {
  const asks = yield* AskStore;
  const productions = yield* ProductionStore;
  const { sets, folderNamed } = yield* setsReads(options);

  const linksOf = (at: string) => linksAt(options.links, at);

  const askRead = (record: AskRecord): AskRead => ({
    page: { id: pageIdOf(record), links: linksOf(pageHref.askPage(pageIdOf(record))) },
    ask: record.id,
    title: record.title,
    by: record.by,
    status: askStatus(record.state),
    ...Match.value(record.state).pipe(
      Match.tag('Asking', 'Answered', (s) => ({ step: s.step })),
      Match.orElse(() => ({})),
    ),
    answers: record.state.answers,
    answered: record.answered.map((a) => ({ step: a.step, at: a.at })),
    ...Match.value(record.state).pipe(
      Match.tag('Closed', (s) => ({ closed: s.why })),
      Match.orElse(() => ({})),
    ),
    ...Struct.pick(record, ['deadline', 'production', 'set', 'point']),
    links: linksOf(pageHref.ask(record.id)),
  });

  const ask = Effect.fn('LabMcp.ask')(function* (given: typeof AskTool.parametersSchema.Type) {
    const blocks = Option.fromUndefinedOr(given.blocks);
    const flow = Option.fromUndefinedOr(given.machine);
    if (Option.isSome(blocks) && Option.isSome(flow))
      return yield* LabRefused.make({ reason: 'give `blocks` or `machine`, not both' });
    const machine = Option.orElse(flow, () =>
      Option.map(blocks, (b) => oneQuestion(b, given.thanks)),
    );
    if (Option.isNone(machine))
      return yield* LabRefused.make({ reason: 'give `blocks` (one page) or `machine`' });
    const production = Option.fromUndefinedOr(given.production);
    const set = Option.fromUndefinedOr(given.set);
    if (Option.isSome(set) && Option.isNone(production))
      return yield* LabRefused.make({ reason: '`set` files the ask on a production: name it' });
    if (
      Option.isSome(production) &&
      Option.isNone(yield* refused(productions.read(production.value)))
    )
      return yield* LabRefused.make({
        reason: `no production ${production.value}: film production new ${production.value} --title "<title>"`,
      });
    if (Option.isSome(set) && !(yield* sets).some((s) => s.set === set.value))
      return yield* LabRefused.make({ reason: `no set ${set.value}: \`sets\` lists them by ref` });
    // Its timeline names the set by its folder: one two roots hold is refused.
    if (Option.isSome(set)) yield* folderNamed(set.value);
    const record = yield* asks.make({ ...given, ask: machine.value }).pipe(
      Effect.mapError((e) =>
        LabRefused.make({
          reason: Match.value(e).pipe(
            Match.tag('AskInvalid', (i) => `the ask may not render:\n- ${i.problems.join('\n- ')}`),
            Match.tag(
              'AskUnknown',
              (u) => `no ask ${u.id} whose page to join: \`asks\` lists them`,
            ),
            Match.orElse((other) => other.message),
          ),
        }),
      ),
    );
    const page = asksOnPage(yield* refused(asks.list), pageIdOf(record));
    return {
      ...askRead(record),
      onPage: Option.match(Option.fromUndefinedOr(record.page), {
        onNone: () => `opened page ${record.id}`,
        onSome: (on) => `joined page ${on}, ${page.length} asks`,
      }),
    };
  });

  const askOf = (id: string) => Effect.map(refused(asks.read(id)), askRead);

  const asksOf = (status: Option.Option<'asking' | 'answered' | 'closed'>) =>
    Effect.map(refused(asks.list), (all) => ({
      asks: all
        .filter((r) =>
          Option.match(status, { onNone: () => true, onSome: (st) => askStatus(r.state) === st }),
        )
        .map(askRead),
    }));

  const closeAsk = Effect.fn('LabMcp.closeAsk')(function* (id: string, why: string) {
    const record = yield* refused(asks.close(id, why));
    return askRead(record);
  });

  /**
   * The owner's word from chat on its production's timeline, through the
   * store's own `say` (as `film production decide|note`, refused by it, as the
   * terminal's is, when not aimed: `aimedWord`), in the version open now: its
   * words, who filed it, and the set, choice and variant it is about.
   */
  const fileWord = Effect.fn('LabMcp.fileWord')(function* (
    tag: OwnerWord['_tag'],
    given: typeof OwnerWordParams.Type,
  ) {
    const production = given.production;
    if (Option.isNone(yield* refused(productions.read(production))))
      return yield* LabRefused.make({
        reason: `no production ${production}: film production new ${production} --title "<title>"`,
      });
    const point = Option.fromUndefinedOr(given.point);
    const variant = Option.fromUndefinedOr(given.variant);
    const named = Option.fromUndefinedOr(given.set);
    const set = yield* Option.match(named, {
      onNone: () => Effect.succeed(Option.none<string>()),
      onSome: (ref) => Effect.asSome(folderNamed(ref)),
    });
    const at = yield* Clock.currentTimeMillis;
    const said: OwnerWord = {
      _tag: tag,
      at,
      text: given.text,
      quote: Option.some(given.quote),
      set,
      point,
      variant,
      ask: Option.none(),
      by: Option.some(given.by),
    };
    const file = yield* refused(productions.say(production, said));
    const version = versionAt(file, at);
    return {
      production,
      version,
      said,
      links: linksOf(pageHref.production(production, version)),
    };
  });

  /**
   * The production moved forward on the decision of the owner's the agent
   * names (`forwardOnDecision`), through the store's own `forward`, which
   * refuses it under the lock when the production moved on since the read.
   */
  const forward = Effect.fn('LabMcp.forward')(function* (given: typeof ForwardParams.Type) {
    const production = given.production;
    const read = yield* refused(productions.read(production));
    if (Option.isNone(read))
      return yield* LabRefused.make({
        reason: `no production ${production}: film production new ${production} --title "<title>"`,
      });
    const move = yield* refused(Effect.fromResult(forwardOnDecision(read.value, given)));
    const at = yield* Clock.currentTimeMillis;
    const file = yield* refused(productions.forward(production, move, at));
    const version = currentVersion(file);
    yield* Effect.log(`lab.mcp.forward production=${production} version=${version}`);
    return {
      production,
      version,
      title: given.title,
      because: Option.getOrElse(move.because, () => ''),
      links: linksOf(pageHref.production(production, version)),
    };
  });

  return { ask, askOf, asksOf, closeAsk, fileWord, forward };
});

/** The asks' and the timelines' tools, served by the lab's MCP server. */
export const asksMcp = (options: LabMcpOptions) =>
  McpServer.toolkit(AsksToolkit).pipe(
    Layer.provideMerge(
      AsksToolkit.toLayer(
        Effect.map(asksReads(options), (lab) =>
          AsksToolkit.of({
            ask: logged('ask', (given) => lab.ask(given)),
            ask_read: logged('ask_read', ({ ask }) => lab.askOf(ask)),
            asks: logged('asks', ({ status }) => lab.asksOf(Option.fromUndefinedOr(status))),
            close_ask: logged('close_ask', ({ ask, why }) => lab.closeAsk(ask, why)),
            decide: logged('decide', (given) => lab.fileWord('Decided', given)),
            note: logged('note', (given) => lab.fileWord('Noted', given)),
            forward: logged('forward', (given) => lab.forward(given)),
          }),
        ),
      ),
    ),
  );
