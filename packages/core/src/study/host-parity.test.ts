/** One study bundle, two seams, byte-identical JSON (§8.2, M5 acceptance).
 *
 *  The same parity claim `wiki/host-parity.test.ts` makes, for the study seam.
 *  The web worker and Electron main are not two implementations — both register
 *  `BibleProcedureHandlers` over the same `StudyService`, so comparing their
 *  wires would compare a value to itself. The CLI is the genuinely separate
 *  seam: it resolves `StudyService` directly and serializes the bundle itself.
 *
 *  So the honest claim asserted here is: **the bundle the RPC handler returns
 *  and the bundle the CLI prints are the same value, encoded by the same
 *  schema.** One fixture feeds both — the same `@bible/core/study/testing`
 *  fixture the two hosts' round-trip tests read — and the comparison is on
 *  encoded JSON rather than on decoded objects, because JSON is what actually
 *  reaches a client.
 *
 *  The *count* of MessagePort crossings is not asserted here. `RpcTest` is an
 *  in-memory client/server pair with no port to count; the physical one-round-
 *  trip claim belongs to the two hosts that have real wires, and is asserted in
 *  `apps/web/src/workers/study-round-trip.test.ts` and
 *  `apps/desktop/tests/study-round-trip.test.ts`.
 */

import { Effect, Layer, Option, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { RpcTest } from 'effect/unstable/rpc';

import { Reference } from '../bible/model.js';
import { BibleProcedureGroup } from '../procedure/group.js';
import { BibleProcedureHandlers } from '../procedure/handlers.js';
import { StrongsStudyJson, VerseStudyJson, strongsNumber } from './model.js';
import { StudyService } from './service.js';
import {
  FIXTURE_BOOK,
  FIXTURE_CHAPTER,
  FIXTURE_CONCORDANCE_TOTAL,
  FIXTURE_LABEL,
  FIXTURE_TEXT,
  FIXTURE_VERSE,
  studyProcedureDependencies,
  studyFixtureLayer,
} from './testing.js';

const FIXTURE_REFERENCE = Reference.verse(FIXTURE_BOOK, FIXTURE_CHAPTER, FIXTURE_VERSE);

const handlers = BibleProcedureHandlers.pipe(Layer.provide(studyProcedureDependencies));

describe('study host parity', () => {
  it.scoped('the RPC handler and the CLI serialize the identical verse bundle', () =>
    Effect.gen(function* () {
      // Seam 1 — the handler both visual hosts register. `RpcTest` runs the
      // real client/server pair, so this value has crossed a wire and been
      // decoded by the group's own schema.
      const overRpc = yield* Effect.gen(function* () {
        const client = yield* RpcTest.makeClient(BibleProcedureGroup);
        return yield* client['v1.study.verse.get']({
          book: FIXTURE_REFERENCE.book,
          chapter: FIXTURE_REFERENCE.chapter,
          verse: FIXTURE_REFERENCE.verse,
        });
      }).pipe(Effect.provide(handlers));

      // Seam 2 — the CLI, calling `StudyService` directly.
      const overCli = yield* Effect.flatMap(StudyService, (service) =>
        service.verse(FIXTURE_REFERENCE),
      ).pipe(Effect.provide(studyFixtureLayer));

      // Encoded, not decoded: JSON is what a client actually receives, and this
      // is the same encoder `bible study verse --json` runs and the same one
      // the procedure group declares as `v1.study.verse.get`'s success schema.
      const encode = Schema.encodeEffect(Schema.fromJsonString(VerseStudyJson));
      expect(yield* encode(overRpc)).toBe(yield* encode(overCli));

      // And the bundle really is the composed one, not an empty shell that
      // would make the equality vacuous. All five sections, populated.
      expect(overCli.words.length).toBe(2);
      expect(overCli.crossRefs.length).toBe(1);
      expect(overCli.marginNotes.length).toBe(1);
      expect(overCli.commentary.map((entry) => entry.bookCode)).toEqual(['5BC']);
      expect(overCli.parallelWritings.map((entry) => entry.bookCode)).toEqual(['GC']);
    }),
  );

  it.scoped("the RPC handler and the CLI serialize the identical Strong's study", () =>
    Effect.gen(function* () {
      const overRpc = yield* Effect.gen(function* () {
        const client = yield* RpcTest.makeClient(BibleProcedureGroup);
        return yield* client['v1.study.strongs.get']({
          number: strongsNumber('H8548'),
          limit: 5,
        });
      }).pipe(Effect.provide(handlers));

      const overCli = yield* Effect.flatMap(StudyService, (service) =>
        service.strongs(strongsNumber('H8548'), { limit: 5 }),
      ).pipe(Effect.provide(studyFixtureLayer));

      const encode = Schema.encodeEffect(Schema.fromJsonString(StrongsStudyJson));
      expect(yield* encode(overRpc)).toBe(yield* encode(overCli));

      // The limit crossed the wire and was honored on the far side — not
      // vacuous, because the fixture holds more hits than the cap.
      expect(overRpc.occurrences.length).toBe(5);
      expect(overRpc.total).toBe(FIXTURE_CONCORDANCE_TOTAL);
      expect(Option.isSome(overRpc.entry)).toBe(true);
    }),
  );

  it.scoped('the bundle survives the wire with its typed absences intact', () =>
    Effect.gen(function* () {
      // Decoded on the client side by the group's schema, so `Option` fields
      // that encode as `null` come back as `Option` rather than as `null` —
      // the property a hand-written wire model would break first.
      const bundle = yield* Effect.gen(function* () {
        const client = yield* RpcTest.makeClient(BibleProcedureGroup);
        return yield* client['v1.study.verse.get']({
          book: FIXTURE_REFERENCE.book,
          chapter: FIXTURE_REFERENCE.chapter,
          verse: FIXTURE_REFERENCE.verse,
        });
      }).pipe(Effect.provide(handlers));

      expect(bundle.text).toEqual(Option.some(FIXTURE_TEXT));
      expect(bundle.label).toBe(FIXTURE_LABEL);

      const target = Option.getOrThrow(Option.fromNullishOr(bundle.crossRefs[0]));
      // Branded, so compared as its numeric projection rather than by
      // reconstructing the brand in the expectation.
      expect(Option.map(target.verse, Number)).toEqual(Option.some(6));
      // The absent half of the same row: `verseEnd` encodes as `null` and must
      // arrive as `None`, not as `null`.
      expect(Option.isNone(target.verseEnd)).toBe(true);
    }),
  );
});
