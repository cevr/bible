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
//       [--set <set>] [--point <id>] [--variant <id>] [--at <ISO time>]
//       record the owner's decision or note given outside the lab
//   film production file <production> <set> --version <n>
//       file a set published before sets named their production
//   film publish <folder> --production <production> [--version <n>]
//       stamp a set's review.json with its production, version and the time
//       now, so it lands on that production's timeline; the folder must be
//       one the lab reads (under a review root)

import { Argument, Command, Flag } from 'effect/cli';
import {
  Clock,
  Console,
  DateTime,
  Effect,
  FileSystem,
  Match,
  Option,
  Path,
  Result,
  Schema,
} from 'effect';
import {
  type ProductionFile,
  ProductionId,
  type Said,
  currentVersion,
  moveForward,
  newProduction,
  versionAt,
  withFiled,
  withSaid,
} from '../core/production.ts';
import { writeWhole } from './content-store.ts';
import { ProductionStore, stampManifest } from './production-store.ts';
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

/** `film production new` on a production that already has a ledger. */
class ProductionKept extends Schema.TaggedError<ProductionKept>()('ProductionKept', {
  production: Schema.String,
}) {
  override get message() {
    return `${this.production} already has a ledger: film production show ${this.production}`;
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

/** A version the production does not have. */
class VersionUnknown extends Schema.TaggedError<VersionUnknown>()('VersionUnknown', {
  production: Schema.String,
  version: Schema.Int,
  current: Schema.Int,
}) {
  override get message() {
    return `${this.production} has no v${this.version} (v1 to v${this.current})`;
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
const saidVerb = { Decided: 'decided', Noted: 'noted' } as const satisfies Record<
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
            `  ${saidVerb[s._tag]} ${iso(s.at)}: ${s.text}${Option.match(s.quote, { onNone: () => '', onSome: (q) => ` — "${q}"` })}${Option.match(s.set, { onNone: () => '', onSome: (set) => `  set=${set}` })}`,
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
    const store = yield* ProductionStore;
    if (Option.isSome(yield* store.read(id))) return yield* ProductionKept.make({ production: id });
    const now = yield* timeOf(input.at);
    const file = yield* store.modify(id, () =>
      Result.succeed({
        ...newProduction(id, input.title, now, input.film),
        blurb: input.blurb,
        versions: [{ at: now, title: input.first, because: Option.none() }],
      }),
    );
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
    const file = yield* (yield* ProductionStore).modify(id, (current) =>
      moveForward(current, { after: input.after, title: input.title, because: input.because }, at),
    );
    yield* Console.log(`${id}  v${currentVersion(file)} ${input.title}  opened ${iso(at)}`);
  }),
).pipe(
  Command.withDescription(
    'Move a production forward: its next version opens now, after the one you saw',
  ),
);

const say = (tag: Said['_tag']) =>
  Command.make(
    { Decided: 'decide', Noted: 'note' }[tag],
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
      };
      const said: Said = { _tag: tag, ...fields };
      yield* (yield* ProductionStore).modify(id, (current) =>
        Result.succeed(withSaid(current, said)),
      );
      yield* Console.log(`${saidVerb[tag]} ${id} at=${iso(at)}`);
    }),
  ).pipe(
    Command.withDescription(
      {
        Decided: "Record the owner's decision given outside the lab (a pick, a direction)",
        Noted: "Record the owner's note given outside the lab (feedback, an ask)",
      }[tag],
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
    yield* (yield* ProductionStore).modify(id, (current) => {
      const n = currentVersion(current);
      if (input.version < 1 || input.version > n)
        return Result.fail(
          VersionUnknown.make({ production: id, version: input.version, current: n }),
        );
      return Result.succeed(withFiled(current, { set: input.set, version: input.version }));
    });
    yield* Console.log(`filed ${input.set} in ${id} v${input.version}`);
  }),
).pipe(
  Command.withDescription('File a set published before sets named their production in a version'),
);

export const production = Command.make('production').pipe(
  Command.withDescription(
    "A production's timeline (a film, or a track such as the look): its versions, the owner's words, moving forward",
  ),
  Command.withSubcommands([list, show, create, forward, say('Decided'), say('Noted'), file]),
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
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const folder = path.resolve(input.folder);
    const manifest = path.join(folder, 'review.json');
    const published = yield* Clock.currentTimeMillis;
    const text = yield* stampManifest(manifest, yield* fs.readFileString(manifest), {
      production: id,
      version: input.version,
      published,
    });
    yield* writeWhole(fs, manifest, (partial) => fs.writeFileString(partial, text));
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
