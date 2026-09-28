// Declared. The page, close on the viewer's figure in their stained garment,
// and the act's one word card: JUSTIFY, δικαιόω, made righteous. The
// figure looks down at the card, doubtful (`still`). On `cover` the card
// goes and the cold open's hollow verdict drifts in over the figure's head,
// the same label at the same size on screen; on `would` it lowers over the
// stains on their chest, a cover-up if God only said the words, and on
// `subst` ("But") it lifts off again, the stains still there. Through
// Waggoner's quotation (`w`) its letters fill with gold word by word; as the
// quotation ends it drops, heavy, into the chest and leaves a glow there.
// On `voice` the camera eases back and the dawn from `spoke` opens in a panel
// behind the figure; the same word of light arcs out of its sun and lands on
// the chest (`speaks`), and gold blooms there as the stains shrink away
// (`made`): made righteous, not covered.

import {
  type Camera,
  type Pt,
  at,
  camera,
  drawing,
  probePlate,
  rectShape,
  write,
} from '@bible/film/canvas';
import { clamp, lerp } from '@bible/film/core';
import {
  type Hands,
  type Person,
  C,
  F,
  between,
  blob,
  clipToGarment,
  glow,
  person,
  piece,
} from '../kit.ts';
import { type Stamp, FIGURE_STAIN_SPOTS, REST as COURT, stamp } from '../court.ts';
import { DAWN_DONE, SUN, arc, dawn, flight } from '../spoken.ts';

const FIG: Pt = [520, 1240];
const FS = 3.8;
/** The figure's chest, where the verdict sinks and the word lands. */
const CHEST: Pt = [FIG[0], FIG[1] - 80 * FS];

const REST: Camera = { x: 960, y: 540, zoom: 1 };
/** Close on the face, with the word card still whole beside it. */
const FACE: Camera = { x: 800, y: 610, zoom: 1.22 };

/** The verdict's scale here: the size it stamps at on screen in the court, under the FACE framing. */
const STAMP_SCALE = (COURT.zoom ?? 1) / (FACE.zoom ?? 1);
/** Where the verdict drifts in from: where the card was. */
const STAMP_FROM: Pt = [1240, 440];

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

const verdictAt = (ctx: CanvasRenderingContext2D, hand: Hands, v: Verdict) => {
  if (v.shown <= 0.01) return;
  at(ctx, { x: v.x, y: v.y, sx: v.scale * v.squash, sy: v.scale * (2 - v.squash) }, () =>
    stamp(ctx, hand, v),
  );
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
    piece(ctx, board, C.cream, hand('card'), { line: 0, torn: 3, shadow: 0.4 });
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

/** Gold in the chest: the glow the sunk verdict leaves (`warm`), and the bloom through the garment. */
const chest = (
  ctx: CanvasRenderingContext2D,
  hand: Hands,
  figure: Person,
  warm: number,
  bloom: number,
) => {
  const lit = Math.max(0.8 * warm, bloom);
  if (lit > 0) glow(ctx, 0, -80, 50, C.glow, 0.5 * lit);
  if (warm > 0) glow(ctx, 0, -80, 20, C.gold, 0.7 * warm * (1 - bloom));
  if (bloom <= 0) return;
  ctx.save();
  clipToGarment(ctx, figure);
  piece(ctx, blob(-4, -82, 56 * bloom, 76 * bloom, 5), C.gold, hand('bloom'), {
    line: 0,
    shadow: 0,
    alpha: 0.6,
  });
  ctx.restore();
};

export const declared = drawing({
  timeline: {
    cardIn: { mark: 'justified', offset: -0.3, dur: 0.4, ease: 'outBack' },
    greek: { mark: 'justified', offset: 0.5, dur: 0.5 },
    madeLine: { after: 'greek', dur: 0.5 },
    doubt: { mark: 'still', dur: 0.5 },
    push: { mark: 'still', offset: -0.2, dur: 0.8 },
    cardOut: { mark: 'cover', offset: -0.2, dur: 0.4 },
    drift: { mark: 'cover', offset: 0.1, dur: 1.2, ease: 'outCubic' },
    patch: { mark: 'would', offset: 0.3, dur: 0.8, ease: 'inOutCubic' },
    unpatch: { mark: 'subst', dur: 0.7, ease: 'inOutCubic' },
    sink: { mark: 'voice', offset: -0.7, dur: 0.7, ease: 'linear' },
    back: { mark: 'voice', offset: -0.3, dur: 0.8, ease: 'inOutCubic' },
    panel: { mark: 'voice', offset: 0.2, dur: 0.6, ease: 'outBack' },
    speak: { mark: 'speaks', offset: -0.6, dur: 1.3, ease: 'inOutSine' },
    bloom: { mark: 'made', offset: -0.6, dur: 1.6, ease: 'outCubic' },
  },
  // Where the hollow verdict hangs over the head, and where it lowers over the stains.
  knobs: { hang: [540, 360], patch: [515, 880] },
  draw: (f) => {
    const { ctx, w, h } = f;
    const hand = (k: string) => f.hand(k);
    const back = f.at('back');
    const bloom = f.at('bloom');
    const doubt = f.at('doubt') * (1 - back);

    // The verdict: drifts in over the head, lowers over the stains and lifts
    // off, fills word by word through the quotation, then drops into the chest.
    const [hx, hy] = f.knob('hang');
    const [px, py] = f.knob('patch');
    const drift = f.at('drift');
    const cover = f.at('patch') * (1 - f.at('unpatch'));
    const sink = f.at('sink');
    // It rises a little as it takes the weight, then drops into the chest.
    const rise = f.keys('sink', [
      [0, 0],
      [0.25, -20, 'outCubic'],
      [0.5, 0, 'inCubic'],
    ]);
    const drop = f.keys('sink', [
      [0.25, 0],
      [1, 1, 'inCubic'],
    ]);
    const hangX = lerp(lerp(STAMP_FROM[0], hx, drift), px, cover);
    const hangY = lerp(lerp(STAMP_FROM[1], hy, drift), py, cover);
    const verdict: Verdict = {
      x: lerp(hangX, CHEST[0], drop),
      y: lerp(hangY, CHEST[1], drop) + rise,
      scale: STAMP_SCALE * lerp(1, 0.2, drop),
      squash: f.keys('sink', [
        [0, 1],
        [0.25, 0.9, 'outCubic'],
        [0.6, 1.1, 'inCubic'],
      ]),
      fill: f.spoken('w', 'voice'),
      shown: drift * (1 - clamp((sink - 0.7) / 0.3)),
    };

    // The figure's eyes follow the verdict: up at it, down at the chest under it, and down as it sinks in.
    const landed = f.at('speak') >= 1 ? 1 : 0;
    const up = drift * (1 - cover) * (1 - sink);
    const down = Math.max(doubt * (1 - drift), cover, sink * (1 - back), landed);
    const look: Pt = [lerp(3, 0, doubt) * (1 - landed), lerp(-1, 4, down) - 5 * up];

    camera(ctx, between(between(REST, FACE, f.at('push')), REST, back), w, h, () => {
      // The dawn panel, callback to `spoke`.
      const shown = f.at('panel');
      if (shown > 0) panel(ctx, hand, shown);

      // The figure, their stains shrinking as the gold blooms.
      at(ctx, { x: FIG[0], y: FIG[1], scale: FS }, () => {
        const k = 1 - clamp(bloom * 1.3);
        const stains =
          k > 0.05 ? STAINS.map(([x, y, sw, sh, seed]) => blob(x, y, sw * k, sh * k, seed)) : [];
        const figure: Person = {
          tilt: 0.1 * doubt - 0.08 * up + 0.08 * landed,
          nod: 4 * doubt + 3 * Math.max(cover, landed),
          look,
          browL: 2 * doubt + 3 * up + 4 * bloom,
          browR: 1 * doubt + 4 * up + 4 * bloom,
          browTilt: 0.45 * doubt + 0.3 * up + 0.1 * bloom,
          mouth: 0.35 * doubt + 0.5 * bloom,
          handL: [lerp(-36, -14, doubt), lerp(-40, -84, doubt)],
          handR: [36, -40],
          stains,
        };
        person(ctx, figure, hand('figure'));
        chest(ctx, hand, figure, sink, bloom);
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
    });
  },
});
