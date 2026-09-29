// The spoken word. It opens on the section head's row, where `woman` left it,
// all three lit. On "gift" the gold word-bubble (faith) pulses and the other
// two dim; on "where" the grey figure beside the row looks at it, curious and
// palms up. On "from" the camera pushes through the word-bubble into its
// gold, and an open book comes up out of it; on "back" its pages turn to the
// beginning, a dark page. The camera pushes through that page into the dark
// (the dip to black): an empty world. On "then" a gold word of light arcs
// across the dark and bursts into a sun; the sky floods dawn to teal and land
// and water tear in and rise (the word did it). Last, a word of light comes
// down from the sun to hang in the air, and a tree grows up under it, drawn
// out of the word.

import {
  type Camera,
  type Pt,
  at,
  camera,
  drawing,
  pushInto,
  rectShape,
  shotPath,
  sub,
} from '@bible/film/canvas';
import { clamp, ease, lerp } from '@bible/film/core';
import {
  type GestureAt,
  C,
  ICON_ROW,
  ICON_SKY,
  ICON_X,
  glow,
  icons,
  person,
  piece,
  rounded,
  sky,
} from '../kit.ts';
import { SUN, TREE, arc, dawn, flight, toward, wordLight } from '../spoken.ts';

/** The book that comes up out of the gold, at the frame's middle. */
const BOOK: Pt = [960, 560];
/** The book's dark page, which the camera pushes through. */
const PAGE: Pt = [960 + 150, 560];

/** The unmoved frame (the canvas itself, so not a knob). */
const REST: Camera = { x: 960, y: 540, zoom: 1 };
/** Through the word-bubble: on its disc, close enough that its gold is past the frame's corners. */
const FAITH: Camera = {
  x: ICON_ROW.x + ICON_X[0] * ICON_ROW.scale,
  y: ICON_ROW.y + 10 * ICON_ROW.scale,
  zoom: 11,
};
/** The asker's two hands at the question, palms up by the shoulders (their reach written each frame). */
const SHRUG_FAR: GestureAt = { to: [-78, -112], reach: 0, grip: 'palm' };
const SHRUG_NEAR: GestureAt = { to: [78, -112], reach: 0, grip: 'palm' };
/** The row's glow and each icon's size, rewritten every frame. */
const LIT: [number, number, number] = [1, 1, 1];
const SHOWN: [number, number, number] = [1, 0, 0];
const OTHERS: readonly [number, number, number] = [0, 1, 1];
/** How far the other two fade as faith is singled out. */
const DIMMED = 0.6;

export const spoke = drawing({
  timeline: {
    gift: { mark: 'gift', offset: 0.2, dur: 1.6, ease: 'inOutSine' },
    dim: { mark: 'gift', offset: 0.1, dur: 0.6 },
    curious: { mark: 'where', offset: -0.2, dur: 0.5 },
    shrug: { mark: 'where', offset: 0.1, dur: 0.5 },
    unshrug: { mark: 'from', offset: -0.2, dur: 0.4 },
    into: { mark: 'from', offset: -0.1, dur: 1.1, ease: 'inCubic' },
    bookIn: { after: 'into', offset: -0.1, dur: 0.6, ease: 'outBack' },
    bookOpen: { mark: 'back', offset: 0.1, dur: 0.6 },
    plunge: { mark: 'dark', offset: -1, dur: 1.1, ease: 'inCubic' },
    // In the dark, the camera drifts slowly back while the world is made.
    drift: { after: 'plunge', dur: 10.4, ease: 'linear' },
    flight: { mark: 'then', offset: 0.1, dur: 1.3, ease: 'inOutSine' },
    burst: { after: 'flight', dur: 0.6, ease: 'outCubic' },
    flood: { mark: 'spake', offset: -0.5, dur: 1.4 },
    day: { after: 'flood', dur: 1.4 },
    land: { mark: 'spake', dur: 1.9, ease: 'linear' },
    hang: { mark: 'only', offset: 0.2, dur: 1.5, ease: 'inOutSine' },
    grow: { mark: 'itself', offset: -0.5, dur: 1.6, ease: 'linear' },
  },
  knobs: {
    hangAt: [1330, 420],
    from: [-120, 760],
    // The grey figure beside the row, lower left.
    figure: [190, 1010],
  },
  draw: (f) => {
    const { ctx, w, h, t } = f;
    const hand = (k: string) => f.hand(k);

    // ── The row: faith singled out, and the push through it ─────────────────
    const into = f.at('into');
    if (into < 1) {
      sky(ctx, w, h, ICON_SKY);
      const cam = shotPath(REST, [[into, FAITH, pushInto]]);
      const gift = f.at('gift');
      const dim = f.at('dim');
      LIT[0] = 1 + 0.6 * Math.sin(Math.PI * gift);
      LIT[1] = 1 - dim;
      LIT[2] = 1 - dim;
      SHOWN[0] = 1 + 0.08 * Math.sin(Math.PI * gift);
      const curious = f.at('curious');
      const shrug = f.at('shrug') * (1 - f.at('unshrug'));
      SHRUG_FAR.reach = shrug;
      SHRUG_NEAR.reach = shrug;
      camera(ctx, cam, w, h, () => {
        at(ctx, { x: ICON_ROW.x, y: ICON_ROW.y, scale: ICON_ROW.scale }, () => {
          // Faith's gold swells behind it as it pulses.
          glow(ctx, ICON_X[0], 0, 340, C.gold, 0.55 * Math.sin(Math.PI * gift) + 0.2 * dim);
          // The other two dim back into the page.
          ctx.save();
          ctx.globalAlpha *= 1 - DIMMED * dim;
          icons(ctx, f.hand, LIT, OTHERS);
          ctx.restore();
          icons(ctx, f.hand, LIT, SHOWN);
        });
        const [fx, fy] = f.knob('figure');
        at(ctx, { x: fx, y: fy, scale: 1.7 }, () =>
          person(
            ctx,
            {
              tilt: 0.1 * curious,
              look: [lerp(1, 3, curious), lerp(0, -4, curious)],
              browL: 3 * curious + 1.5 * shrug,
              browR: 4 * curious + 1.5 * shrug,
              browTilt: 0.4 * curious,
              mouth: 0.4 * shrug,
              far: SHRUG_FAR,
              near: SHRUG_NEAR,
            },
            hand('asker'),
          ),
        );
      });
      // The bubble's gold, filling the frame as the push goes through it.
      if (into > 0.75) {
        ctx.save();
        ctx.globalAlpha *= clamp((into - 0.75) / 0.25);
        ctx.fillStyle = C.gold;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
      return;
    }

    // ── The book of beginnings, up out of the gold ──────────────────────────
    const plunge = f.at('plunge');
    if (plunge < 1) {
      ctx.fillStyle = C.gold;
      ctx.fillRect(0, 0, w, h);
      glow(ctx, w / 2, h / 2, 700, C.glow, 0.6);
      const cam: Camera = {
        x: lerp(REST.x, PAGE[0], plunge),
        y: lerp(REST.y, PAGE[1], plunge),
        zoom: lerp(1, 9, ease.inCubic(plunge)),
      };
      camera(ctx, cam, w, h, () => {
        const inAt = f.at('bookIn');
        if (inAt <= 0) return;
        const open = f.at('bookOpen');
        at(
          ctx,
          { x: BOOK[0], y: BOOK[1] + (1 - inAt) * 260, rot: -0.04, scale: 1.45 * inAt },
          () => {
            // Closed: a cover. Open: two pages, the right one the dark of the beginning.
            piece(ctx, rounded(0, 0, lerp(230, 460, open), 300, 12), C.boardDeep, hand('cover'), {
              role: 'scenery',
              kind: 'cut',
              line: 4,
            });
            if (open < 0.5)
              piece(ctx, rounded(0, 0, 150, 200, 8), C.cream, hand('clasp'), {
                role: 'scenery',
                kind: 'cut',
                line: 3,
                alpha: 1 - open * 2,
              });
            else {
              const k = (open - 0.5) * 2;
              piece(ctx, rectShape(-210, -135, 200 * k, 270), C.cream, hand('left'), {
                role: 'scenery',
                kind: 'cut',
                line: 2.5,
              });
              piece(ctx, rectShape(10, -135, 200 * k, 270), C.night, hand('right'), {
                role: 'scenery',
                kind: 'cut',
                line: 2.5,
              });
              for (let i = 0; i < 5; i++)
                piece(
                  ctx,
                  rounded(-110, -70 + i * 34, 150 * k, 6, 3),
                  C.inkSoft,
                  sub(hand('text'), i),
                  {
                    role: 'scenery',
                    kind: 'ink',
                    line: 0,
                    shadow: 0,
                  },
                );
            }
          },
        );
      });
      // The dark page fills the frame as the camera goes through it.
      if (plunge > 0.7) {
        ctx.save();
        ctx.globalAlpha *= clamp((plunge - 0.7) / 0.3);
        ctx.fillStyle = C.night;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
      return;
    }

    // ── The dark, and the word that makes the world ─────────────────────────
    const drift = f.at('drift');
    camera(ctx, { x: 960, y: lerp(560, 530, drift), zoom: lerp(1.06, 1, drift) }, w, h, () => {
      dawn(ctx, w, h, hand, {
        flood: f.at('flood'),
        day: f.at('day'),
        sun: f.at('burst'),
        land: f.at('land'),
        tree: f.at('grow'),
      });

      // The word flies in and becomes the sun.
      const fly = f.at('flight');
      if (f.at('burst') < 0.5) flight(ctx, arc(f.knob('from'), SUN, 260), fly, hand('word'), 0.7);

      // A word comes down from the sun and hangs; the tree rises to meet it.
      const hang = f.at('hang');
      if (hang > 0) {
        const [hx, hy] = toward(SUN, f.knob('hangAt'), hang);
        const grow = f.at('grow');
        // Gold falls from the word to where the tree will stand.
        if (grow > 0) {
          ctx.save();
          ctx.globalAlpha *= 0.35 * Math.sin(Math.PI * clamp(grow));
          const beam = ctx.createLinearGradient(0, hy, 0, TREE[1]);
          beam.addColorStop(0, C.glow);
          beam.addColorStop(1, `${C.glow}00`);
          ctx.fillStyle = beam;
          ctx.fillRect(hx - 70, hy, 140, Math.max(0, TREE[1] - hy));
          ctx.restore();
        }
        at(ctx, { x: hx, y: hy + 6 * Math.sin(t * 2.2) }, () =>
          wordLight(ctx, hand('hung'), lerp(0.35, 0.55, hang)),
        );
      }
    });
  },
});
