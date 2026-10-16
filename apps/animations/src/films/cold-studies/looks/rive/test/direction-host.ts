// What the host draws round the figures, recorded as the direction tests
// (`direction-*.test.ts`) read it: the regions a canvas fills and clips to,
// their colours, and the casts under the judge's hand in every pose.

import { type Style, isPattern, recorder, withDom } from '@bible/film/stand-in';
import { Predicate } from 'effect';
import { GAVEL_REST } from '../../../../righteousness-by-faith/court.ts';
import type { CourtFrame } from '../../../scenes/court.ts';
import { type Direction, propsOf } from '../direction.ts';
import { figureRigs } from '../figures.ts';
import { HAND_ART } from '../judge-rig.ts';
import { handAt, judgeOf, underHand } from '../judge.ts';
import { HAND_LIFT, LIFT, type Pt } from '../parts.ts';
import type { Element } from '../rml.ts';
import {
  paintNamed,
  coloursOf,
  drawnOf,
  inside,
  edgeDistance,
  derived,
  shown,
  FEATHER_EXTENT,
  coverOf,
} from './direction-rigs.ts';

export type Rule = 'nonzero' | 'evenodd';

/** A region a canvas fills or clips to: its subpaths in device units, and its fill rule. */
export interface Region {
  readonly paths: ReadonlyArray<ReadonlyArray<Pt>>;
  readonly rule: Rule;
}

/**
 * One paint: a fill (`fill`, `fillRect`), a stroke, or the shadow a fill or
 * stroke casts (`shadowColor`); its region, the clips in force, its colours
 * (a gradient's every stop; a pre-blended face's tile colour), whether it is
 * one opaque flat colour (`flat`: how an ink line is laid, `ink.ts` filling
 * a line's outline so) and whether it paints over (`source-over`).
 */
export interface Laid extends Region {
  readonly kind: 'fill' | 'stroke' | 'shadow';
  readonly clips: ReadonlyArray<Region>;
  readonly colours: ReadonlyArray<string>;
  readonly flat: boolean;
  readonly over: boolean;
}

/** Whether `region` covers `p`, by its rule. */
export const covers = (region: Region, [x, y]: Pt) => {
  let winding = 0;
  let crossings = 0;
  for (const poly of region.paths)
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i] ?? [0, 0];
      const [xj, yj] = poly[j] ?? [0, 0];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        crossings += 1;
        winding += yi > yj ? 1 : -1;
      }
    }
  return region.rule === 'evenodd' ? crossings % 2 === 1 : winding !== 0;
};

/** A colour as a canvas takes it, as `#rrggbb` (its alpha dropped). */
export const hexOfCss = (colour: string) => {
  const s = colour.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${[...s.slice(1)].map((c) => `${c}${c}`).join('')}`;
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(s)) return s.slice(0, 7);
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(s);
  if (rgb === null) return s;
  return `#${[rgb[1], rgb[2], rgb[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`;
};

/** A colour's own alpha, 0..1: `rgba(…, a)`, `#rrggbbaa`, `transparent`; 1 for any other. */
export const alphaOfCss = (colour: string) => {
  const s = colour.replace(/\s/g, '').toLowerCase();
  if (s === 'transparent') return 0;
  const hex = /^#[0-9a-f]{6}([0-9a-f]{2})$/.exec(s)?.[1];
  if (hex !== undefined) return Number.parseInt(hex, 16) / 255;
  const a = /^rgba\([^,]+,[^,]+,[^,]+,([\d.]+)\)$/.exec(s)?.[1];
  return a === undefined ? 1 : Number(a);
};

/**
 * A paint style's colours as `#rrggbb`: a colour's own, a gradient's every
 * stop's, a pattern's the colours its tile was filled with (a pre-blended
 * face's tile holds one fill, the face's colour, under its grain: `faceOf`).
 */
export const coloursOfStyle = (
  style: string | CanvasGradient | CanvasPattern,
): ReadonlyArray<string> => {
  if (Predicate.isString(style)) return [hexOfCss(style)];
  const as = style as unknown as Style;
  if (isPattern(as))
    return as.tile.drawn.fills.flatMap((f) =>
      Predicate.isString(f.style) ? [hexOfCss(f.style)] : [],
    );
  // The stand-in's gradients keep their stops, as added (`StandInGradient`).
  const stops = Predicate.hasProperty(style, 'stops') ? style.stops : undefined;
  return Array.isArray(stops)
    ? stops.flatMap((stop) =>
        Array.isArray(stop) && Predicate.isString(stop[1]) ? [hexOfCss(stop[1])] : [],
      )
    : [];
};

/** Whether a canvas lays a shadow under what it paints now: a colour not fully clear, blurred or moved. */
export const castsShadow = (ctx: CanvasRenderingContext2D) => {
  const c = ctx.shadowColor.replace(/\s/g, '').toLowerCase();
  const clear =
    c === 'transparent' || /^rgba\(\d+,\d+,\d+,0(\.0*)?\)$/.test(c) || /^#[0-9a-f]{6}00$/.test(c);
  return !clear && (ctx.shadowBlur > 0 || ctx.shadowOffsetX !== 0 || ctx.shadowOffsetY !== 0);
};

/**
 * What `draw` paints, in order, drawn into a recording context: each fill
 * (`fill`, `fillRect`) and stroke, and the shadow each casts, with its region
 * and clips in device units (the recorder's transform at each path call) and
 * its every colour. A rig it draws (`f.rive`) is not drawn here.
 */
export const laidBy = (draw: (f: CourtFrame) => void): ReadonlyArray<Laid> =>
  withDom(() => {
    const rec = recorder();
    const laid: Laid[] = [];
    let path: Pt[][] = [];
    let clips: ReadonlyArray<Region> = [];
    const saved: Array<ReadonlyArray<Region>> = [];
    const to = (x: number, y: number): Pt => {
      const [a, b, c, d, e, f] = rec.now();
      return [a * x + c * y + e, b * x + d * y + f];
    };
    const add = (p: Pt) => {
      const sub = path.at(-1);
      if (sub === undefined) path.push([p]);
      else sub.push(p);
    };
    const bezier = (ps: ReadonlyArray<Pt>, t: number): Pt =>
      ps.length <= 1
        ? (ps[0] ?? [0, 0])
        : bezier(
            ps.slice(1).map((q, i): Pt => {
              const p = ps[i] ?? q;
              return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
            }),
            t,
          );
    const curve = (ps: ReadonlyArray<Pt>) => {
      const from = path.at(-1)?.at(-1) ?? ps[0] ?? [0, 0];
      for (let k = 1; k <= 12; k++) add(bezier([from, ...ps], k / 12));
    };
    const arc = (
      [x, y, rx, ry, rot, a0, a1]: readonly [
        number,
        number,
        number,
        number,
        number,
        number,
        number,
      ],
      ccw: boolean,
    ) => {
      const turn = 2 * Math.PI;
      const sweep = ccw
        ? a0 - a1 >= turn
          ? -turn
          : -((((a0 - a1) % turn) + turn) % turn)
        : a1 - a0 >= turn
          ? turn
          : (((a1 - a0) % turn) + turn) % turn;
      for (let k = 0; k <= 32; k++) {
        const a = a0 + (sweep * k) / 32;
        const [ex, ey] = [rx * Math.cos(a), ry * Math.sin(a)];
        add(
          to(
            x + ex * Math.cos(rot) - ey * Math.sin(rot),
            y + ex * Math.sin(rot) + ey * Math.cos(rot),
          ),
        );
      }
    };
    type Op = (n: ReadonlyArray<number>, raw: ReadonlyArray<unknown>) => void;
    const ops = new Map<PropertyKey, Op>([
      [
        'beginPath',
        () => {
          path = [];
        },
      ],
      ['moveTo', ([x = 0, y = 0]) => path.push([to(x, y)])],
      ['lineTo', ([x = 0, y = 0]) => add(to(x, y))],
      [
        'closePath',
        () => {
          const first = path.at(-1)?.[0];
          if (first !== undefined) path.push([first]);
        },
      ],
      [
        'bezierCurveTo',
        ([a = 0, b = 0, c = 0, d = 0, e = 0, f = 0]) => curve([to(a, b), to(c, d), to(e, f)]),
      ],
      ['quadraticCurveTo', ([a = 0, b = 0, c = 0, d = 0]) => curve([to(a, b), to(c, d)])],
      [
        'arc',
        ([x = 0, y = 0, r = 0, a0 = 0, a1 = 0], raw) =>
          arc([x, y, r, r, 0, a0, a1], raw[5] === true),
      ],
      [
        'ellipse',
        ([x = 0, y = 0, rx = 0, ry = 0, rot = 0, a0 = 0, a1 = 0], raw) =>
          arc([x, y, rx, ry, rot, a0, a1], raw[7] === true),
      ],
      [
        'rect',
        ([x = 0, y = 0, w = 0, h = 0]) =>
          path.push([to(x, y), to(x + w, y), to(x + w, y + h), to(x, y + h)], [to(x, y)]),
      ],
      ['save', () => saved.push(clips)],
      [
        'restore',
        () => {
          clips = saved.pop() ?? clips;
        },
      ],
      [
        'clip',
        (_, raw) => {
          const region: Region = {
            paths: path.map((s) => [...s]),
            rule: raw[0] === 'evenodd' ? 'evenodd' : 'nonzero',
          };
          clips = [...clips, region];
        },
      ],
    ]);
    /** The region a paint call covers: the path for `fill` and `stroke`, its rectangle for `fillRect`. */
    const painted = (
      key: PropertyKey,
      [x = 0, y = 0, w = 0, h = 0]: ReadonlyArray<number>,
      raw: ReadonlyArray<unknown>,
    ): Region | undefined => {
      if (key === 'fill' || key === 'stroke')
        return {
          paths: path.map((s) => [...s]),
          rule: raw[0] === 'evenodd' ? 'evenodd' : 'nonzero',
        };
      if (key !== 'fillRect') return undefined;
      return { paths: [[to(x, y), to(x + w, y), to(x + w, y + h), to(x, y + h)]], rule: 'nonzero' };
    };
    /** One paint over `region`, and first the shadow it casts if the context lays one. */
    const lay = (target: CanvasRenderingContext2D, kind: 'fill' | 'stroke', region: Region) => {
      const over = target.globalCompositeOperation === 'source-over';
      if (castsShadow(target))
        laid.push({
          ...region,
          kind: 'shadow',
          clips,
          colours: [hexOfCss(target.shadowColor)],
          flat: false,
          over,
        });
      const style = kind === 'stroke' ? target.strokeStyle : target.fillStyle;
      laid.push({
        ...region,
        kind,
        clips,
        colours: coloursOfStyle(style),
        flat: Predicate.isString(style) && target.globalAlpha * alphaOfCss(style) >= 0.999,
        over,
      });
    };
    const ctx = new Proxy(rec.ctx, {
      get: (target, key) => {
        const value = Reflect.get(target, key);
        if (!Predicate.isFunction(value)) return value;
        return (...args: ReadonlyArray<unknown>) => {
          const n = args.map((a) => (Predicate.isNumber(a) ? a : 0));
          const region = painted(key, n, args);
          if (region === undefined) ops.get(key)?.(n, args);
          else lay(target, key === 'stroke' ? 'stroke' : 'fill', region);
          return Reflect.apply(value as (...a: ReadonlyArray<unknown>) => unknown, target, args);
        };
      },
      set: (target, key, value) => Reflect.set(target, key, value),
    });
    draw({
      ctx,
      boil: 0,
      hand: (key: string | number) => ({ boil: 0, seed: String(key).length }),
      rive: () => undefined,
      at: () => 0,
      t: 0,
      cue: () => ({ start: 0, dur: 1 }),
    } as unknown as CourtFrame);
    return laid;
  });

/** The colours of the topmost fill over `p`, inside every clip in force, or `none`. */
export const laidAt = (laid: ReadonlyArray<Laid>, p: Pt): ReadonlyArray<string> =>
  laid.findLast(
    (l) =>
      l.kind === 'fill' &&
      l.over &&
      l.colours.length > 0 &&
      covers(l, p) &&
      l.clips.every((c) => covers(c, p)),
  )?.colours ?? ['none'];

/** The gavel's turns across its fall: raised, at rest, swinging down, down on the block. */
export const SWINGS = [-0.3, GAVEL_REST, 0.9, 1.4, 1.62];
/** How far he leans in: upright, halfway, all the way. */
export const LEANS = [0, 0.5, 1];

/** How near a surface's edge a sample is too near to say which surface it is on (the boil, the cut's rim, its ink), units. */
export const EDGE = 3;

/**
 * Points round a hand at `c` where its cast shows: past its ink (`cover`)
 * and within the reach of its shadow, the hand's outline moved along the
 * light by its lift and feathered as the renderer feathers it.
 */
export const castBand = (c: Pt, cover: number): Pt[] => {
  const offset: Pt = [LIFT.x * HAND_LIFT, LIFT.y * HAND_LIFT];
  const R = HAND_ART.r + FEATHER_EXTENT * LIFT.feather * HAND_LIFT;
  return Array.from({ length: 36 }, (_, k): Pt => [
    Math.cos((k * Math.PI) / 18),
    Math.sin((k * Math.PI) / 18),
  ]).flatMap((u) => {
    const along = u[0] * offset[0] + u[1] * offset[1];
    const disc = R * R - (offset[0] ** 2 + offset[1] ** 2) + along * along;
    const inner = HAND_ART.r + cover + 0.25;
    const outer = disc > 0 ? along + Math.sqrt(disc) : 0;
    const rho = (inner + outer) / 2;
    return outer - inner < 0.1 ? [] : [[c[0] + u[0] * rho, c[1] + u[1] * rho] as const];
  });
};

/** The palms built so far, by direction: every pose of one direction reads the same rig. */
export const palms = new Map<Direction, ReturnType<typeof palmBuilt>>();

/** `d`'s palm as its hand rig draws it, and the cast the rig lays under it, if any. */
export const palmBuilt = (d: Direction) => {
  const palm = drawnOf(figureRigs(d).hand[0] as Element).find((s) => s.name === 'palm');
  return { palm, rigCast: palm === undefined ? undefined : paintNamed(palm.e, 'Shadow') };
};

/** `d`'s palm, built once however many poses read it. */
export const palmOf = (d: Direction) => {
  const built = palms.get(d) ?? palmBuilt(d);
  palms.set(d, built);
  return built;
};

/**
 * Under `d`, leaning `lean` with the gavel turned `swing`: each place the
 * hand's cast shows, the surface the court's geometry puts there, and the
 * colour laid there: the rig's own shadow if it lays one, else the topmost
 * fill the host draws there.
 */
export const handCasts = (d: Direction, lean: number, swing: number, as: Mutation = (f) => f) => {
  const { palm, rigCast } = palmOf(d);
  const fills = laidBy((f) => judgeOf(d).over(as(f), swing, lean, propsOf(d)));
  const surfaces = underHand(d, swing, lean, propsOf(d));
  const outlined = surfaces.flatMap((s) =>
    s.outline === undefined ? [] : [{ ...s, outline: s.outline }],
  );
  const wall = surfaces.find((s) => s.outline === undefined);
  return castBand(handAt(swing, lean), palm === undefined ? 0 : coverOf(palm.e))
    .filter((p) => outlined.every((s) => edgeDistance(p, s.outline) >= EDGE))
    .map((p) => {
      const under = outlined.find((s) => inside(p, s.outline)) ?? wall;
      return {
        on: under?.name ?? 'nothing',
        want: under === undefined ? 'no surface' : derived(under.paper).shade,
        laid: rigCast === undefined ? laidAt(fills, p) : coloursOf(rigCast),
      };
    });
};

/** A frame drawn some other way: a negative control's mutation of what the host draws. */
export type Mutation = (f: CourtFrame) => CourtFrame;

/** `f` with every radial gradient's middle stop black, its alpha kept: a cast shaded with black part way across. */
export const blackMiddleStop: Mutation = (f) => {
  const ctx = new Proxy(f.ctx, {
    get: (target, key) =>
      key === 'createRadialGradient'
        ? (...args: Parameters<CanvasRenderingContext2D['createRadialGradient']>) => {
            const g = target.createRadialGradient(...args);
            const add = g.addColorStop.bind(g);
            g.addColorStop = (t: number, c: string) =>
              add(t, t === 0.5 ? `#000000${c.length === 9 ? c.slice(7) : ''}` : c);
            return g;
          }
        : Reflect.get(target, key),
    set: (target, key, value) => Reflect.set(target, key, value),
  });
  return { ...f, ctx } as CourtFrame;
};

/** Whether a cast lies in its surface's shade: every colour laid there (each stop of its feather) is it. */
export const castHolds = (c: ReturnType<typeof handCasts>[number]) =>
  c.laid.length > 0 && c.laid.every((l) => l === c.want);

/** The faults among a hand's casts: each place it lies in a colour not its surface's shade. */
export const castFaults = (casts: ReturnType<typeof handCasts>) =>
  casts.filter((c) => !castHolds(c)).map((c) => `on the ${c.on}: ${c.laid.map(shown).join(', ')}`);
