// Figures drawn in pixels for the measure's tests (`figure.test.ts`, the
// easel's match): the house look reduced to what the measure reads, flat
// fills inside one warm dark ink line, so every ratio is known from the
// numbers it was drawn with. A circle head with its outline, a hair cap
// (its own ink along the hair line, or none), an ear on the face (a light
// rim inside its edge, or none), the hair dark and grained (or light and
// flat), two upright oval eyes, a mouth under them (open, or a closed
// line, or none), a robe down to a hem, two feet (or none), a round hand, a
// rail in front of the robe's foot (or none), and a wall's thin lines behind
// it (or none). Tests only.

import type { Raster } from '../raster.ts';

type Rgb = readonly [number, number, number];

/** The house ink: dark and warm. */
const INK: Rgb = [58, 38, 28];
const PAPER: Rgb = [238, 230, 214];
const SKIN: Rgb = [226, 178, 146];
const HAIR: Rgb = [170, 112, 64];
/** Dark hair, lighter than the ink and greyer, and the grain's warm specks in it that read as ink one by one. */
const HAIR_DARK: Rgb = [80, 62, 60];
const HAIR_SPECK: Rgb = [74, 48, 30];
const ROBE: Rgb = [92, 128, 170];
const SHOE: Rgb = [128, 96, 72];
const WOOD: Rgb = [150, 100, 60];
/** The rig's rim light on skin (papers.ts `skin.light`). */
const SKIN_LIGHT: Rgb = [251, 210, 182];

/** How a drawn figure is drawn: its head, its line, its hair and its robe, in pixels. */
export interface FigureSpec {
  /** The head's centre and its fill's radii (inside the line). */
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  /** The ink line's width, drawn outside each fill. */
  readonly line: number;
  /** How far above the head's centre the hair line runs (the cap is the head above it). */
  readonly hairAbove: number;
  /** Whether the hair line carries its own ink (the owner's rule: it never does). */
  readonly hairInk: boolean;
  /** Whether the hair is dark and grained, a speck in every five pixels, each pixel beside one (as a paper's grain scatters them), rather than light and flat. */
  readonly darkHair?: boolean;
  /** Each eye's fill's width and height, and the distance between their centres; their row below the head's centre. */
  readonly eyeW: number;
  readonly eyeH: number;
  readonly eyeGap: number;
  readonly eyeBelow: number;
  /** The robe: its width under the chin and at the hem, and its hem's depth under the chin. */
  readonly robeTop: number;
  readonly robeHem: number;
  readonly robeDepth: number;
  /** The robe's shaded half (its right), when it has one: a colour, as the house shades. */
  readonly robeShade?: Rgb;
  /** An ear on the face's right side, 38 px from its centre (clear of an eye at an `eyeGap` up to 30), when it has one: its rim, a light band inside its edge, or none. */
  readonly ear?: { readonly rim: boolean };
  /** A mouth 25 px under the eyes, when it has one: open (a filled oval half as tall as it is wide) or closed (a 3 px line), `width` px wide. */
  readonly mouth?: { readonly open: boolean; readonly width: number };
  /** Whether two feet stand under the hem (they do unless `false`). */
  readonly feet?: boolean;
  /** A rail drawn in front of the robe's foot, 320 px wide, hiding its hem and its feet. */
  readonly rail?: boolean;
  /** Eight 3 px lines of ink across the paper behind the figure (a panelled wall): more runs of thin line than the figure's own. */
  readonly wall?: boolean;
}

/** A plain figure: a head 120 px wide inside its line, a 6 px line, light hair with no ink of its own. */
export const PLAIN: FigureSpec = {
  cx: 200,
  cy: 150,
  rx: 60,
  ry: 66,
  line: 6,
  hairAbove: 30,
  hairInk: false,
  eyeW: 8,
  eyeH: 13,
  eyeGap: 48,
  eyeBelow: 10,
  robeTop: 110,
  robeHem: 240,
  robeDepth: 330,
};

/** A canvas over a `Raster`: fills by a pixel test, the last drawn on top. */
const canvasOf = (width: number, height: number) => {
  const rgba = new Uint8Array(width * height * 4);
  const fill = (inside: (x: number, y: number) => boolean, colour: Rgb) => {
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (inside(x + 0.5, y + 0.5)) rgba.set([...colour, 255], (y * width + x) * 4);
  };
  fill(() => true, PAPER);
  return { fill, raster: (): Raster => ({ width, height, rgba }) };
};

/** Inside the ellipse at (cx, cy) with radii rx, ry. */
const ellipse = (cx: number, cy: number, rx: number, ry: number) => (x: number, y: number) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

/** A drawn figure, 400 × 640, on paper. */
export const drawFigure = (spec: FigureSpec = PLAIN): Raster => {
  const c = canvasOf(400, 640);
  const { cx, cy, rx, ry, line } = spec;
  const chin = cy + ry;
  const hem = chin + spec.robeDepth;
  // The robe: a trapezoid from under the chin to the hem, inside its line.
  const halfAt = (y: number) =>
    spec.robeTop / 2 + ((spec.robeHem - spec.robeTop) / 2) * ((y - chin) / spec.robeDepth);
  const robe = (pad: number) => (x: number, y: number) =>
    y >= chin - ry / 2 - pad &&
    y <= hem + pad &&
    Math.abs(x - cx) <= halfAt(Math.max(chin, y)) + pad;
  // The wall's lines, behind everything.
  for (const k of spec.wall === true ? Array.from({ length: 8 }, (_, i) => i) : [])
    c.fill((_, y) => y >= 260 + 32 * k && y < 263 + 32 * k, INK);
  // The feet, under the hem; the hand, a circle beside the robe.
  for (const dx of spec.feet === false ? [] : [-40, 40]) {
    c.fill(ellipse(cx + dx, hem + 12, 24 + line, 10 + line), INK);
    c.fill(ellipse(cx + dx, hem + 12, 24, 10), SHOE);
  }
  c.fill(robe(line), INK);
  c.fill(robe(0), ROBE);
  if (spec.robeShade !== undefined) {
    const shade = spec.robeShade;
    c.fill((x, y) => robe(0)(x, y) && x > cx + 6, shade);
  }
  const hand = { x: cx + spec.robeHem / 2 + 30, y: chin + 0.6 * spec.robeDepth, r: 22 };
  c.fill(ellipse(hand.x, hand.y, hand.r + line, hand.r + line), INK);
  c.fill(ellipse(hand.x, hand.y, hand.r, hand.r), SKIN);
  // The head over the robe's top: its line, its skin, its hair cap.
  c.fill(ellipse(cx, cy, rx + line, ry + line), INK);
  c.fill(ellipse(cx, cy, rx, ry), SKIN);
  const hairLine = cy - spec.hairAbove;
  const cap = (x: number, y: number) => ellipse(cx, cy, rx, ry)(x, y) && y < hairLine;
  c.fill(cap, spec.darkHair === true ? HAIR_DARK : HAIR);
  if (spec.darkHair === true)
    c.fill((x, y) => cap(x, y) && (Math.floor(x) + 2 * Math.floor(y)) % 5 === 0, HAIR_SPECK);
  if (spec.hairInk)
    c.fill(
      (x, y) =>
        ellipse(cx, cy, rx, ry)(x, y) && y >= hairLine - line / 2 && y < hairLine + line / 2,
      INK,
    );
  // The ear, on the face at its right side: its line, its skin, and its rim when it has one.
  if (spec.ear !== undefined) {
    const ear = { x: cx + 38, y: cy + 8, rx: 10, ry: 18 };
    c.fill(ellipse(ear.x, ear.y, ear.rx + line, ear.ry + line), INK);
    c.fill(ellipse(ear.x, ear.y, ear.rx, ear.ry), SKIN);
    if (spec.ear.rim)
      c.fill(
        (x, y) =>
          ellipse(ear.x, ear.y, ear.rx, ear.ry)(x, y) &&
          !ellipse(ear.x, ear.y, ear.rx - 5, ear.ry - 5)(x, y),
        SKIN_LIGHT,
      );
  }
  // The rail, in front of the robe's foot: its line, its wood.
  if (spec.rail === true) {
    const bar = (pad: number) => (x: number, y: number) =>
      x >= 40 - pad && x <= 360 + pad && y >= hem - 30 - pad && y <= hem + 40 + pad;
    c.fill(bar(line), INK);
    c.fill(bar(0), WOOD);
  }
  // The eyes: two upright ink ovals on one row.
  for (const side of [-1, 1])
    c.fill(
      ellipse(cx + (side * spec.eyeGap) / 2, cy + spec.eyeBelow, spec.eyeW / 2, spec.eyeH / 2),
      INK,
    );
  // The mouth, under the eyes: an open oval, or a closed line.
  if (spec.mouth !== undefined) {
    const { open, width } = spec.mouth;
    const y = cy + spec.eyeBelow + 25;
    c.fill(
      open
        ? ellipse(cx, y, width / 2, width / 4)
        : (x, yy) => Math.abs(x - cx) <= width / 2 && Math.abs(yy - y) <= 1.5,
      INK,
    );
  }
  return c.raster();
};

/** The head's outer width, its line in: what every ratio is a share of. */
export const headWidth = (spec: FigureSpec = PLAIN): number => 2 * (spec.rx + spec.line);
