// The law moves in. On the parchment page the gold circle from `word`, as big
// as the universe, comes back around the grey figure; on "never" it shrinks
// and settles into their chest, and on "write" it is a warm heart with the two
// tablets inside it, still legible. Then two panels, one after the other: a
// closed book with a gold ribbon (the past, forgiven: "first"), and a path
// ahead with the figure walking it and flowers springing up in their
// footprints ("second"). Last, the pull back to the three icons, the heart
// lighting, all three lit. The Sabbath rest moved to `daily` (its field is
// `restingField` in garden.ts); the script's `power`, `not` and `become` shots
// are not drawn yet.

import {
  type Hand,
  type Pt,
  at,
  drawing,
  ellipse,
  ellipseShape,
  rectShape,
  stroke,
  sub,
} from '@bible/film/canvas';
import { clamp, lerp } from '@bible/film/core';
import { C, blob, contact, glow, icons, person, piece, rounded, sky } from '../kit.ts';

/** The figure on the page: where they stand, and where they stand aside. */
const CENTRE: Pt = [960, 930];
const ASIDE: Pt = [420, 930];
/** The panel beside them. */
const PANEL: Pt = [1260, 520];
const PANEL_W = 900;
const PANEL_H = 640;

/** The path ahead, in the panel's units, from near left to far right. */
const PATH: Pt[] = [
  [-360, 250],
  [-180, 200],
  [-40, 110],
  [110, 40],
  [260, -60],
  [380, -130],
];

const along = (t: number): Pt => {
  const k = clamp(t) * (PATH.length - 1);
  const i = Math.min(PATH.length - 2, Math.floor(k));
  const a = PATH[i] ?? [0, 0];
  const b = PATH[i + 1] ?? a;
  return [lerp(a[0], b[0], k - i), lerp(a[1], b[1], k - i)];
};

/** The two tablets on the heart, with their lines. */
const tablets = (ctx: CanvasRenderingContext2D, hand: (k: string) => Hand) => {
  for (const x of [-24, 24] as const) {
    piece(ctx, rounded(x, 6, 40, 64, 14), C.gold, sub(hand('tablet'), x), { line: 3.5 });
    for (let i = 0; i < 4; i++)
      piece(ctx, rounded(x, -10 + i * 12, 24, 3, 1), C.ink, sub(hand('law'), x * 10 + i), {
        line: 0,
        shadow: 0,
      });
  }
};

const HEART: Pt[] = [
  [0, -54],
  [40, -94],
  [96, -60],
  [84, 4],
  [0, 96],
  [-84, 4],
  [-96, -60],
  [-40, -94],
];

export const within = drawing({
  timeline: {
    ask: { mark: 'out', dur: 0.4 },
    shrink: { mark: 'never', dur: 1.5, ease: 'inOutCubic' },
    heart: { mark: 'write', offset: -0.1, dur: 0.5, ease: 'outBack' },
    aside: { mark: 'first', offset: -0.4, dur: 0.8 },
    book: { mark: 'first', dur: 0.5, ease: 'outBack' },
    swap: { mark: 'second', offset: -0.3, dur: 0.6 },
    walk: { mark: 'second', offset: 0.3, dur: 2, ease: 'linear' },
    toIcons: { mark: 'second', offset: 1.9, dur: 0.3 },
    pullBack: { with: 'toIcons', dur: 0.7, ease: 'outCubic' },
    heartLit: { after: 'pullBack', dur: 0.4 },
  },
  draw: (f) => {
    const { ctx, w, h } = f;
    const hand = (k: string) => f.hand(k);
    const toIcons = f.at('toIcons');

    // ── A: the page ─────────────────────────────────────────────────────────
    if (toIcons < 1) {
      ctx.save();
      sky(ctx, w, h, [
        [0, C.paper],
        [1, C.paper],
      ]);

      const aside = f.at('aside');
      const [fx, fy] = [lerp(CENTRE[0], ASIDE[0], aside), lerp(CENTRE[1], ASIDE[1], aside)];
      const scale = lerp(2.4, 1.9, aside);
      const ask = f.at('ask') * (1 - f.at('heart'));
      const heart = f.at('heart');

      // The circle, as big as the universe, coming home to the chest.
      const shrink = f.at('shrink');
      const chest: Pt = [fx, fy - 92 * scale];
      const r = lerp(720, 40, shrink);
      const [cx, cy] = [lerp(960, chest[0], shrink), lerp(470, chest[1], shrink)];
      if (heart < 0.6) {
        ctx.save();
        ctx.globalAlpha *= 1 - clamp(heart / 0.6);
        glow(ctx, cx, cy, r * 1.1, C.glow, 0.5);
        stroke(
          ctx,
          ellipse(cx, cy, r, r),
          { color: C.gold, width: lerp(16, 8, shrink), jitter: 0.6, taper: 0 },
          hand('circle'),
        );
        // A few worlds inside it, going as it shrinks.
        for (const [i, [sx, sy, sr]] of (
          [
            [-0.5, -0.3, 22],
            [0.35, -0.45, 14],
            [0.55, 0.2, 30],
            [-0.3, 0.45, 12],
            [0.05, -0.7, 9],
          ] as const
        ).entries())
          piece(
            ctx,
            ellipseShape(cx + sx * r, cy + sy * r, sr, sr),
            i % 2 === 0 ? C.gold : C.inkSoft,
            sub(hand('world'), i),
            { line: 2, alpha: 1 - shrink },
          );
        ctx.restore();
      }

      contact(ctx, fx, fy + 4, 90 * scale);
      at(ctx, { x: fx, y: fy, scale }, () => {
        person(
          ctx,
          {
            tilt: -0.12 * ask + 0.08 * heart * (1 - aside),
            nod: 4 * heart * (1 - aside),
            look: [lerp(0, 2, ask) + 2 * aside, lerp(-4 * ask, 3, heart * (1 - aside))],
            browL: 4 * ask + 2 * heart,
            browR: 2 * ask + 2 * heart,
            browTilt: 0.35 * ask,
            mouth: 0.6 * ask,
          },
          hand('figure'),
        );
        if (heart > 0)
          at(ctx, { x: 0, y: -80, scale: 0.36 * heart }, () => {
            glow(ctx, 0, 0, 220, C.glow, 0.8);
            piece(ctx, HEART, C.peachTop, hand('heart'), { line: 5 });
            tablets(ctx, hand);
          });
      });

      // The panel: first the past, closed and forgiven; then the path ahead.
      if (aside > 0) {
        const swap = f.at('swap');
        at(ctx, { x: PANEL[0] + (1 - aside) * 900, y: PANEL[1] }, () => {
          piece(ctx, rounded(0, 0, PANEL_W, PANEL_H, 24), C.cream, hand('panel'), {
            line: 4,
            torn: 1,
          });
          ctx.save();
          ctx.beginPath();
          ctx.rect(-PANEL_W / 2 + 6, -PANEL_H / 2 + 6, PANEL_W - 12, PANEL_H - 12);
          ctx.clip();
          if (swap < 1) {
            const book = f.at('book');
            at(ctx, { x: -swap * 900, y: 20, scale: book, rot: -0.06 }, () => {
              piece(ctx, rounded(0, 0, 420, 300, 14), C.boardDeep, hand('cover'), { line: 4 });
              piece(ctx, rounded(8, 0, 380, 264, 8), C.inkSoft, hand('coverInset'), {
                line: 0,
              });
              // The ribbon tied across it.
              piece(ctx, rectShape(-40, -160, 40, 320), C.gold, hand('ribbon'), { line: 3 });
              piece(ctx, blob(-20, -8, 90, 60, 9), C.gold, hand('bow'), { line: 3 });
            });
          }
          if (swap > 0) {
            at(ctx, { x: (1 - swap) * 900, y: 0 }, () => {
              // The hills and the path.
              piece(ctx, blob(0, 260, 1100, 420, 31), C.leaf, hand('hill'), {
                line: 0,
                shadow: 0.2,
              });
              stroke(
                ctx,
                PATH,
                { color: C.boardLight, width: 44, jitter: 0.4, taper: 0.5 },
                hand('path'),
              );
              const walk = f.at('walk');
              // Flowers where the figure has already stepped.
              for (let i = 0; i < 9; i++) {
                const k = i / 9;
                const age = (walk - k) * 6;
                if (age <= 0) continue;
                const [px, py] = along(k);
                const s = clamp(age);
                const side = i % 2 === 0 ? -1 : 1;
                at(ctx, { x: px + side * 34, y: py + 10, scale: s * (1 - 0.4 * k) }, () => {
                  stroke(
                    ctx,
                    [
                      [0, 0],
                      [0, -30],
                    ],
                    { color: C.leafShade, width: 4, jitter: 0.3 },
                    sub(hand('stem'), i),
                  );
                  piece(
                    ctx,
                    ellipseShape(0, -34, 14, 14),
                    i % 3 === 0 ? C.gold : C.robe,
                    sub(hand('flower'), i),
                    { line: 2 },
                  );
                });
              }
              const [wx, wy] = along(walk);
              const bob = Math.abs(Math.sin(walk * 30)) * 6;
              at(ctx, { x: wx, y: wy - bob, scale: 0.9 - 0.4 * walk }, () => {
                glow(ctx, 0, -90, 90, C.glow, 0.6);
                person(ctx, { look: [3, -1], browTilt: 0.1 }, hand('walker'));
              });
            });
          }
          ctx.restore();
        });
      }
      ctx.restore();
    }

    // ── B: the three icons, the heart lighting, all three lit ───────────────
    if (toIcons > 0) {
      const pull = f.at('pullBack');
      ctx.save();
      ctx.globalAlpha *= toIcons;
      sky(ctx, w, h, [
        [0, C.glow],
        [1, C.peachLow],
      ]);
      at(ctx, { x: 960, y: lerp(-160, 540, pull), scale: lerp(2.3, 1, pull) }, () =>
        icons(ctx, hand, [0.7, 0.7, 0.4 + 0.6 * f.at('heartLit')]),
      );
      ctx.restore();
    }
  },
});
