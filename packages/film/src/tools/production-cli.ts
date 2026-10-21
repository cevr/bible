// `film production` and `film publish`: a production's ledger kept from the
// terminal (`core/production.ts`, `production-store.ts`), and a review set
// published onto a production's timeline. Each line printed is one line, so
// an agent reads it. The owner's word is filed, asked and moved forward on
// by the lab's commands (`film lab decide|note|ask|forward`, the same as the
// lab's MCP tools: `lab-commands.ts`).
//
//   film production list
//       each ledger: its name, current version and title, words and filings
//   film production show <production>
//       its versions newest first, each with the owner's words and the sets filed by hand
//   film production new <production> --title "<title>" [--film <film>] [--blurb "<line>"]
//       [--first "<what v1 is for>"] [--at <ISO>]
//       start a ledger: one version, opened now (or at --at)
//   film production file <production> <set> --version <n>
//       file a set published before sets named their production
//   film publish <folder> --production <production> [--version <n>]
//       stamp a set's review.json with its production, version and the time
//       now (`ProductionStore.stamp`: refused for a production that keeps no
//       ledger, or a version it has not opened, as the lab's `publish_set`
//       refuses them), so it lands on that production's timeline; then say whether the
//       running lab (FILM_LAB_URL) lists the set, as that lab answers it: the
//       lab's own review roots decide, never this checkout's

import { Argument, Command, Flag } from 'effect/cli';
import {
  Array as Arr,
  Clock,
  Console,
  Data,
  DateTime,
  Duration,
  Effect,
  FileSystem,
  Match,
  Option,
  Path,
  Result,
  Schema,
} from 'effect';
import { FetchHttpClient } from 'effect/http';
import {
  type ProductionFile,
  ProductionId,
  type Said,
  currentVersion,
  versionAt,
} from '../core/production.ts';
import { ProductionStore } from './production-store.ts';
import { labClient, labUrl } from './lab-client.ts';
import { SetsTool } from './sets-mcp.ts';

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
  Command.withSubcommands([list, show, create, file]),
);

/** What the running lab says of a set's folder: listed (its ref and link), not listed, or nothing it could say. */
type Listing = Data.TaggedEnum<{
  Listed: { readonly ref: string; readonly link: string };
  Unlisted: {};
  Unknown: { readonly reason: string };
}>;
const Listing = Data.taggedEnum<Listing>();

/** How long `film publish` waits on the lab's answer: the stamp has landed, so a lab that holds the call never holds the line. */
const LAB_ANSWER_SECONDS = 5;

/**
 * Whether the lab at `url` lists the set in `folder`, asked of the lab
 * itself (its `sets`, its index read fresh): the lab reads its own review
 * roots, which a command run from another checkout (a worktree) does not
 * share. A lab that does not answer within `LAB_ANSWER_SECONDS`, or answers
 * in a shape this checkout does not read, leaves it unknown: the publish has
 * landed either way.
 */
const listedByLab = (url: string, folder: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const real = (at: string) => fs.realPath(at).pipe(Effect.orElseSucceed(() => at));
    const at = yield* real(folder);
    const client = yield* labClient(url);
    const { sets } = yield* Effect.scoped(
      Effect.flatMap(client.session, (session) => client.call(session, SetsTool, {})),
    );
    const dirs = yield* Effect.forEach(sets, (set) => real(set.dir));
    return Option.match(
      Option.flatMap(
        Arr.findFirstIndex(dirs, (dir) => dir === at),
        (i) => Arr.get(sets, i),
      ),
      {
        onNone: () => Listing.Unlisted(),
        onSome: (set) => Listing.Listed({ ref: set.set, link: set.links.local }),
      },
    );
  }).pipe(
    Effect.timeoutOrElse({
      duration: Duration.seconds(LAB_ANSWER_SECONDS),
      orElse: () =>
        Effect.succeed(Listing.Unknown({ reason: `no answer in ${LAB_ANSWER_SECONDS} s` })),
    }),
    Effect.catch((error) => Effect.succeed(Listing.Unknown({ reason: error.message }))),
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
    const url = yield* labUrl;
    const landed = `to ${id} at ${iso(published)}`;
    yield* Console.log(
      Listing.$match(yield* listedByLab(url, folder), {
        Listed: ({ ref, link }) => `published ${ref} ${landed}  ${link}`,
        Unlisted: () =>
          `published ${folder} ${landed}; the lab at ${url} does not list it: it lists the folders under its own review roots that hold something to review`,
        Unknown: ({ reason }) =>
          `published ${folder} ${landed}; whether the lab at ${url} lists it is unknown (${reason})`,
      }),
    );
  }),
).pipe(
  Command.withDescription(
    "Publish a review set onto a production's timeline: its review.json names the production, the version and when; then say whether the running lab (FILM_LAB_URL) lists it",
  ),
  Command.provide(FetchHttpClient.layer),
);
