// A robed standing figure as a Rive rig, on the house generator's parts: its
// head traced from its concept (the outline inside the ink, and the hair or
// headcloth, beard and ear inside it), cut with one ink line round the whole
// (`silhouette`), the face kit at its place; a long robe with what lies on
// it (a sash, the shade of a neckline) laid as colour clipped to it, and its
// feet under the hem. Christ is one (`christ-rig.ts`), and every robed
// figure of the cast is another: a figure is its traced measures and its
// papers (`Robed`), the rig the same for each. Its circle hands are the hand
// rig's, drawn by the host where they work.
//
// Units are the Board's pixels; the feet are the artboard's origin.
//
// The host poses a robed figure by its view model, every frame: the face
// kit's numbers (`FACE`); `lean`, radians about its feet; `tilt`, radians,
// its head about its neck; `nod`, units, its head down toward its chest.
// The rig keeps its `breath` and the paper's `boil`.
//
// Where its papers meet, the one behind is tucked under the one in front
// (`tucked`): the head's paper under its hair, beard and headcloth, and
// each of those under the ones laid over it, so no sliver of skin shows at
// their seams or round the silhouette as their outlines crawl.

import type { Pt } from '@bible/film/style';
import {
  FACE,
  type Figure,
  type PieceLook,
  artboard,
  boilTimeline,
  el,
  faceKit,
  gazeTarget,
  piece,
  silhouette,
  timeline,
  tucked,
  tuckedRimmed,
} from '@bible/film/style/rig';

/** One paper of a figure: its outline, units, and its paint. */
export interface RobedPart {
  readonly key: string;
  readonly pts: ReadonlyArray<Pt>;
  readonly look: PieceLook;
  /** Its outline's crawl, units (the generator's default when left out). */
  readonly boil?: number;
}

/** The face kit's place on the head (from its centre), its scale, and the marks its concept draws. */
type FaceAt = Parameters<typeof faceKit>[1] & {
  /** The marks' turn on the head, radians: a face the concept draws tipped (a head turned up and aside). */
  readonly rotation?: number;
  /** Each eye's lean past the marks' turn, radians (negative: its top toward screen left), as a turned head's concept leans them. */
  readonly eyeLean?: number;
};

/** A Rive element as the generator writes it. */
type Element = ReturnType<typeof el>;

/** The face kit's eyes, by their shapes' names. */
const EYES: ReadonlySet<unknown> = new Set(['eyeL', 'eyeR']);

/** `node` with each eye shape in it leaned `lean` radians about its centre. */
const leanEyes = (node: Element, lean: number): Element => {
  const named = node.attrs.find(([k]) => k === 'name')?.[1];
  const attrs = Object.fromEntries(node.attrs);
  const own = node.name === 'Shape' && EYES.has(named);
  return el(
    node.name,
    own ? { ...attrs, rotation: lean } : attrs,
    node.children.map((c) => leanEyes(c, lean)),
  );
};
type FaceMarks = NonNullable<Parameters<typeof faceKit>[2]>;

/**
 * An arm in its sleeve to the wrist, swung by the host: the sleeve's paper
 * in the pose it is traced in, from the feet, turned by the number `knob`
 * (radians, 0 that pose) about `pivot`, a point inside the robe, so its root
 * stays under the robe's paper however it swings. The host draws its circle
 * hand at the cuff.
 */
interface RobedArm {
  readonly knob: string;
  readonly pivot: Pt;
  readonly sleeve: RobedPart;
}

/** A robed figure: its measures, head, face, robe and feet. */
export interface Robed {
  /** Its artboard, and where its feet stand on it. */
  readonly art: { readonly width: number; readonly height: number; readonly feet: Pt };
  /** Its head's centre, from the feet, and the robe's top under it (the neck), units. */
  readonly head: { readonly x: number; readonly y: number };
  readonly neck: number;
  /** The head: its outline inside the ink, about its centre, and its skin. */
  readonly outline: ReadonlyArray<Pt>;
  readonly skin: PieceLook;
  readonly face: FaceAt;
  readonly marks: FaceMarks;
  /**
   * What is cut in one outline with the head, front first, about the head's
   * centre: a lip in the beard, the beard, the ear, the hair or headcloth.
   * The face kit lies over them all.
   */
  readonly cut: ReadonlyArray<RobedPart>;
  /** The robe, from the feet, and its paper with what lies on it (`tones`). */
  readonly robe: ReadonlyArray<Pt>;
  readonly robeLook: PieceLook;
  /**
   * Its arms that reach past the robe, each laid behind the robe's paper and
   * cut in one outline with it, so a sleeve grows out of the robe with no
   * line where it leaves it. An arm that lies on the robe is a tone of it.
   */
  readonly arms?: ReadonlyArray<RobedArm>;
  /** The feet under the hem, front first: each foot, its sole, its strap. */
  readonly feet: ReadonlyArray<RobedPart>;
  /** Its breath's period, seconds. */
  readonly breath: number;
}

/** A face's marks as its concept draws them, in the concept's pixels: each eye's centre and size, each brow's ends and stroke, the mouth's ends and stroke. */
interface TracedMarks {
  readonly eyes: readonly [Pt, Pt];
  readonly eye: readonly [number, number];
  readonly brows: readonly [readonly [Pt, Pt], readonly [Pt, Pt]];
  readonly brow: number;
  readonly mouth: readonly [Pt, Pt];
  readonly mouthLine: number;
}

/** The face kit's place on the head and its marks, from marks traced in a concept. */
interface TracedFace {
  readonly at: FaceAt;
  readonly marks: FaceMarks;
}

/**
 * The face kit's place and marks for marks traced in a concept's pixels,
 * `panel` taking a pixel to units about the head's centre: the kit sits at
 * the eyes' middle, turned as the line through the eyes tips, each mark in
 * that turned frame; `turn` is how far the features slide after the gaze.
 */
export const tracedFace = (
  m: TracedMarks,
  panel: { readonly scale: number; readonly head: Pt },
  turn: number,
): TracedFace => {
  const [l, r] = m.eyes;
  const c: Pt = [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2];
  const rotation = Math.atan2(r[1] - l[1], r[0] - l[0]);
  const [cos, sin] = [Math.cos(-rotation), Math.sin(-rotation)];
  const r2 = (v: number) => +v.toFixed(2);
  const local = ([x, y]: Pt): Pt => {
    const [dx, dy] = [x - c[0], y - c[1]];
    return [(dx * cos - dy * sin) * panel.scale, (dx * sin + dy * cos) * panel.scale];
  };
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const half = (a: Pt, b: Pt) => (Math.hypot(b[0] - a[0], b[1] - a[1]) / 2) * panel.scale;
  const [eyeL, eyeR] = [local(l), local(r)];
  const [browL, browR] = [local(mid(...m.brows[0])), local(mid(...m.brows[1]))];
  const mouth = local(mid(...m.mouth));
  return {
    at: {
      x: r2((c[0] - panel.head[0]) * panel.scale),
      y: r2((c[1] - panel.head[1]) * panel.scale),
      scale: 1,
      rotation: r2(rotation),
    },
    marks: {
      eyes: [r2(eyeL[0]), r2(eyeR[0])],
      eyeY: r2((eyeL[1] + eyeR[1]) / 2),
      eye: [r2(m.eye[0] * panel.scale), r2(m.eye[1] * panel.scale)],
      turn,
      brows: [r2(browL[0]), r2(browR[0])],
      browY: r2((browL[1] + browR[1]) / 2),
      browHalf: r2((half(...m.brows[0]) + half(...m.brows[1])) / 2),
      brow: r2(m.brow * panel.scale),
      mouth: [r2(mouth[0]), r2(mouth[1])],
      mouthHalf: r2(half(...m.mouth)),
      mouthLine: r2(m.mouthLine * panel.scale),
    },
  };
};

/** The view model's numbers at rest for a figure looking at `gaze`, upright: the kit's, and `over` for its own. */
export const robedKnobs = (gaze: Pt, over: Partial<Record<keyof typeof FACE, number>> = {}) =>
  ({
    ...FACE,
    ...over,
    gazeX: gaze[0],
    gazeY: gaze[1],
    lean: 0,
    tilt: 0,
    nod: 0,
  }) as const;

/** A robed figure's numbers, by name. */
export type RobedKnob = keyof ReturnType<typeof robedKnobs>;

export const ROBED_TIMELINES = {
  breath: { seconds: 5, move: 5 },
  boil: { seconds: 4, move: 4 },
} as const;
export type RobedTimeline = keyof typeof ROBED_TIMELINES;

/** The face `check` reads: its node, and the head's height. */
export const robedFaceCheck = (r: Robed) => {
  const ys = r.outline.map((p) => p[1]);
  return { node: 'face', height: Math.max(...ys) - Math.min(...ys) } as const;
};

const KEY = { y: 14, rotation: 15 } as const;

/** How far the head's paper lies under the seams of the papers over it past its rim's width, units. */
const TUCK_UNDER_RIM = 2;

/**
 * The head's papers, front first, each tucked under those laid over it, the
 * head's own last: when it draws a rim, its rim's width and more under their
 * seams over it (`tuckedRimmed`), as only it draws one.
 */
const tuckedHead = (r: Robed): RobedPart[] => {
  const parts = [...r.cut, { key: 'headPaper', pts: r.outline, look: r.skin }];
  const base = parts.length - 1;
  return parts.map((p, i) => {
    const fronts = parts.slice(0, i).map((q) => q.pts);
    const rim = p.look.rim ?? 0;
    const pts =
      i === base && rim > 0
        ? tuckedRimmed(p.pts, fronts, TUCK_UNDER_RIM + rim)
        : tucked(p.pts, fronts);
    return { ...p, pts };
  });
};

/** An arm's sleeve on its pivot, turned by its number. */
const armOf = (fig: Figure, a: RobedArm): Element => {
  const name = `${a.sleeve.key}Arm`;
  return el('Node', { x: a.pivot[0], y: a.pivot[1], name, id: fig.idOf(name) }, [
    fig.bind(a.knob, KEY.rotation),
    el('Node', { x: -a.pivot[0], y: -a.pivot[1], name: `${a.sleeve.key}At` }, [
      piece(fig, a.sleeve.key, a.sleeve.pts, a.sleeve.look, { boil: a.sleeve.boil ?? 0.9 }),
    ]),
  ]);
};

/** The robe's paper, and its arms behind it in one outline with it when it has any. */
const robeOf = (fig: Figure, r: Robed): Element => {
  const arms = r.arms ?? [];
  if (arms.length === 0) return piece(fig, 'robe', r.robe, r.robeLook);
  return silhouette(fig, 'robeCut', [
    { key: 'robe', pts: r.robe, look: r.robeLook },
    ...arms.map((a) => armOf(fig, a)),
  ]);
};

/** The robed figure `r`, at rest at `knobs` (its own numbers past the kit's), as its artboard and view model. */
export const robedRig = (
  fig: Figure,
  r: Robed,
  knobs: Readonly<Record<RobedKnob, number>> & Readonly<Record<string, number>>,
) => {
  // The robe breathes about its hem.
  const hem = Math.max(...r.robe.map((p) => p[1]));
  const { rotation, eyeLean, ...faceAt } = r.face;
  const kit = faceKit(fig, faceAt, r.marks);
  const face = eyeLean === undefined ? kit : leanEyes(kit, eyeLean);
  const headNode = el('Node', { y: r.neck, name: 'neck', id: fig.idOf('neck') }, [
    el('Node', { name: 'head', id: fig.idOf('head') }, [
      fig.bind('tilt', KEY.rotation),
      el('Node', { name: 'nodded', id: fig.idOf('nodded') }, [
        fig.bind('nod', KEY.y),
        el('Node', { x: r.head.x, y: r.head.y - r.neck, name: 'skull' }, [
          silhouette(fig, 'headCut', [
            rotation === undefined
              ? face
              : el('Node', { x: faceAt.x, y: faceAt.y, rotation, name: 'faceTurn' }, [
                  el('Node', { x: -faceAt.x, y: -faceAt.y, name: 'faceAt' }, [face]),
                ]),
            ...tuckedHead(r),
          ]),
        ]),
      ]),
    ]),
  ]);
  // Rive draws a node's children front first: the head over the robe, the robe over the feet.
  const body = el('Node', { name: 'body', id: fig.idOf('body') }, [
    fig.bind('lean', KEY.rotation),
    headNode,
    el('Node', { y: hem, name: 'trunk', id: fig.idOf('trunk') }, [
      el('Node', { y: -hem, name: 'robeSide' }, [robeOf(fig, r)]),
    ]),
    ...r.feet.map((p) => piece(fig, p.key, p.pts, p.look, { boil: p.boil ?? 0.6 })),
  ]);
  const figure = el('Node', { x: r.art.feet[0], y: r.art.feet[1], name: 'figure' }, [
    gazeTarget(fig, knobs),
    body,
  ]);
  const half = r.breath / 2;
  const breath = timeline(
    fig,
    'breath',
    r.breath,
    {
      trunk: {
        scaleY: [
          [0, 1],
          [half, 1.008],
          [r.breath, 1],
        ],
      },
      neck: {
        y: [
          [0, r.neck],
          [half, r.neck - 2.5],
          [r.breath, r.neck],
        ],
      },
    },
    { loop: true },
  );
  return artboard(fig, r.art, [figure], [breath, boilTimeline(fig)], knobs);
};
