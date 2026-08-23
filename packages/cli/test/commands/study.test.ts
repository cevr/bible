/** Milestone 5's CLI JSON workflow (§8.2, §10).
 *
 *  `bible study verse "Dan 8:13" --json` and `bible study strongs H8548 --json`
 *  must produce **the same result identities as the RPC responses**.
 *
 *  Core's `study/host-parity.test.ts` already proves the exported `verseStudyJson`
 *  and the RPC handler run one codec. What it cannot prove is that the *command*
 *  still calls it: replacing `verseStudyJson(bundle)` in `study.ts` with a
 *  hand-mapped object leaves that test green, because the test applies the
 *  encoder itself. These run the real command — argument parsing, layer
 *  resolution, encoder, `Console.log` — and compare what actually reached
 *  stdout with what the procedures put on the wire for the same inputs.
 */

import { BibleProcedureGroup, BibleProcedureHandlers } from '@bible/core/procedure';
import {
  StrongsStudyJson,
  StudyService,
  VerseStudyJson,
  strongsNumber,
  type StrongsStudy,
  type VerseStudy,
} from '@bible/core/study';
import {
  FIXTURE_BOOK,
  FIXTURE_CHAPTER,
  FIXTURE_MALFORMED_ROW,
  FIXTURE_VERSE,
  malformedStudyFixtureLayer,
  studyProcedureDependencies,
  studyFixtureLayer,
} from '@bible/core/study/testing';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Option, Schema, SchemaGetter } from 'effect';
import { RpcTest } from 'effect/unstable/rpc';

import { StudyLayer, strongsStudyJson, study, verseStudyJson } from '../../src/commands/study.js';
import { runCli } from '../lib/run-cli.js';

/** The layer the two commands resolve under test. Substituted through
 *  `StudyLayer`, the reference whose default is the installed `~/.bible`
 *  corpora, so the command under test is the production command and only its
 *  data source moved. */
const fixture: Layer.Layer<StudyService> = studyFixtureLayer;

const runStudy = (args: readonly string[]) =>
  runCli(study, [...args], {}).pipe(Effect.provideService(StudyLayer, fixture));

/** The CLI's serializer, declared here so the comparison is a property of the
 *  payload rather than of this test's own formatting choices. */
const JsonText = Schema.Unknown.pipe(
  Schema.encodeTo(Schema.String, {
    decode: SchemaGetter.parseJson(),
    encode: SchemaGetter.stringifyJson({ space: 2 }),
  }),
);

const serialize = Schema.encodeUnknownEffect(JsonText);

/** The JSON text `v1.study.verse.get` puts on the wire for one bundle.
 *
 *  Two steps, because that is what the seam is: `VerseStudyJson` — the exported
 *  name for the procedure's declared success schema — encodes the bundle, and
 *  the result is serialized. Comparing text rather than objects is the point:
 *  JSON is what a client actually receives, and two encoders agreeing in memory
 *  while disagreeing on the wire is exactly the drift a shared codec removes. */
const verseWireText = (bundle: VerseStudy): Effect.Effect<string, Schema.SchemaError> =>
  Effect.flatMap(Schema.encodeEffect(VerseStudyJson)(bundle), serialize);

const strongsWireText = (result: StrongsStudy): Effect.Effect<string, Schema.SchemaError> =>
  Effect.flatMap(Schema.encodeEffect(StrongsStudyJson)(result), serialize);

/** The handler layer both visual hosts register, over the same fixture. */
const handlers = BibleProcedureHandlers.pipe(Layer.provide(studyProcedureDependencies));

describe('bible study verse --json', () => {
  it.scoped('prints exactly what v1.study.verse.get puts on the wire', () =>
    Effect.gen(function* () {
      const result = yield* runStudy(['verse', 'Dan 8:13', '--json']);
      expect(result.success).toBe(true);

      // The bundle as it crosses the *RPC* seam: through the real client/server
      // pair, decoded by the group's own schema. Not the CLI's own service
      // call — that would compare the command to itself.
      const client = yield* RpcTest.makeClient(BibleProcedureGroup);
      const overRpc = yield* client['v1.study.verse.get']({
        book: FIXTURE_BOOK,
        chapter: FIXTURE_CHAPTER,
        verse: FIXTURE_VERSE,
      });

      // The whole assertion. A hand-mapped projection reintroduced in the
      // command — renaming a field, dropping `parallelWritingsTotal`, flattening
      // an `Option` — changes this text and nothing else has to be updated to
      // catch it.
      expect(result.stdout).toBe(yield* verseWireText(overRpc));

      // Not vacuous: an empty stdout would satisfy neither of these, and a
      // bundle missing a section would satisfy neither.
      expect(result.stdout.length).toBeGreaterThan(0);
      expect(result.stdout).toContain('"parallelWritings"');
      expect(result.stdout).toContain('"marginNotes"');
      expect(result.stdout).toContain('"5BC"');
      expect(result.stdout).toContain('"GC"');
    }).pipe(Effect.provide(handlers)),
  );

  it.effect('renders the five sections for a human reader', () =>
    Effect.gen(function* () {
      const result = yield* runStudy(['verse', 'Dan 8:13']);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('Daniel 8:13');
      expect(result.stdout).toContain('## words');
      expect(result.stdout).toContain('## cross-references');
      expect(result.stdout).toContain('## margin-notes');
      expect(result.stdout).toContain('## commentary');
      // The cap and the uncapped total, so a reader can see there is more.
      expect(result.stdout).toContain('## parallel-writings  1/1');
    }),
  );

  it.effect('refuses a reference that does not name one verse', () =>
    Effect.gen(function* () {
      // A chapter parses fine, but the bundle is keyed to one verse — silently
      // studying verse 1 and printing a label the caller did not ask for is the
      // failure this rejects.
      const result = yield* runStudy(['verse', 'Dan 8', '--json']);
      expect(result.success).toBe(false);
    }),
  );
});

describe('bible study strongs --json', () => {
  it.scoped('prints exactly what v1.study.strongs.get puts on the wire', () =>
    Effect.gen(function* () {
      const result = yield* runStudy(['strongs', 'H8548', '--json']);
      expect(result.success).toBe(true);

      const client = yield* RpcTest.makeClient(BibleProcedureGroup);
      // No `limit`: the command sent none either, so both sides take the
      // service's default and the comparison covers the default path.
      const overRpc = yield* client['v1.study.strongs.get']({ number: strongsNumber('H8548') });

      expect(result.stdout).toBe(yield* strongsWireText(overRpc));
      expect(result.stdout).toContain('"occurrences"');
      expect(result.stdout).toContain('"total"');
    }).pipe(Effect.provide(handlers)),
  );

  it.scoped('passes --limit through to the same cap the RPC applies', () =>
    Effect.gen(function* () {
      const result = yield* runStudy(['strongs', 'H8548', '--limit', '3', '--json']);
      expect(result.success).toBe(true);

      const client = yield* RpcTest.makeClient(BibleProcedureGroup);
      const overRpc = yield* client['v1.study.strongs.get']({
        number: strongsNumber('H8548'),
        limit: 3,
      });

      expect(result.stdout).toBe(yield* strongsWireText(overRpc));
      expect(overRpc.occurrences.length).toBe(3);
    }).pipe(Effect.provide(handlers)),
  );

  it.effect('accepts a lowercase number, decoding it the way the wire does', () =>
    Effect.gen(function* () {
      const result = yield* runStudy(['strongs', 'h8548']);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('H8548');
    }),
  );

  it.effect('refuses a number the wire schema would refuse', () =>
    Effect.gen(function* () {
      // `8548` has no lexicon prefix. Rejecting it here rather than querying
      // for it is what keeps the CLI and the RPC payload agreeing about what a
      // Strong's number is.
      const result = yield* runStudy(['strongs', '8548']);
      expect(result.success).toBe(false);
    }),
  );

  it.effect('refuses a leading-zero number at this seam too', () =>
    Effect.gen(function* () {
      // Should-fix 5. The corpus stores no zero-padded numbers, so `H0001`
      // names no lexicon row — and the CLI must refuse it for the same reason
      // and by the same schema the RPC does, rather than querying for it and
      // printing an empty result that looks like an answer.
      const result = yield* runStudy(['strongs', 'H0001']);
      expect(result.success).toBe(false);
    }),
  );

  it.effect('refuses --limit 0, as the RPC payload does', () =>
    Effect.gen(function* () {
      // The flag used to accept zero and hand it to a service whose
      // `StrongsStudy.limit` is `isGreaterThan(0)` — so the caller met a schema
      // error from inside the encode rather than "that flag needs a positive
      // number". Now the flag carries the procedure's own check.
      const result = yield* runStudy(['strongs', 'H8548', '--limit', '0']);
      expect(result.success).toBe(false);
    }),
  );

  it.effect('still accepts a positive --limit', () =>
    Effect.gen(function* () {
      // The other side of the check: tightening the flag must not have made the
      // ordinary case fail, which is exactly what applying the schema after
      // `Flag.optional` would have done.
      const result = yield* runStudy(['strongs', 'H8548', '--limit', '2']);
      expect(result.success).toBe(true);
    }),
  );
});

describe('the CLI encoders are the core schemas', () => {
  it.effect('emits the bundle through the core schema, not a CLI-local projection', () =>
    Effect.gen(function* () {
      const bundle = yield* Effect.flatMap(StudyService, (service) =>
        service.verse({
          _tag: 'verse',
          book: FIXTURE_BOOK,
          chapter: FIXTURE_CHAPTER,
          verse: FIXTURE_VERSE,
        }),
      );

      // Equality against the core encoder is the property that makes a
      // hand-written projection impossible: any such projection differs from it
      // somewhere.
      expect(yield* verseStudyJson(bundle)).toEqual(
        yield* Schema.encodeEffect(VerseStudyJson)(bundle),
      );
    }).pipe(Effect.provide(fixture)),
  );

  it.effect("emits the Strong's study through the core schema", () =>
    Effect.gen(function* () {
      const result = yield* Effect.flatMap(StudyService, (service) =>
        service.strongs(strongsNumber('H8548')),
      );

      expect(yield* strongsStudyJson(result)).toEqual(
        yield* Schema.encodeEffect(StrongsStudyJson)(result),
      );
      expect(Option.isSome(result.entry)).toBe(true);
    }).pipe(Effect.provide(fixture)),
  );
});

/** Should-fix 9's CLI half: a malformed corpus row is reported *by name*.
 *
 *  The error was already typed and already carried `source`, `operation` and
 *  `row` — and the CLI printed the schema's `message` and nothing else, so an
 *  operator was told a row was malformed and given no way to find it. The three
 *  fields exist for exactly that, and reaching stderr is the only place they do
 *  the reader any good. */
describe('bible study verse against a malformed corpus row', () => {
  const runMalformed = (args: readonly string[]) =>
    runCli(study, [...args], {}).pipe(
      Effect.provideService(StudyLayer, malformedStudyFixtureLayer),
    );

  it.effect('names the corpus, the section and the row on stderr', () =>
    Effect.gen(function* () {
      const result = yield* runMalformed(['verse', 'Dan 8:13']);

      // Still a failure: the row is a corpus defect, and §8.4's sparseness
      // posture means a section quietly one item short reads as "no citations"
      // rather than as a fault. Dropping it is the bug the typed error exists
      // to prevent.
      expect(result.success).toBe(false);

      // And the identity an operator acts on. Without the report the whole
      // line is absent — `stderr` is empty and the run says only that
      // something failed.
      expect(result.stderr).toContain(FIXTURE_MALFORMED_ROW);
      expect(result.stderr).toContain('verse.parallelWritings');
      expect(result.stderr).toContain('writings');
    }),
  );

  it.effect('keeps the diagnostic out of stdout, where --json pipes', () =>
    Effect.gen(function* () {
      // A diagnostic line on stdout would corrupt the payload a script is
      // parsing, which is the reason the report is on stderr rather than the
      // stream every other line of this command writes to.
      const result = yield* runMalformed(['verse', 'Dan 8:13', '--json']);
      expect(result.success).toBe(false);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain(FIXTURE_MALFORMED_ROW);
    }),
  );
});
