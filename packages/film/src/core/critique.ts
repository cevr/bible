// The critique's words (`film critique`, the lab's `critique` tool): a fresh
// model's eye on a figure as drawn against the concept it was painted from,
// at 1:1, beside the match's numbers. The match measures what can be
// measured (proportions, outlines, shading, facing, the render's thin lines);
// the critique names what a measure misses or reads wrong: a head's angle
// and turn, the face's shape and features, the pose, the palette, an
// artifact (owner, 2026-10-18, on the RBF v3 cast: "theres some artifacts in
// the render, and the farmer looks nothing like the concept, face
// proportions and angles are off"). Pure: the packet it sends, the answer it
// reads, the file it writes.

import { Array as Arr, Option, Result, Schema } from 'effect';

/** A section of the app's rule files the critique quotes: the file and its heading line. */
export interface CritiqueRule {
  readonly file: string;
  readonly heading: string;
}

/** A rule as the packet quotes it: its file's name, its heading and its words. */
export interface QuotedSection {
  readonly file: string;
  readonly heading: string;
  readonly text: string;
}

/** What a finding is about: the head's angle and turn, the face's shape and features, the pose, a proportion, the palette, an artifact. */
const CRITIQUE_ASPECTS = [
  'head angle',
  'face',
  'pose',
  'proportion',
  'palette',
  'artifact',
] as const;

/** One difference the critique saw between the concept and the scene, on one figure. */
export const CritiqueFinding = Schema.Struct({
  figure: Schema.String,
  aspect: Schema.Literals(CRITIQUE_ASPECTS),
  /** The difference, in a sentence: what the concept has and the scene does not, or the other way. */
  what: Schema.String,
  /** Where on the figure, when it is one place (the crown, the beard's right edge). */
  where: Schema.optionalKey(Schema.String),
});
export type CritiqueFinding = typeof CritiqueFinding.Type;

/** The answer's one JSON block: every finding, on every figure. */
const CritiqueAnswer = Schema.Struct({ findings: Schema.Array(CritiqueFinding) });

const decodeAnswer = Schema.decodeUnknownResult(Schema.fromJsonString(CritiqueAnswer));

/** What changes the cache's key when the packet's words change. */
export const CRITIQUE_VERSION = 1;

/** One figure in the packet: its name, its two crops by their files beside the packet, and the match's flagged rows. */
export interface CritiqueFigure {
  readonly figure: string;
  readonly concept: string;
  readonly scene: string;
  readonly flagged: ReadonlyArray<string>;
}

/** The packet the counsel reads: what to compare, the rules, each figure's crops and flags, and the answer's form. */
export const critiquePacket = (
  place: string,
  figures: ReadonlyArray<CritiqueFigure>,
  rules: ReadonlyArray<QuotedSection>,
): string =>
  [
    '# Critique: figures against their concepts',
    '',
    `Each figure below was drawn in a film's scene (${place}) from a painted concept. Read both crops of each with the Read tool. Both are at 1:1: look at them closely, part by part, before you answer.`,
    '',
    'For each figure, name every difference between the concept and the scene in:',
    '',
    "- **head angle**: the head's turn (front, three-quarter, profile; which way) and its tilt (up, down, to a side). A concept's angle is design, never a slip: a different angle is a finding.",
    "- **face**: the face's shape (round, long, the jaw, the chin, the cheek) and its features (the eyes' size, spacing and height, the brows, a nose, the mouth, the beard's shape).",
    '- **pose**: where each hand floats (raised or low, which one), the lean, the gesture. The house hands float free with no arm, ever: compare where a hand is, never ask for an arm or a sleeve to it.',
    "- **proportion**: the head against the body, a garment's width and length. The figure's height in heads is not a finding: it comes from the cast's height band.",
    '- **palette**: a colour in the scene the concept does not have, or one it lost (skin, hair, a garment, the shade).',
    '- **artifact**: anything at 1:1 no part should draw: a light line between two pieces, a fill short of the outline with another colour showing in the gap, a point poking past the silhouette, rain or a stroke across the face, a hole, a ragged edge.',
    '',
    "The match's numbers flagged the rows listed under each figure: check each against the crops, and add what the numbers missed. Say nothing a crop does not show. Name no fix; say what differs.",
    '',
    '## The house rules',
    '',
    ...rules.flatMap((rule) => [`From \`${rule.file}\`:`, '', rule.text, '']),
    '## The figures',
    '',
    ...figures.flatMap((f) => [
      `### ${f.figure}`,
      '',
      `- The concept: \`${f.concept}\``,
      `- The scene: \`${f.scene}\``,
      '',
      ...Arr.match(f.flagged, {
        onEmpty: () => ['The match flagged no row.'],
        onNonEmpty: (rows) => ["The match's flagged rows:", '', ...rows.map((r) => `- ${r}`)],
      }),
      '',
    ]),
    '## Your answer',
    '',
    'Write your reading in prose first, figure by figure. End with one fenced `json` block and nothing after it:',
    '',
    '```json',
    '{"findings": [{"figure": "<name>", "aspect": "head angle", "what": "<the difference, one sentence>", "where": "<where on the figure, optional>"}]}',
    '```',
    '',
    `Each \`aspect\` is one of: ${CRITIQUE_ASPECTS.map((a) => `"${a}"`).join(', ')}. A figure that matches its concept in every aspect has no finding.`,
    '',
  ].join('\n');

/** The answer's last fenced `json` block, decoded, or why it cannot be read. */
export const findingsOf = (answer: string): Result.Result<ReadonlyArray<CritiqueFinding>, string> =>
  Option.match(Arr.last([...answer.matchAll(/```json\s*\n([\s\S]*?)\n```/g)]), {
    onNone: () => Result.fail('the answer ends with no ```json block'),
    onSome: (block) =>
      Result.mapBoth(decodeAnswer(block[1] ?? ''), {
        onFailure: (error) => `its json block does not read: ${error.message}`,
        onSuccess: (read) => read.findings,
      }),
  });

/** One figure's critique as its file says it: the place, the crops, then each finding, or why there is none. */
export const critiqueMarkdown = (
  figure: string,
  place: string,
  read: Result.Result<ReadonlyArray<CritiqueFinding>, string>,
): string =>
  [
    `### ${figure}: critique (${place})`,
    '',
    ...Result.match(read, {
      onFailure: (why) => [`Skipped: ${why}. The critique fails open: look at the crops yourself.`],
      onSuccess: (findings) =>
        Arr.match(
          findings.filter((f) => f.figure === figure),
          {
            onEmpty: () => ['No finding: the counsel saw the scene match its concept.'],
            onNonEmpty: (own) =>
              own.map((f) =>
                [
                  `- **${f.aspect}**: ${f.what}`,
                  ...Option.toArray(Option.map(Option.fromUndefinedOr(f.where), (w) => ` (${w})`)),
                ].join(''),
              ),
          },
        ),
    }),
    '',
  ].join('\n');
