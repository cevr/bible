// The spoken word. It opens on the section head's row, where `woman` left it,
// all three lit. On "gift" the gold word-bubble (faith) pops forward on a gold
// rim and the other two fade back; on "where" the grey figure beside the row looks at it, curious and
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
  clearOf,
  drawing,
  knobCamera,
  pushInto,
  rectShape,
  shotPath,
  sub,
  type Posed,
  glow,
  rounded,
  sky,
  wash,
} from '@bible/film/canvas';
import { clamp, lerp } from '@bible/film/core';
import {
  type GestureAt,
  C,
  ICON_ROW,
  ICON_SKY,
  ICON_X,
  type IconCount,
  icons,
  person,
  piece,
} from '../kit.ts';
import { SUN, TREE, arc, dawn, flight, toward, wordLight } from '../spoken.ts';

/** The book that comes up out of the gold, at the frame's middle. */
const BOOK: Pt = [960, 560];

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
/** The row's glow and which icon leads, rewritten every frame. */
const LIT: [number, number, number] = [1, 1, 1];
const LEAD: [number, number, number] = [0, 0, 0];
const COUNT: Posed<IconCount> = { lead: LEAD, dim: 0 };
/** The gold that falls from the hung word to the tree: the word's light, clear at the ground. */
const BEAM = [
  [0, C.glow],
  [1, clearOf(C.glow)],
] as const;

export const spoke = drawing({
  timeline: {
    // Faith pops forward in gold, the other two fade back: the section's gift.
    lead: { mark: 'gift', offset: 0.1, dur: 0.6, ease: 'outBack' },
    dim: { mark: 'gift', offset: 0.1, dur: 0.6 },
    curious: { mark: 'where', offset: -0.2, dur: 0.5 },
    shrug: { mark: 'where', offset: 0.1, dur: 0.5 },
    unshrug: { mark: 'from', offset: -0.2, dur: 0.4 },
    into: { mark: 'from', offset: -0.1, dur: 1.1, ease: 'inCubic' },
    // The bubble's gold fills the frame as the push goes through it.
    gold: { after: 'into', dur: 0.1, ends: true, ease: 'linear' },
    bookIn: { after: 'into', offset: -0.1, dur: 0.6, ease: 'outBack' },
    bookOpen: { mark: 'back', offset: 0.1, dur: 0.6 },
    plunge: { mark: 'dark', offset: -1, dur: 1.1, ease: 'inCubic' },
    // The dark page fills the frame as the camera goes through it.
    night: { after: 'plunge', dur: 0.12, ends: true, ease: 'linear' },
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
    // Through the book's dark page: where the plunge ends, and how close.
    page: [1110, 560],
    pageZoom: 9,
    hangAt: [1330, 420],
    from: [-120, 760],
    // The grey figure beside the row, lower left.
    figure: [190, 1010],
    // In the dark: the camera drifts from close and low back to the made world.
    dark: [960, 560],
    darkZoom: 1.06,
    made: [960, 530],
    madeZoom: 1,
  },
  draw: (f) => {
    const { ctx, w, h, t } = f;
    const hand = (k: string) => f.hand(k);

    // ── The row: faith singled out, and the push through it ─────────────────
    const into = f.at('into');
    if (into < 1) {
      sky(ctx, w, h, ICON_SKY);
      const cam = shotPath(REST, [[into, FAITH, pushInto]]);
      const dim = f.at('dim');
      LIT[1] = 1 - dim;
      LIT[2] = 1 - dim;
      LEAD[0] = f.at('lead');
      COUNT.dim = dim;
      const curious = f.at('curious');
      const shrug = f.at('shrug') * (1 - f.at('unshrug'));
      SHRUG_FAR.reach = shrug;
      SHRUG_NEAR.reach = shrug;
      camera(ctx, cam, w, h, () => {
        at(ctx, { x: ICON_ROW.x, y: ICON_ROW.y, scale: ICON_ROW.scale }, () =>
          icons(ctx, f.hand, LIT, undefined, COUNT),
        );
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
      const gold = f.at('gold');
      if (gold > 0) {
        ctx.save();
        ctx.globalAlpha *= gold;
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
      const cam = shotPath(REST, [
        [plunge, knobCamera(f.knob('page'), f.knob('pageZoom')), pushInto],
      ]);
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
      const night = f.at('night');
      if (night > 0) {
        ctx.save();
        ctx.globalAlpha *= night;
        ctx.fillStyle = C.night;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
      return;
    }

    // ── The dark, and the word that makes the world ─────────────────────────
    const drift = shotPath(knobCamera(f.knob('dark'), f.knob('darkZoom')), [
      [f.at('drift'), knobCamera(f.knob('made'), f.knob('madeZoom'))],
    ]);
    camera(ctx, drift, w, h, () => {
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
          wash(ctx, hx - 70, hy, 140, TREE[1] - hy, BEAM);
          ctx.restore();
        }
        at(ctx, { x: hx, y: hy + 6 * Math.sin(t * 2.2) }, () =>
          wordLight(ctx, hand('hung'), lerp(0.35, 0.55, hang)),
        );
      }
    });
  },
});
