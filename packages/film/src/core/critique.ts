// The critique's words (`film lab critique`, the lab's `critique` tool): a fresh
// model's eye on a figure as drawn against the concept it was painted from,
// at 1:1, beside the match's numbers. The match measures what can be
// measured (proportions, outlines, shading, facing, the render's thin lines);
// the critique names what a measure misses or reads wrong: a head's angle
// and turn, the face's shape and features, the pose, the palette, an
// artifact (owner, 2026-10-17, his local day, on the RBF v3 cast: "theres some artifacts in
// the render, and the farmer looks nothing like the concept, face
// proportions and angles are off"). Pure: the packet it sends, the answer it
// reads, the file it writes.

import { Array as Arr, Boolean as Bool, Option, Result, Schema } from 'effect';

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
export const CRITIQUE_ASPECTS = [
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

/** The answer's one JSON block: its findings, each read on its own (`findingsOf`). */
const CritiqueAnswer = Schema.Struct({ findings: Schema.Array(Schema.Unknown) });

const decodeAnswer = Schema.decodeUnknownResult(Schema.fromJsonString(CritiqueAnswer));
const decodeFinding = Schema.decodeUnknownResult(CritiqueFinding);

/** An answer read: the findings that read, each on a figure asked about, and each one that did not, said. */
export interface CritiqueRead {
  readonly findings: ReadonlyArray<CritiqueFinding>;
  readonly rejected: ReadonlyArray<string>;
}

/** One figure in the packet: its name, its two crops by their files beside the packet, and the match's flagged rows. */
export interface CritiqueFigure {
  readonly figure: string;
  readonly concept: string;
  readonly scene: string;
  readonly flagged: ReadonlyArray<string>;
  /** On a cast sheet, what its layout asks of this view (its turn, tilt and gesture); a scene's figure has none. */
  readonly layout: Option.Option<string>;
  /** Where the hair meets the beard, as the match measured each side (`hairBeardLine`); none with no beard read. */
  readonly boundary: Option.Option<string>;
}

/**
 * Where a scene stages its figures at the place critiqued: the Board panel
 * shown there (its id and its shown try's image) and the script's picture
 * of the beat. A concept is a model sheet, so what a figure wears, holds and
 * does there is the panel's and the picture's, never the concept's: a robe
 * or a held thing the place stages is no finding against the sheet.
 */
export interface CritiqueStaging {
  readonly panel: Option.Option<{ readonly id: string; readonly image: string }>;
  readonly picture: Option.Option<string>;
}

/** No staging: a cast sheet's views, or a scene whose Board and script could not be read. */
export const UNSTAGED: CritiqueStaging = { panel: Option.none(), picture: Option.none() };

/** The file the staged panel's image is copied to beside the packet: `board` with the image's extension. */
export const boardFileOf = (staging: CritiqueStaging): Option.Option<string> =>
  Option.map(staging.panel, ({ image }) => `board${image.slice(image.lastIndexOf('.'))}`);

/** The packet's staging section: the panel and the picture, and how design and state are held; none when nothing is staged. */
const stagingLines = (staging: CritiqueStaging): ReadonlyArray<string> =>
  Bool.match(Option.isNone(staging.panel) && Option.isNone(staging.picture), {
    onTrue: () => [],
    onFalse: () => [
      '## Where the scene stages them',
      '',
      ...Option.match(
        Option.zipWith(staging.panel, boardFileOf(staging), (p, f) => [p.id, f]),
        {
          onNone: () => [],
          onSome: ([id, file]) => [
            `- The Board panel shown here (${id}): \`${file}\`. Read it with the Read tool.`,
          ],
        },
      ),
      ...Option.match(staging.picture, {
        onNone: () => [],
        onSome: (picture) => [`- The script's picture of this beat: ${picture}`],
      }),
      '',
      "Hold each figure's design (the face, the proportion, the palette of skin and hair) to its concept, and its state (what it wears, what it holds, what it does) to the Board panel and the script's picture. The concept is a model sheet: a robe, a held thing or a gesture this place stages that the concept lacks is not a finding; a state the place stages that the scene does not draw is a finding.",
      '',
    ],
  });

/** What the figures were drawn in: a film's scene (a rig drawn there), or a cast sheet (a view painted from the concept, that the rigs are traced from). */
export type CritiqueDrawn = 'scene' | 'sheet';

/** The packet's opening: what each figure is, by what it was drawn in. */
const drawnIn = (drawn: CritiqueDrawn, place: string): string =>
  (drawn === 'sheet' &&
    `Each figure below is one view of a cast sheet (${place}), painted from a concept: the film's rigs are traced from the sheet, so what differs here differs in every scene. Hold each view to its concept in the face, the proportion, the palette, the sleeves and the artifacts, and to its layout's words in the angle and the pose.`) ||
  `Each figure below was drawn in a film's scene (${place}) from a painted concept.`;

/** How a head's angle is judged: a scene's figure holds its concept's angle; a sheet's view holds the angle its layout asks for. */
const angleRule = (drawn: CritiqueDrawn): string =>
  (drawn === 'sheet' &&
    "On a sheet each view's turn and tilt are what its layout asks (said under it), never the concept's: an angle is a finding only where the view differs from its layout's words.") ||
  "A concept's angle is design, never a slip: a different angle is a finding.";

/** On a sheet, the gesture each view's layout asks for is the design. */
const poseRule = (drawn: CritiqueDrawn): string =>
  (drawn === 'sheet' &&
    ' On a sheet each view holds the gesture its layout asks (said under it): a raised hand, a bow or a lean the layout asks for is never a finding.') ||
  '';

/** The packet the counsel reads: what to compare, the rules, each figure's crops and flags, and the answer's form. */
export const critiquePacket = (
  drawn: CritiqueDrawn,
  place: string,
  figures: ReadonlyArray<CritiqueFigure>,
  rules: ReadonlyArray<QuotedSection>,
  staging: CritiqueStaging,
): string =>
  [
    '# Critique: figures against their concepts',
    '',
    `${drawnIn(drawn, place)} Read both crops of each with the Read tool. Both are at 1:1: look at them closely, part by part, before you answer.`,
    '',
    'For each figure, name every difference between the concept and the scene in:',
    '',
    `- **head angle**: the head's turn (front, three-quarter, profile; which way) and its tilt (up, down, to a side). ${angleRule(drawn)}`,
    "- **face**: the face's shape (round, long, the jaw, the chin, the cheek) and its features (the eyes' size, spacing and height, the brows, a nose, the mouth, the beard's shape), and where the hair meets the beard: the concept's head outline runs between them, so a beard that runs into the hair, or hair drawn as beard, is a finding (owner, 2026-10-18).",
    `- **pose**: where each hand is (raised or low, which one), the lean, the gesture. The house hand is a circle at the end of an arm in its sleeve: a hand floating free of the body, with no sleeve to it, is a finding.${poseRule(drawn)}`,
    "- **proportion**: the head against the body, a garment's width and length. The figure's height in heads is not a finding: it comes from the cast's height band.",
    '- **palette**: a colour in the scene the concept does not have, or one it lost (skin, hair, a garment, the shade).',
    '- **artifact**: anything at 1:1 no part should draw: a light line between two pieces, a fill short of the outline with another colour showing in the gap, a point poking past the silhouette, rain or a stroke across the face, a hole, a ragged edge.',
    '',
    "The measure's numbers flagged the rows listed under each figure: check each against the crops, and add what the numbers missed. Say nothing a crop does not show. Name no fix; say what differs.",
    '',
    '## The house rules',
    '',
    ...rules.flatMap((rule) => [`From \`${rule.file}\`:`, '', rule.text, '']),
    ...stagingLines(staging),
    '## The figures',
    '',
    ...figures.flatMap((f) => [
      `### ${f.figure}`,
      '',
      `- The concept: \`${f.concept}\``,
      `- The ${drawn}: \`${f.scene}\``,
      ...Option.match(f.layout, {
        onNone: () => [],
        onSome: (asked) => [`- What the layout asks of it: ${asked}`],
      }),
      ...Option.match(f.boundary, {
        onNone: () => [],
        onSome: (measured) => [
          `- Where the hair meets the beard, as measured: ${measured}. Look at that edge in both crops.`,
        ],
      }),
      '',
      ...Arr.match(f.flagged, {
        onEmpty: () => ['The measure flagged no row.'],
        onNonEmpty: (rows) => ["The measure's flagged rows:", '', ...rows.map((r) => `- ${r}`)],
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
    `Each \`figure\` is one of: ${figures.map((f) => `"${f.figure}"`).join(', ')}. Each \`aspect\` is one of: ${CRITIQUE_ASPECTS.map((a) => `"${a}"`).join(', ')}. A figure that matches its concept in every aspect has no finding.`,
    '',
  ].join('\n');

/**
 * The answer's last fenced `json` block, its findings read one by one on
 * the figures asked about (`figures`, named in any case, kept in the case
 * asked): a finding that does not read, or names no figure asked about, is
 * rejected and said, never taken as none. Fails when there is no block, or
 * it is not `{"findings": [...]}`.
 */
export const findingsOf = (
  answer: string,
  figures: ReadonlyArray<string>,
): Result.Result<CritiqueRead, string> =>
  Option.match(Arr.last([...answer.matchAll(/```json\s*\n([\s\S]*?)\n```/g)]), {
    onNone: () => Result.fail('the answer ends with no ```json block'),
    onSome: (block) =>
      Result.mapBoth(decodeAnswer(block[1] ?? ''), {
        onFailure: (error) => `its json block does not read: ${error.message}`,
        onSuccess: (read) =>
          read.findings.reduce<CritiqueRead>(
            (acc, raw, index) =>
              Result.match(decodeFinding(raw), {
                onFailure: (error) => ({
                  ...acc,
                  rejected: [
                    ...acc.rejected,
                    `finding ${index + 1} does not read: ${error.message}`,
                  ],
                }),
                onSuccess: (finding) =>
                  Option.match(
                    Arr.findFirst(figures, (f) => f.toLowerCase() === finding.figure.toLowerCase()),
                    {
                      onNone: () => ({
                        ...acc,
                        rejected: [
                          ...acc.rejected,
                          `finding ${index + 1} names ${finding.figure}, no figure asked about (${figures.join(', ')})`,
                        ],
                      }),
                      onSome: (figure) => ({
                        ...acc,
                        findings: [...acc.findings, { ...finding, figure }],
                      }),
                    },
                  ),
              }),
            { findings: [], rejected: [] },
          ),
      }),
  });

/** One figure's critique as its file says it: the place, then each finding on it, or why there is none. */
export const critiqueMarkdown = (
  figure: string,
  place: string,
  read: Result.Result<CritiqueRead, string>,
): string =>
  [
    `### ${figure}: critique (${place})`,
    '',
    ...Result.match(read, {
      onFailure: (why) => [`Skipped: ${why}. The critique fails open: look at the crops yourself.`],
      onSuccess: ({ findings, rejected }) => [
        ...Arr.match(
          findings.filter((f) => f.figure === figure),
          {
            onEmpty: () => ['No finding named this figure.'],
            onNonEmpty: (own) =>
              own.map((f) =>
                [
                  `- **${f.aspect}**: ${f.what}`,
                  ...Option.toArray(Option.map(Option.fromUndefinedOr(f.where), (w) => ` (${w})`)),
                ].join(''),
              ),
          },
        ),
        ...Arr.match(rejected, {
          onEmpty: () => [],
          onNonEmpty: (all) => ['', 'Rejected from the answer:', '', ...all.map((r) => `- ${r}`)],
        }),
      ],
    }),
    '',
  ].join('\n');
