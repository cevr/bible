// A review record (`film review`): the evidence that a scene's figures were
// looked at closely before the owner is asked to keep them. It holds the
// scene's source keys when it was taken, each figure's crops at 1:1 at
// several places, and a fresh critique's findings, each with what was done
// about it. An ask on a production whose recommended option keeps, locks or
// goes on is refused unless its set holds a record from the scenes as they
// stand now with every finding answered (`evidenceProblems`), or the owner's
// own words override it. The owner, 2026-10-18, after a keep recommended on
// figures nobody had looked at 1:1: "theres some artifacts in the render,
// and the farmer looks nothing like the concept, face proportions and angles
// are off". Pure: the record, the problems, its page.

import { Array as Arr, Boolean as Bool, Option, Predicate, Record, Result, Schema } from 'effect';
import { type Ask, type Asking, askedIn } from './ask.ts';
import { CRITIQUE_ASPECTS } from './critique.ts';

/** The record's folder in its set, and its two files: the record and the page the owner reads. */
const EVIDENCE_DIR = 'review';
export const EVIDENCE_FILE = `${EVIDENCE_DIR}/evidence.json`;
export const EVIDENCE_PAGE = `${EVIDENCE_DIR}/evidence.md`;

/** One scene the record reviewed, by the key its sources had then (`film project`). */
const ReviewedScene = Schema.Struct({ scene: Schema.String, key: Schema.String });

/** One figure's crops at one place, as files in the set's folder. */
const ReviewCrop = Schema.Struct({
  scene: Schema.String,
  at: Schema.String,
  figure: Schema.String,
  concept: Schema.String,
  drawn: Schema.String,
  side: Schema.String,
});

/** A critique's finding at one place, and what was done about it once it is answered. */
export const ReviewFinding = Schema.Struct({
  scene: Schema.String,
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
const ReviewSkip = Schema.Struct({
  scene: Schema.String,
  at: Schema.String,
  reason: Schema.String,
});

export const ReviewRecord = Schema.Struct({
  film: Schema.String,
  /** ISO time it was taken. */
  made: Schema.String,
  scenes: Schema.Array(ReviewedScene),
  crops: Schema.Array(ReviewCrop),
  findings: Schema.Array(ReviewFinding),
  skipped: Schema.Array(ReviewSkip),
});
export type ReviewRecord = typeof ReviewRecord.Type;

export const ReviewRecordJson = Schema.fromJsonString(ReviewRecord);

/** An option's word that keeps what it asks about: lock, keep or go on. */
const KEEPING = /^(lock|keep|go)\b/i;

/**
 * The option an ask recommends that keeps what it shows (its value or its
 * label starts lock, keep or go), by its step and its question; none when
 * every recommendation asks for more work.
 */
export const keepRecommended = (ask: Ask): Option.Option<string> =>
  Arr.head(
    Record.toEntries(ask.steps).flatMap(([name, step]) =>
      askedIn(step)
        .filter((b): b is Extract<Asking, { readonly kind: 'choose' }> => b.kind === 'choose')
        .flatMap((c) =>
          c.options
            .filter((o) => o.recommended === true)
            .filter((o) => KEEPING.test(o.value) || KEEPING.test(o.label))
            .map((o) => `step ${name}: ${c.id} recommends ${o.value}`),
        ),
    ),
  );

/**
 * What keeps `record` from standing for the scenes as they are now
 * (`now`, each scene's key as `film project` reads it): a scene changed
 * since, no crop, a finding with nothing done. None: it is evidence.
 */
export const evidenceProblems = (
  record: ReviewRecord,
  now: ReadonlyMap<string, string>,
): ReadonlyArray<string> => [
  ...Arr.match(record.crops, {
    onEmpty: () => ['the review holds no crop: run film review at the scene’s marks'],
    onNonEmpty: () => [],
  }),
  ...record.scenes.flatMap((s) =>
    Option.match(Option.fromUndefinedOr(now.get(s.scene)), {
      onNone: () => [`scene ${s.scene} is no scene of ${record.film} now`],
      onSome: (key) =>
        Bool.match(key === s.key, {
          onTrue: () => [],
          onFalse: () => [
            `scene ${s.scene} changed since its review (key ${s.key.slice(0, 12)}, now ${key.slice(0, 12)}): run film review again`,
          ],
        }),
    }),
  ),
  ...record.findings.flatMap((f, index) =>
    Option.match(Option.fromUndefinedOr(f.done), {
      onNone: () => [
        `finding ${index + 1} (${f.figure} ${f.aspect} at ${f.scene} ${f.at}: ${f.what}) has nothing done: fix it, then film review ${record.film} --set <set> --done ${index + 1} --did "<what was done>"`,
      ],
      onSome: () => [],
    }),
  ),
];

/** The record as the owner reads it in the set: the scenes and their keys, each place's crops, each finding and what was done. */
export const evidenceMarkdown = (record: ReviewRecord): string =>
  [
    `# Review: ${record.film}`,
    '',
    `Taken ${record.made}, over the scenes as their sources stood then:`,
    '',
    ...record.scenes.map((s) => `- ${s.scene} (key ${s.key.slice(0, 12)})`),
    '',
    '## Crops at 1:1',
    '',
    ...record.crops.map(
      (c) =>
        `- ${c.scene} ${c.at}, ${c.figure}: \`${c.concept}\`, \`${c.drawn}\`, side by side \`${c.side}\``,
    ),
    '',
    '## Findings',
    '',
    ...Arr.match(record.findings, {
      onEmpty: () => ['No finding.'],
      onNonEmpty: (all) =>
        all.map(
          (f, index) =>
            `${index + 1}. ${f.scene} ${f.at}, ${f.figure}, **${f.aspect}**: ${f.what}${Option.match(Option.fromUndefinedOr(f.where), { onNone: () => '', onSome: (w) => ` (${w})` })}. Done: ${f.done ?? 'nothing yet'}`,
        ),
    }),
    ...Arr.match(record.skipped, {
      onEmpty: () => [],
      onNonEmpty: (all) => [
        '',
        '## Skipped critiques',
        '',
        ...all.map((s) => `- ${s.scene} ${s.at}: ${s.reason}`),
      ],
    }),
    '',
  ].join('\n');

/** A crop's file in the set's folder: the scene, the place (its `:` and `@` made plain), the figure and its kind. */
export const cropFile = (
  scene: string,
  at: string,
  figure: string,
  kind: 'concept' | 'scene' | 'side',
): string =>
  `${EVIDENCE_DIR}/crops/${scene}.${at.replace(/[^A-Za-z0-9.-]+/g, '-')}.${figure}.${kind}.png`;

/**
 * `findings` with what was done kept from `before` for each the earlier
 * record holds word for word (the critique kept by its inputs answers the
 * same words for the same crops): a finding answered once is not asked again.
 */
export const carriedDone = (
  before: ReadonlyArray<ReviewFinding>,
  findings: ReadonlyArray<ReviewFinding>,
): ReadonlyArray<ReviewFinding> =>
  findings.map((f) =>
    Option.match(
      Arr.findFirst(
        before,
        (b) =>
          b.scene === f.scene &&
          b.at === f.at &&
          b.figure === f.figure &&
          b.aspect === f.aspect &&
          b.what === f.what &&
          Predicate.isNotUndefined(b.done),
      ),
      { onNone: () => f, onSome: (b) => ({ ...f, done: b.done }) },
    ),
  );

/** The record with finding `n` (from 1) answered `done`, or why it cannot be. */
export const answered = (
  record: ReviewRecord,
  n: number,
  done: string,
): Result.Result<ReviewRecord, string> =>
  Bool.match(Number.isInteger(n) && n >= 1 && n <= record.findings.length && done.trim() !== '', {
    onFalse: () =>
      Result.fail(
        `the record holds findings 1 to ${record.findings.length}, and what was done is words: finding ${n}, "${done}"`,
      ),
    onTrue: () =>
      Result.succeed({
        ...record,
        findings: record.findings.map((f, i) =>
          Bool.match(i === n - 1, { onTrue: () => ({ ...f, done }), onFalse: () => f }),
        ),
      }),
  });
