/**
 * The hymn recordings the app plays: the set they belong to, each hymn's key
 * inside a set, and the credit their instruments ask for. It imports nothing,
 * so the app's bundlers and the infra read it unchanged.
 *
 * A set is rendered once (`scripts/render/`) and never replaced: any change
 * to the sound is a new set (`warm-2`), uploaded beside the old one.
 */

/** The set the app plays: style C, "Warm band", the first render. */
export const RECORDING_SET = 'warm-1';

/**
 * The keys the app's Key stepper reaches besides the printed one, in the
 * order they are rendered: the smallest steps first, so the most used keys
 * arrive first.
 */
export const KEY_TRANSPOSES = [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6] as const;

/**
 * The set of `RECORDING_SET` moved `transpose` semitones: `warm-1-up2`,
 * `warm-1-down3`; 0 is `RECORDING_SET` itself. No name holds a `+`.
 */
export const keySet = (transpose: number) =>
  transpose === 0
    ? RECORDING_SET
    : `${RECORDING_SET}-${transpose > 0 ? 'up' : 'down'}${Math.abs(transpose)}`;

/** A hymn's key inside a set: the 1985 SDA Hymnal's number, unpadded. */
export const recordingKey = (hymn: number) => `sdah/${hymn}.mp3`;

/** One instrument's credit: what it plays, the work, its author and its licence. */
export interface CreditLine {
  readonly part: string;
  readonly work: string;
  readonly author: string;
  readonly licence: string;
  /** The licence's address, written out where the licence asks for it (CC BY). */
  readonly licenceUrl?: string;
}

/**
 * Who made the sounds, as the licences ask: the Salamander piano is CC BY 3.0
 * and must be credited with its licence's address; the strings are CC0 and
 * are credited anyway.
 */
export const RECORDING_CREDITS = {
  lead: "The recordings are played from the hymnal's own scores.",
  lines: [
    {
      part: 'Piano',
      work: 'Salamander Grand Piano V3',
      author: 'Alexander Holm',
      licence: 'CC BY 3.0',
      licenceUrl: 'https://creativecommons.org/licenses/by/3.0/',
    },
    {
      part: 'Strings',
      work: 'VS Chamber Orchestra 2: Community Edition',
      author: 'Versilian Studios',
      licence: 'CC0 1.0',
    },
  ],
} as const satisfies { readonly lead: string; readonly lines: ReadonlyArray<CreditLine> };

/** One credit line as a sentence: "Piano: Salamander Grand Piano V3 by Alexander Holm, CC BY 3.0 (…)." */
const creditLine = (line: CreditLine) =>
  `${line.part}: ${line.work} by ${line.author}, ${line.licence}${
    line.licenceUrl === undefined ? '' : ` (${line.licenceUrl})`
  }.`;

/** Every credit as one text, the lead first: what each MP3 carries as its comment. */
export const creditText = () =>
  [RECORDING_CREDITS.lead, ...RECORDING_CREDITS.lines.map(creditLine)].join(' ');
