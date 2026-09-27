// Declared. The page, close on the viewer's figure in their stained garment,
// and the act's one word card: JUSTIFY, δικαιόω, declared righteous. The
// figure looks down at the stains, doubtful: a cover-up again? Pull back to
// the three icons, the word-bubble lit. On "substantial" the bubble becomes a
// solid, heavy thing and lands with weight. Then the dawn from `spoke` opens
// in a panel behind the figure; the same word of light arcs out of its sun
// and lands on their chest, and gold blooms there as the stains shrink away:
// made righteous, not covered.

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
import { clamp, ease, keys, lerp } from '@bible/film/core';
import { C, F, ICON_X, blob, glow, icons, person, piece, rounded, sky } from '../kit.ts';
import { DAWN_DONE, SUN, arc, dawn, flight } from '../spoken.ts';

const FIG: Pt = [520, 1240];
const FS = 3.8;
/** The figure's chest, where the word lands. */
const CHEST: Pt = [FIG[0], FIG[1] - 80 * FS];

const REST: Camera = { x: 960, y: 540, zoom: 1 };
/** Close on the face, with the word card still whole beside it. */
const FACE: Camera = { x: 800, y: 610, zoom: 1.22 };

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
    text: 'declared righteous',
    dy: 125,
    size: 52,
    family: F.display,
    weight: 500,
    color: C.inkSoft,
    italic: true,
  },
] as const;

/** The stains on the garment, in the figure's units: centre, size and seed. */
const STAINS = [
  [10, -76, 30, 38, 7],
  [-14, -52, 14, 16, 11],
  [-16, -100, 18, 14, 13],
] as const;

/** The dawn panel behind the figure, in frame units, and its scale on the dawn world. */
const PANEL = { x: 1010, y: 150, w: 780, h: 440 };
const PANEL_SCALE = PANEL.w / 1920;
const PANEL_SUN: Pt = [PANEL.x + SUN[0] * PANEL_SCALE, PANEL.y + SUN[1] * PANEL_SCALE];

/** The heavy word: the bubble given depth, a slab of gold. */
const BUBBLE: Pt[] = [
  [-80, -48],
  [80, -48],
  [80, 40],
  [-20, 40],
  [-54, 76],
  [-46, 40],
  [-80, 40],
];

export const declared = drawing({
  timeline: {
    cardIn: { mark: 'justified', offset: -0.3, dur: 0.4, ease: 'outBack' },
    greek: { mark: 'justified', offset: 0.5, dur: 0.5 },
    doubt: { mark: 'still', dur: 0.5 },
    push: { mark: 'still', offset: -0.2, dur: 0.8 },
    toIcons: { mark: 'cover', offset: -0.2, dur: 0.8, ease: 'inOutCubic' },
    wordLit: { mark: 'would', dur: 0.6 },
    heavy: { mark: 'subst', offset: -0.1, dur: 1.2, ease: 'linear' },
    back: { mark: 'voice', offset: -0.3, dur: 0.3, ease: 'inOutCubic' },
    panel: { mark: 'voice', offset: 0.2, dur: 0.6, ease: 'outBack' },
    speak: { mark: 'speaks', offset: -0.6, dur: 1.3, ease: 'inOutSine' },
    bloom: { mark: 'made', offset: -0.6, dur: 1.6, ease: 'outCubic' },
  },
  draw: (f) => {
    const { ctx, w, h, t } = f;
    const hand = (k: string) => f.hand(k);
    const toIcons = f.at('toIcons');
    const back = f.at('back');
    const figureShown = 1 - toIcons + back;
    const bloom = f.at('bloom');

    // ── The figure (and, first, the word card; last, the dawn panel) ────────
    if (figureShown > 0.01) {
      ctx.save();
      ctx.globalAlpha *= clamp(figureShown);
      const doubt = f.at('doubt');
      const cam: Camera =
        back > 0
          ? REST
          : {
              x: lerp(REST.x, FACE.x, f.at('push')),
              y: lerp(REST.y, FACE.y, f.at('push')),
              zoom: lerp(1, FACE.zoom ?? 1, f.at('push')),
            };
      camera(ctx, cam, w, h, () => {
        // The dawn panel, callback to `spoke`.
        const panel = f.at('panel');
        if (panel > 0)
          at(ctx, { x: PANEL.x + PANEL.w / 2, y: PANEL.y + PANEL.h / 2, scale: panel }, () => {
            at(ctx, { x: -PANEL.w / 2, y: -PANEL.h / 2 }, () => {
              piece(ctx, rectShape(-14, -14, PANEL.w + 28, PANEL.h + 28), C.cream, hand('frame'), {
                line: 3,
                torn: 3,
              });
              ctx.save();
              ctx.beginPath();
              ctx.rect(0, 0, PANEL.w, PANEL.h);
              ctx.clip();
              at(ctx, { x: 0, y: 0, scale: PANEL_SCALE }, () =>
                dawn(ctx, 1920, 1080, hand, DAWN_DONE),
              );
              ctx.restore();
            });
          });

        // The figure, their stains shrinking as the gold blooms.
        const landed = f.at('speak') >= 1 ? 1 : 0;
        const look: Pt = [
          lerp(3, 0, doubt) * (1 - landed),
          lerp(-1, 4, Math.max(doubt * (1 - back), landed)),
        ];
        at(ctx, { x: FIG[0], y: FIG[1], scale: FS }, () => {
          const stains = STAINS.flatMap(([x, y, sw, sh, seed]) => {
            const k = 1 - clamp(bloom * 1.3);
            return k > 0.05 ? [blob(x, y, sw * k, sh * k, seed)] : [];
          });
          person(
            ctx,
            {
              tilt: 0.1 * doubt * (1 - back) + 0.08 * landed,
              nod: 4 * doubt * (1 - back) + 3 * landed,
              look,
              browL: 2 * doubt * (1 - back) + 4 * bloom,
              browR: 1 * doubt * (1 - back) + 4 * bloom,
              browTilt: 0.45 * doubt * (1 - back) + 0.1 * bloom,
              mouth: 0.35 * doubt * (1 - back) + 0.5 * bloom,
              handL: [lerp(-36, -14, doubt * (1 - back)), lerp(-40, -84, doubt * (1 - back))],
              handR: [36, -40],
              stains,
            },
            hand('figure'),
          );
          if (bloom > 0) {
            // Gold spreads through the garment from where the word landed.
            glow(ctx, 0, -80, 50, C.glow, 0.35 * bloom);
            const garment = rounded(0, -72, 66, 112, 22);
            ctx.save();
            ctx.beginPath();
            garment.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
            ctx.closePath();
            ctx.clip();
            piece(ctx, blob(-4, -82, 56 * bloom, 76 * bloom, 5), C.gold, hand('bloom'), {
              line: 0,
              shadow: 0,
              alpha: 0.6,
            });
            ctx.restore();
          }
        });

        // The word, from the panel's sun to the chest.
        flight(
          ctx,
          arc(PANEL_SUN, CHEST, 160),
          f.at('speak') < 1 ? f.at('speak') : 0,
          hand('word'),
          0.5,
        );

        // The word card: the act's one card.
        const card = f.at('cardIn') * (1 - toIcons) * (1 - back);
        if (card > 0.01)
          at(ctx, { x: CARD[0], y: CARD[1], rot: -0.02, scale: card }, () => {
            piece(ctx, rectShape(-310, -165, 620, 330), C.cream, hand('card'), {
              line: 0,
              torn: 3,
              shadow: 0.4,
            });
            const reveal = [
              f.spoken('justified', 'declared'),
              f.at('greek'),
              f.spoken('declared', 'still'),
            ];
            LINES.forEach((l, i) => {
              const box = { w: l.text.length * l.size * 0.52, h: l.size * 1.05 };
              probePlate(ctx, l.text, -box.w / 2, l.dy - l.size * 0.82, box.w, box.h);
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
              );
            });
          });
      });
      ctx.restore();
    }

    // ── The three icons, and the word made heavy ────────────────────────────
    const iconsShown = toIcons * (1 - back);
    if (iconsShown > 0.01) {
      ctx.save();
      ctx.globalAlpha *= iconsShown;
      sky(ctx, w, h, [
        [0, C.glow],
        [1, C.peachLow],
      ]);
      const heavy = f.at('heavy');
      const wordX = 960 + ICON_X[0];
      // Push in on the word-bubble as it becomes solid.
      camera(ctx, { x: lerp(960, wordX, heavy), y: 540, zoom: lerp(1, 3.4, heavy) }, w, h, () => {
        at(ctx, { x: 960, y: lerp(900, 540, toIcons), scale: lerp(2, 1, toIcons) }, () =>
          icons(ctx, hand, [0.5 + 0.5 * f.at('wordLit'), 0, 0]),
        );
        if (heavy > 0) {
          // It lifts out of the icon, gains depth, and lands with weight.
          const since = t - f.cue('heavy').start;
          const fall = keys(since, [
            [0, 0],
            [0.45, -70, ease.outCubic],
            [0.75, 0, ease.inCubic],
          ]);
          const squash = keys(since, [
            [0.72, 1],
            [0.8, 1.14, ease.outCubic],
            [1.1, 1, ease.outBack],
          ]);
          const depth = clamp(since / 0.45);
          at(ctx, { x: wordX, y: 540 + fall, sx: squash, sy: 2 - squash }, () => {
            // The slab's depth, then its face and its lines.
            for (let i = 8; i > 0; i--)
              at(ctx, { x: 0, y: i * 2.5 * depth }, () =>
                piece(ctx, BUBBLE, C.boardDeep, hand(`depth${i}`), {
                  line: 0,
                  shadow: i === 8 ? 0.8 : 0,
                }),
              );
            piece(ctx, BUBBLE, C.gold, hand('slab'), { line: 5, shadow: 0 });
            for (let i = 0; i < 3; i++)
              piece(
                ctx,
                rounded(-6 + (i % 2) * 8, -12 + i * 14, 90 - (i % 2) * 20, 5, 2),
                C.ink,
                hand(`slabLine${i}`),
                { line: 0, shadow: 0 },
              );
          });
        }
      });
      ctx.restore();
    }
  },
});
