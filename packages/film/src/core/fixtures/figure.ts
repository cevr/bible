// Figures drawn in pixels for the measure's tests (`figure.test.ts`, the
// easel's match): the house look reduced to what the measure reads, flat
// fills inside one warm dark ink line, so every ratio is known from the
// numbers it was drawn with. A circle head with its outline, a hair cap
// (its own ink along the hair line, or none), an ear on the face (a light
// rim inside its edge, or none), the hair dark and grained (or light and
// flat), two upright oval eyes, a mouth under them (open, or a closed
// line, or none), a robe down to a hem, two feet (or none), a round hand, a
// rail in front of the robe's foot (or none), and a wall's thin lines behind
// it (or none). For a cast sheet's tests (`cast-sheet.test.ts`): the eyes
// turned off the face's middle, long dark hair down the head's sides and a
// beard (parted from the hair by a line, or running into it), a sleeve
// hanging at rest or reaching to the hand, a bare arm, a limb (a sleeve, a
// bare forearm or nothing) bent from the shoulder into a hand at any place
// and angle, its cuff inked or not, no hands at all, bare skin on the robe
// (a yoke, two shoulders, a patch on the chest), one eye (a profile), a
// headcloth with its face opening, a head tipped, a robe of another colour,
// the robe lit on its right (so a view drawn facing left and flipped is lit
// as the house lights), a view flipped, and figures side by side on one
// sheet. Tests only.

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
/** Long hair and a beard: a dark warm brown, dark as a fill and far from the ink (more than 44 from it). */
const LOCKS: Rgb = [112, 66, 40];

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
  /** How far the eyes sit right of the face's middle, in pixels (a head turned to the viewer's right; negative, to the left). */
  readonly eyeShift?: number;
  /** Long dark hair: the cap and a lock down each side of the face to the chin, 14 px wide inside the head's line. */
  readonly longHair?: boolean;
  /** A dark beard over the lower face between the locks, the mouth inside it: parted from the locks by a line, or running into them. */
  readonly beard?: { readonly parted: boolean };
  /**
   * What lies between the robe and the hand: a sleeve hanging at rest down
   * the robe's side (8 px wide), a sleeve reaching out from the side to the
   * hand held out, or a bare arm of skin out to it, the hand at its end with
   * no line between them. The hand floats beside the robe when left out.
   */
  readonly arm?: 'sleeveAtRest' | 'sleeveReach' | 'bare';
  /** The robe's colour, when not the house blue: a paper of another cloth. */
  readonly robe?: Rgb;
  /** A head tipped: the right eye this many pixels lower than the left. */
  readonly roll?: number;
  /** The robe's lit half, the light's side, when it is shaded: its `left` (the shade on the right, as the house lights) or its `right`. */
  readonly lit?: 'left' | 'right';
  /**
   * The hand placed anywhere (raised beside the head, held out and down),
   * in place of the one `arm` puts, with what joins it to the body: nothing,
   * a sleeve or a bare arm along `from` (a shoulder on the robe, then an
   * elbow) to it, drawn outside the robe's fill and the head. A sleeve meets the
   * hand as flat colour, as the house look draws a join with no ink inside
   * the silhouette, or with the hand's own ring between them (`cuff`).
   */
  readonly limb?: {
    readonly hand: readonly [number, number];
    /** The sleeve's or the arm's points from the body to the hand: a shoulder, then an elbow, if any. */
    readonly from?: ReadonlyArray<readonly [number, number]>;
    readonly kind: 'free' | 'sleeve' | 'bare';
    readonly cuff?: boolean;
  };
  /** No hand at all: a bust on a heads sheet. */
  readonly handless?: boolean;
  /**
   * Bare skin on the robe with no line round it: a band from shoulder to
   * shoulder joined to the neck (`yoke`), two bare shoulders apart from it
   * (`shoulders`), or a 40 px wide patch on the chest (`chest`), each
   * `depth` px deep.
   */
  readonly bareSkin?: { readonly kind: 'yoke' | 'shoulders' | 'chest'; readonly depth: number };
  /** One eye only, on the side the eyes are shifted to: a head in profile. */
  readonly oneEye?: boolean;
  /** A headcloth: the head's fill in this cloth but for an oval face opening round the eyes. */
  readonly headcloth?: Rgb;
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

type Canvas = ReturnType<typeof canvasOf>;

/** Where a drawn figure's parts fall: its chin, its hem, its robe's half width at a row, and the robe's fill. */
const frameOf = (spec: FigureSpec) => {
  const chin = spec.cy + spec.ry;
  const hem = chin + spec.robeDepth;
  // The robe: a trapezoid from under the chin to the hem, inside its line.
  const halfAt = (y: number) =>
    spec.robeTop / 2 + ((spec.robeHem - spec.robeTop) / 2) * ((y - chin) / spec.robeDepth);
  const robe = (pad: number) => (x: number, y: number) =>
    y >= chin - spec.ry / 2 - pad &&
    y <= hem + pad &&
    Math.abs(x - spec.cx) <= halfAt(Math.max(chin, y)) + pad;
  const out = spec.arm === 'sleeveReach' || spec.arm === 'bare';
  const hand = out
    ? { x: spec.cx + spec.robeHem / 2 + 40, y: chin + 0.4 * spec.robeDepth, r: 22 }
    : { x: spec.cx + spec.robeHem / 2 + 30, y: chin + 0.6 * spec.robeDepth, r: 22 };
  return { chin, hem, halfAt, robe, hand };
};
type Frame = ReturnType<typeof frameOf>;

/** The robe's fill and its shaded right half. */
const drawRobeFill = (c: Canvas, spec: FigureSpec, f: Frame) => {
  c.fill(f.robe(0), spec.robe ?? ROBE);
  const shade = spec.robeShade;
  const right = spec.lit !== 'right';
  const shaded = (x: number) => (right && x > spec.cx + 6) || (!right && x < spec.cx - 6);
  if (shade !== undefined) c.fill((x, y) => f.robe(0)(x, y) && shaded(x), shade);
};

/** The arm and the hand: a sleeve at rest down the side, a sleeve or bare skin out to the hand, then the hand. */
const drawArm = (c: Canvas, spec: FigureSpec, f: Frame) => {
  const { cx, line } = spec;
  const { hand } = f;
  if (spec.arm === 'sleeveAtRest') {
    const band = (pad: number) => (x: number, y: number) =>
      y >= f.chin + 0.1 * spec.robeDepth - pad &&
      y <= f.chin + 0.55 * spec.robeDepth + pad &&
      x >= cx &&
      x <= cx + f.halfAt(y) + 8 + pad;
    c.fill(band(line), INK);
    c.fill(band(0), spec.robe ?? ROBE);
  }
  const reach = (pad: number) => (x: number, y: number) =>
    Math.abs(y - hand.y) <= 16 + pad && x >= cx && x <= hand.x;
  if (spec.arm === 'sleeveReach') {
    c.fill(reach(line), INK);
    c.fill(reach(0), spec.robe ?? ROBE);
  }
  if (spec.arm === 'bare') c.fill(reach(line), INK);
  if (spec.limb !== undefined || spec.handless === true) return;
  c.fill(ellipse(hand.x, hand.y, hand.r + line, hand.r + line), INK);
  if (spec.arm === 'bare') c.fill(reach(0), SKIN);
  c.fill(ellipse(hand.x, hand.y, hand.r, hand.r), SKIN);
  // The robe over the arm's root, so the arm leaves from its side.
  if (spec.arm !== undefined) drawRobeFill(c, spec, f);
};

/** Inside a band of half-width `w` round the segment from `a` to `b`. */
const segment =
  (a: readonly [number, number], b: readonly [number, number], w: number) =>
  (x: number, y: number) => {
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy)) <= w;
  };

/** A hand placed by `limb`, the robe's fill and the head left as they are under its sleeve or arm. */
const drawLimb = (c: Canvas, spec: FigureSpec, f: Frame) => {
  const limb = spec.limb;
  if (limb === undefined) return;
  const { line } = spec;
  const [hx, hy] = limb.hand;
  const head = ellipse(spec.cx, spec.cy, spec.rx + line, spec.ry + line);
  const off = (p: (x: number, y: number) => boolean) => (x: number, y: number) =>
    p(x, y) && !f.robe(0)(x, y) && !head(x, y);
  const points = [...(limb.from ?? []), limb.hand];
  const along = (w: number) => (x: number, y: number) =>
    limb.kind !== 'free' && points.slice(1).some((b, k) => segment(points[k]!, b, w)(x, y));
  const fill = limb.kind === 'bare' ? SKIN : (spec.robeShade ?? spec.robe ?? ROBE);
  c.fill(off(along(16 + line)), INK);
  c.fill(ellipse(hx, hy, 22 + line, 22 + line), INK);
  c.fill(off(along(16)), fill);
  if (limb.cuff === true) c.fill(ellipse(hx, hy, 22 + line, 22 + line), INK);
  c.fill(ellipse(hx, hy, 22, 22), SKIN);
};

/** Bare skin on the robe's fill, with no line round it. */
const drawBareSkin = (c: Canvas, spec: FigureSpec, f: Frame) => {
  const bare = spec.bareSkin;
  if (bare === undefined) return;
  const head = ellipse(spec.cx, spec.cy, spec.rx + spec.line, spec.ry + spec.line);
  const top = bare.kind === 'chest' ? f.chin + 80 : f.chin - 4;
  const across = (x: number) =>
    bare.kind === 'yoke' ||
    (bare.kind === 'shoulders' && Math.abs(x - spec.cx) > 30) ||
    (bare.kind === 'chest' && Math.abs(x - spec.cx) <= 20);
  c.fill(
    (x, y) => f.robe(0)(x, y) && y >= top && y <= top + bare.depth && across(x) && !head(x, y),
    SKIN,
  );
};

/** The hair: a cap above the hair line, long locks down the face's sides, a beard, its grain and its own ink. */
const drawHair = (c: Canvas, spec: FigureSpec) => {
  const { cx, cy, rx, ry, line } = spec;
  const head = ellipse(cx, cy, rx, ry);
  const hairLine = cy - spec.hairAbove;
  const cap = (x: number, y: number) => head(x, y) && y < hairLine;
  const short = (spec.darkHair === true && HAIR_DARK) || HAIR;
  c.fill(cap, (spec.longHair === true && LOCKS) || short);
  const inLock = (x: number, y: number) =>
    head(x, y) && y >= hairLine && Math.abs(x - cx) > rx - 14;
  if (spec.longHair === true) c.fill(inLock, LOCKS);
  if (spec.beard !== undefined) {
    const beardTop = cy + spec.eyeBelow + 16;
    c.fill((x, y) => head(x, y) && y >= beardTop && !inLock(x, y), LOCKS);
    const seam = (x: number, y: number) =>
      head(x, y) &&
      y >= beardTop &&
      Math.abs(x - cx) > rx - 14 - line &&
      Math.abs(x - cx) <= rx - 14;
    if (spec.beard.parted) c.fill(seam, INK);
  }
  if (spec.darkHair === true)
    c.fill((x, y) => cap(x, y) && (Math.floor(x) + 2 * Math.floor(y)) % 5 === 0, HAIR_SPECK);
  if (spec.hairInk)
    c.fill((x, y) => head(x, y) && y >= hairLine - line / 2 && y < hairLine + line / 2, INK);
};

/** The ear, on the face at its right side: its line, its skin, and its rim when it has one. */
const drawEar = (c: Canvas, spec: FigureSpec) => {
  if (spec.ear === undefined) return;
  const ear = { x: spec.cx + 38, y: spec.cy + 8, rx: 10, ry: 18 };
  c.fill(ellipse(ear.x, ear.y, ear.rx + spec.line, ear.ry + spec.line), INK);
  c.fill(ellipse(ear.x, ear.y, ear.rx, ear.ry), SKIN);
  const rim = (x: number, y: number) =>
    ellipse(ear.x, ear.y, ear.rx, ear.ry)(x, y) &&
    !ellipse(ear.x, ear.y, ear.rx - 5, ear.ry - 5)(x, y);
  if (spec.ear.rim) c.fill(rim, SKIN_LIGHT);
};

/** The eyes, two upright ink ovals on one row, and the mouth under them: an open oval, or a closed line. */
const drawFace = (c: Canvas, spec: FigureSpec) => {
  const { cy } = spec;
  const eyeX = spec.cx + (spec.eyeShift ?? 0);
  // A head tipped `roll` px: the right eye that much lower than the left.
  const tip = spec.roll ?? 0;
  const sides = spec.oneEye === true ? [Math.sign(spec.eyeShift ?? 0) || 1] : [-1, 1];
  for (const side of sides)
    c.fill(
      ellipse(
        eyeX + (side * spec.eyeGap) / 2,
        cy + spec.eyeBelow + (side * tip) / 2,
        spec.eyeW / 2,
        spec.eyeH / 2,
      ),
      INK,
    );
  if (spec.mouth === undefined) return;
  const { open, width } = spec.mouth;
  const y = cy + spec.eyeBelow + 25;
  c.fill(
    (open && ellipse(eyeX, y, width / 2, width / 4)) ||
      ((x, yy) => Math.abs(x - eyeX) <= width / 2 && Math.abs(yy - y) <= 1.5),
    INK,
  );
};

/** A drawn figure, 400 × 640, on paper. */
export const drawFigure = (spec: FigureSpec = PLAIN): Raster => {
  const c = canvasOf(400, 640);
  const { cx, cy, rx, ry, line } = spec;
  const f = frameOf(spec);
  // The wall's lines, behind everything.
  for (const k of (spec.wall === true && Array.from({ length: 8 }, (_, i) => i)) || [])
    c.fill((_, y) => y >= 260 + 32 * k && y < 263 + 32 * k, INK);
  // The feet, under the hem.
  for (const dx of (spec.feet === false && []) || [-40, 40]) {
    c.fill(ellipse(cx + dx, f.hem + 12, 24 + line, 10 + line), INK);
    c.fill(ellipse(cx + dx, f.hem + 12, 24, 10), SHOE);
  }
  c.fill(f.robe(line), INK);
  drawRobeFill(c, spec, f);
  drawArm(c, spec, f);
  drawBareSkin(c, spec, f);
  drawLimb(c, spec, f);
  // The head over the robe's top: its line and its skin, then its hair.
  c.fill(ellipse(cx, cy, rx + line, ry + line), INK);
  c.fill(ellipse(cx, cy, rx, ry), SKIN);
  drawHair(c, spec);
  if (spec.headcloth !== undefined) {
    const opening = ellipse(cx + (spec.eyeShift ?? 0), cy + spec.eyeBelow + 8, rx - 16, ry - 20);
    c.fill((x, y) => ellipse(cx, cy, rx, ry)(x, y) && !opening(x, y), spec.headcloth);
  }
  drawEar(c, spec);
  // The rail, in front of the robe's foot: its line, its wood.
  if (spec.rail === true) {
    const bar = (pad: number) => (x: number, y: number) =>
      x >= 40 - pad && x <= 360 + pad && y >= f.hem - 30 - pad && y <= f.hem + 40 + pad;
    c.fill(bar(line), INK);
    c.fill(bar(0), WOOD);
  }
  drawFace(c, spec);
  return c.raster();
};

/** `r` flipped left to right: a view drawn as the mirror of another. */
export const flipRaster = (r: Raster): Raster => {
  const rgba = new Uint8Array(r.rgba.length);
  for (let y = 0; y < r.height; y++)
    for (let x = 0; x < r.width; x++)
      rgba.set(
        r.rgba.subarray((y * r.width + x) * 4, (y * r.width + x) * 4 + 4),
        (y * r.width + (r.width - 1 - x)) * 4,
      );
  return { width: r.width, height: r.height, rgba };
};

/** Pictures side by side on one sheet of paper, each 400 × 640 (`drawFigure`), so their soles share one ground line. */
export const drawSheet = (views: ReadonlyArray<Raster>): Raster => {
  const height = Math.max(...views.map((v) => v.height));
  const width = views.reduce((s, v) => s + v.width, 0);
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) rgba.set([...PAPER, 255], i * 4);
  let left = 0;
  for (const v of views) {
    for (let y = 0; y < v.height; y++)
      rgba.set(v.rgba.subarray(y * v.width * 4, (y + 1) * v.width * 4), (y * width + left) * 4);
    left += v.width;
  }
  return { width, height, rgba };
};

/** The head's outer width, its line in: what every ratio is a share of. */
export const headWidth = (spec: FigureSpec = PLAIN): number => 2 * (spec.rx + spec.line);
