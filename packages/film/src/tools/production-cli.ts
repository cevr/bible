// `film production` and `film publish`: a production's ledger kept from the
// terminal (`core/production.ts`, `production-store.ts`), and a review set
// published onto a production's timeline. Each line printed is one line, so
// an agent reads it.
//
//   film production list
//       each ledger: its name, current version and title, words and filings
//   film production show <production>
//       its versions newest first, each with the owner's words and the sets filed by hand
//   film production new <production> --title "<title>" [--film <film>] [--blurb "<line>"]
//       [--first "<what v1 is for>"] [--at <ISO>]
//       start a ledger: one version, opened now (or at --at)
//   film production forward <production> --after <n> --title "<title>" [--because "<decision>"] [--at <ISO>]
//       move forward: version n+1 opens now (or at --at) (refused when the production is past n)
//   film production decide|note <production> "<text>" [--quote "<owner's words>"]
//       [--set <set>] [--point <id>] [--variant <id>] [--by <who>] [--at <ISO time>]
//       record the owner's decision or note given outside the lab (the lab's
//       MCP `decide` and `note` record the same, through the same store)
//   film production ask <production> "<question>" --why "<what it decides>"
//       [--option "<answer>" --option "<answer>" ...] [--set <set> [--point <id>]]
//       [--film <film>] [--deadline <ISO>] [--by <who>]
//       ask the owner on a page of the running lab (`FILM_LAB_URL`, through
//       `lab-client.ts`): the lab's own ask, filed on the production's
//       timeline as the lab's MCP `ask` files it; prints its links. Two
//       options or more are a choice with optional words beside it, the
//       first given the recommendation (the page lists it first and marks
//       it); none asks for words. The set is named as every production command and
//       the ledger name it, by its folder under its review root: the lab's
//       sets say which one it is, and a folder two roots hold is refused (a
//       timeline could not tell them apart). No lab answering is
//       `LabUnanswered`: nothing is asked
//   film production file <production> <set> --version <n>
//       file a set published before sets named their production
//   film publish <folder> --production <production> [--version <n>]
//       stamp a set's review.json with its production, version and the time
//       now, so it lands on that production's timeline; the folder must be
//       one the lab reads (under a review root)

import { Argument, Command, Flag } from 'effect/cli';
import {
  Boolean as Bool,
  Clock,
  Console,
  DateTime,
  Effect,
  Match,
  Option,
  Path,
  Result,
  Schema,
} from 'effect';
import { FetchHttpClient } from 'effect/http';
import { AskBlock } from '../core/ask.ts';
import { AskInvalid } from '../core/refusals.ts';
import {
  type OwnerWord,
  type ProductionFile,
  ProductionId,
  type Said,
  currentVersion,
  setNamed,
  setPathOf,
  versionAt,
} from '../core/production.ts';
import { type LabClient, labClient, labUrl } from './lab-client.ts';
import { AskTool } from './asks-mcp.ts';
import { Sets } from './sets-mcp.ts';
import { ProductionStore } from './production-store.ts';
import { Review, refOf } from './review.ts';

/** A name that is not a production's (lower case, digits and `-`). */
class ProductionNameInvalid extends Schema.TaggedError<ProductionNameInvalid>()(
  'ProductionNameInvalid',
  { name: Schema.String },
) {
  override get message() {
    return `"${this.name}" is not a production's name: lower case letters, digits and -, e.g. righteousness-by-faith`;
  }
}

/** A time that does not parse. */
class TimeInvalid extends Schema.TaggedError<TimeInvalid>()('TimeInvalid', {
  text: Schema.String,
}) {
  override get message() {
    return `"${this.text}" is not a time: give an ISO time, e.g. 2026-10-14T15:10:00-04:00`;
  }
}

/** One option is no choice. */
class OneOption extends Schema.TaggedError<OneOption>()('OneOption', {
  option: Schema.String,
}) {
  override get message() {
    return `one --option ("${this.option}") is no choice: give two or more, or none to ask for words`;
  }
}

/** A set the lab does not list. */
class SetUnlisted extends Schema.TaggedError<SetUnlisted>()('SetUnlisted', {
  set: Schema.String,
  url: Schema.String,
}) {
  override get message() {
    return `the lab at ${this.url} lists no set ${this.set}: name a set by its folder under its review root, as \`film production show\` prints it (set=…)`;
  }
}

/** A folder more than one root holds: the lab lists a set in each, and a timeline, naming a set by its folder alone, cannot tell them apart. */
class SetInRoots extends Schema.TaggedError<SetInRoots>()('SetInRoots', {
  set: Schema.String,
  refs: Schema.Array(Schema.String),
}) {
  override get message() {
    return `${this.set} is a folder in more than one root (${this.refs.join(', ')}), and a production's timeline names a set by its folder alone: rename one, or ask without --set`;
  }
}

/** A set named by the lab's ref: the production commands name it by its folder. */
class SetByRef extends Schema.TaggedError<SetByRef>()('SetByRef', {
  ref: Schema.String,
  folder: Schema.String,
}) {
  override get message() {
    return `${this.ref} is the lab's ref for it: the production commands name a set by its folder under its root, --set ${this.folder}`;
  }
}

const productionNamed = (name: string) =>
  Effect.fromResult(
    Result.mapError(Schema.decodeResult(ProductionId)(name), () =>
      ProductionNameInvalid.make({ name }),
    ),
  );

const name = Argument.String('production').pipe(
  Argument.withDescription('the production: a film or a track, e.g. righteousness-by-faith, look'),
);

const iso = (at: number) => DateTime.formatIso(DateTime.makeUnsafe(at));

/** `--at`, an ISO time, as ms since the epoch; now without. */
const timeOf = (text: Option.Option<string>) =>
  Option.match(text, {
    onNone: () => Clock.currentTimeMillis,
    onSome: (given) =>
      Option.match(DateTime.make(given), {
        onNone: () => Effect.fail(TimeInvalid.make({ text: given })),
        onSome: (at) => Effect.succeed(DateTime.toEpochMillis(at)),
      }),
  });

/** When it happened: now, or an earlier time an agent records late. */
const atFlag = (what: string) =>
  Flag.String('at').pipe(
    Flag.optional,
    Flag.withDescription(`when ${what}, an ISO time (now without)`),
  );

/** What a said line opens with, by its kind. */
const saidVerb = { Decided: 'decided', Noted: 'noted', Asked: 'asked' } as const satisfies Record<
  Said['_tag'],
  string
>;

/** The current version's mark on its line. */
const currentMark = (current: boolean): string =>
  Match.value(current).pipe(
    Match.when(true, () => ' (current)'),
    Match.orElse(() => ''),
  );

/** The ledger as `show` prints it: newest version first, the owner's words and filings under each. */
const ledgerLines = (file: ProductionFile): ReadonlyArray<string> => {
  const current = currentVersion(file);
  return [
    `${file.production}  ${file.title}${Option.match(file.film, { onNone: () => '', onSome: (f) => `  film=${f}` })}`,
    ...file.versions.toReversed().flatMap((v, back) => {
      const n = current - back;
      const words = file.said.filter((s) => versionAt(file, s.at) === n);
      return [
        `v${n}${currentMark(n === current)}  ${v.title}  opened ${iso(v.at)}`,
        ...Option.match(v.because, { onNone: () => [], onSome: (b) => [`  because: ${b}`] }),
        ...words.map(
          (s) =>
            `  ${saidVerb[s._tag]} ${iso(s.at)}: ${s.text}${Option.match(s.quote, { onNone: () => '', onSome: (q) => ` — "${q}"` })}${Option.match(s.set, { onNone: () => '', onSome: (set) => `  set=${set}` })}${Option.match(s.by, { onNone: () => '', onSome: (by) => `  by=${by}` })}`,
        ),
        ...file.filed.filter((f) => f.version === n).map((f) => `  filed set=${f.set}`),
      ];
    }),
  ];
};

const list = Command.make(
  'list',
  {},
  Effect.fn('film.production.list')(function* () {
    const files = yield* (yield* ProductionStore).list;
    if (files.length === 0)
      yield* Console.log('no productions yet: film production new <name> --title "<title>"');
    for (const file of files) {
      const n = currentVersion(file);
      yield* Console.log(
        `${file.production}  v${n} ${file.versions[n - 1]?.title ?? ''}  ${file.said.length} words  ${file.filed.length} filed`,
      );
    }
  }),
).pipe(Command.withDescription('Every production kept, with its current version'));

const show = Command.make(
  'show',
  { production: name },
  Effect.fn('film.production.show')(function* (input) {
    const id = yield* productionNamed(input.production);
    const file = yield* (yield* ProductionStore).read(id);
    if (Option.isNone(file))
      return yield* Console.log(`${id} has no ledger: its sets alone make its timeline (v1)`);
    for (const line of ledgerLines(file.value)) yield* Console.log(line);
  }),
).pipe(
  Command.withDescription(
    "A production's ledger: its versions newest first, with the owner's words and the sets filed by hand",
  ),
);

const create = Command.make(
  'new',
  {
    production: name,
    title: Flag.String('title').pipe(Flag.withDescription('its name on the front door')),
    film: Flag.String('film').pipe(
      Flag.optional,
      Flag.withDescription('the film it makes, if any'),
    ),
    blurb: Flag.String('blurb').pipe(Flag.optional, Flag.withDescription('a line on what it is')),
    first: Flag.String('first').pipe(
      Flag.withDefault('v1'),
      Flag.withDescription('what its first version is for, its name on the timeline'),
    ),
    at: atFlag('its first version opened'),
  },
  Effect.fn('film.production.new')(function* (input) {
    const id = yield* productionNamed(input.production);
    const now = yield* timeOf(input.at);
    const file = yield* (yield* ProductionStore).start(id, {
      title: input.title,
      film: input.film,
      blurb: input.blurb,
      first: input.first,
      at: now,
    });
    yield* Console.log(`started ${file.production}  v1  opened ${iso(now)}`);
  }),
).pipe(Command.withDescription("Start a production's ledger: one version, opened now"));

const forward = Command.make(
  'forward',
  {
    production: name,
    after: Flag.Int('after').pipe(
      Flag.withDescription('the version you saw as current: refused when it has moved since'),
    ),
    title: Flag.String('title').pipe(Flag.withDescription('what the new version is for')),
    because: Flag.String('because').pipe(
      Flag.optional,
      Flag.withDescription('the decision that moves it forward, in a line'),
    ),
    at: atFlag('it moved forward'),
  },
  Effect.fn('film.production.forward')(function* (input) {
    const id = yield* productionNamed(input.production);
    const at = yield* timeOf(input.at);
    const file = yield* (yield* ProductionStore).forward(
      id,
      { after: input.after, title: input.title, because: input.because },
      at,
    );
    yield* Console.log(`${id}  v${currentVersion(file)} ${input.title}  opened ${iso(at)}`);
  }),
).pipe(
  Command.withDescription(
    'Move a production forward: its next version opens now, after the one you saw',
  ),
);

const say = (tag: OwnerWord['_tag']) =>
  Command.make(
    ({ Decided: 'decide', Noted: 'note' } as const)[tag],
    {
      production: name,
      text: Argument.String('text').pipe(Argument.withDescription('what was said, plainly')),
      quote: Flag.String('quote').pipe(
        Flag.optional,
        Flag.withDescription("the owner's own words, verbatim"),
      ),
      set: Flag.String('set').pipe(
        Flag.optional,
        Flag.withDescription('the set it is about: its folder under the review root'),
      ),
      point: Flag.String('point').pipe(
        Flag.optional,
        Flag.withDescription('the choice in that set it is about (e.g. render:cold)'),
      ),
      variant: Flag.String('variant').pipe(
        Flag.optional,
        Flag.withDescription('the variant chosen'),
      ),
      by: Flag.String('by').pipe(
        Flag.optional,
        Flag.withDescription('who files it, when an agent heard it: its name'),
      ),
      at: atFlag('it was said'),
    },
    Effect.fn(`film.production.${tag}`)(function* (input) {
      const id = yield* productionNamed(input.production);
      const at = yield* timeOf(input.at);
      const fields = {
        at,
        text: input.text,
        quote: input.quote,
        set: input.set,
        point: input.point,
        variant: input.variant,
        ask: Option.none(),
        by: input.by,
      };
      const said: OwnerWord = { _tag: tag, ...fields };
      yield* (yield* ProductionStore).say(id, said);
      yield* Console.log(`${saidVerb[tag]} ${id} at=${iso(at)}`);
    }),
  ).pipe(
    Command.withDescription(
      (
        {
          Decided: "Record the owner's decision given outside the lab (a pick, a direction)",
          Noted: "Record the owner's note given outside the lab (feedback)",
        } as const
      )[tag],
    ),
  );

/** `blocks` decoded as an ask's page, so each name is checked here: an option left blank is refused. */
const decodeBlocks = (
  blocks: ReadonlyArray<typeof AskBlock.Encoded>,
): Effect.Effect<ReadonlyArray<AskBlock>, AskInvalid> =>
  Schema.decodeEffect(Schema.Array(AskBlock))(blocks).pipe(
    Effect.mapError((error) => AskInvalid.make({ problems: [error.message] })),
  );

/**
 * The page an ask from the terminal shows: two options or more are a choice
 * (the owner taps one, the first given recommended) with words beside it the owner may leave empty; none
 * asks for words, which then must be written.
 */
const askBlocks = (options: ReadonlyArray<string>) =>
  Match.value(options).pipe(
    Match.when(
      (o) => o.length === 0,
      () =>
        decodeBlocks([{ kind: 'free_text', id: 'answer', label: 'Your answer', required: true }]),
    ),
    Match.when(
      (o) => o.length === 1,
      (o) => Effect.fail(OneOption.make({ option: o[0] ?? '' })),
    ),
    Match.orElse((o) =>
      decodeBlocks([
        {
          kind: 'choose',
          id: 'pick',
          label: 'Pick one',
          // The first given is the recommendation: an ask made now names one.
          options: o.map((label, i) => ({
            value: String(i + 1),
            label,
            ...Bool.match(i === 0, { onFalse: () => ({}), onTrue: () => ({ recommended: true }) }),
          })),
        },
        { kind: 'free_text', id: 'note', label: 'Anything else?' },
      ]),
    ),
  );

/**
 * The lab's ref for the set `given` names, among the refs the lab lists
 * (`setNamed`): the folder under its root, as the ledger and every
 * production command name a set, held by one root. A ref is refused, naming
 * its folder; a folder more than one root holds is refused, since the
 * timeline could not tell which.
 */
const refFor = (
  listed: ReadonlyArray<string>,
  given: string,
  url: string,
): Effect.Effect<string, SetUnlisted | SetInRoots | SetByRef> =>
  Result.match(setNamed(listed, given), {
    onFailure: (held) => Effect.fail(SetInRoots.make({ set: held.folder, refs: held.refs })),
    onSuccess: (named) =>
      Option.match(named, {
        onNone: () => Effect.fail(SetUnlisted.make({ set: given, url })),
        onSome: ({ ref, folder }) =>
          Match.value(ref === given).pipe(
            Match.when(true, () => Effect.fail(SetByRef.make({ ref, folder }))),
            Match.orElse(() => Effect.succeed(ref)),
          ),
      }),
  });

/** `ask` made in the lab, in a session of its own (ended once answered); its set, given by folder, named by the lab's ref. */
const askInLab = Effect.fn('film.production.askInLab')(function* (
  client: LabClient,
  ask: typeof AskTool.parametersSchema.Type,
) {
  const session = yield* client.session;
  const set = yield* Option.match(Option.fromUndefinedOr(ask.set), {
    onNone: () => Effect.succeed({}),
    onSome: (given) =>
      client.call(session, Sets, {}).pipe(
        Effect.flatMap(({ sets }) =>
          refFor(
            sets.map((listed) => listed.set),
            given,
            client.url,
          ),
        ),
        Effect.map((ref) => ({ set: ref })),
      ),
  });
  return yield* client.call(session, AskTool, { ...ask, ...set });
}, Effect.scoped);

const ask = Command.make(
  'ask',
  {
    production: name,
    question: Argument.String('question').pipe(
      Argument.withDescription('the question, plainly: the title of its page'),
    ),
    why: Flag.String('why').pipe(
      Flag.withDescription('what the answer decides, said under the question'),
    ),
    option: Flag.String('option').pipe(
      Flag.atLeast(0),
      Flag.withDescription(
        'an answer the owner taps: give two or more (a choice, with optional words beside it), your recommendation first, or none to ask for words',
      ),
    ),
    set: Flag.String('set').pipe(
      Flag.optional,
      Flag.withDescription(
        'the set it is about: its folder under its review root, as `decide` and `note` take it; its timeline shows it waiting there',
      ),
    ),
    point: Flag.String('point').pipe(
      Flag.optional,
      Flag.withDescription(
        'the choice in that set it is about (e.g. render:cold): a pick there answers it too',
      ),
    ),
    film: Flag.String('film').pipe(Flag.optional, Flag.withDescription('the film it is about')),
    deadline: Flag.String('deadline').pipe(
      Flag.optional,
      Flag.withDescription('an ISO time after which it takes no answer'),
    ),
    by: Flag.String('by').pipe(Flag.withDefault('agent'), Flag.withDescription('who asks')),
  },
  Effect.fn('film.production.ask')(function* (input) {
    const id = yield* productionNamed(input.production);
    const blocks = yield* askBlocks(input.option);
    const client = yield* labClient(yield* labUrl);
    const asked = yield* askInLab(client, {
      title: input.question,
      why: input.why,
      by: input.by,
      production: id,
      blocks,
      ...Option.match(input.set, { onNone: () => ({}), onSome: (set) => ({ set }) }),
      ...Option.match(input.point, { onNone: () => ({}), onSome: (point) => ({ point }) }),
      ...Option.match(input.film, { onNone: () => ({}), onSome: (film) => ({ film }) }),
      ...Option.match(input.deadline, { onNone: () => ({}), onSome: (deadline) => ({ deadline }) }),
    });
    yield* Console.log(
      `asked ${asked.ask} on ${id}: ${Option.match(Option.fromUndefinedOr(asked.set), {
        onNone: () => 'filed on its timeline once closed',
        onSome: (set) =>
          `waits on its timeline at ${setPathOf(set)}${Option.match(
            Option.fromUndefinedOr(asked.point),
            {
              onNone: () => '',
              onSome: (point) => `, ${point}`,
            },
          )}`,
      })}`,
    );
    yield* Console.log(`local ${asked.links.local}`);
    yield* Console.log(
      Option.match(Option.fromUndefinedOr(asked.links.phone), {
        onNone: () => 'phone none: the lab has no FILM_LAB_PHONE_URL',
        onSome: (phone) => `phone ${phone}`,
      }),
    );
    yield* Console.log(
      `then: bun cli.ts ask wait ${asked.ask} in the background (it exits once answered, with the answers); close_ask it once acted on`,
    );
  }),
).pipe(
  Command.provide(FetchHttpClient.layer),
  Command.withDescription(
    "Ask the owner on a page of the running lab (FILM_LAB_URL), filed on the production's timeline; prints its links",
  ),
);

const file = Command.make(
  'file',
  {
    production: name,
    set: Argument.String('set').pipe(
      Argument.withDescription('the set: its folder under the review root, e.g. styles-2026-10-13'),
    ),
    version: Flag.Int('version').pipe(Flag.withDescription('the version it belongs to')),
  },
  Effect.fn('film.production.file')(function* (input) {
    const id = yield* productionNamed(input.production);
    yield* (yield* ProductionStore).file(id, input.set, input.version);
    yield* Console.log(`filed ${input.set} in ${id} v${input.version}`);
  }),
).pipe(
  Command.withDescription('File a set published before sets named their production in a version'),
);

export const production = Command.make('production').pipe(
  Command.withDescription(
    "A production's timeline (a film, or a track such as the look): its versions, the owner's words, moving forward",
  ),
  Command.withSubcommands([list, show, create, forward, say('Decided'), say('Noted'), ask, file]),
);

export const publish = Command.make(
  'publish',
  {
    folder: Argument.String('folder').pipe(
      Argument.withDescription('the set: a folder with a review.json, under a review root'),
    ),
    production: Flag.String('production').pipe(
      Flag.withDescription('the production whose timeline it lands on'),
    ),
    version: Flag.Int('version').pipe(
      Flag.optional,
      Flag.withDescription('the version it was made for (the one open now without)'),
    ),
  },
  Effect.fn('film.publish')(function* (input) {
    const id = yield* productionNamed(input.production);
    const path = yield* Path.Path;
    const folder = path.resolve(input.folder);
    const published = yield* Clock.currentTimeMillis;
    yield* (yield* ProductionStore).publish(folder, id, input.version, published);
    const ref = refOf((yield* Review).roots, folder, path);
    yield* Console.log(
      Option.match(ref, {
        onNone: () =>
          `published ${folder} to ${id} at ${iso(published)}; no review root holds it, so the lab will not list it`,
        onSome: (r) =>
          `published ${r} to ${id} at ${iso(published)}  /sets/${encodeURIComponent(r)}`,
      }),
    );
  }),
).pipe(
  Command.withDescription(
    "Publish a review set onto a production's timeline: its review.json names the production, the version and when",
  ),
);
