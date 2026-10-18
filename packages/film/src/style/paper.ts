// A paper, as a figure's piece takes it: its lit colour, its shade past the
// crease (a hue of its own, CRAFT rule 12, never the colour dimmed), and the
// light that rims the edge facing the light; where it turns (`crease`) and
// how wide its rim is (`rim`). Each figure's papers are its own, sampled
// from its concept; the house gives what a paper is, checks it as it is made
// (`paper`: a shade greyed or blackened is refused, GreyShade), ramps one
// under the key light, and lays it on a piece. A part takes only a checked
// paper (`Paper` is branded), and checks it again as it is made; a part laid
// within another's outline takes one with no rim (`unrimmed`, InnerRim).
// Colour laid inside a paper and clipped to it is a tone (`Tones`). Pure.

import { type Brand, Schema } from 'effect';
import { type Hex, channelsOf } from '../canvas/colour.ts';
import { hsvOf, shadeKind } from '../core/figure.ts';
import { decoder, ruleCheck } from './decode.ts';
import { shaded } from './house.ts';
import { Opacity, Outline } from './parts/measure.ts';
import type { PieceLook } from './rig/parts.ts';

/** A colour as a paper takes it: `#rgb` or `#rrggbb` hex. */
export const HexColour = Schema.TemplateLiteral(['#', Schema.String]).check(
  Schema.isPattern(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i),
);

/**
 * Where and how a piece's paper turns, when it is not the look's default:
 * the share of the way along the light it turns (`at`), how wide the turn
 * is as a share of that way (`soft`, 0 a cut), and the angle the light
 * crosses this piece at (`toward`, radians, y down). A concept that turns a
 * face softly and a robe sharply says so piece by piece.
 */
const Crease = Schema.Struct({
  at: Schema.optionalKey(Schema.Finite),
  soft: Schema.optionalKey(Schema.Finite),
  toward: Schema.optionalKey(Schema.Finite),
  /**
   * A round piece's turn: the paper is laid in its shade and its light is
   * its own outline moved this share of its half-size toward the light,
   * clipped to it, so the shade is a crescent on the far side (`litOf`,
   * `rig/parts.ts`) rather than a straight cut.
   */
  crescent: Schema.optionalKey(Schema.Finite),
});
export type Crease = typeof Crease.Type;

/** A paper's fields, as a film writes them: unchecked. */
const PaperFields = Schema.Struct({
  color: HexColour,
  /** Its far side past the crease; none for a flat paper (an ear). */
  shade: Schema.optionalKey(HexColour),
  /** The light on its edge facing the light: its rim, or the light core on its cut. */
  light: HexColour,
  crease: Schema.optionalKey(Crease),
  /** Its rim's width, units at a head's scale, when the concept says (0: none). */
  rim: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))),
});
type PaperFields = typeof PaperFields.Type;

/**
 * A shade is a colour of its own: refused when it keeps under 0.6 of the
 * lit side's saturation and turns under 15° or has no hue to turn (a grey,
 * black), by the predicate `film match` reads a figure's pixels with
 * (`shadeKind`).
 */
const colourShade = ruleCheck('GreyShade', (p: PaperFields) =>
  p.shade === undefined ||
  shadeKind(hsvOf(channelsOf(p.color)), hsvOf(channelsOf(p.shade))) === 'colour'
    ? true
    : `its shade ${p.shade} is ${p.color} greyed or blackened: give it a hue of its own`,
);

/** A paper, checked: only `paper` (or `papers`) makes one, and a part decodes it again. */
export const Paper = PaperFields.check(colourShade).pipe(Schema.brand('Paper'));
export type Paper = typeof Paper.Type;

/** A paper with no ink of its own: an `ink` on it is refused by InteriorInk (the ink is the film's). */
const decodePaper = decoder(Paper, { fields: { ink: 'InteriorInk' } });

/**
 * A part laid within another's outline (hair, an ear, a garment's bands)
 * takes no rim: the rim runs inside its base piece's own line alone, so a
 * paper with one is refused by InnerRim.
 */
export const unrimmed = ruleCheck('InnerRim', (part: { readonly paper: Paper }) =>
  part.paper.rim === undefined
    ? true
    : `its paper is rimmed ${part.paper.rim} wide, inside the outline of the piece it lies within`,
);

/**
 * Colour laid inside a paper and clipped to it: an outline of its own in
 * the piece's units, in `color` at `alpha` (whole when left out); `soft`, it
 * fades from its middle to nothing at its edge, so it blends into the paper
 * with no edge of its own (`Tone`, `rig/parts.ts`).
 */
const Tone = Schema.Struct({
  pts: Outline,
  color: HexColour,
  alpha: Schema.optionalKey(Opacity),
  soft: Schema.optionalKey(Schema.Boolean),
});

/** A part's tones, laid in order: the light on a tuft, the shade a hairline lays on a brow. */
export const Tones = Schema.Array(Tone);

/** `fields` as a paper, checked (`Paper`); `name` is what a refusal names. */
export const paper = (fields: PaperFields, name = 'paper'): Paper => decodePaper(fields, name);

/** Each of a film's papers, by its name, checked: its fields as written, branded. */
type Papers<P> = { readonly [K in keyof P]: P[K] & Brand.Brand<'Paper'> };

/** Each of `fields` checked as a paper (`paper`), refused naming its name: so each is one. */
const checkPapers: <P extends Readonly<Record<string, PaperFields>>>(
  fields: P,
) => asserts fields is P & Papers<P> = (fields) => {
  for (const [name, f] of Object.entries(fields)) paper(f, `paper ${name}`);
};

/**
 * `fields` as a film's papers, each checked as its module loads (`paper`)
 * and kept as it was written, so a paper's colours keep their written types.
 */
export const papers = <const P extends Readonly<Record<string, PaperFields>>>(
  fields: P,
): Papers<P> => {
  checkPapers(fields);
  return fields;
};

/** `base`'s ramp under the house's key light (`shaded`), as a paper. */
export const rampedPaper = (base: Hex): Paper => {
  const r = shaded(base);
  return paper({ color: r.base, shade: r.shade, light: r.light }, `the ramp of ${base}`);
};

/** Paper `p` as a piece's paint (`PieceLook`): its colours, crease and rim, and `extra` over them. */
export const looked = (p: Paper, extra: Partial<PieceLook> = {}): PieceLook => ({
  ...p,
  ...extra,
});
