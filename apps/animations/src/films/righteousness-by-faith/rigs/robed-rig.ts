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
type FaceAt = Parameters<typeof faceKit>[1];
type FaceMarks = NonNullable<Parameters<typeof faceKit>[2]>;

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
  /** The feet under the hem, front first: each foot, its sole, its strap. */
  readonly feet: ReadonlyArray<RobedPart>;
  /** Its breath's period, seconds. */
  readonly breath: number;
}

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

/** The robed figure `r`, at rest at `knobs`, as its artboard and view model. */
export const robedRig = (fig: Figure, r: Robed, knobs: Readonly<Record<RobedKnob, number>>) => {
  // The robe breathes about its hem.
  const hem = Math.max(...r.robe.map((p) => p[1]));
  const headNode = el('Node', { y: r.neck, name: 'neck', id: fig.idOf('neck') }, [
    el('Node', { name: 'head', id: fig.idOf('head') }, [
      fig.bind('tilt', KEY.rotation),
      el('Node', { name: 'nodded', id: fig.idOf('nodded') }, [
        fig.bind('nod', KEY.y),
        el('Node', { x: r.head.x, y: r.head.y - r.neck, name: 'skull' }, [
          silhouette(fig, 'headCut', [
            faceKit(fig, r.face, r.marks),
            ...r.cut,
            { key: 'headPaper', pts: r.outline, look: r.skin },
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
      el('Node', { y: -hem, name: 'robeSide' }, [piece(fig, 'robe', r.robe, r.robeLook)]),
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
