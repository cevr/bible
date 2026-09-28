// The spoken word. It opens on the page, close on the viewer's own face as
// they ask where righteousness comes from, and a book (the beginning) sets
// down beside them and opens on a dark page. The camera pushes through that
// page into the dark (the dip to black): an empty world. On "then" a gold
// word of light arcs across the dark and bursts into a sun; the sky floods
// dawn to teal and land and water tear in and rise (the word did it). Last,
// a word of light comes down from the sun to hang in the air, and a tree
// grows up under it, drawn out of the word.

import { type Camera, type Pt, at, camera, drawing, rectShape, sub } from '@bible/film/canvas';
import { clamp, ease, lerp } from '@bible/film/core';
import { C, person, piece, rounded } from '../kit.ts';
import { SUN, TREE, arc, dawn, flight, toward, wordLight } from '../spoken.ts';

/** The page: close on the asker, and the book they turn to. */
const FIGURE: Pt = [600, 1330];
const BOOK: Pt = [1360, 600];
/** The book's dark page, which the camera pushes through. */
const PAGE: Pt = [1360 + 150, 600];

const REST: Camera = { x: 960, y: 540, zoom: 1 };

export const spoke = drawing({
  timeline: {
    shrug: { mark: 'where', offset: -0.35, dur: 0.5 },
    bookIn: { mark: 'back', offset: -0.1, dur: 0.55, ease: 'outBack' },
    turn: { mark: 'back', offset: 0.1, dur: 0.5 },
    bookOpen: { mark: 'back', offset: 0.35, dur: 0.55 },
    plunge: { mark: 'dark', offset: -1, dur: 1.1, ease: 'inCubic' },
    // In the dark, the camera drifts slowly back while the world is made.
    drift: { after: 'plunge', dur: 12, ease: 'linear' },
    flight: { mark: 'then', offset: 0.1, dur: 1.3, ease: 'inOutSine' },
    burst: { after: 'flight', dur: 0.6, ease: 'outCubic' },
    flood: { mark: 'spake', offset: -0.5, dur: 1.4 },
    day: { after: 'flood', dur: 1.4 },
    land: { mark: 'spake', dur: 1.9, ease: 'linear' },
    hang: { mark: 'only', offset: 0.2, dur: 1.5, ease: 'inOutSine' },
    grow: { mark: 'itself', offset: -0.5, dur: 1.6, ease: 'linear' },
  },
  knobs: { hangAt: [1330, 420], from: [-120, 760] },
  draw: (f) => {
    const { ctx, w, h, t } = f;
    const hand = (k: string) => f.hand(k);
    const plunge = f.at('plunge');

    // ── The page: the asker, and the book of beginnings ─────────────────────
    if (plunge < 1) {
      const shrug = f.at('shrug') * (1 - f.at('turn'));
      const turn = f.at('turn');
      const cam: Camera = {
        x: lerp(REST.x, PAGE[0], plunge),
        y: lerp(REST.y, PAGE[1], plunge),
        zoom: lerp(1, 9, ease.inCubic(plunge)),
      };
      camera(ctx, cam, w, h, () => {
        at(ctx, { x: FIGURE[0], y: FIGURE[1], scale: 4.2 }, () =>
          person(
            ctx,
            {
              tilt: -0.08 * shrug + 0.1 * turn,
              look: [lerp(-2 * shrug, 4, turn), lerp(-2 * shrug, 1, turn)],
              browL: 4 * shrug + 2 * turn,
              browR: 4 * shrug + 3 * turn,
              browTilt: 0.45 * shrug + 0.2 * turn,
              mouth: 0.6 * shrug,
              handL: [lerp(-40, -78, shrug), lerp(-40, -112, shrug)],
              handR: [lerp(40, 78, shrug), lerp(-40, -112, shrug)],
            },
            hand('asker'),
          ),
        );

        const inAt = f.at('bookIn');
        if (inAt > 0) {
          const open = f.at('bookOpen');
          at(
            ctx,
            { x: BOOK[0], y: BOOK[1] + (1 - inAt) * 80, rot: -0.04, scale: 1.45 * inAt },
            () => {
              // Closed: a cover. Open: two pages, the right one the dark of the beginning.
              piece(ctx, rounded(0, 0, lerp(230, 460, open), 300, 12), C.boardDeep, hand('cover'), {
                line: 4,
              });
              if (open < 0.5)
                piece(ctx, rounded(0, 0, 150, 200, 8), C.gold, hand('clasp'), {
                  line: 3,
                  alpha: 1 - open * 2,
                });
              else {
                const k = (open - 0.5) * 2;
                piece(ctx, rectShape(-210, -135, 200 * k, 270), C.cream, hand('left'), {
                  line: 2.5,
                });
                piece(ctx, rectShape(10, -135, 200 * k, 270), C.night, hand('right'), {
                  line: 2.5,
                });
                for (let i = 0; i < 5; i++)
                  piece(
                    ctx,
                    rounded(-110, -70 + i * 34, 150 * k, 6, 3),
                    C.inkSoft,
                    sub(hand('text'), i),
                    {
                      line: 0,
                      shadow: 0,
                    },
                  );
              }
            },
          );
        }
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
