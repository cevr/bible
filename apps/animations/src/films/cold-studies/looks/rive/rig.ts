// The accused as a Rive rig, generated: Righteousness by Faith's grey paper
// person (`kit.ts`'s `person`, the cutpaper control) rebuilt in Rive's own
// terms so the comparison is engine, not art. Same shapes, colours and line;
// what changes is how it moves:
//
// - bones: hips → chest → head (→ jaw), each piece of the body skinned to them;
// - weighted meshes: the tunic, its stains and the scarlet sash bend between
//   hips and chest (the bow hunches the body, the lift straightens it), and
//   the head's lower half rides a jaw bone (the chin tucks as the head bows);
// - constraints: each eye is pulled toward a gaze target and gated inside its
//   socket (translation + distance), and the head can turn after it (an IK
//   look-at whose strength is a view-model number);
// - cloth: the sash's two tails hang on three-bone chains whose swing lags
//   the body by frames (overlap and settle, keyed);
// - a view model, `Accused`: the face's knobs (gaze, eyes, brows, mouth,
//   follow) as named numbers the host sets;
// - timelines named for the court's cues (`bow`, `stamp`, `lift`) plus a
//   `breath` loop and a `boil` loop (12 fps vertex jitter, the paper's crawl).
//
// Rive never owns the clock: `riveProp` sets each timeline's time and each
// view-model number from the frame (`court.ts`). Pure: `accusedRml()` is the
// whole project file, the same text for the same code.

import { hash2, rng } from '@bible/film/core';
import { palette as P } from '../../../righteousness-by-faith/palette.ts';
import { type Element, argb, el, fragment, ids } from './rml.ts';

type Pt = readonly [number, number];

/** The artboard, and where the figure's feet stand on it (its origin). */
export const ART = { width: 320, height: 300, feet: [160, 280] satisfies Pt } as const;

/** The view model's numbers, and what each means at rest. */
export const KNOBS = {
  /** Where the eyes look, in the figure's units (feet at 0, 0): the face itself looks at us. */
  gazeX: 0,
  gazeY: -165,
  /** How far the head turns after the gaze (the look-at's strength), 0..1. */
  follow: 0,
  /** 1 open to 0 shut. */
  eyes: 1,
  /** The brows' rise, units, negative up. */
  browY: 0,
  /** 0 closed, 1 a small round "oh". */
  mouth: 0,
} as const;
export type Knob = keyof typeof KNOBS;

/** The timelines a host poses, their authored length in seconds, and the share of it its cue spans. */
export const TIMELINES = {
  breath: { seconds: 4, move: 4 },
  bow: { seconds: 1.4, move: 0.35 },
  stamp: { seconds: 0.6, move: 0.2 },
  lift: { seconds: 1.2, move: 0.37 },
  boil: { seconds: 1, move: 1 },
} as const;
export type Timeline = keyof typeof TIMELINES;

const FPS = 60;

// ─── geometry ────────────────────────────────────────────────────────────────

/** An affine matrix, canvas order: x' = a·x + c·y + tx, y' = b·x + d·y + ty. */
type Mat = readonly [number, number, number, number, number, number];
const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const local = (x: number, y: number, r: number): Mat => [
  Math.cos(r),
  Math.sin(r),
  -Math.sin(r),
  Math.cos(r),
  x,
  y,
];
const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Points round an ellipse, clockwise on screen (y down), from its right. */
const ellipse = (cx: number, cy: number, rx: number, ry: number, n: number): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as const;
  });

/**
 * The kit's open mitten at rest (`canvas/hand.ts`, `FORMS.open`, 22 long,
 * PERSON_HAND): its palm's points and its thumb's capsule, turned the way the
 * hand points from its shoulder (rest less `SHOULDER`, [±17, −111]), the far
 * hand the near one's mirror, its centre at (0, 0).
 */
const MITTEN = 22;
const OPEN_PALM: ReadonlyArray<Pt> = [
  [-0.5, -0.26],
  [-0.1, -0.3],
  [0.3, -0.3],
  [0.5, -0.18],
  [0.55, 0.02],
  [0.46, 0.24],
  [0.2, 0.32],
  [-0.2, 0.3],
  [-0.5, 0.24],
];
const capsule = (a: Pt, b: Pt, r: number): Pt[] => {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const out: Pt[] = [];
  for (let i = 0; i <= 4; i++) {
    const t = ang + Math.PI / 2 + (Math.PI * i) / 4;
    out.push([a[0] + Math.cos(t) * r, a[1] + Math.sin(t) * r]);
  }
  for (let i = 0; i <= 4; i++) {
    const t = ang - Math.PI / 2 + (Math.PI * i) / 4;
    out.push([b[0] + Math.cos(t) * r, b[1] + Math.sin(t) * r]);
  }
  return out;
};
const OPEN_THUMB = capsule([-0.2, -0.2], [0.1, -0.55], 0.12);
const REST_ANGLE = Math.atan2(-50 - -111, 42 - 17);
/** A unit mitten part placed for `side`: scaled, turned, and mirrored for the far hand (its order kept clockwise). */
const mittenPart = (unit: ReadonlyArray<Pt>, side: 'near' | 'far'): Pt[] => {
  const c = Math.cos(REST_ANGLE);
  const s = Math.sin(REST_ANGLE);
  const placed = unit.map(([x, y]): Pt => [MITTEN * (c * x - s * y), MITTEN * (s * x + c * y)]);
  return side === 'near' ? placed : placed.map(([x, y]): Pt => [-x, y]).reverse();
};

/** Points round a rounded rectangle centred on (cx, cy), clockwise, `k` to each corner's arc. */
const roundRect = (cx: number, cy: number, w: number, h: number, r: number, k = 3): Pt[] => {
  const out: Pt[] = [];
  const corners: ReadonlyArray<readonly [number, number, number]> = [
    [cx + w / 2 - r, cy - h / 2 + r, -Math.PI / 2],
    [cx + w / 2 - r, cy + h / 2 - r, 0],
    [cx - w / 2 + r, cy + h / 2 - r, Math.PI / 2],
    [cx - w / 2 + r, cy - h / 2 + r, Math.PI],
  ];
  for (const [x, y, a0] of corners)
    for (let i = 0; i <= k; i++) {
      const a = a0 + ((Math.PI / 2) * i) / k;
      out.push([x + r * Math.cos(a), y + r * Math.sin(a)]);
    }
  return out;
};

/** A stain: `ink.ts`'s `blob`, its eleven control points (the canvas look splines them). */
const blob = (x: number, y: number, w: number, h: number, seed: number): Pt[] =>
  Array.from({ length: 11 }, (_, i) => {
    const a = (2 * Math.PI * i) / 11;
    const k = 0.78 + 0.3 * hash2(i, seed);
    return [x + ((Math.cos(a) * w) / 2) * k, y + ((Math.sin(a) * h) / 2) * k] as const;
  });

/** `court.ts`'s `FIGURE_STAIN_SPOTS`, the accused's two stains. */
const STAINS: ReadonlyArray<Pt[]> = [blob(10, -76, 30, 38, 7), blob(-14, -52, 14, 16, 11)];

// ─── the skeleton ────────────────────────────────────────────────────────────

/** A bone: its parent, place (a root's, in its parent's frame), turn and length. */
interface BoneSpec {
  readonly name: string;
  readonly parent?: string;
  readonly x?: number;
  readonly y?: number;
  readonly rotation: number;
  readonly length: number;
}

const UP = -Math.PI / 2;
const DOWN = Math.PI / 2;

/** The body's chain: hips at the waist's foot, chest to the neck (−128, `NECK`), head to its centre, jaw back down to the chin. */
const CHAIN = {
  hips: { name: 'hips', x: 0, y: -20, rotation: UP, length: 50 },
  chest: { name: 'chest', parent: 'hips', rotation: 0, length: 58 },
  head: { name: 'head', parent: 'chest', rotation: 0, length: 37 },
  jaw: { name: 'jaw', parent: 'head', rotation: Math.PI, length: 38 },
} satisfies Record<string, BoneSpec>;

/** The sash's tails, from its knot at the waist, three links each. */
const TAILS = {
  A: [
    { name: 'tailA0', x: 15, y: -40, rotation: DOWN - 0.18, length: 9 },
    { name: 'tailA1', parent: 'tailA0', rotation: 0.06, length: 9 },
    { name: 'tailA2', parent: 'tailA1', rotation: 0.04, length: 9 },
  ],
  B: [
    { name: 'tailB0', x: 17, y: -40, rotation: DOWN + 0.32, length: 8 },
    { name: 'tailB1', parent: 'tailB0', rotation: -0.05, length: 8 },
    { name: 'tailB2', parent: 'tailB1', rotation: -0.03, length: 8 },
  ],
} satisfies Record<'A' | 'B', readonly [BoneSpec, BoneSpec, BoneSpec]>;

/** Every bone: the body's chain, then the sash's tails. */
const BONES: ReadonlyArray<BoneSpec> = [
  CHAIN.hips,
  CHAIN.chest,
  CHAIN.head,
  CHAIN.jaw,
  ...TAILS.A,
  ...TAILS.B,
];

/** Each bone's bind transform in the body's frame (feet at 0, 0), from the chain. */
const BIND: ReadonlyMap<string, Mat> = (() => {
  const m = new Map<string, Mat>();
  for (const b of BONES) {
    const parent = b.parent === undefined ? undefined : BONES.find((p) => p.name === b.parent);
    const base =
      parent === undefined
        ? local(b.x ?? 0, b.y ?? 0, 0)
        : mul(m.get(parent.name) ?? IDENTITY, local(parent.length, 0, 0));
    m.set(b.name, mul(base, local(0, 0, b.rotation)));
  }
  return m;
})();

/** Where the tip of bone `name` is at bind, in the body's frame. */
const tipOf = (name: string): Pt => {
  const m = BIND.get(name) ?? IDENTITY;
  const len = BONES.find((b) => b.name === name)?.length ?? 0;
  return [m[0] * len + m[4], m[1] * len + m[5]];
};
const rootOf = (name: string): Pt => {
  const m = BIND.get(name) ?? IDENTITY;
  return [m[4], m[5]];
};

// ─── building it ─────────────────────────────────────────────────────────────

/**
 * Everything the build hands out ids to, by name, so timelines and binds can
 * reach it, and the fresh timeline's tracks (`freshen`): one property of
 * every path, a unit off at its start and back as cut a frame later.
 */
const build = () => {
  const id = ids();
  const named = new Map<string, string>();
  const idOf = (name: string) => {
    const have = named.get(name);
    if (have !== undefined) return have;
    const made = id();
    named.set(name, made);
    return made;
  };
  const fresh: Record<string, Record<string, ReadonlyArray<K>>> = {};
  /** Put the path `key` on the fresh timeline by its `property`, `value` as cut. */
  const freshen = (key: string, property: 'x' | 'width', value: number) => {
    fresh[key] = {
      [property]: [
        [0, value + 1, 'hold'],
        [1 / FPS, value, 'hold'],
      ],
    };
  };
  return { id, idOf, fresh, freshen };
};

/** A colour as a paint. */
const solid = (hex: string, alpha = 1) => el('SolidColor', { colorValue: argb(hex, alpha) });

/** A figure piece's paint, bottom to top as Rive stacks a shape's paints (last on top). */
interface PieceLook {
  readonly color: string;
  /** Ink outline width, units; 0 for none. */
  readonly line?: number;
  /** The cutout's lift off the sheet, 0..1 (`cutout`'s shadow). */
  readonly shadow?: number;
}

const paints = (p: PieceLook): Element[] => {
  const lift = p.shadow ?? 0.35;
  const out: Element[] = [];
  if (lift > 0)
    out.push(
      el('Fill', { fillRule: 'clockwise', name: 'Shadow' }, [
        solid('#281c10', 0.28 * lift),
        el('Feather', { strength: 10 * lift, offsetX: 2 * lift, offsetY: 5 * lift, name: 'Lift' }),
      ]),
    );
  out.push(el('Fill', { name: 'Paper' }, [solid(p.color)]));
  const line = p.line ?? 3;
  if (line > 0)
    out.push(
      el('Stroke', { thickness: line, join: 'round', cap: 'round', name: 'Ink' }, [
        solid(P.outline),
      ]),
    );
  return out;
};

/** A skinned vertex's weights: up to four (tendon index, share) pairs, packed as `Weight` wants them. */
type Influence = ReadonlyArray<readonly [number, number]>;
const packed = (inf: Influence) => {
  const kept = inf.filter(([, w]) => w > 1e-3).slice(0, 4);
  const total = kept.reduce((s, [, w]) => s + w, 0);
  const bytes = kept.map(([, w]) => Math.round((255 * w) / total));
  // The bytes must total 255 exactly: the largest takes the rounding.
  const drift = 255 - bytes.reduce((s, b) => s + b, 0);
  const big = bytes.indexOf(Math.max(...bytes));
  bytes[big] = (bytes[big] ?? 0) + drift;
  let indices = 0;
  let values = 0;
  kept.forEach(([t], i) => {
    indices += (t + 1) * 2 ** (8 * i);
    values += (bytes[i] ?? 0) * 2 ** (8 * i);
  });
  return { indices, values };
};

/**
 * A closed smooth path through `pts` (Catmull-Rom as mirrored cubics), each
 * vertex weighted by `weigh` to `bones` when given, named so the boil keys it.
 */
const smoothPath = (
  b: ReturnType<typeof build>,
  key: string,
  pts: ReadonlyArray<Pt>,
  skin?: { readonly bones: ReadonlyArray<string>; readonly weigh: (p: Pt) => Influence },
  closed = true,
): Element => {
  const n = pts.length;
  const vertices = pts.map((p, i) => {
    const prev = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)] ?? p;
    const next = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)] ?? p;
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const tension = closed || (i > 0 && i < n - 1) ? 1 : 0;
    const weight =
      skin === undefined
        ? []
        : (() => {
            const w = packed(skin.weigh(p));
            return [
              el('CubicWeight', {
                indices: w.indices,
                values: w.values,
                inIndices: w.indices,
                inValues: w.values,
                outIndices: w.indices,
                outValues: w.values,
              }),
            ];
          })();
    return el(
      'CubicMirroredVertex',
      {
        x: p[0],
        y: p[1],
        rotation: Math.atan2(dy, dx),
        distance: (tension * Math.hypot(dx, dy)) / 6,
        name: `${key}.${i}`,
        id: b.idOf(`${key}.${i}`),
      },
      weight,
    );
  });
  const skinEl =
    skin === undefined
      ? []
      : [
          el(
            'Skin',
            { name: 'Skin' },
            skin.bones.map((bone) => {
              const m = BIND.get(bone) ?? IDENTITY;
              return el('Tendon', {
                boneId: b.idOf(`bone:${bone}`),
                xx: m[0],
                xy: m[1],
                yx: m[2],
                yy: m[3],
                tx: m[4],
                ty: m[5],
                name: bone,
              });
            }),
          ),
        ];
  b.freshen(`${key}.0`, 'x', pts[0]?.[0] ?? 0);
  return el('PointsPath', { isClosed: closed, isClockwise: true, name: 'Path' }, [
    ...vertices,
    ...skinEl,
  ]);
};

/** The torso's two bones blended up the body: hips at the hem, chest from the ribs. */
const torsoWeigh = (p: Pt): Influence => {
  const up = smooth(-38, -100, p[1]);
  return [
    [0, 1 - up],
    [1, up],
  ];
};

/** The head's two bones: the upper head rigid, its lower half riding the jaw. */
const headWeigh = (p: Pt): Influence => {
  const down = smooth(-168, -140, p[1]);
  return [
    [0, 1 - down],
    [1, down],
  ];
};

/** A tail's three links: each vertex shared between the two links it lies between. */
const tailWeigh =
  (tail: 'A' | 'B') =>
  (p: Pt): Influence => {
    const [rx, ry] = rootOf(`tail${tail}0`);
    const along = Math.hypot(p[0] - rx, p[1] - ry);
    const len = BONES.find((b) => b.name === `tail${tail}0`)?.length ?? 9;
    const s = along / len;
    const i = Math.min(2, Math.floor(s));
    const f = s - i;
    if (i >= 2 || f < 0.5) return [[i, 1]];
    return [
      [i, 1.5 - f],
      [i + 1, f - 0.5],
    ];
  };

/** A strip of cloth hanging along a tail's bones, `w0` wide at the knot to `w1` at its end, clockwise. */
const tailStrip = (tail: 'A' | 'B', w0: number, w1: number): Pt[] => {
  const spine: Pt[] = [
    rootOf(`tail${tail}0`),
    tipOf(`tail${tail}0`),
    tipOf(`tail${tail}1`),
    tipOf(`tail${tail}2`),
  ];
  const side = (sgn: number): Pt[] =>
    spine.map((p, i) => {
      const q = spine[Math.min(spine.length - 1, i + 1)] ?? p;
      const o = spine[Math.max(0, i - 1)] ?? p;
      const dx = q[0] - o[0];
      const dy = q[1] - o[1];
      const l = Math.hypot(dx, dy) || 1;
      const w = (w0 + ((w1 - w0) * i) / (spine.length - 1)) / 2;
      return [p[0] - (sgn * dy * w) / l, p[1] + (sgn * dx * w) / l];
    });
  const left = side(1);
  const right = side(-1).reverse();
  return [...left, ...right];
};

/** A shape of the figure: its transform, its path, its paints. */
const shape = (
  b: ReturnType<typeof build>,
  name: string,
  path: Element,
  look: PieceLook,
  at: { x?: number; y?: number } = {},
  extra: ReadonlyArray<Element> = [],
) => el('Shape', { x: at.x, y: at.y, name, id: b.idOf(name) }, [path, ...paints(look), ...extra]);

// ─── timelines ───────────────────────────────────────────────────────────────

/** A key: its second, its value, and how it leaves for the next ('io' eases in and out). */
type K = readonly [number, number, ('io' | 'out' | 'in' | 'linear' | 'hold')?];

const CURVES = {
  io: [0.42, 0, 0.58, 1],
  out: [0.15, 0.6, 0.35, 1],
  in: [0.5, 0, 0.85, 0.4],
} as const;

const keyframes = (keys: ReadonlyArray<K>, fps = FPS): Element[] =>
  keys.map(([s, value, how = 'io']) => {
    const frame = Math.round(s * fps);
    if (how === 'hold' || how === 'linear')
      return el('KeyFrameDouble', { value, frame, interpolationType: how });
    const [x1, y1, x2, y2] = CURVES[how];
    return el('KeyFrameDouble', { value, frame, interpolationType: 'cubic' }, [
      el('CubicEaseInterpolator', { x1, y1, x2, y2 }),
    ]);
  });

/** One timeline: object name → property → keys. */
type Tracks = Readonly<Record<string, Readonly<Record<string, ReadonlyArray<K>>>>>;

const timeline = (
  b: ReturnType<typeof build>,
  name: string,
  seconds: number,
  tracks: Tracks,
  fps = FPS,
  loop = false,
) =>
  el(
    'LinearAnimation',
    {
      fps,
      duration: Math.round(seconds * fps),
      loopValue: loop ? 'loop' : 'oneShot',
      name,
      id: b.idOf(`anim:${name}`),
    },
    Object.entries(tracks).map(([object, props]) =>
      el(
        'KeyedObject',
        { objectId: b.idOf(object) },
        Object.entries(props).map(([property, keys]) =>
          el('KeyedProperty', { property }, keyframes(keys, fps)),
        ),
      ),
    ),
  );

/**
 * A lagging swing: a link of cloth starting from `from`, kicked toward `kick`
 * `lag` s after the body moves, overshooting back and settling at `to`.
 */
const swing = (from: number, to: number, kick: number, lag: number, start = 0): K[] => [
  [0, from],
  [start + lag, from, 'io'],
  [start + lag + 0.16, to + kick, 'io'],
  [start + lag + 0.38, to - kick * 0.45, 'io'],
  [start + lag + 0.62, to + kick * 0.15, 'io'],
  [start + lag + 0.9, to],
];

/**
 * The contact shadow: the engine's `ground` (100 wide, 12 % as tall, 0.28 at
 * its heart, gone at its rim) as a feathered ellipse, matched by eye in the
 * Rive Renderer. A feather spreads a thin shape's ink, so the ellipse is
 * smaller and darker than the shadow it makes. Rive's Canvas 2D renderer
 * draws no feather: there it is a hard ellipse.
 */
const GROUND = { width: 84, height: 8, alpha: 0.55, feather: 8 } as const;

/** The face's centre in the head's upright frame (the neck at 0, 0): `HEAD` less `NECK`. Its keys are this plus an offset. */
const FACE_Y = -37;

/** The pose the bow ends in, which the lift starts from. */
const BOWED = {
  chestRot: 0.045,
  chestLen: 0.93,
  headRot: 0.15,
  jaw: 0.88,
  faceY: 6,
  faceSy: 0.9,
  handY: 3,
  handX: -3,
  bodyY: 0,
} as const;

/** Every tail link's rest turn. */
const restOf = (name: string) => BONES.find((b) => b.name === name)?.rotation ?? 0;

/** The tails' swing on a move starting at `start`, from `from` (rest + offset per link), each link later and wider. */
const tails = (kick: number, start: number, from = 0, to = 0) =>
  Object.fromEntries(
    (['A', 'B'] as const).flatMap((tail) =>
      [0, 1, 2].map((i) => {
        const name = `tail${tail}${i}`;
        const r = restOf(name);
        const amp = kick * (1 + 0.5 * i) * (tail === 'A' ? 1 : 0.8);
        const swung = swing(
          r + from * (i === 0 ? 1 : 0.3),
          r + to * (i === 0 ? 1 : 0.3),
          amp,
          0.05 + 0.06 * i,
          start,
        );
        return [`bone:${name}`, { rotation: swung }] as const;
      }),
    ),
  );

// ─── the file ────────────────────────────────────────────────────────────────

/** The accused's whole Rive project file. */
export const accusedRml = (): string => {
  const b = build();
  const { idOf } = b;

  const bone = (spec: BoneSpec, children: ReadonlyArray<Element>): Element =>
    el(
      spec.parent === undefined ? 'RootBone' : 'Bone',
      {
        x: spec.parent === undefined ? spec.x : undefined,
        y: spec.parent === undefined ? spec.y : undefined,
        rotation: spec.rotation,
        length: spec.length,
        name: spec.name,
        id: idOf(`bone:${spec.name}`),
      },
      children,
    );
  const vm = idOf('vm');
  /** A view-model number's id, by its name (a `KNOBS` key). */
  const prop = (k: string) => idOf(`vm:${k}`);
  const bind = (k: Knob, propertyKey: number) =>
    el('DataBindContext', { sourcePathIds: `${vm}-${prop(k)}`, propertyKey });
  /** An ellipse `w` × `h` about its shape's origin, on the fresh timeline as `key`. */
  const ellipsePath = (key: string, w: number, h: number) => {
    b.freshen(key, 'width', w);
    return el('Ellipse', {
      width: w,
      height: h,
      originX: 0.5,
      originY: 0.5,
      name: 'Path',
      id: idOf(key),
    });
  };

  // The face, in the head's own frame turned upright (origin at the neck, x right, y down).
  const eye = (side: 'L' | 'R', x: number) =>
    el('Shape', { x, y: -7, name: `eye${side}`, id: idOf(`eye${side}`) }, [
      ellipsePath(`eye${side}:path`, 6.4, 8.4),
      el('Fill', { name: 'Ink' }, [solid(P.outline)]),
      // Pulled toward the gaze, then held inside its socket.
      el('TranslationConstraint', { targetId: idOf('gaze'), strength: 0.03, name: 'Look' }),
      el('DistanceConstraint', {
        targetId: idOf(`socket${side}`),
        distance: 3,
        modeValue: 'closer',
        name: 'Socket',
      }),
      bind('eyes', 17),
    ]);
  const brow = (side: -1 | 1) =>
    el('Shape', { x: side * 13, y: -21, name: `brow${side}`, id: idOf(`brow${side}`) }, [
      smoothPath(
        b,
        `brow${side}`,
        [
          [-8, 0],
          [8, 0],
        ],
        undefined,
        false,
      ),
      el('Stroke', { thickness: 3.4, cap: 'round', name: 'Ink' }, [solid(P.outline)]),
    ]);
  const face = el('Node', { x: 0, y: FACE_Y, name: 'face', id: idOf('face') }, [
    el('Node', { name: 'brows', id: idOf('brows') }, [bind('browY', 14), brow(-1), brow(1)]),
    eye('L', -12),
    eye('R', 13),
    el('Shape', { x: 2, y: 16, scaleX: 0, scaleY: 0, name: 'mouth', id: idOf('mouth') }, [
      ellipsePath('mouth:path', 6, 8),
      el('Fill', { name: 'Ink' }, [solid(P.outline)]),
      bind('mouth', 16),
      bind('mouth', 17),
    ]),
    el('Node', { x: -12, y: -7, name: 'socketL', id: idOf('socketL') }),
    el('Node', { x: 13, y: -7, name: 'socketR', id: idOf('socketR') }),
  ]);
  const headSpace = el('Node', { rotation: Math.PI / 2, name: 'headSpace' }, [face]);

  const skeleton = bone(CHAIN.hips, [
    bone(CHAIN.chest, [
      bone(CHAIN.head, [
        headSpace,
        // The head turns after the eyes (`follow` of the way). The runtime's IK keeps its last
        // solve where the head bone is not dirtied, so the prop re-dirties it each frame
        // (`RiveSource.refresh`): without that a frame depends on the frame drawn before it.
        el(
          'IKConstraint',
          {
            targetId: idOf('gaze'),
            parentBoneCount: 0,
            strength: 0,
            name: 'Follow',
            id: idOf('follow'),
          },
          [bind('follow', 172)],
        ),
        bone(CHAIN.jaw, []),
      ]),
    ]),
  ]);
  const tailBones = (['A', 'B'] as const).map((t) => {
    const [root, mid, tip] = TAILS[t];
    return bone(root, [bone(mid, [bone(tip, [])])]);
  });

  const torsoSkin = { bones: ['hips', 'chest'], weigh: torsoWeigh };
  const mitten = (side: 'near' | 'far', x: number) =>
    el('Node', { x, y: -50, name: `${side}Breath`, id: idOf(`${side}Breath`) }, [
      el('Node', { name: `${side}Hand`, id: idOf(`${side}Hand`) }, [
        // The palm over the thumb, which stands behind it, open.
        shape(b, `${side}Mitten`, smoothPath(b, `${side}Mitten`, mittenPart(OPEN_PALM, side)), {
          color: P.figure,
          line: 2.5,
        }),
        shape(b, `${side}Thumb`, smoothPath(b, `${side}Thumb`, mittenPart(OPEN_THUMB, side)), {
          color: P.figure,
          line: 2.5,
        }),
      ]),
    ]);

  const body = el('Node', { name: 'body', id: idOf('body') }, [
    // Front to back: the first child draws on top.
    mitten('near', 42),
    skeleton,
    shape(
      b,
      'head',
      smoothPath(b, 'head', ellipse(0, -165, 35, 38, 18), {
        bones: ['head', 'jaw'],
        weigh: headWeigh,
      }),
      { color: P.figure },
    ),
    ...(['A', 'B'] as const).map((t) =>
      shape(
        b,
        `tail${t}`,
        smoothPath(b, `tail${t}`, tailStrip(t, t === 'A' ? 8 : 7, t === 'A' ? 10 : 8), {
          bones: [`tail${t}0`, `tail${t}1`, `tail${t}2`],
          weigh: tailWeigh(t),
        }),
        { color: P.scarlet, line: 2, shadow: 0.2 },
      ),
    ),
    shape(b, 'knot', smoothPath(b, 'knot', ellipse(16, -40, 6, 5, 8), torsoSkin), {
      color: P.scarlet,
      line: 2,
      shadow: 0.2,
    }),
    shape(b, 'sash', smoothPath(b, 'sash', roundRect(0, -40, 70, 8, 3, 1), torsoSkin), {
      color: P.scarlet,
      line: 2,
      shadow: 0.15,
    }),
    ...STAINS.map((pts, i) =>
      shape(b, `stain${i}`, smoothPath(b, `stain${i}`, pts, torsoSkin), {
        color: P.scarlet,
        line: 0,
        shadow: 0.1,
      }),
    ),
    shape(b, 'tunic', smoothPath(b, 'tunic', roundRect(0, -72, 66, 112, 22, 3), torsoSkin), {
      color: P.figure,
    }),
    ...[-13, 13].map((x) =>
      shape(b, `leg${x}`, smoothPath(b, `leg${x}`, roundRect(x, -10, 16, 22, 5, 2)), {
        color: P.figureShade,
        line: 2.5,
      }),
    ),
    mitten('far', -42),
    ...tailBones,
  ]);

  const figure = el('Node', { x: ART.feet[0], y: ART.feet[1], name: 'figure' }, [
    el('Node', { x: KNOBS.gazeX, y: KNOBS.gazeY, name: 'gaze', id: idOf('gaze') }, [
      bind('gazeX', 13),
      bind('gazeY', 14),
    ]),
    body,
    // The contact shadow under the feet (`ground`), softened by a feather.
    el('Shape', { x: 0, y: 2, name: 'ground' }, [
      ellipsePath('ground:path', GROUND.width, GROUND.height),
      el('Fill', { fillRule: 'clockwise', name: 'Shade' }, [
        solid('#281c10', GROUND.alpha),
        el('Feather', { strength: GROUND.feather, name: 'Soft' }),
      ]),
    ]),
  ]);

  // ─── the timelines ───
  const bow = timeline(b, 'bow', TIMELINES.bow.seconds, {
    'bone:chest': {
      rotation: [
        [0, 0],
        [0.33, BOWED.chestRot + 0.01, 'io'],
        [0.5, BOWED.chestRot],
      ],
      scaleX: [
        [0, 1, 'out'],
        [0.3, BOWED.chestLen - 0.01, 'io'],
        [0.52, BOWED.chestLen],
      ],
    },
    'bone:head': {
      rotation: [
        [0, 0],
        [0.06, 0, 'out'],
        [0.4, BOWED.headRot + 0.03, 'io'],
        [0.62, BOWED.headRot],
      ],
    },
    'bone:jaw': {
      scaleX: [
        [0, 1],
        [0.06, 1, 'out'],
        [0.38, BOWED.jaw],
      ],
    },
    face: {
      y: [
        [0, FACE_Y],
        [0.04, FACE_Y, 'out'],
        [0.36, FACE_Y + BOWED.faceY + 1, 'io'],
        [0.56, FACE_Y + BOWED.faceY],
      ],
      scaleY: [
        [0, 1],
        [0.04, 1, 'out'],
        [0.36, BOWED.faceSy],
      ],
    },
    nearHand: {
      y: [
        [0, 0],
        [0.08, 0, 'out'],
        [0.42, BOWED.handY + 1, 'io'],
        [0.66, BOWED.handY],
      ],
      x: [
        [0, 0],
        [0.4, BOWED.handX],
      ],
    },
    farHand: {
      y: [
        [0, 0],
        [0.14, 0, 'out'],
        [0.48, BOWED.handY + 1, 'io'],
        [0.72, BOWED.handY],
      ],
      x: [
        [0, 0],
        [0.46, -BOWED.handX],
      ],
    },
    body: {
      y: [
        [0, 0],
        [0.1, 1.6, 'io'],
        [0.36, BOWED.bodyY],
      ],
    },
    ...tails(0.16, 0.0),
  });

  const lift = timeline(b, 'lift', TIMELINES.lift.seconds, {
    'bone:chest': {
      rotation: [
        [0, BOWED.chestRot],
        [0.3, -0.012, 'io'],
        [0.6, 0],
      ],
      scaleX: [
        [0, BOWED.chestLen, 'out'],
        [0.26, 1.035, 'io'],
        [0.46, 0.995, 'io'],
        [0.66, 1],
      ],
    },
    'bone:head': {
      rotation: [
        [0, BOWED.headRot, 'out'],
        [0.3, -0.06, 'io'],
        [0.52, 0.012, 'io'],
        [0.74, 0],
      ],
    },
    'bone:jaw': {
      scaleX: [
        [0, BOWED.jaw, 'out'],
        [0.26, 1.05, 'io'],
        [0.56, 1],
      ],
    },
    face: {
      y: [
        [0, FACE_Y + BOWED.faceY, 'out'],
        [0.26, FACE_Y - 3, 'io'],
        [0.54, FACE_Y],
      ],
      scaleY: [
        [0, BOWED.faceSy, 'out'],
        [0.26, 1.04, 'io'],
        [0.54, 1],
      ],
    },
    nearHand: {
      y: [
        [0, BOWED.handY],
        [0.06, BOWED.handY, 'out'],
        [0.36, -5, 'io'],
        [0.66, 0],
      ],
      x: [
        [0, BOWED.handX],
        [0.5, 0],
      ],
    },
    farHand: {
      y: [
        [0, BOWED.handY],
        [0.12, BOWED.handY, 'out'],
        [0.42, -5, 'io'],
        [0.72, 0],
      ],
      x: [
        [0, -BOWED.handX],
        [0.56, 0],
      ],
    },
    body: {
      y: [
        [0, BOWED.bodyY, 'out'],
        [0.22, -2.2, 'io'],
        [0.5, 0],
      ],
    },
    ...tails(-0.2, 0.0),
  });

  const stamp = timeline(b, 'stamp', TIMELINES.stamp.seconds, {
    body: {
      scaleY: [
        [0, 1, 'out'],
        [0.05, 0.972, 'io'],
        [0.24, 1.008, 'io'],
        [0.4, 1],
      ],
      scaleX: [
        [0, 1, 'out'],
        [0.05, 1.012, 'io'],
        [0.24, 0.997, 'io'],
        [0.4, 1],
      ],
    },
  });

  const breath = timeline(
    b,
    'breath',
    TIMELINES.breath.seconds,
    {
      'bone:chest': {
        scaleY: [
          [0, 1],
          [2, 1.025],
          [4, 1],
        ],
      },
      nearBreath: {
        y: [
          [0, -50],
          [2, -51.6],
          [4, -50],
        ],
      },
      farBreath: {
        y: [
          [0, -50],
          [0.3, -50],
          [2.3, -51.6],
          [4, -50],
        ],
      },
    },
    FPS,
    true,
  );

  // The boil: every outline vertex of the paper re-jittered twelve times a second, held between.
  const boilKeys: Record<string, Record<string, K[]>> = {};
  const r = rng(1888);
  const jitter = (key: string, pts: ReadonlyArray<Pt>, amp: number) =>
    pts.forEach((p, i) => {
      const xs: K[] = [];
      const ys: K[] = [];
      for (let tick = 0; tick < 12; tick++) {
        xs.push([tick / 12, p[0] + (r() - 0.5) * 2 * amp, 'hold']);
        ys.push([tick / 12, p[1] + (r() - 0.5) * 2 * amp, 'hold']);
      }
      boilKeys[`${key}.${i}`] = { x: xs, y: ys };
    });
  jitter('head', ellipse(0, -165, 35, 38, 18), 0.45);
  jitter('tunic', roundRect(0, -72, 66, 112, 22, 3), 0.45);
  for (const side of ['near', 'far'] as const) {
    jitter(`${side}Mitten`, mittenPart(OPEN_PALM, side), 0.35);
    jitter(`${side}Thumb`, mittenPart(OPEN_THUMB, side), 0.3);
  }
  for (const x of [-13, 13]) jitter(`leg${x}`, roundRect(x, -10, 16, 22, 5, 2), 0.35);
  STAINS.forEach((pts, i) => jitter(`stain${i}`, pts, 0.6));
  const boil = el(
    'LinearAnimation',
    { fps: 12, duration: 12, loopValue: 'loop', name: 'boil', id: idOf('anim:boil') },
    Object.entries(boilKeys).map(([object, props]) =>
      el(
        'KeyedObject',
        { objectId: idOf(object) },
        Object.entries(props).map(([property, keys]) =>
          el('KeyedProperty', { property }, keyframes(keys, 12)),
        ),
      ),
    ),
  );
  const idle = el('LinearAnimation', {
    fps: FPS,
    duration: 1,
    name: 'idle',
    id: idOf('anim:idle'),
  });
  // Every path a unit off and back as cut (`RiveSource.fresh`): the engine plays it
  // first each frame, so every shape is remade from that frame's own transforms.
  const fresh = timeline(b, 'fresh', 2 / FPS, b.fresh);

  const artboard = el(
    'Artboard',
    {
      defaultStateMachineId: idOf('sm'),
      viewModelId: vm,
      viewModelInstanceId: idOf('vm:default'),
      width: ART.width,
      height: ART.height,
      clip: false,
      name: 'Accused',
      id: idOf('artboard'),
    },
    [
      figure,
      // A machine that only idles: it is what applies the view model's binds.
      el('StateMachine', { name: 'Knobs', id: idOf('sm') }, [
        el('StateMachineLayer', { name: 'Idle' }, [
          el('EntryState', {}, [el('StateTransition', { stateToId: idOf('state:idle') })]),
          el('AnimationState', { animationId: idOf('anim:idle'), id: idOf('state:idle') }),
        ]),
      ]),
      idle,
      breath,
      bow,
      stamp,
      lift,
      boil,
      fresh,
    ],
  );

  const viewModel = el(
    'ViewModel',
    { defaultInstanceId: idOf('vm:default'), name: 'Accused', id: vm },
    [
      ...Object.keys(KNOBS).map((k) => el('ViewModelPropertyNumber', { name: k, id: prop(k) })),
      el(
        'ViewModelInstance',
        { exports: true, name: 'Default', id: idOf('vm:default') },
        Object.entries(KNOBS).map(([k, v]) =>
          el('ViewModelInstanceNumber', { propertyValue: v, viewModelPropertyId: prop(k) }),
        ),
      ),
    ],
  );

  return fragment([artboard, viewModel]);
};
