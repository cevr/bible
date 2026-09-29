// Declared. The page, close on the viewer's figure in their stained garment,
// and the act's one word card: JUSTIFY, δικαιόω, made righteous. The
// figure looks down at the card, doubtful (`still`). On `cover` the card
// goes and the cold open's hollow verdict drifts in over the figure's head,
// the same label at the same size on screen; on `would` it goes round the
// face to lie over the stains on their chest, a cover-up if God only said the
// words, and on `subst` ("But") it goes back round, the stains still there.
// It never crosses the face. Through Waggoner's quotation (`w`) its letters
// fill with gold word by word; once the quotation ends it takes its weight,
// solid, and goes round the face into the chest, its letters kept until it is
// inside, and the chest glows as it enters. On `voice` the camera eases back and the dawn from `spoke` opens in a panel
// behind the figure; the same word of light arcs out of its sun and lands on
// the chest (`speaks`). On `made` its light spreads through the garment from
// inside: the stains wash out, the nearest first, and the grey paper of the
// cloth warms toward cream: made righteous, not covered.

import {
  type Camera,
  type Place,
  type Pt,
  at,
  camera,
  drawing,
  probePlate,
  rectShape,
  shotPath,
  write,
} from '@bible/film/canvas';
import { type Key, clamp, ease, lerp } from '@bible/film/core';
import {
  type Hands,
  type Person,
  C,
  F,
  blob,
  clipToGarment,
  glow,
  knobCamera,
  mix,
  person,
  piece,
} from '../kit.ts';
import { type Stamp, FIGURE_STAIN_SPOTS, REST as COURT, stamp } from '../court.ts';
import { DAWN_DONE, SUN, arc, dawn, flight } from '../spoken.ts';

const FS = 3.8;
/** The figure's chest this frame, where the verdict sinks and the word lands (scratch, set from the `fig` knob). */
const CHEST: [number, number] = [0, 0];

/** The unmoved frame the scene rests on (the canvas itself, so not a knob). */
const REST: Camera = { x: 960, y: 540, zoom: 1 };

/** Where the verdict drifts in from, level with where it hangs: across from where the card was. */
const STAMP_FROM_X = 1240;
/**
 * The column the verdict passes down, clear of the face: the head's right
 * edge (its 35-unit radius at the figure's scale) plus half the label (the
 * stamp's gold edge, 262 wide, at its scale) and a margin, so no part of it
 * crosses the face on the way.
 */
const sideX = (figX: number, stampScale: number) => figX + 35 * FS + 262 * stampScale + 40;
/** Where the verdict is this frame: one scratch point, reused. */
const AT: [number, number] = [0, 0];

/**
 * Sets `AT` to the point `p` (0..1) along the way from `a` to `b` round the
 * face: out level to the `side` column, along it to `b`'s height, then in
 * level to `b`, each leg eased. The label never crosses the face.
 */
const aroundFace = (
  a: readonly [number, number],
  b: readonly [number, number],
  side: number,
  p: number,
) => {
  const out = ease.inOutSine(clamp(p * 3));
  const along = ease.inOutSine(clamp(p * 3 - 1));
  const inward = ease.inOutSine(clamp(p * 3 - 2));
  AT[0] = lerp(lerp(a[0], side, out), b[0], inward);
  AT[1] = lerp(a[1], b[1], along);
};

/** The sink across its cue: settling its weight in place first, then round the face into the chest. */
const SINK_PATH: ReadonlyArray<Key> = [
  [0.2, 0],
  [1, 1, 'linear'],
];
/** The little rise as it takes its weight. */
const SINK_RISE: ReadonlyArray<Key> = [
  [0, 0],
  [0.1, -20, 'outCubic'],
  [0.2, 0, 'inCubic'],
];
/** The squash as it takes its weight: down, over, and settled. */
const SINK_SQUASH: ReadonlyArray<Key> = [
  [0, 1],
  [0.1, 0.9, 'outCubic'],
  [0.18, 1.06, 'inCubic'],
  [0.26, 1, 'outCubic'],
];
/** It fades only once it is small inside the chest, its letters kept until then. */
const SINK_OUT: ReadonlyArray<Key> = [
  [0.92, 0],
  [1, 1, 'linear'],
];
/** The chest's glow, lit as the verdict goes in. */
const SINK_WARM: ReadonlyArray<Key> = [
  [0.85, 0],
  [1, 1, 'linear'],
];

/** The word card: its centre, and each line's baseline and size. */
const CARD: Pt = [1240, 440];
const LINES = [
  {
    text: 'Justify',
    dy: -40,
    size: 104,
    family: F.display,
    weight: 700,
    color: C.ink,
    italic: false,
  },
  {
    text: 'δικαιόω',
    dy: 50,
    size: 72,
    family: F.greek,
    weight: 500,
    color: C.inkSoft,
    italic: false,
  },
  {
    text: 'made righteous',
    dy: 125,
    size: 52,
    family: F.display,
    weight: 500,
    color: C.inkSoft,
    italic: true,
  },
] as const;

/** The stains on the garment, in the figure's units: the cold open's two and one more (centre, size, seed). */
const STAINS = [...FIGURE_STAIN_SPOTS, [-16, -100, 18, 14, 13]] as const;
const STAIN_SHAPES = STAINS.map(([x, y, sw, sh, seed]) => blob(x, y, sw, sh, seed));
/** Where the light in the chest spreads from, in the figure's units. */
const BLOOM_AT: Pt = [-4, -82];
/** How fast the wash runs out from the light, and each stain's distance along it (its reach, 0..). */
const WASH_RATE = 2.2;
const STAIN_REACH = STAINS.map(([x, y]) => Math.hypot(x - BLOOM_AT[0], y - BLOOM_AT[1]) / 40);
/** One scratch list of the stains' wash, reused every frame. */
const WASH: number[] = STAINS.map(() => 0);
/** The cloth's colour from grey paper to warm cream, in steps. */
const CLOTH_WARMS = Array.from({ length: 17 }, (_, i) => mix(C.figure, C.cream, (0.7 * i) / 16));

/** The dawn panel behind the figure, in frame units, and its scale on the dawn world. */
const PANEL = { x: 1010, y: 150, w: 780, h: 440 };
const PANEL_SCALE = PANEL.w / 1920;
const PANEL_SUN: Pt = [PANEL.x + SUN[0] * PANEL_SCALE, PANEL.y + SUN[1] * PANEL_SCALE];

/** The verdict's place and size this frame: `sx`/`sy` squash it as it lands heavy. */
interface Verdict extends Stamp {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly squash: number;
}

/** The verdict and its placement, rewritten each frame (scratch, so the draw allocates none). */
const VERDICT = {
  x: 0,
  y: 0,
  scale: 1,
  squash: 1,
  fill: 0,
  shown: 0,
} satisfies Verdict;
const VERDICT_AT: Place = { x: 0, y: 0, sx: 1, sy: 1 };

const verdictAt = (ctx: CanvasRenderingContext2D, hand: Hands, v: Verdict) => {
  if (v.shown <= 0.01) return;
  VERDICT_AT.x = v.x;
  VERDICT_AT.y = v.y;
  VERDICT_AT.sx = v.scale * v.squash;
  VERDICT_AT.sy = v.scale * (2 - v.squash);
  at(ctx, VERDICT_AT, () => stamp(ctx, hand, v));
};

/** The word card, its three lines written in as they are spoken. */
const card = (
  ctx: CanvasRenderingContext2D,
  hand: Hands,
  shown: number,
  reveal: readonly number[],
) =>
  at(ctx, { x: CARD[0], y: CARD[1], rot: -0.02, scale: shown }, () => {
    const board = rectShape(-310, -165, 620, 330);
    piece(ctx, board, C.cream, hand('card'), {
      role: 'scenery',
      kind: 'cut',
      line: 0,
      torn: 3,
      shadow: 0.4,
    });
    probePlate(ctx, board, () =>
      LINES.forEach((l, i) =>
        write(
          ctx,
          l.text,
          0,
          l.dy,
          {
            family: l.family,
            size: l.size,
            weight: l.weight,
            italic: l.italic,
            color: l.color,
            align: 'center',
          },
          hand(`line${i}`),
          { progress: reveal[i] ?? 1, reveal: i === 1 ? 'pop' : 'write', boil: 0.4 },
        ),
      ),
    );
  });

/** The dawn from `spoke`, in its torn frame, at `shown` scale. */
const panel = (ctx: CanvasRenderingContext2D, hand: Hands, shown: number) =>
  at(ctx, { x: PANEL.x + PANEL.w / 2, y: PANEL.y + PANEL.h / 2, scale: shown }, () =>
    at(ctx, { x: -PANEL.w / 2, y: -PANEL.h / 2 }, () => {
      piece(ctx, rectShape(-14, -14, PANEL.w + 28, PANEL.h + 28), C.cream, hand('frame'), {
        role: 'scenery',
        kind: 'cut',
        line: 3,
        torn: 3,
      });
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, PANEL.w, PANEL.h);
      ctx.clip();
      at(ctx, { x: 0, y: 0, scale: PANEL_SCALE }, () => dawn(ctx, 1920, 1080, hand, DAWN_DONE));
      ctx.restore();
    }),
  );

/**
 * Gold in the chest: the glow the sunk verdict leaves (`warm`), and on
 * `made` the light spreading through the garment from inside, a glow held to
 * the cloth, never a patch laid on it.
 */
const chest = (ctx: CanvasRenderingContext2D, figure: Person, warm: number, bloom: number) => {
  const lit = Math.max(0.8 * warm, bloom);
  if (lit > 0) glow(ctx, 0, -80, 50, C.glow, 0.5 * lit);
  if (warm > 0) glow(ctx, 0, -80, 20, C.gold, 0.7 * warm * (1 - bloom));
  if (bloom <= 0) return;
  ctx.save();
  clipToGarment(ctx, figure);
  glow(ctx, BLOOM_AT[0], BLOOM_AT[1], lerp(20, 130, bloom), C.glow, 0.65 * bloom);
  glow(ctx, BLOOM_AT[0], BLOOM_AT[1], lerp(10, 70, bloom), C.gold, 0.45 * bloom);
  ctx.restore();
};

/**
 * How far each stain is washed out at `bloom`, into `out`: from the light in
 * the chest outward, the nearest first, every one gone before the light has
 * fully spread.
 */
const washStains = (out: number[], bloom: number) => {
  for (let i = 0; i < STAIN_REACH.length; i++)
    out[i] = clamp(WASH_RATE * bloom - (STAIN_REACH[i] ?? 0));
  return out;
};

/** The garment's colour as the light spreads through it: grey paper warming to cream, in steps. */
const clothAt = (bloom: number) =>
  CLOTH_WARMS[Math.round(clamp(bloom) * (CLOTH_WARMS.length - 1))] ?? C.figure;

export const declared = drawing({
  timeline: {
    cardIn: { mark: 'justified', offset: -0.3, dur: 0.4, ease: 'outBack' },
    greek: { mark: 'justified', offset: 0.5, dur: 0.5 },
    madeLine: { after: 'greek', dur: 0.5 },
    doubt: { mark: 'still', dur: 0.5 },
    push: { mark: 'still', offset: -0.2, dur: 0.8 },
    cardOut: { mark: 'cover', offset: -0.2, dur: 0.4 },
    drift: { mark: 'cover', offset: 0.1, dur: 1.2, ease: 'outCubic' },
    patch: { mark: 'would', offset: 0.3, dur: 1.2, ease: 'linear' },
    unpatch: { mark: 'subst', dur: 1, ease: 'linear' },
    sink: { mark: 'voice', offset: -0.15, dur: 1.4, ease: 'linear' },
    back: { mark: 'voice', offset: -0.3, dur: 0.8, ease: 'inOutCubic' },
    panel: { mark: 'voice', offset: 0.2, dur: 0.6, ease: 'outBack' },
    speak: { mark: 'speaks', offset: -0.6, dur: 1.3, ease: 'inOutSine' },
    landed: { after: 'speak', dur: 0.5 },
    bloom: { mark: 'made', offset: -0.6, dur: 1.6, ease: 'outCubic' },
  },
  knobs: {
    // Where the hollow verdict hangs over the head, and where it lowers over the stains.
    hang: [540, 360],
    patch: [515, 880],
    // The figure's feet.
    fig: [520, 1240],
    // Close on the face, with the word card still whole beside it.
    face: [800, 610],
    faceZoom: 1.22,
  },
  draw: (f) => {
    const { ctx, w, h } = f;
    const hand = (k: string) => f.hand(k);
    const back = f.at('back');
    const bloom = f.at('bloom');
    const doubt = f.at('doubt') * (1 - back);
    const faceZoom = f.knob('faceZoom');
    const FACE = knobCamera(f.knob('face'), faceZoom);
    // The verdict's scale here: the size it stamps at on screen in the court, under the FACE framing.
    const stampScale = (COURT.zoom ?? 1) / faceZoom;
    const drift = f.at('drift');
    const cover = f.at('patch') * (1 - f.at('unpatch'));
    const sink = f.at('sink');
    const into = f.keys('sink', SINK_PATH);

    /**
     * The verdict: drifts in over the head, goes round the face to lie over
     * the stains and back, fills word by word through the quotation, then,
     * solid, takes its weight and goes round the face into the chest. Placed
     * under the camera, where its knobs and the figure's are read, so the
     * lab's handles land where they are drawn.
     */
    const placeVerdict = (fig: readonly [number, number]) => {
      const hang = f.knob('hang');
      const patch = f.knob('patch');
      const side = sideX(fig[0], stampScale);
      if (sink > 0) aroundFace(hang, CHEST, side, into);
      else if (f.at('unpatch') > 0) aroundFace(patch, hang, side, f.at('unpatch'));
      else if (f.at('patch') > 0) aroundFace(hang, patch, side, f.at('patch'));
      else {
        AT[0] = lerp(STAMP_FROM_X, hang[0], drift);
        AT[1] = hang[1];
      }
      const verdict = VERDICT;
      verdict.x = AT[0];
      verdict.y = AT[1] + f.keys('sink', SINK_RISE);
      verdict.scale = stampScale * lerp(1, 0.15, clamp((into - 2 / 3) * 3) ** 3);
      verdict.squash = f.keys('sink', SINK_SQUASH);
      verdict.fill = f.spoken('w', 'voice');
      verdict.shown = drift * (1 - f.keys('sink', SINK_OUT));
      return verdict;
    };

    // The figure's eyes follow the verdict: up at it, down at the chest under it, and down as it sinks in.
    const landed = f.at('landed');
    const up = drift * (1 - cover) * (1 - sink);
    const down = Math.max(doubt * (1 - drift), cover, sink * (1 - back), landed);
    const look: Pt = [lerp(3, 0, doubt) * (1 - landed), lerp(-1, 4, down) - 5 * up];

    camera(
      ctx,
      shotPath(REST, [
        [f.at('push'), FACE],
        [back, REST],
      ]),
      w,
      h,
      () => {
        const fig = f.knob('fig');
        CHEST[0] = fig[0];
        CHEST[1] = fig[1] - 80 * FS;
        const verdict = placeVerdict(fig);

        // The dawn panel, callback to `spoke`.
        const shown = f.at('panel');
        if (shown > 0) panel(ctx, hand, shown);

        // The figure, their stains washed out from the light inside as it spreads.
        at(ctx, { x: fig[0], y: fig[1], scale: FS }, () => {
          const figure: Person = {
            body: clothAt(bloom),
            tilt: 0.1 * doubt - 0.08 * up + 0.08 * landed,
            nod: 4 * doubt + 3 * Math.max(cover, landed),
            look,
            browL: 2 * doubt + 3 * up + 4 * bloom,
            browR: 1 * doubt + 4 * up + 4 * bloom,
            browTilt: 0.45 * doubt + 0.3 * up + 0.1 * bloom,
            mouth: 0.35 * doubt + 0.5 * bloom,
            far: { to: [lerp(-36, -14, doubt), lerp(-40, -84, doubt)], grow: 1 },
            near: { to: [36, -40], grow: 1 },
            stains: STAIN_SHAPES,
            washed: washStains(WASH, bloom),
          };
          person(ctx, figure, hand('figure'));
          chest(ctx, figure, f.keys('sink', SINK_WARM), bloom);
        });

        verdictAt(ctx, hand, verdict);

        // The word, from the panel's sun to the chest.
        flight(
          ctx,
          arc(PANEL_SUN, CHEST, 160),
          f.at('speak') < 1 ? f.at('speak') : 0,
          hand('word'),
          0.5,
        );

        // The word card: the act's one card.
        const shownCard = f.at('cardIn') * (1 - f.at('cardOut'));
        if (shownCard > 0.01)
          card(ctx, hand, shownCard, [
            f.spoken('justified', 'still'),
            f.at('greek'),
            f.at('madeLine'),
          ]);
      },
    );
  },
});
