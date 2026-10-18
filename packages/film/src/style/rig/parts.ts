// The paper-cut figure's parts, as Rive markup: one generator a film's rigs
// are built from (`righteousness-by-faith/rigs/`), so its people share their
// paper, their hands and their face rather than each drawing its own. The
// language they follow is the film skill's director vision → "Paper-cut
// figures (Rive)":
//
// - paper: a flat piece with an ink edge (`INK`, laid as its figure's
//   direction's outline says, `house.ts`) and its ramp's light on the
//   cut, lifted off the sheet by a small cast shadow in the shade of each
//   surface it falls on, its outline crawling on the boil;
// - the crease (the look's signature): every piece is split once by a
//   straight line at the light's one angle, its far side the paper's shade,
//   a hue of its own from the paper's ramp (`ramps`), never the paper dimmed;
// - the hand: a plain circle, nothing else;
// - the face kit: two eyes, two brows and a mouth line, each moved by a
//   view-model number, so a face acts by brow angle, eye shape and mouth.
//
// Pure: the same code writes the same markup.

import { rng } from '../../core/random.ts';
import { type Direction, LIGHT, inkOf, ramps as R } from '../house.ts';
import type { Crease } from '../paper.ts';
import { type Element, argb, el } from './rml.ts';

export type Pt = readonly [number, number];

// ─── geometry ────────────────────────────────────────────────────────────────

/** 0 below `e0`, 1 past `e1`, smooth between. */
export const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Points round an ellipse, clockwise on screen (y down), from its right. */
export const ellipse = (cx: number, cy: number, rx: number, ry: number, n: number): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as const;
  });

/** The box round `pts`. */
export const boxOf = (pts: ReadonlyArray<Pt>): Box => ({
  x0: Math.min(...pts.map(([x]) => x)),
  y0: Math.min(...pts.map(([, y]) => y)),
  x1: Math.max(...pts.map(([x]) => x)),
  y1: Math.max(...pts.map(([, y]) => y)),
});

// ─── the light and the crease ────────────────────────────────────────────────

/** A box in a piece's own units. */
interface Box {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/**
 * Where the crease cuts `box`: a gradient's axis across the box along the
 * light, and the share of the way along it the paper turns. The line it
 * draws is square to the axis, so it runs from the box's upper right toward
 * its lower left.
 */
export const creaseOf = (box: Box, crease: Crease = {}) => {
  const toward = crease.toward ?? LIGHT.toward;
  const dx = Math.cos(toward);
  const dy = Math.sin(toward);
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  // Half the box's reach along the light: its corners' furthest projection.
  const reach = (Math.abs(box.x1 - box.x0) * dx + Math.abs(box.y1 - box.y0) * dy) / 2;
  return {
    start: [cx - dx * reach, cy - dy * reach] as const,
    end: [cx + dx * reach, cy + dy * reach] as const,
    at: crease.at ?? LIGHT.crease,
  };
};

/** A colour as a paint. */
const solid = (hex: string, alpha = 1) => el('SolidColor', { colorValue: argb(hex, alpha) });

/** The paper over `box`, `color` on the light's side of the crease and `shade` past it, cut sharp unless `crease.soft`. */
const creased = (color: string, shade: string, box: Box, crease: Crease = {}): Element => {
  const { start, end, at } = creaseOf(box, crease);
  const soft = crease.soft ?? 0;
  // A cut turns across the least step a gradient keeps apart; a soft turn spans `soft` about the crease.
  const [from, to] = soft > 0 ? [at - soft / 2, at + soft / 2] : [at, at + 0.002];
  return el('LinearGradient', { startX: start[0], startY: start[1], endX: end[0], endY: end[1] }, [
    el('GradientStop', { colorValue: argb(color), position: 0 }),
    el('GradientStop', { colorValue: argb(color), position: Math.max(0, from) }),
    el('GradientStop', { colorValue: argb(shade), position: Math.min(1, to) }),
    el('GradientStop', { colorValue: argb(shade), position: 1 }),
  ]);
};

/**
 * A piece of the figure a cast shadow falls on: its key (`piece`) and its
 * paper's shade, which the shadow lays there.
 */
interface Surface {
  readonly key: string;
  readonly shade: string;
}

/** A figure piece's paint. */
export interface PieceLook {
  readonly color: string;
  /** The paper past the crease; none for a piece too small or thin to crease (a stain, a band). */
  readonly shade?: string;
  /** Its ramp's light: the light core along its cut edge (outline `edge` or `both`), its one highlight. */
  readonly light: string;
  /** What its ink carries (`INK`): a silhouette's line (`outer`, the default), a small silhouette piece's (`small`), trim's, or none. */
  readonly ink?: keyof typeof INK | 'none';
  /** The cutout's lift off the sheet, 0..1: a small cast shadow to the light's far side. */
  readonly shadow?: number;
  /**
   * The shade of what the cast shadow falls on past the figure (its ramp's,
   * `ramps`): the parchment sheet's unless said.
   */
  readonly cast?: string;
  /**
   * `host`: what lies past the figure under this piece is the host's scenery
   * (the judge's hand over the bench), so the host lays its cast, in the
   * shade of each surface there, and the rig lays none.
   */
  readonly ground?: 'host';
  /**
   * The figure's own pieces this one's cast shadow can fall on, and its
   * backmost piece. Given, the shadow is laid once per surface, in that
   * surface's shade, clipped to it and drawn just over it, and once in
   * `cast` behind the whole figure, where only the sheet shows it: a cast
   * shadow is the shade of the surface it falls on (CRAFT 12).
   */
  readonly over?: { readonly surfaces: ReadonlyArray<Surface>; readonly behind: string };
  /** Where its crease falls and how softly, when not the look's (`Crease`). */
  readonly crease?: Crease;
  /**
   * The light edge just inside its outline on the light's side, units wide,
   * in `light`, fading out toward the crease (`rimOf`); given, it takes the
   * place of the light core on the cut.
   */
  readonly rim?: number;
  /** Colour laid inside the paper, clipped to it (`Tone`): a lock of hair, the shade under a hairline. */
  readonly tones?: ReadonlyArray<Tone>;
}

/**
 * Colour laid inside a piece and clipped to its paper: an outline of its
 * own in the piece's units, in `color` at `alpha`; `soft`, it fades from
 * its middle to nothing at its edge (a radial ramp), so it blends into the
 * paper with no edge of its own.
 */
interface Tone {
  readonly pts: ReadonlyArray<Pt>;
  readonly color: string;
  readonly alpha?: number;
  readonly soft?: boolean;
}

/** The grey paper of a person, its far side and its light: the figure ramp. */
const FIGURE: PieceLook = {
  color: R.figure.base,
  shade: R.figure.shade,
  light: R.figure.light,
};

/**
 * How strongly a cast shadow lays its surface's shade per unit of lift: a
 * piece lifted 0.35 (the default) lays it at about half, which darkens the
 * parchment as much as the old 30 % warm black did, in the shade's own hue.
 */
const CAST = 1.4;

/** How opaque a cast shadow lifted `lift` lays its surface's shade (`CAST`). */
const castAlpha = (lift: number) => Math.min(1, CAST * lift);

/**
 * The ink's weights, in units at the court's scale, by what a line carries,
 * as a line centred on the cut edge (outline `line`): a figure's
 * silhouette (`outer`) is the heaviest line in the frame, so the eye finds
 * the people first; its small pieces (`small`: a hand, a leg) and its trim
 * (`trim`: a sash, a band, a tail) lighter; the face's marks are the kit's
 * own and lighter still (`KIT.brow`, `KIT.mouthLine`).
 */
const INK = { outer: 5, small: 3.5, trim: 2.5 } as const;

/**
 * What a silhouette's line shows outside its paper under the thick outline
 * (outline `thick` or `both`), units: RimWorld's figures-first line
 * (`.claude/skills/film/reference/rimworld-study.md`), about 3 % of the accused's
 * height on the head and body, a little less on a hand or a leg.
 */
const OUTSIDE = { outer: 6, small: 5 } as const;

/**
 * The light core's half-width on a cut edge (outline `edge` or `both`),
 * units: about 1.5 px a side at the court's camera. Its colour is the
 * paper's ramp light (`PieceLook.light`): the edge of a cut catching the
 * room, leaning to the key's warm hue.
 */
const CORE = 1;

/**
 * The widths of a piece's edge strokes under `d`'s outline, units: the ink
 * laid outside the paper (a stroke under it, twice as wide as what shows,
 * the paper covering its inner half), the ink centred on the cut, and the
 * light core straddling the cut; 0 for a stroke the outline does not lay.
 */
const edgeWidths = (d: Direction, weight: keyof typeof INK) => {
  const heavy = d.weight ?? 1;
  if (d.outline === 'line' || (d.outline === 'thick' && weight === 'trim'))
    return { under: 0, centred: INK[weight] * heavy, core: 0 };
  const core = d.outline === 'thick' ? 0 : CORE;
  const showing =
    d.outline === 'edge' ? 0 : (weight === 'trim' ? INK.trim / 2 : OUTSIDE[weight]) * heavy;
  return { under: showing > 0 ? 2 * (showing + core) : 0, centred: 0, core: 2 * core };
};

/** The ink a silhouette lays under its parts' papers, units wide (what shows outside, twice). */
const silhouetteInk = (d: Direction, weight: keyof typeof INK) => {
  const w = edgeWidths(d, weight);
  return Math.max(w.under - w.core, w.centred);
};

/**
 * How far a piece's edge under `d` covers what lies just outside its cut,
 * units: half its widest stroke (ink or light core), 0 for a piece with none.
 */
const inkCover = (d: Direction, weight: keyof typeof INK | 'none') => {
  if (weight === 'none') return 0;
  const w = edgeWidths(d, weight);
  return Math.max(w.under, w.centred, w.core) / 2;
};

/**
 * A piece's edge under `d`'s outline and in its ink, as the strokes under
 * its paper and over it (`edgeWidths`); its light core in `light`.
 */
const edgeOf = (d: Direction, weight: keyof typeof INK, light: string) => {
  const ink = (thickness: number) =>
    el('Stroke', { thickness, join: 'round', cap: 'round', name: 'Ink' }, [solid(inkOf(d))]);
  const w = edgeWidths(d, weight);
  return {
    under: w.under > 0 ? [ink(w.under)] : [],
    over: [
      ...(w.centred > 0 ? [ink(w.centred)] : []),
      ...(w.core > 0
        ? [
            el('Stroke', { thickness: w.core, join: 'round', cap: 'round', name: 'Core' }, [
              solid(light),
            ]),
          ]
        : []),
    ],
  };
};

/**
 * A cast shadow per unit of a piece's lift, units: how far it falls from the
 * piece along the light (`x`, `y`, to the light's far side) and its
 * feather's strength.
 */
const LIFT = { x: 3, y: 5, feather: 6 } as const;

/**
 * How far the Rive Renderer paints a feather past its shape, per unit of
 * its strength (`paint_outset.hpp`: a feather's outset is 1.5 times it), and
 * the antialiasing pixel past that, units.
 */
const FEATHER_REACH = 1.5;
const AA = 1;

/**
 * Whether a cast lifted `lift` shows past an edge that covers `cover`
 * (`inkCover`): its offset along the light, its feather's reach and a pixel
 * of antialiasing past the ink. A cast the ink hides is not laid: no shadow,
 * no casts on the figure's surfaces, no boil echo (R3-M2).
 */
const castShows = (lift: number, cover: number) =>
  lift > 0 && Math.hypot(LIFT.x, LIFT.y) * lift + FEATHER_REACH * LIFT.feather * lift + AA > cover;

/**
 * A cast shadow in `shade`, lifted `lift`: a feathered copy of its shape's
 * outline toward the light's far side, as a fill (`clockwise`, the one rule
 * the Rive Renderer feathers without pixel local storage).
 */
const shadowFill = (shade: string, lift: number) =>
  el('Fill', { fillRule: 'clockwise', name: 'Shadow' }, [
    solid(shade, castAlpha(lift)),
    el('Feather', {
      strength: LIFT.feather * lift,
      offsetX: LIFT.x * lift,
      offsetY: LIFT.y * lift,
      name: 'Lift',
    }),
  ]);

/** A piece's lift off the sheet. */
const liftOf = (look: PieceLook) => look.shadow ?? 0.35;

/** Whether `look`'s cast shows past its own edge under `d` (`castShows`). */
const castOf = (d: Direction, look: PieceLook) =>
  castShows(liftOf(look), inkCover(d, look.ink ?? 'outer'));

/**
 * The paints of a piece over `box` under `d`, bottom to top as Rive stacks a
 * shape's paints (last on top). A part of a silhouette (`inside`) lays only
 * its paper: its silhouette lays the one shadow and the one ink line round
 * all its parts (`silhouette`). A piece with a rim (`look.rim`) lays no light
 * core: its rim is the light on its edge (`rimOf`).
 */
const paints = (d: Direction, look: PieceLook, box: Box, inside = false): Element[] => {
  const paper = el('Fill', { name: 'Paper' }, [
    look.shade === undefined
      ? solid(look.color)
      : look.crease?.crescent === undefined
        ? creased(look.color, look.shade, box, look.crease)
        : solid(look.shade),
  ]);
  if (inside) return [paper];
  const out: Element[] = [];
  // A piece that lies over others of its figure lays its shadow on each (`casts`), not here; a
  // piece over the host's scenery leaves its shadow to the host.
  if (castOf(d, look) && look.over === undefined && look.ground !== 'host')
    out.push(shadowFill(look.cast ?? R.paper.shade, liftOf(look)));
  const weight = look.ink ?? 'outer';
  const edge: { under: Element[]; over: Element[] } =
    weight === 'none' ? { under: [], over: [] } : edgeOf(d, weight, look.light);
  out.push(...edge.under, paper, ...(look.rim === undefined ? edge.over : []));
  return out;
};

// ─── a figure in the project ─────────────────────────────────────────────────

/** One timeline's keys: object name → property → keys. */
type K = readonly [number, number, ('io' | 'out' | 'in' | 'linear' | 'hold')?];
type Tracks = Readonly<Record<string, Readonly<Record<string, ReadonlyArray<K>>>>>;

/** A figure's numbers, by name, at rest. */
type Numbers = Readonly<Record<string, number>>;

/**
 * One figure (an artboard) of the project: the art direction it is drawn
 * in; its names, each made an id once and namespaced to the figure so two
 * rigs never share one; the outline vertices its boil keys; and its view
 * model, whose numbers its parts bind.
 */
export interface Figure {
  readonly name: string;
  readonly direction: Direction;
  /** Where its artboard sits on the editor's stage, left to right, so the file opens laid out. */
  readonly stage: number;
  readonly idOf: (name: string) => string;
  /** A bind of view-model number `knob` into the property `key` of the element it sits in. */
  readonly bind: (knob: string, key: number) => Element;
  /** Key each of `pts` (the vertices `key.i`) to crawl within `amp` units of where it is cut, on the boil's ticks. */
  readonly boil: (key: string, pts: ReadonlyArray<Pt>, amp: number) => void;
  /**
   * Key the `n` vertices `key.i` to crawl exactly as `like.i` do (a cast
   * shadow following its piece), each `shift[i]` units off it when given (a
   * rim inset into its piece).
   */
  readonly echo: (key: string, like: string, n: number, shift?: ReadonlyArray<Pt>) => void;
  readonly boilTracks: () => Tracks;
}

/** A figure of the project in `direction`, its ids from `next` (one counter for the whole file). */
export const figure = (
  next: () => string,
  name: string,
  seed: number,
  stage: number,
  direction: Direction,
): Figure => {
  const named = new Map<string, string>();
  const idOf = (key: string) => {
    const have = named.get(key);
    if (have !== undefined) return have;
    const made = next();
    named.set(key, made);
    return made;
  };
  const tracks: Record<string, Record<string, K[]>> = {};
  const r = rng(seed);
  return {
    name,
    direction,
    stage,
    idOf,
    bind: (knob, key) =>
      el('DataBindContext', {
        sourcePathIds: `${idOf('vm')}-${idOf(`vm:${knob}`)}`,
        propertyKey: key,
      }),
    boil: (key, pts, amp) =>
      pts.forEach((p, i) => {
        const [dx, dy] = [crawl(r, amp), crawl(r, amp)];
        const keys = (c: number, d: (tick: number) => number): K[] =>
          Array.from({ length: BOIL.ticks }, (_, tick) => [tick / BOIL.fps, c + d(tick), 'hold']);
        tracks[`${key}.${i}`] = { x: keys(p[0], dx), y: keys(p[1], dy) };
      }),
    echo: (key, like, n, shift) => {
      for (let i = 0; i < n; i++) {
        const track = tracks[`${like}.${i}`];
        const [dx, dy] = shift?.[i] ?? [0, 0];
        if (track !== undefined)
          tracks[`${key}.${i}`] =
            dx === 0 && dy === 0
              ? track
              : {
                  x: (track['x'] ?? []).map(([t, v, e]): K => [t, v + dx, e]),
                  y: (track['y'] ?? []).map(([t, v, e]): K => [t, v + dy, e]),
                };
      }
    },
    boilTracks: () => tracks,
  };
};

/**
 * The paper's crawl: a new outline on each of the film's boil ticks (twelve a
 * second, the engine's `BOIL_FPS`), each point wandering slowly round where
 * it was cut, never jumping: a figure's line crawls, it does not tick
 * (DIRECTION, "Boil"). The loop is four seconds, long enough not to read as
 * a loop.
 */
const BOIL = { fps: 12, seconds: 4, ticks: 48 } as const;

/** Its harmonics: cycles a loop and share of the wander, so a point moves at most about 0.21 `amp` a tick. */
const CRAWL = [
  [1, 0.58],
  [2, 0.25],
  [3, 0.17],
] as const;

/** One axis of a point's crawl, within `amp` units: a sum of slow loops at random phases. */
const crawl = (r: () => number, amp: number) => {
  const phases = CRAWL.map(() => r() * 2 * Math.PI);
  return (tick: number) =>
    CRAWL.reduce(
      (sum, [cycles, share], k) =>
        sum + amp * share * Math.sin((2 * Math.PI * cycles * tick) / BOIL.ticks + (phases[k] ?? 0)),
      0,
    );
};

/** Where the boil timeline stands on the film's boil tick `tick` (`f.boil`). */
export const boilTime = (tick: number) => (tick % BOIL.ticks) / BOIL.fps + 1e-4;

/** The vertex `key.i` at `p`, its handles along the line from `prev` to `next` (`tension` 0 for a corner). */
const vertex = (fig: Figure, name: string, p: Pt, around: readonly [Pt, Pt], tension: number) => {
  const dx = around[1][0] - around[0][0];
  const dy = around[1][1] - around[0][1];
  return el('CubicMirroredVertex', {
    x: p[0],
    y: p[1],
    rotation: Math.atan2(dy, dx),
    distance: (tension * Math.hypot(dx, dy)) / 6,
    name,
    id: fig.idOf(name),
  });
};

/**
 * A smooth path through `pts` (Catmull-Rom as mirrored cubics), each vertex
 * named `key.i` so the boil keys it.
 */
const smoothPath = (fig: Figure, key: string, pts: ReadonlyArray<Pt>, closed = true): Element => {
  const n = pts.length;
  const vertices = pts.map((p, i) => {
    const prev = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)] ?? p;
    const next = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)] ?? p;
    const tension = closed || (i > 0 && i < n - 1) ? 1 : 0;
    return vertex(fig, `${key}.${i}`, p, [prev, next], tension);
  });
  return el('PointsPath', { isClosed: closed, isClockwise: true, name: 'Path' }, vertices);
};

/**
 * A piece of the figure: a closed smooth outline through `pts`, painted
 * `look` with its crease across its own box, and its outline on the boil
 * (`boil` units; 0 holds it still). A piece that lies over others
 * of its figure (`look.over`) comes as a node: the piece, then its cast
 * shadows (`casts`), when they show past its edge (`castShows`).
 */
export const piece = (
  fig: Figure,
  key: string,
  pts: ReadonlyArray<Pt>,
  look: PieceLook,
  opts: { readonly boil?: number } = {},
): Element => paperOf(fig, { key, pts, look, ...opts }, false);

/**
 * A piece's paper and what lies on it, front first: its rim (`rimOf`), its
 * tones (`toneOf`), the paper, then its casts over its figure (`casts`). A
 * part of a silhouette (`inside`) lays no ink, no shadow and no casts.
 */
const paperOf = (fig: Figure, part: Part, inside: boolean): Element => {
  const { key, pts, look } = part;
  const boil = part.boil ?? 0.9;
  if (boil > 0) fig.boil(key, pts, boil);
  const box = boxOf(pts);
  const shape = el('Shape', { name: key, id: fig.idOf(key) }, [
    smoothPath(fig, key, pts),
    ...paints(fig.direction, look, box, inside),
  ]);
  const crescent = look.shade === undefined ? undefined : look.crease?.crescent;
  const onTop = [
    ...(look.rim === undefined ? [] : [rimOf(fig, part, look.rim, box, boil > 0)]),
    ...(look.tones ?? []).map((t, i) => toneOf(fig, key, t, i)).reverse(),
    ...(crescent === undefined ? [] : [litOf(fig, part, crescent, box, boil > 0)]),
  ];
  const cast = !inside && look.over !== undefined && castOf(fig.direction, look);
  if (onTop.length === 0 && !cast) return shape;
  return el('Node', { name: `${key}Piece` }, [
    ...onTop,
    shape,
    ...(cast && look.over !== undefined ? casts(fig, key, pts, look, look.over, boil > 0) : []),
  ]);
};

// ─── light on the paper: rims and tones ──────────────────────────────────────

/** Twice the signed area of `pts` (positive clockwise, y down). */
const turning = (pts: ReadonlyArray<Pt>) =>
  pts.reduce((sum, p, i) => {
    const q = pts[(i + 1) % pts.length] ?? p;
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0);

/**
 * `pts` moved `by` units inward, each along its normal (square to the line
 * from its neighbour before to its neighbour after): an outline inset into
 * its own paper. Pure.
 */
const inset = (pts: ReadonlyArray<Pt>, by: number): Pt[] => {
  const n = pts.length;
  const side = turning(pts) > 0 ? 1 : -1;
  return pts.map((p, i) => {
    const prev = pts[(i - 1 + n) % n] ?? p;
    const next = pts[(i + 1) % n] ?? p;
    const tx = next[0] - prev[0];
    const ty = next[1] - prev[1];
    const len = Math.hypot(tx, ty) || 1;
    // Clockwise on screen (y down), the inside lies to the right of the way round: (−ty, tx).
    return [p[0] - (side * ty * by) / len, p[1] + (side * tx * by) / len];
  });
};

/** How far toward the crease a rim keeps its whole light before it fades, a share of the way. */
const RIM_HOLD = 0.6;

/**
 * A piece's rim: the light just inside its outline, `width` units, in its
 * paper's `light`, full on the light's side (`RIM_HOLD` of the way) and gone by its crease, so the
 * edge facing the light catches it and the far edge does not. A stroke on
 * the outline inset by half its width, crawling with the piece.
 */
const rimOf = (fig: Figure, part: Part, width: number, box: Box, boils: boolean): Element => {
  const name = `${part.key}Rim`;
  const pts = inset(part.pts, width / 2);
  if (boils)
    fig.echo(
      name,
      part.key,
      pts.length,
      pts.map((p, i): Pt => [p[0] - (part.pts[i]?.[0] ?? 0), p[1] - (part.pts[i]?.[1] ?? 0)]),
    );
  const { start, end, at } = creaseOf(box, part.look.crease);
  return el('Shape', { name, id: fig.idOf(name) }, [
    smoothPath(fig, name, pts),
    el('Stroke', { thickness: width, join: 'round', cap: 'round', name: 'Rim' }, [
      el('LinearGradient', { startX: start[0], startY: start[1], endX: end[0], endY: end[1] }, [
        el('GradientStop', { colorValue: argb(part.look.light), position: 0 }),
        el('GradientStop', { colorValue: argb(part.look.light), position: at * RIM_HOLD }),
        el('GradientStop', { colorValue: argb(part.look.light, 0), position: at }),
        el('GradientStop', { colorValue: argb(part.look.light, 0), position: 1 }),
      ]),
    ]),
  ]);
};

/**
 * The lit side of a piece that turns in a crescent (`Crease.crescent`): its
 * outline moved `share` of its half-size back toward the light, in its
 * colour, clipped to its paper and crawling with it, so its shade shows only
 * as the crescent the move uncovers on the far side.
 */
const litOf = (fig: Figure, part: Part, share: number, box: Box, boils: boolean): Element => {
  const name = `${part.key}Lit`;
  const toward = part.look.crease?.toward ?? LIGHT.toward;
  const by: Pt = [
    (-Math.cos(toward) * share * (box.x1 - box.x0)) / 2,
    (-Math.sin(toward) * share * (box.y1 - box.y0)) / 2,
  ];
  const pts = part.pts.map(([x, y]): Pt => [x + by[0], y + by[1]]);
  if (boils)
    fig.echo(
      name,
      part.key,
      pts.length,
      pts.map(() => by),
    );
  return el('Shape', { name, id: fig.idOf(name) }, [
    smoothPath(fig, name, pts),
    el('Fill', { name: 'Lit' }, [solid(part.look.color)]),
    el('ClippingShape', { sourceId: fig.idOf(part.key), name: 'Clip' }),
  ]);
};

/** The tone `i` of the piece `key`, clipped to its paper (`Tone`). */
const toneOf = (fig: Figure, key: string, tone: Tone, i: number): Element => {
  const name = `${key}Tone${i}`;
  const box = boxOf(tone.pts);
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const alpha = tone.alpha ?? 1;
  const paint = tone.soft
    ? el(
        'RadialGradient',
        { startX: cx, startY: cy, endX: cx + Math.max(box.x1 - cx, box.y1 - cy), endY: cy },
        [
          el('GradientStop', { colorValue: argb(tone.color, alpha), position: 0 }),
          el('GradientStop', { colorValue: argb(tone.color, alpha * 0.6), position: 0.55 }),
          el('GradientStop', { colorValue: argb(tone.color, 0), position: 1 }),
        ],
      )
    : solid(tone.color, alpha);
  return el('Shape', { name, id: fig.idOf(name) }, [
    smoothPath(fig, name, tone.pts),
    el('Fill', { name: 'Tone' }, [paint]),
    el('ClippingShape', { sourceId: fig.idOf(key), name: 'Clip' }),
  ]);
};

// ─── silhouettes ─────────────────────────────────────────────────────────────

/** One part of a silhouette, or a piece: its key, its outline, its paint and its boil. */
interface Part {
  readonly key: string;
  readonly pts: ReadonlyArray<Pt>;
  readonly look: PieceLook;
  readonly boil?: number;
}

const isPart = (layer: Part | Element): layer is Part => 'pts' in layer;

/**
 * One cut-out made of several papers: a head with its hair and its ear, as
 * the concept draws it, with one ink line round the outside of the whole and
 * none where its papers meet. `layers` are its parts and any other element
 * laid among them (the face kit), front first. Each part lays its paper, its
 * rim and its tones, unstroked; behind them all one shape holds every
 * part's outline, crawling with it, and lays the ink under every paper and
 * the one cast shadow, so the line shows only where no paper covers it: round
 * the silhouette. The light rim inside the line is the backmost part's
 * alone (the head), so it runs only where nothing lies over that part's
 * edge, round the silhouette; a part laid over it (an ear, hair, a beard)
 * keeps no rim of its own, which would draw a light border inside the
 * outline. A rig declares the parts and gets one outline.
 */
export const silhouette = (
  fig: Figure,
  key: string,
  layers: ReadonlyArray<Part | Element>,
  opts: { readonly ink?: keyof typeof INK; readonly shadow?: number } = {},
): Element => {
  const parts = layers.filter(isPart);
  const base = parts.at(-1);
  const drawn = layers.map((l) => {
    if (!isPart(l)) return l;
    if (l === base) return paperOf(fig, l, true);
    const { rim: _rim, ...look } = l.look;
    return paperOf(fig, { ...l, look }, true);
  });
  const name = `${key}Ink`;
  const paths = parts.map((p) => {
    const at = `${name}${p.key}`;
    if ((p.boil ?? 0.9) > 0) fig.echo(at, p.key, p.pts.length);
    return smoothPath(fig, at, p.pts);
  });
  const d = fig.direction;
  const weight = opts.ink ?? 'outer';
  const lift = opts.shadow ?? 0.35;
  const look = parts[0]?.look;
  const shadow =
    look !== undefined && castShows(lift, inkCover(d, weight)) && look.ground !== 'host'
      ? [shadowFill(look.cast ?? R.paper.shade, lift)]
      : [];
  const ink = el('Shape', { name, id: fig.idOf(name) }, [
    ...paths,
    ...shadow,
    el(
      'Stroke',
      { thickness: silhouetteInk(d, weight), join: 'round', cap: 'round', name: 'Ink' },
      [solid(inkOf(d))],
    ),
  ]);
  return el('Node', { name: key, id: fig.idOf(key) }, [...drawn, ink]);
};

/**
 * The cast shadows of the piece `key` over the surfaces of its figure: one
 * per surface, in its shade, clipped to it and drawn just over it, so a piece
 * between them covers it as it covers that surface; and one in the ground's
 * shade (`look.cast`) drawn behind the figure's backmost piece, so only the
 * sheet past the figure shows it. Each is the piece's outline again,
 * crawling with it.
 */
const casts = (
  fig: Figure,
  key: string,
  pts: ReadonlyArray<Pt>,
  look: PieceLook,
  over: NonNullable<PieceLook['over']>,
  boils: boolean,
): Element[] => {
  const lift = look.shadow ?? 0.35;
  const cast = (
    name: string,
    shade: string,
    target: { readonly key: string; readonly placement: 'before' | 'after' },
    clip?: string,
  ) => {
    if (boils) fig.echo(name, key, pts.length);
    return el('Shape', { name, id: fig.idOf(name) }, [
      smoothPath(fig, name, pts),
      shadowFill(shade, lift),
      ...(clip === undefined
        ? []
        : [el('ClippingShape', { sourceId: fig.idOf(clip), name: 'Clip' })]),
      el(
        'DrawRules',
        { drawTargetId: fig.idOf(`${name}:at`), name: 'Rules', id: fig.idOf(`${name}:rules`) },
        [
          el('DrawTarget', {
            drawableId: fig.idOf(target.key),
            placementValue: target.placement,
            name: 'At',
            id: fig.idOf(`${name}:at`),
          }),
        ],
      ),
    ]);
  };
  return [
    ...over.surfaces.map((s) =>
      cast(`${key}CastOn${s.key}`, s.shade, { key: s.key, placement: 'before' }, s.key),
    ),
    cast(`${key}Cast`, look.cast ?? R.paper.shade, { key: over.behind, placement: 'after' }),
  ];
};

// ─── the hand ────────────────────────────────────────────────────────────────

/** The outline points of a hand of radius `r`: a circle, twelve points round so it boils like the rest of the paper. */
const handOutline = (r: number): Pt[] => ellipse(0, 0, r, r, 12);

/** A hand's lift off the sheet: a little less than a body piece's. */
const HAND_LIFT = 0.3;

/**
 * The hand: a plain circle of paper of radius `r` at the origin, creased like
 * every piece. No thumb, no fingers: a grip or a point reads from where the
 * circle sits and how it travels.
 */
export const hand = (fig: Figure, key: string, r: number, look: PieceLook = FIGURE): Element =>
  piece(fig, key, handOutline(r), { ink: 'small', shadow: HAND_LIFT, ...look }, { boil: 0.6 });

/**
 * Where a hand is `reach` of the way from `rest` to `to`, travelling round
 * `shoulder`: its angle and its distance about the shoulder each eased
 * between the two, so the hand swings on an arc bowed away from the body
 * rather than sliding on a line. Pure.
 */
export const reachAbout = (shoulder: Pt, rest: Pt, to: Pt, reach: number): Pt => {
  const k = Math.max(0, Math.min(1, reach));
  const a0 = Math.atan2(rest[1] - shoulder[1], rest[0] - shoulder[0]);
  let a1 = Math.atan2(to[1] - shoulder[1], to[0] - shoulder[0]);
  // The short way round.
  if (a1 - a0 > Math.PI) a1 -= 2 * Math.PI;
  if (a0 - a1 > Math.PI) a1 += 2 * Math.PI;
  const r0 = Math.hypot(rest[0] - shoulder[0], rest[1] - shoulder[1]);
  const r1 = Math.hypot(to[0] - shoulder[0], to[1] - shoulder[1]);
  const a = a0 + (a1 - a0) * k;
  const r = r0 + (r1 - r0) * k;
  return [shoulder[0] + Math.cos(a) * r, shoulder[1] + Math.sin(a) * r];
};

// ─── the face kit ────────────────────────────────────────────────────────────

/**
 * The face's view-model numbers and what each moves, at rest. The kit is
 * drawn at the accused's size; a bigger head scales the whole kit, so every
 * number means the same on every face.
 */
export const FACE = {
  /** Where the eyes look, in the figure's units from its origin. */
  gazeX: 0,
  gazeY: 0,
  /** How far a head turns after the gaze, 0..1: kept in the view model, though no part the kit draws binds it. */
  follow: 0,
  /** The eyes' height (1 at rest, 0 shut, past 1 wide open) and width. */
  eyes: 1,
  eyeW: 1,
  /** The brows' rise, units, negative up. */
  browY: 0,
  /** The brows' turn, radians: past 0 their inner ends rise (worry, hope); below, they knit. */
  browTilt: 0,
  /** The mouth line's middle, units below its corners: past 0 a smile, below 0 turned down. */
  mouth: 0,
  /** The mouth line's opacity: 0 where the open mouth takes its place. */
  mouthLine: 1,
  /** The open mouth, an "oh", 0 closed to 1 open. */
  mouthOpen: 0,
} as const;
export type FaceKnob = keyof typeof FACE;

/** The face's parts, in the kit's units about the face's centre. */
const KIT: FaceShape = {
  eyes: [-12, 13],
  eyeY: -7,
  eye: [6.8, 8.8],
  /** How far an eye may leave its socket after the gaze. */
  roam: 3,
  /**
   * How far the features slide across the head after the gaze, and how hard
   * the gaze pulls them: a flat face turns by its features, not its outline.
   */
  turn: 4,
  turnPull: 0.05,
  brows: [-13, 13],
  browY: -21,
  browHalf: 8,
  brow: 3.4,
  mouth: [1, 15],
  mouthHalf: 6.5,
  mouthLine: 3,
};

/**
 * Where and how big the face's marks are, in the kit's units about the
 * face's centre: the eyes' x, their height (`eyeY`) and size (width,
 * height), how far an eye roams and the features turn; the brows' x, height,
 * half-length and stroke; the mouth's place, half-width and stroke. A figure
 * drawn to its own sheet gives the parts it draws otherwise (`faceKit`).
 */
interface FaceShape {
  readonly eyes: readonly [number, number];
  readonly eyeY: number;
  readonly eye: readonly [number, number];
  readonly roam: number;
  readonly turn: number;
  readonly turnPull: number;
  readonly brows: readonly [number, number];
  readonly browY: number;
  readonly browHalf: number;
  readonly brow: number;
  readonly mouth: readonly [number, number];
  readonly mouthHalf: number;
  readonly mouthLine: number;
}

/** The view model's property keys the kit binds (`rive schema`). */
const KEY = {
  x: 13,
  y: 14,
  rotation: 15,
  scaleX: 16,
  scaleY: 17,
  opacity: 18,
  vertexY: 25,
} as const;

/** One brow: a short arched stroke turned by `browTilt`; the left one mirrored, so both inner ends rise together. */
const brow = (fig: Figure, k: FaceShape, side: 'L' | 'R', x: number) =>
  el('Node', { x, y: k.browY, scaleX: side === 'L' ? -1 : 1, name: `brow${side}Side` }, [
    el('Shape', { name: `brow${side}`, id: fig.idOf(`brow${side}`) }, [
      smoothPath(
        fig,
        `brow${side}`,
        [
          [-k.browHalf, 1],
          [0, -0.8],
          [k.browHalf, 1],
        ],
        false,
      ),
      el('Stroke', { thickness: k.brow, cap: 'round', name: 'Ink' }, [solid(inkOf(fig.direction))]),
      fig.bind('browTilt', KEY.rotation),
    ]),
  ]);

/** An ellipse `w` × `h` about its shape's origin. */
const ellipsePath = (w: number, h: number) =>
  el('Ellipse', { width: w, height: h, originX: 0.5, originY: 0.5, name: 'Path' });

/** One eye: pulled toward the gaze, held inside its socket, its height and width the view model's. */
const eye = (fig: Figure, k: FaceShape, side: 'L' | 'R', x: number, scale: number) =>
  el('Shape', { x, y: k.eyeY, name: `eye${side}`, id: fig.idOf(`eye${side}`) }, [
    ellipsePath(k.eye[0], k.eye[1]),
    el('Fill', { name: 'Ink' }, [solid(inkOf(fig.direction))]),
    el('TranslationConstraint', { targetId: fig.idOf('gaze'), strength: 0.03, name: 'Look' }),
    el('DistanceConstraint', {
      targetId: fig.idOf(`socket${side}`),
      distance: k.roam * scale,
      modeValue: 'closer',
      name: 'Socket',
    }),
    fig.bind('eyes', KEY.scaleY),
    fig.bind('eyeW', KEY.scaleX),
  ]);

/** The mouth: a line whose middle bends (smile, frown), and an "oh" that opens over it. */
const mouth = (fig: Figure, k: FaceShape) =>
  el('Node', { x: k.mouth[0], y: k.mouth[1], name: 'mouth', id: fig.idOf('mouth') }, [
    el('Shape', { scaleX: 0, scaleY: 0, name: 'mouthOh', id: fig.idOf('mouthOh') }, [
      ellipsePath(8, 10.5),
      el('Fill', { name: 'Ink' }, [solid(inkOf(fig.direction))]),
      fig.bind('mouthOpen', KEY.scaleX),
      fig.bind('mouthOpen', KEY.scaleY),
    ]),
    el('Shape', { name: 'mouthLine', id: fig.idOf('mouthLine') }, [
      el('PointsPath', { isClosed: false, isClockwise: true, name: 'Path' }, [
        el('StraightVertex', { x: -k.mouthHalf, y: 0, name: 'mouthL' }),
        el(
          'CubicMirroredVertex',
          { x: 0, y: 0, rotation: 0, distance: k.mouthHalf * 0.55, name: 'mouthMid' },
          [fig.bind('mouth', KEY.vertexY)],
        ),
        el('StraightVertex', { x: k.mouthHalf, y: 0, name: 'mouthR' }),
      ]),
      el('Stroke', { thickness: k.mouthLine, cap: 'round', join: 'round', name: 'Ink' }, [
        solid(inkOf(fig.direction)),
      ]),
      fig.bind('mouthLine', KEY.opacity),
    ]),
  ]);

/**
 * The face, centred at (x, y) in its parent's frame and `scale` times the
 * kit's size: brows, eyes and mouth, each moved by the figure's view-model
 * numbers (`FACE`), and the eyes' sockets; the features together slide a
 * little toward the gaze (`turn`). `shape` gives the marks a figure's
 * sheet draws otherwise than the kit (`FaceShape`). Named `face`, the node
 * `check`'s face probe reads.
 */
export const faceKit = (
  fig: Figure,
  at: { x: number; y: number; scale?: number },
  shape: Partial<FaceShape> = {},
) => {
  const scale = at.scale ?? 1;
  const k: FaceShape = { ...KIT, ...shape };
  return el(
    'Node',
    { x: at.x, y: at.y, scaleX: at.scale, scaleY: at.scale, name: 'face', id: fig.idOf('face') },
    [
      el('Node', { name: 'features', id: fig.idOf('features') }, [
        el('TranslationConstraint', {
          targetId: fig.idOf('gaze'),
          strength: k.turnPull,
          name: 'Turn',
        }),
        el('DistanceConstraint', {
          targetId: fig.idOf('faceRest'),
          distance: k.turn * scale,
          modeValue: 'closer',
          name: 'Within',
        }),
        el('Node', { name: 'brows', id: fig.idOf('brows') }, [
          fig.bind('browY', KEY.y),
          brow(fig, k, 'L', k.brows[0]),
          brow(fig, k, 'R', k.brows[1]),
        ]),
        eye(fig, k, 'L', k.eyes[0], scale),
        eye(fig, k, 'R', k.eyes[1], scale),
        mouth(fig, k),
        el('Node', { x: k.eyes[0], y: k.eyeY, name: 'socketL', id: fig.idOf('socketL') }),
        el('Node', { x: k.eyes[1], y: k.eyeY, name: 'socketR', id: fig.idOf('socketR') }),
      ]),
      el('Node', { name: 'faceRest', id: fig.idOf('faceRest') }),
    ],
  );
};

/** The gaze target the eyes and the features follow, at rest at `knobs`' gaze. */
export const gazeTarget = (fig: Figure, knobs: Numbers) =>
  el('Node', { x: knobs['gazeX'], y: knobs['gazeY'], name: 'gaze', id: fig.idOf('gaze') }, [
    fig.bind('gazeX', KEY.x),
    fig.bind('gazeY', KEY.y),
  ]);

// ─── timelines ───────────────────────────────────────────────────────────────

const FPS = 60;

const CURVES = {
  io: [0.42, 0, 0.58, 1],
  out: [0.15, 0.6, 0.35, 1],
  in: [0.5, 0, 0.85, 0.4],
} as const;

const keyframes = (keys: ReadonlyArray<K>, fps: number): Element[] =>
  keys.map(([s, value, how = 'io']) => {
    const frame = Math.round(s * fps);
    if (how === 'hold' || how === 'linear')
      return el('KeyFrameDouble', { value, frame, interpolationType: how });
    const [x1, y1, x2, y2] = CURVES[how];
    return el('KeyFrameDouble', { value, frame, interpolationType: 'cubic' }, [
      el('CubicEaseInterpolator', { x1, y1, x2, y2 }),
    ]);
  });

/** One named timeline of the figure, `seconds` long: its tracks keyed by object name. */
export const timeline = (
  fig: Figure,
  name: string,
  seconds: number,
  tracks: Tracks,
  opts: { readonly fps?: number; readonly loop?: boolean } = {},
) => {
  const fps = opts.fps ?? FPS;
  return el(
    'LinearAnimation',
    {
      fps,
      duration: Math.round(seconds * fps),
      loopValue: opts.loop === true ? 'loop' : 'oneShot',
      name,
      id: fig.idOf(`anim:${name}`),
    },
    Object.entries(tracks).map(([object, props]) =>
      el(
        'KeyedObject',
        { objectId: fig.idOf(object) },
        Object.entries(props).map(([property, keys]) =>
          el('KeyedProperty', { property }, keyframes(keys, fps)),
        ),
      ),
    ),
  );
};

/** The figure's boil: every outline it registered, crawling tick by tick and held between. */
export const boilTimeline = (fig: Figure) =>
  timeline(fig, 'boil', BOIL.seconds, fig.boilTracks(), { fps: BOIL.fps, loop: true });

// ─── the artboard ────────────────────────────────────────────────────────────

/**
 * The figure's artboard: `width` × `height`, its content and timelines and,
 * given `knobs`, the view model `Figure` whose numbers they are: the
 * artboard's default, which the film binds an instance of to each frame's own
 * artboard (`f.rive`), so no state machine is needed to apply its binds.
 */
export const artboard = (
  fig: Figure,
  size: { readonly width: number; readonly height: number },
  content: ReadonlyArray<Element>,
  timelines: ReadonlyArray<Element>,
  knobs?: Numbers,
): Element[] => {
  const vm = knobs === undefined ? undefined : fig.idOf('vm');
  const board = el(
    'Artboard',
    {
      viewModelId: vm,
      viewModelInstanceId: knobs === undefined ? undefined : fig.idOf('vm:default'),
      x: fig.stage,
      y: 0,
      width: size.width,
      height: size.height,
      clip: false,
      name: fig.name,
      id: fig.idOf('artboard'),
    },
    [...content, ...timelines],
  );
  if (knobs === undefined) return [board];
  const names = Object.keys(knobs);
  return [
    board,
    el('ViewModel', { defaultInstanceId: fig.idOf('vm:default'), name: fig.name, id: vm }, [
      ...names.map((k) => el('ViewModelPropertyNumber', { name: k, id: fig.idOf(`vm:${k}`) })),
      el(
        'ViewModelInstance',
        { exports: true, name: 'Default', id: fig.idOf('vm:default') },
        names.map((k) =>
          el('ViewModelInstanceNumber', {
            propertyValue: knobs[k] ?? 0,
            viewModelPropertyId: fig.idOf(`vm:${k}`),
          }),
        ),
      ),
    ]),
  ];
};
