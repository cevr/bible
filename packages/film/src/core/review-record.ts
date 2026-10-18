// A review record (`film review`): the evidence that a scene's figures were
// looked at closely before the owner is asked to keep them. It is a list of
// reviews, one per run, each appended and never written over: a run takes
// one scene of one film, its source key read before its first place and
// again after its last (the same, or the run is refused), each figure's
// crops at 1:1 at two places or more, and a fresh critique's findings, each
// with a stable id and, once answered, what was done about it.
//
// The keep gate (`tools/ask-materials.ts`) reads what an ask keeps by its
// types (`AskKeeps` on an option whose `outcome` is `keep`, on the ask's
// recommended way), never by its words: each scene and figure kept needs a
// review of it from the scene as it stands now, every finding on it answered
// (`evidenceProblems`), or the owner's own words override it. The owner,
// 2026-10-17 (his local day), after a keep recommended on figures nobody had
// looked at 1:1: "theres some artifacts in the render, and the farmer looks
// nothing like the concept, face proportions and angles are off". Pure: the
// record, the problems, its page.

import { Array as Arr, Boolean as Bool, Effect, Option, Predicate, Result, Schema } from 'effect';
import { type Ask, type AskKeeps, recommendedPath, untypedKeeps } from './ask.ts';
import { CRITIQUE_ASPECTS } from './critique.ts';
import { fnv1a } from './random.ts';

/** The record's folder in its set, and its two files: the record and the page the owner reads. */
const EVIDENCE_DIR = 'review';
export const EVIDENCE_FILE = `${EVIDENCE_DIR}/evidence.json`;
export const EVIDENCE_PAGE = `${EVIDENCE_DIR}/evidence.md`;

/** One figure's crops at one place, as files in the set's folder. */
const ReviewCrop = Schema.Struct({
  at: Schema.String,
  figure: Schema.String,
  concept: Schema.String,
  drawn: Schema.String,
  side: Schema.String,
});

/** A critique's finding at one place, by its id (`findingId`), and what was done about it once it is answered. */
export const ReviewFinding = Schema.Struct({
  id: Schema.String,
  at: Schema.String,
  figure: Schema.String,
  aspect: Schema.Literals(CRITIQUE_ASPECTS),
  what: Schema.String,
  where: Schema.optionalKey(Schema.String),
  /** What was done: the fix, or why it stands. */
  done: Schema.optionalKey(Schema.String),
});
export type ReviewFinding = typeof ReviewFinding.Type;

/** A place whose critique was skipped (it fails open), and why. */
const ReviewSkip = Schema.Struct({ at: Schema.String, reason: Schema.String });

/** One run of `film review`: one scene of one film, at its places, over the key its sources had all through. */
const Review = Schema.Struct({
  /** `r1`, `r2`…, in the order the runs were taken. */
  id: Schema.String,
  film: Schema.String,
  scene: Schema.String,
  key: Schema.String,
  /** The one figure the run was narrowed to (`--figure`); left out, every figure the scene draws with a concept. */
  figure: Schema.optionalKey(Schema.String),
  /** ISO time it was taken. */
  made: Schema.String,
  places: Schema.Array(Schema.String),
  crops: Schema.Array(ReviewCrop),
  findings: Schema.Array(ReviewFinding),
  skipped: Schema.Array(ReviewSkip),
});
type Review = typeof Review.Type;

/** A set's reviews, oldest first. */
export const ReviewRecord = Schema.Struct({ reviews: Schema.Array(Review) });
export type ReviewRecord = typeof ReviewRecord.Type;

export const ReviewRecordJson = Schema.fromJsonString(ReviewRecord);

/** A finding's id: the hash of where it is and what it says, so the same finding read again has the same id. */
export const findingId = (
  film: string,
  scene: string,
  finding: Pick<ReviewFinding, 'at' | 'figure' | 'aspect' | 'what'>,
): string =>
  `f${fnv1a([film, scene, finding.at, finding.figure, finding.aspect, finding.what].join('\n'))
    .toString(16)
    .padStart(8, '0')}`;

/** The id the next review of `record` takes. */
export const nextReviewId = (record: ReviewRecord): string => `r${record.reviews.length + 1}`;

/** Whether two figure names name one figure: a counsel or an ask may write a name in another case. */
const sameFigure = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/**
 * `record` with `review` appended, each of its findings that an earlier
 * review answered (the same id) answered as there: a finding answered once
 * is not asked again. No earlier review is changed.
 */
export const appended = (record: ReviewRecord, review: Review): ReviewRecord => {
  const done = new Map(
    record.reviews.flatMap((r) =>
      r.findings.flatMap((f) =>
        Option.match(Option.fromUndefinedOr(f.done), {
          onNone: () => [],
          onSome: (d) => [[f.id, d] as const],
        }),
      ),
    ),
  );
  return {
    reviews: [
      ...record.reviews,
      {
        ...review,
        findings: review.findings.map((f) =>
          Option.match(Option.fromUndefinedOr(done.get(f.id)), {
            onNone: () => f,
            onSome: (d) => ({ ...f, done: d }),
          }),
        ),
      },
    ],
  };
};

/** A keep on an ask's recommended way that names a scene: which option it is, and what it keeps. */
interface Kept {
  readonly which: string;
  readonly keeps: AskKeeps;
}

/**
 * The keeps on `ask`'s recommended way (`recommendedPath`) that name a
 * scene: each option whose `outcome` is `keep` and whose `keeps` names one
 * or more. A keep of no scene (a script, a concept, a Board), a revise and a
 * keep only another answer reaches are not among them.
 */
export const keptOn = (ask: Ask): ReadonlyArray<Kept> =>
  recommendedPath(ask).flatMap((r) =>
    Option.match(
      Option.filter(
        Option.fromUndefinedOr(r.option.keeps),
        (keeps) => r.option.outcome === 'keep' && keeps.scenes.length > 0,
      ),
      {
        onNone: () => [],
        onSome: (keeps) => [
          { which: `step ${r.step}: ${r.choose} recommends ${r.option.value}`, keeps },
        ],
      },
    ),
  );

/**
 * What a production ask leaves untyped or types wrong, before any record
 * is read: the outcomes and keeps an ask that shows figures owes
 * (`untypedKeeps`), and a keep of another film than the production's
 * (`productionFilm`, the film its ledger names, when it names one).
 */
export const typingProblems = (
  ask: Ask,
  production: string,
  productionFilm: Option.Option<string>,
): ReadonlyArray<string> => [
  ...untypedKeeps(ask),
  ...keptOn(ask).flatMap(({ which, keeps }) =>
    Option.match(productionFilm, {
      onNone: () => [],
      onSome: (film) =>
        Bool.match(keeps.film === film, {
          onTrue: () => [],
          onFalse: () => [
            `${which}: it keeps ${keeps.film}, and production ${production} is the film ${film}`,
          ],
        }),
    }),
  ),
];

/** The newest review in `record` of `film`'s `scene` covering `figure` (none: a run over every figure). */
const newestOf = (
  record: ReviewRecord,
  film: string,
  scene: string,
  figure: Option.Option<string>,
): Option.Option<Review> =>
  Arr.findLast(
    record.reviews,
    (r) =>
      r.film === film &&
      r.scene === scene &&
      Option.match(figure, {
        onNone: () => Predicate.isUndefined(r.figure) && r.crops.length > 0,
        onSome: (f) => r.crops.some((c) => sameFigure(c.figure, f)),
      }),
  );

/**
 * What keeps `record` from standing for `keeps` (what a recommended keep
 * keeps) as the scenes are now (`now`, each of the film's scenes' keys as
 * `film project` reads it): a scene or a figure kept that no review covers,
 * a scene changed since its review, a finding on what is kept with nothing
 * done. None: it is evidence.
 */
export const evidenceProblems = (
  record: ReviewRecord,
  keeps: AskKeeps,
  now: ReadonlyMap<string, string>,
): ReadonlyArray<string> =>
  Arr.dedupe(
    keeps.scenes.flatMap(({ scene, figures }) =>
      Option.match(Option.fromUndefinedOr(figures), {
        onNone: () => [Option.none<string>()],
        onSome: (named) => named.map(Option.some),
      }).flatMap((figure) => {
        const what = Option.match(figure, {
          onNone: () => `${keeps.film} ${scene} over every figure`,
          onSome: (f) => `${f} in ${keeps.film} ${scene}`,
        });
        return Option.match(newestOf(record, keeps.film, scene, figure), {
          onNone: () => [
            `no review of ${what}: run film review ${keeps.film} --set <set> --scene ${scene} --at <place> --at <place>${Option.match(figure, { onNone: () => '', onSome: (f) => ` --figure ${f}` })}`,
          ],
          onSome: (review) => [
            ...Option.match(Option.fromUndefinedOr(now.get(scene)), {
              onNone: () => [`scene ${scene} is no scene of ${keeps.film} now`],
              onSome: (key) =>
                Bool.match(key === review.key, {
                  onTrue: () => [],
                  onFalse: () => [
                    `${keeps.film} ${scene} changed since review ${review.id} (key ${review.key.slice(0, 12)}, now ${key.slice(0, 12)}): run film review again`,
                  ],
                }),
            }),
            ...review.findings
              .filter((f) =>
                Option.match(figure, {
                  onNone: () => true,
                  onSome: (named) => sameFigure(f.figure, named),
                }),
              )
              .filter((f) => Predicate.isUndefined(f.done))
              .map(
                (f) =>
                  `finding ${f.id} of review ${review.id} (${f.figure} ${f.aspect} at ${scene} ${f.at}: ${f.what}) has nothing done: fix it, then film review ${keeps.film} --set <set> --done ${f.id} --did "<what was done>"`,
              ),
          ],
        });
      }),
    ),
  );

/** One review as the owner reads it: what it took, its crops, each finding and what was done. */
const reviewMarkdown = (r: Review): ReadonlyArray<string> => [
  `## ${r.id}: ${r.film} ${r.scene}${Option.match(Option.fromUndefinedOr(r.figure), { onNone: () => '', onSome: (f) => `, ${f}` })}`,
  '',
  `Taken ${r.made} at ${r.places.join(', ')}, over the scene's sources at key ${r.key.slice(0, 12)} all through.`,
  '',
  '### Crops at 1:1',
  '',
  ...r.crops.map(
    (c) => `- ${c.at}, ${c.figure}: \`${c.concept}\`, \`${c.drawn}\`, side by side \`${c.side}\``,
  ),
  '',
  '### Findings',
  '',
  ...Arr.match(r.findings, {
    onEmpty: () => ['No finding.'],
    onNonEmpty: (all) =>
      all.map(
        (f) =>
          `- \`${f.id}\` ${f.at}, ${f.figure}, **${f.aspect}**: ${f.what}${Option.match(Option.fromUndefinedOr(f.where), { onNone: () => '', onSome: (w) => ` (${w})` })}. Done: ${f.done ?? 'nothing yet'}`,
      ),
  }),
  ...Arr.match(r.skipped, {
    onEmpty: () => [],
    onNonEmpty: (all) => [
      '',
      '### Skipped critiques',
      '',
      ...all.map((s) => `- ${s.at}: ${s.reason}`),
    ],
  }),
  '',
];

/** The record as the owner reads it in the set: each review, newest first. */
export const evidenceMarkdown = (record: ReviewRecord): string =>
  ['# Reviews', '', ...Arr.reverse(record.reviews).flatMap(reviewMarkdown)].join('\n');

/** A crop's file in the set's folder: its review, the scene, the place (its `:` and `@` made plain), the figure and its kind. */
export const cropFile = (
  review: string,
  scene: string,
  at: string,
  figure: string,
  kind: 'concept' | 'scene' | 'side',
): string =>
  `${EVIDENCE_DIR}/crops/${review}/${scene}.${at.replace(/[^A-Za-z0-9.-]+/g, '-')}.${figure}.${kind}.png`;

/** The record with finding `id` answered `done` in every review that holds it, or why it cannot be. */
export const answered = (
  record: ReviewRecord,
  id: string,
  done: string,
): Result.Result<ReviewRecord, string> => {
  const ids = Arr.dedupe(record.reviews.flatMap((r) => r.findings.map((f) => f.id)));
  if (done.trim() === '') return Result.fail(`what was done is words: finding ${id}, "${done}"`);
  if (!ids.includes(id))
    return Result.fail(
      `the record holds no finding ${id}: it holds ${Arr.match(ids, { onEmpty: () => 'none', onNonEmpty: (all) => all.join(', ') })}`,
    );
  return Result.succeed({
    reviews: record.reviews.map((r) => ({
      ...r,
      findings: r.findings.map((f) =>
        Bool.match(f.id === id, { onTrue: () => ({ ...f, done }), onFalse: () => f }),
      ),
    })),
  });
};

/** A scene saved between a review's two reads of its key: the review is refused, never written. */
class ReviewSceneChanged extends Schema.TaggedError<ReviewSceneChanged>()('ReviewSceneChanged', {
  before: Schema.String,
  after: Schema.String,
}) {
  override get message() {
    return `film review: the scene changed during the review (key ${this.before.slice(0, 12)} before its first place, ${this.after.slice(0, 12)} after its last): run film review again`;
  }
}

/**
 * `places` taken between two reads of the scene's key (`keyNow`): the key
 * they were all taken at, or refused when the scene changed between the
 * reads (a painter's save, a shared rig rebuilt), so no review holds crops
 * of one version under the key of another.
 */
export const keyHeld = <A, E, R, E2, R2>(
  keyNow: Effect.Effect<string, E2, R2>,
  places: Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const before = yield* keyNow;
    const taken = yield* places;
    const after = yield* keyNow;
    if (before !== after) return yield* ReviewSceneChanged.make({ before, after });
    return { key: before, taken };
  });
