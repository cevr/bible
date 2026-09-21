/**
 * Study CLI command graph (§8.2).
 *
 * `bible study verse "Dan 8:13" [--json]` prints the whole study bundle — the
 * verse's words with their Strong's numbers, its cross-references, its margin
 * notes, the EGW Bible Commentary on it, and the parallel writings that cite
 * it. `bible study strongs H8548 [--json]` prints one lexicon entry plus the
 * reverse concordance.
 *
 * Both call `StudyService` **directly**, so what they print is the value
 * `v1.study.verse.get` and `v1.study.strongs.get` return — the same service,
 * the same caps, the same result identities, with no second data path that
 * could drift from the two visual hosts.
 *
 * The `--json` payloads are produced by **the core schemas themselves**
 * (`VerseStudyJson`, `StrongsStudyJson`), not by a hand-written projection.
 * Those are the procedure group's own success schemas, so the CLI's JSON and
 * the RPC wire cannot disagree, and a field added to the model reaches both at
 * once instead of silently missing from one.
 */

import { parseBibleQuery } from '@bible/core/bible';
import {
  StrongsNumber,
  StrongsStudyJson,
  StudyCorpusDataError,
  StudyLimit,
  StudyService,
  VerseStudyJson,
  type StrongsStudy,
  type VerseStudy,
} from '@bible/core/study';
import { layerBunStudy } from '@bible/core/study/bun';
import { BunServices } from '@effect/platform-bun';
import {
  Config,
  Console,
  Context,
  Effect,
  Layer,
  Option,
  Path,
  Schema,
  SchemaGetter,
} from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';

const JsonString = Schema.Unknown.pipe(
  Schema.encodeTo(Schema.String, {
    decode: SchemaGetter.parseJson(),
    encode: SchemaGetter.stringifyJson({ space: 2 }),
  }),
);

const encodeJson = Schema.encodeUnknownEffect(JsonString);

/** The two core encoders. Nothing below names a field of a bundle: the schema
 *  is the wire contract, so the CLI's job is to run it. */
const encodeVerse = Schema.encodeEffect(VerseStudyJson);
const encodeStrongs = Schema.encodeEffect(StrongsStudyJson);

const json = Flag.Boolean('json').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Emit stable JSON'),
);

/** The cap, under `StudyLimit` — the one schema `v1.study.strongs.get` declares
 *  for it and `StrongsStudy.limit` reports it under.
 *
 *  The rule used to be written out here and again in the procedure payload, so
 *  `--limit 0` was accepted by the flag and refused by the wire: the caller met
 *  a schema error from deep inside the encode rather than "that flag needs a
 *  positive number". One exported schema is what makes the two seams agree by
 *  construction instead of by inspection. */
const limit = Flag.Int('limit').pipe(
  // Before `Flag.optional`, deliberately: the combinators compose in order, so
  // a schema applied after it would be handed the `Option` wrapper rather than
  // the number and would reject every invocation, absent flag included.
  Flag.withSchema(StudyLimit),
  Flag.optional,
  Flag.withDescription('How many concordance occurrences to list'),
);

/** The two corpora on disk. Both live in `~/.bible`, the same place every other
 *  command resolves them from. */
const installedStudyLayer = Layer.unwrap(
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const home = yield* Config.String('HOME');
    return layerBunStudy({
      bible: path.join(home, '.bible', 'bible.db'),
      writings: path.join(home, '.bible', 'egw-paragraphs.db'),
    });
  }).pipe(Effect.provide(BunServices.layer), Effect.orDie),
).pipe(Layer.provide(BunServices.layer));

/** Which `StudyService` the two commands resolve, as an overridable default.
 *
 *  A `Context.Reference` rather than a top-level CLI requirement, for the same
 *  reason `WikiLayer` is one: production wiring is unchanged and no other
 *  command pays to open two SQLite files it does not use, while a test can point
 *  the commands at fixtures and **still run the real command** — argument
 *  parsing, encoder, `Console.log` and all. The seam a helper-level test leaves
 *  open is precisely the one where a hand-mapped projection could reappear
 *  between the bundle and stdout. */
export class StudyLayer extends Context.Reference<Layer.Layer<StudyService>>(
  '@bible/cli/study/StudyLayer',
  { defaultValue: () => installedStudyLayer },
) {}

const studyService = <A, E>(use: Effect.Effect<A, E, StudyService>): Effect.Effect<A, E> =>
  Effect.flatMap(StudyLayer, (layer) => use.pipe(Effect.provide(layer)));

/** A writings row's citation, for a terminal line.
 *
 *  The book code stands in when the corpus stores the paragraph without a
 *  refcode — ~563 rows do, and five of them cite a verse. The line still has to
 *  say where the text came from, and printing an empty column would read as a
 *  rendering bug rather than as a property of the row. */
const writingRefcode = (entry: {
  readonly refcode: Option.Option<string>;
  readonly bookCode: string;
}): string => Option.getOrElse(entry.refcode, () => entry.bookCode);

const isCorpusRowFailure = Schema.is(StudyCorpusDataError);

/** Reports a malformed corpus row by its own identity, on stderr.
 *
 *  `StudyCorpusDataError` is the one study failure an operator can *act* on:
 *  every other cause says "the corpus refused", this one says "the corpus
 *  answered with a row that does not decode", and it carries the three fields
 *  that turn that into a task — which corpus (`source`), which section
 *  (`operation`) and which row (`row`, as the corpus names it: a refcode, a
 *  reference label, an index).
 *
 *  Printed rather than folded into the message the runtime renders, because the
 *  default rendering shows the schema's own `message` and nothing else — an
 *  operator was told a row was malformed and given no way to find it. On
 *  stderr, not stdout: `--json` pipes stdout, and a diagnostic line in that
 *  stream would corrupt the payload a script is parsing. The failure is
 *  re-raised unchanged, so the exit status and the typed error are what they
 *  were. */
const reportCorpusRow = <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E> =>
  Effect.tapError(effect, (cause) => {
    if (!isCorpusRowFailure(cause)) return Effect.void;
    return Console.error(
      `malformed ${cause.source} row in ${cause.operation}: ${cause.row} — ${cause.message}`,
    );
  });

// ---------------------------------------------------------------------------
// bible study verse
// ---------------------------------------------------------------------------

/** The `--json` payload for one bundle: the core schema's own encoding, so the
 *  CLI emits the value `v1.study.verse.get` puts on the wire rather than a
 *  parallel projection of it. */
export const verseStudyJson = (
  bundle: VerseStudy,
): Effect.Effect<VerseStudyJson, Schema.SchemaError> => encodeVerse(bundle);

const reference = Argument.String('reference').pipe(
  Argument.withDescription('A Bible verse reference, e.g. "Dan 8:13"'),
);

/** The reference argument named something other than one verse. */
class NotOneVerseError extends Schema.TaggedError<NotOneVerseError>()('NotOneVerseError', {
  reference: Schema.String,
}) {
  override get message(): string {
    return `Not a single-verse reference: "${this.reference}". Try a form like "Dan 8:13".`;
  }
}

/** Resolves a reference argument to a single verse.
 *
 *  Only `single` is accepted. A chapter, a range or a search phrase all parse,
 *  but the bundle is keyed to one verse — `getVerseWords`, `getCrossRefs` and
 *  `getMarginNotes` all take three numbers — so accepting a range would mean
 *  silently studying its first verse and printing a label the caller did not
 *  ask for. */
const singleVerse = (input: string) => {
  const parsed = parseBibleQuery(input);
  if (parsed._tag !== 'single') {
    return Effect.fail(NotOneVerseError.make({ reference: input }));
  }
  return Effect.succeed(parsed.ref);
};

export const studyVerse = Command.make('verse', { reference, json }, (args) =>
  Effect.gen(function* () {
    const target = yield* singleVerse(args.reference);
    const bundle = yield* studyService(
      Effect.flatMap(StudyService, (service) => service.verse(target)),
    );

    if (args.json) {
      yield* Console.log(yield* encodeJson(yield* verseStudyJson(bundle)));
      return;
    }

    yield* Console.log(bundle.label);
    yield* Option.match(bundle.text, {
      onNone: () => Console.log('(text unavailable)'),
      onSome: (text) => Console.log(text),
    });
    yield* Console.log(``);

    const tapTargets = bundle.words.filter((word) => word.strongs.length > 0);
    yield* Console.log(`## words  ${String(tapTargets.length)}/${String(bundle.words.length)}`);
    for (const word of tapTargets) {
      yield* Console.log(`  ${word.text}  ${word.strongs.join(' ')}`);
    }

    yield* Console.log(`## cross-references  ${String(bundle.crossRefs.length)}`);
    for (const crossRef of bundle.crossRefs) {
      yield* Console.log(`  ${crossRef.label}  [${crossRef.source}]`);
    }

    yield* Console.log(`## margin-notes  ${String(bundle.marginNotes.length)}`);
    for (const note of bundle.marginNotes) {
      yield* Console.log(`  ${note.phrase}: ${note.text}  [${note.kind}]`);
    }

    yield* Console.log(`## commentary  ${String(bundle.commentary.length)}`);
    for (const entry of bundle.commentary) {
      yield* Console.log(`  ${writingRefcode(entry)}  ${entry.bookTitle}`);
    }

    yield* Console.log(
      `## parallel-writings  ${String(bundle.parallelWritings.length)}/${String(
        bundle.parallelWritingsTotal,
      )}`,
    );
    for (const entry of bundle.parallelWritings) {
      yield* Console.log(`  ${writingRefcode(entry)}  ${entry.bookTitle}`);
    }
  }).pipe(reportCorpusRow, Effect.provide(BunServices.layer)),
);

// ---------------------------------------------------------------------------
// bible study strongs
// ---------------------------------------------------------------------------

export const strongsStudyJson = (
  result: StrongsStudy,
): Effect.Effect<StrongsStudyJson, Schema.SchemaError> => encodeStrongs(result);

const number = Argument.String('number').pipe(
  Argument.withDescription("A Strong's number, e.g. H8548"),
);

export const studyStrongs = Command.make('strongs', { number, limit, json }, (args) =>
  Effect.gen(function* () {
    // Decoded through the branded schema the RPC payload declares, and through
    // *only* it: the schema normalizes case itself, so uppercasing here would
    // widen what the CLI accepts past what the wire does — `h8548` would work
    // at one seam and fail at the other for the same reason nothing states.
    const target = yield* Schema.decodeEffect(StrongsNumber)(args.number);
    const result = yield* studyService(
      Effect.flatMap(StudyService, (service) =>
        service.strongs(target, { limit: Option.getOrUndefined(args.limit) }),
      ),
    );

    if (args.json) {
      yield* Console.log(yield* encodeJson(yield* strongsStudyJson(result)));
      return;
    }

    yield* Option.match(result.entry, {
      onNone: () => Console.log(`${result.number}  (no lexicon entry)`),
      onSome: (entry) =>
        Effect.gen(function* () {
          yield* Console.log(`${entry.number}  ${entry.lemma}  [${entry.language}]`);
          yield* Option.match(entry.transliteration, {
            onNone: () => Effect.void,
            onSome: (value) => Console.log(`  ${value}`),
          });
          yield* Console.log(`  ${entry.definition}`);
        }),
    });
    yield* Console.log(``);
    yield* Console.log(
      `## occurrences  ${String(result.occurrences.length)}/${String(result.total)}`,
    );
    for (const occurrence of result.occurrences) {
      yield* Console.log(`  ${occurrence.label}  ${occurrence.word}`);
    }
  }).pipe(reportCorpusRow, Effect.provide(BunServices.layer)),
);

export const study = Command.make('study', {}, () =>
  Console.log(
    `Usage: bible study verse "<reference>" [--json]\n` +
      `       bible study strongs <number> [--limit <n>] [--json]`,
  ),
).pipe(Command.withSubcommands([studyVerse, studyStrongs]));
