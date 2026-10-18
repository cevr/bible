// `film review`: the evidence a keep is asked on (`core/review-record.ts`).
// At each place named it takes the scene's figures through the lab's match
// (`takeMatch`, as `film match` does), critiques them (`Critic`, as `film
// critique` does), copies each figure's crops and side-by-side into the
// set's folder (`<set>/review/crops/`), and writes the record
// (`review/evidence.json`) and its page (`review/evidence.md`), listed in the
// set's manifest, so the owner sees them and the ask gate finds them. The
// record holds the scene's source key as `film project` reads it now, so a
// scene changed since is a stale review. `--done <n> --did "<what>"` answers
// one finding: the fix made, or why it stands.
//
//   film review <film> --set <name> --scene <id> --at <place> --at <place> [--figure <name>]
//   film review <film> --set <name> --done <n> --did "<what was done>"

import { Argument, Command, Flag } from 'effect/cli';
import {
  Array as Arr,
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
  carriedDone,
  cropFile,
  evidenceMarkdown,
} from '../core/review-record.ts';
import { repoJson } from '../core/schema.ts';
import { Counsel } from './counsel.ts';
import { Critic } from './critique.ts';
import { takeMatch } from './easel-cli.ts';
import { filmsOut } from './film-repo.ts';
import { FreshFilm } from './fresh-film.ts';
import { labUrl } from './lab-client.ts';

/** The fewest places a review takes: one still is a glance, not a review. */
const REVIEW_PLACES = 2;

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
      done: Flag.Int('done').pipe(
        Flag.optional,
        Flag.withDescription('answer this finding (from 1) instead of taking a review'),
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
      const before = yield* fs.readFileString(recordFile).pipe(
        Effect.flatMap((text) => Schema.decodeEffect(ReviewRecordJson)(text)),
        Effect.option,
      );

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
          const open = record.findings.filter((f) => Predicate.isUndefined(f.done)).length;
          yield* Effect.log(
            `review.written set=${input.set} film=${record.film} crops=${record.crops.length} findings=${record.findings.length} open=${open} skipped=${record.skipped.length}`,
          );
          yield* Console.log(
            `${path.join(dir, EVIDENCE_PAGE)} findings=${record.findings.length} open=${open}`,
          );
          for (const [i, f] of record.findings.entries())
            yield* Console.log(
              `  ${i + 1}. ${f.scene} ${f.at} ${f.figure} ${f.aspect}: ${f.what}${Option.match(Option.fromUndefinedOr(f.done), { onNone: () => '', onSome: (d) => ` [done: ${d}]` })}`,
            );
        });

      // Answer one finding of the record there.
      if (Option.isSome(input.done)) {
        const record = yield* Effect.fromOption(before).pipe(
          Effect.mapError(() =>
            ReviewRefused.make({ reason: `set ${input.set} holds no review record yet` }),
          ),
        );
        const did = Option.getOrElse(input.did, () => '');
        const next = yield* Effect.fromResult(answered(record, input.done.value, did)).pipe(
          Effect.mapError((reason) => ReviewRefused.make({ reason })),
        );
        return yield* written(next, []);
      }

      const scene = yield* Effect.fromOption(input.scene).pipe(
        Effect.mapError(() => ReviewRefused.make({ reason: 'name the scene (--scene <id>)' })),
      );
      if (input.at.length < REVIEW_PLACES)
        return yield* ReviewRefused.make({
          reason: `a review takes ${REVIEW_PLACES} places or more (--at mark:<m> --at cue:<c>@0.5): it was given ${input.at.length}`,
        });
      const url = yield* labUrl;
      const critic = yield* Critic;
      const from = path.resolve(films);
      const places = yield* Effect.forEach(input.at, (at) =>
        Effect.gen(function* () {
          const taken = yield* takeMatch(url, input.film, {
            scene,
            at,
            ...Option.match(input.figure, { onNone: () => ({}), onSome: (figure) => ({ figure }) }),
            from,
          });
          const critiqued = yield* critic.critique(taken);
          const crops = yield* Effect.forEach(taken.figures, (m) =>
            Effect.gen(function* () {
              const files = {
                concept: cropFile(scene, at, m.figure, 'concept'),
                drawn: cropFile(scene, at, m.figure, 'scene'),
                side: cropFile(scene, at, m.figure, 'side'),
              };
              yield* fs.makeDirectory(path.dirname(path.join(dir, files.side)), {
                recursive: true,
              });
              yield* fs.copyFile(m.crops.concept, path.join(dir, files.concept));
              yield* fs.copyFile(m.crops.scene, path.join(dir, files.drawn));
              yield* fs.copyFile(m.side, path.join(dir, files.side));
              return { scene, at, figure: m.figure, ...files };
            }),
          );
          const findings: ReadonlyArray<ReviewFinding> = critiqued.figures.flatMap((f) =>
            f.findings.map((finding) => ({ scene, at, ...finding })),
          );
          const skipped = Option.toArray(
            Option.map(Option.fromUndefinedOr(critiqued.skipped), (reason) => ({
              scene,
              at,
              reason,
            })),
          );
          return { crops, findings, skipped };
        }),
      );
      const project = yield* (yield* FreshFilm).project([input.film, '--json']);
      const key = yield* Effect.fromOption(
        Arr.findFirst(project.scenes, (s) => s.scene === scene),
      ).pipe(
        Effect.mapError(() =>
          ReviewRefused.make({ reason: `${input.film} has no scene ${scene}` }),
        ),
      );
      const crops = places.flatMap((p) => p.crops);
      const record: ReviewRecord = {
        film: input.film,
        made: DateTime.formatIso(yield* DateTime.now),
        scenes: [{ scene, key: key.key }],
        crops,
        findings: carriedDone(
          Option.match(before, { onNone: () => [], onSome: (b) => b.findings }),
          places.flatMap((p) => p.findings),
        ),
        skipped: places.flatMap((p) => p.skipped),
      };
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
      "Take the evidence a keep is asked on: the scene's figures matched and critiqued at each place (2 or more), their crops at 1:1 copied into the set, and the record (review/evidence.json, review/evidence.md) written there with the scene's source key; --done <n> --did answers a finding. An ask on a production that recommends lock, keep or go is refused without it",
    ),
  );
