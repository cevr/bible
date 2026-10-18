// `film review`: the evidence a keep is asked on (`core/review-record.ts`).
// It reads the scene's source key as `film project` reads it, then at each
// place named, all at once, takes the scene's figures through the lab's
// match (`takeMatch`, as `film match` does), critiques them (`Critic`, as
// `film critique` does) and copies each figure's crops and side-by-side into
// the set's folder (`<set>/review/crops/<review>/`), then reads the key again:
// a scene changed between the two reads is refused, so no record stamps old
// crops with a new key. The run is appended to the record
// (`review/evidence.json`) as one review, never over another, and the page
// (`review/evidence.md`) is written from them all; both are listed in the
// set's manifest, so the owner sees them and the ask gate finds them.
// `--done <id> --did "<what>"` answers one finding by its id: the fix made,
// or why it stands.
//
//   film review <film> --set <name> --scene <id> --at <place> --at <place> [--figure <name>]
//   film review <film> --set <name> --done <id> --did "<what was done>"

import { Argument, Command, Flag } from 'effect/cli';
import {
  Array as Arr,
  Boolean as Bool,
  Console,
  DateTime,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Predicate,
  Schema,
} from 'effect';
import { FetchHttpClient } from 'effect/http';
import type { CritiqueRule } from '../core/critique.ts';
import {
  EVIDENCE_FILE,
  EVIDENCE_PAGE,
  type ReviewFinding,
  type ReviewRecord,
  ReviewRecordJson,
  answered,
  appended,
  cropFile,
  evidenceMarkdown,
  findingId,
  keyHeld,
  nextReviewId,
} from '../core/review-record.ts';
import { repoJson } from '../core/schema.ts';
import { Counsel } from './counsel.ts';
import { Critic } from './critique.ts';
import { takeMatch } from './easel-cli.ts';
import { filmsOut } from './film-repo.ts';
import { FreshFilm } from './fresh-film.ts';
import { labUrl } from './lab-client.ts';

/** The fewest distinct places a review takes: one still is a glance, not a review. */
const REVIEW_PLACES = 2;

/** How many places a review takes at once: each is a match and a counsel run. */
const PLACES_AT_ONCE = 4;

class ReviewRefused extends Schema.TaggedError<ReviewRefused>()('ReviewRefused', {
  reason: Schema.String,
}) {
  override get message() {
    return `film review: ${this.reason}`;
  }
}

/** A set's manifest as JSON, every field kept: the review adds its page and crops and leaves the rest. */
const ManifestJson = repoJson(Schema.JsonObject);

/** The two lists of a manifest the review adds to, as written there (none: empty). */
const Listed = Schema.Struct({
  docs: Schema.optionalKey(Schema.Array(Schema.String)),
  images: Schema.optionalKey(Schema.Array(Schema.String)),
});
const listedOf = Schema.decodeUnknownOption(Listed);

export const review = (films: string, rules: ReadonlyArray<CritiqueRule>) =>
  Command.make(
    'review',
    {
      film: Argument.String('film').pipe(
        Argument.withDescription('the film, a folder under src/films'),
      ),
      set: Flag.String('set').pipe(
        Flag.withDescription('the set the record goes in: its folder under out/, published first'),
      ),
      scene: Flag.String('scene').pipe(Flag.optional, Flag.withDescription('the scene, by its id')),
      at: Flag.String('at').pipe(
        Flag.atLeast(0),
        Flag.withDescription(
          `a place in the scene, ${REVIEW_PLACES} or more: seconds (2.5), mark:<name>, or cue:<name>[@<0..1>]`,
        ),
      ),
      figure: Flag.String('figure').pipe(
        Flag.optional,
        Flag.withDescription(
          "one figure, by its rig's name; every figure with a concept when left out",
        ),
      ),
      done: Flag.String('done').pipe(
        Flag.optional,
        Flag.withDescription(
          'answer this finding, by its id (`f…`, as the page lists it), instead of taking a review',
        ),
      ),
      did: Flag.String('did').pipe(
        Flag.optional,
        Flag.withDescription('with --done: what was done (the fix, or why it stands)'),
      ),
    },
    Effect.fn('film.review')(function* (input) {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = path.join(yield* filmsOut, input.set);
      const manifest = path.join(dir, 'review.json');
      if (!(yield* fs.exists(manifest)))
        return yield* ReviewRefused.make({
          reason: `no set ${input.set} (${manifest}): publish it first (publish_set, or film publish)`,
        });
      const recordFile = path.join(dir, EVIDENCE_FILE);
      // The record there: none yet is an empty one; one that does not read is refused, never taken as none.
      const before: ReviewRecord = yield* Bool.match(yield* fs.exists(recordFile), {
        onFalse: () => Effect.succeed<ReviewRecord>({ reviews: [] }),
        onTrue: () =>
          fs.readFileString(recordFile).pipe(
            Effect.flatMap((text) => Schema.decodeEffect(ReviewRecordJson)(text)),
            Effect.mapError((error) =>
              ReviewRefused.make({
                reason: `${recordFile} does not read: ${error.message}`,
              }),
            ),
          ),
      });

      /** `record` written as the set's record and page, both listed in its manifest with `images`. */
      const written = (record: ReviewRecord, images: ReadonlyArray<string>) =>
        Effect.gen(function* () {
          yield* fs.makeDirectory(path.dirname(recordFile), { recursive: true });
          yield* fs.writeFileString(
            recordFile,
            yield* Schema.encodeEffect(ReviewRecordJson)(record),
          );
          yield* fs.writeFileString(path.join(dir, EVIDENCE_PAGE), evidenceMarkdown(record));
          const json = yield* Schema.decodeEffect(ManifestJson)(yield* fs.readFileString(manifest));
          const listed = Option.getOrElse(listedOf(json), (): typeof Listed.Type => ({}));
          const next = {
            ...json,
            docs: Arr.dedupe([...(listed.docs ?? []), EVIDENCE_PAGE]),
            images: Arr.dedupe([...(listed.images ?? []), ...images]),
          };
          yield* fs.writeFileString(manifest, yield* Schema.encodeEffect(ManifestJson)(next));
          const newest = Arr.last(record.reviews);
          const findings = Option.match(newest, { onNone: () => [], onSome: (r) => r.findings });
          const open = findings.filter((f) => Predicate.isUndefined(f.done)).length;
          yield* Effect.log(
            `review.written set=${input.set} reviews=${record.reviews.length} findings=${findings.length} open=${open}`,
          );
          yield* Console.log(
            `${path.join(dir, EVIDENCE_PAGE)} reviews=${record.reviews.length} newest=${Option.match(newest, { onNone: () => '-', onSome: (r) => `${r.id} ${r.scene}` })} findings=${findings.length} open=${open}`,
          );
          for (const f of findings)
            yield* Console.log(
              `  ${f.id} ${f.at} ${f.figure} ${f.aspect}: ${f.what}${Option.match(Option.fromUndefinedOr(f.done), { onNone: () => '', onSome: (d) => ` [done: ${d}]` })}`,
            );
        });

      // Answer one finding of the record there.
      if (Option.isSome(input.done)) {
        const did = Option.getOrElse(input.did, () => '');
        const next = yield* Effect.fromResult(answered(before, input.done.value, did)).pipe(
          Effect.mapError((reason) => ReviewRefused.make({ reason })),
        );
        return yield* written(next, []);
      }

      const scene = yield* Effect.fromOption(input.scene).pipe(
        Effect.mapError(() => ReviewRefused.make({ reason: 'name the scene (--scene <id>)' })),
      );
      const places = Arr.dedupe(input.at);
      if (places.length < REVIEW_PLACES)
        return yield* ReviewRefused.make({
          reason: `a review takes ${REVIEW_PLACES} distinct places or more (--at mark:<m> --at cue:<c>@0.5): it was given ${places.length}`,
        });
      const url = yield* labUrl;
      const critic = yield* Critic;
      const fresh = yield* FreshFilm;
      const from = path.resolve(films);
      const id = nextReviewId(before);
      const keyNow = fresh.project([input.film, '--json']).pipe(
        Effect.flatMap((project) =>
          Effect.fromOption(Arr.findFirst(project.scenes, (s) => s.scene === scene)),
        ),
        Effect.map((s) => s.key),
        Effect.mapError(() =>
          ReviewRefused.make({ reason: `${input.film} has no scene ${scene}` }),
        ),
      );
      const held = yield* keyHeld(
        keyNow,
        Effect.forEach(
          places,
          (at) =>
            Effect.gen(function* () {
              const taken = yield* takeMatch(url, input.film, {
                scene,
                at,
                ...Option.match(input.figure, {
                  onNone: () => ({}),
                  onSome: (figure) => ({ figure }),
                }),
                from,
              });
              const critiqued = yield* critic.critique(taken);
              const crops = yield* Effect.forEach(taken.figures, (m) =>
                Effect.gen(function* () {
                  const files = {
                    concept: cropFile(id, scene, at, m.figure, 'concept'),
                    drawn: cropFile(id, scene, at, m.figure, 'scene'),
                    side: cropFile(id, scene, at, m.figure, 'side'),
                  };
                  yield* fs.makeDirectory(path.dirname(path.join(dir, files.side)), {
                    recursive: true,
                  });
                  yield* fs.copyFile(m.crops.concept, path.join(dir, files.concept));
                  yield* fs.copyFile(m.crops.scene, path.join(dir, files.drawn));
                  yield* fs.copyFile(m.side, path.join(dir, files.side));
                  return { at, figure: m.figure, ...files };
                }),
              );
              const findings: ReadonlyArray<ReviewFinding> = critiqued.figures.flatMap((f) =>
                f.findings.map((finding) => ({
                  id: findingId(input.film, scene, { at, ...finding }),
                  at,
                  ...finding,
                })),
              );
              const skipped = [
                ...Option.toArray(
                  Option.map(Option.fromUndefinedOr(critiqued.skipped), (reason) => ({
                    at,
                    reason,
                  })),
                ),
                ...critiqued.rejected.map((r) => ({ at, reason: `a finding rejected: ${r}` })),
              ];
              return { crops, findings, skipped };
            }),
          { concurrency: PLACES_AT_ONCE },
        ),
      );
      const crops = held.taken.flatMap((p) => p.crops);
      const record = appended(before, {
        id,
        film: input.film,
        scene,
        key: held.key,
        ...Option.match(input.figure, { onNone: () => ({}), onSome: (figure) => ({ figure }) }),
        made: DateTime.formatIso(yield* DateTime.now),
        places,
        crops,
        findings: held.taken.flatMap((p) => p.findings),
        skipped: held.taken.flatMap((p) => p.skipped),
      });
      return yield* written(
        record,
        crops.flatMap((c) => [c.side, c.concept, c.drawn]),
      );
    }),
  ).pipe(
    Command.provide(
      Layer.mergeAll(FetchHttpClient.layer, Critic.layer(rules).pipe(Layer.provide(Counsel.layer))),
    ),
    Command.withDescription(
      "Take the evidence a keep is asked on: the scene's figures matched and critiqued at each place (2 distinct or more, at once), their crops at 1:1 copied into the set, and the run appended to the record (review/evidence.json, review/evidence.md) with the scene's source key, read before and after; --done <id> --did answers a finding. An ask on a production whose recommended keep names this scene or its figures (outcome 'keep', keeps.scenes) is refused without it",
    ),
  );
