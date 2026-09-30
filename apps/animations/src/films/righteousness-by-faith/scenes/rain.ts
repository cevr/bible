// Where it was heading. Wide cardboard fields under a teal sky, dry, with the
// city low on the horizon and scarlet specks hanging over the land. On
// "spirit" the rain begins, silver-gold, and the fields green where it falls.
// On "blot" the camera tilts up to the gold sanctuary far above, veil drawn
// up and Christ pleading before the ark as `exchange` left him: its light
// brightens, and the specks over the land wink out one by one. On "loud" the
// camera comes down over the city, the angel with the third angel's banner
// flies across again, and figures on the rooftops turn to look and wave.

import { type Camera, type Pt, at, drawing, multiplane, unprobed, sub } from '@bible/film/canvas';
import { clamp, keys, lerp, rng } from '@bible/film/core';
import { type GestureAt, C, blob, glow, person, piece, sky, mix } from '../kit.ts';
import { CITY_FRONT, cityBack, cityFront } from '../city.ts';
import { herald, ministry } from '../heaven.ts';

/** The unmoved frame (the canvas itself, so not a knob). */
const REST: Camera = { x: 960, y: 540, zoom: 1 };

/** Where the sanctuary floats, on the far plane. */
const SANCTUARY: Pt = [960, -110];

/** The fields, back to front: centre, size, seed, and when the rain reaches each. */
const FIELDS = [
  { x: 500, y: 800, w: 1500, h: 260, seed: 61, reach: 0.15 },
  { x: 1500, y: 830, w: 1400, h: 280, seed: 62, reach: 0.35 },
  { x: 900, y: 960, w: 2300, h: 300, seed: 63, reach: 0.55 },
  { x: 300, y: 1060, w: 1500, h: 260, seed: 64, reach: 0.75 },
  { x: 1600, y: 1080, w: 1500, h: 240, seed: 65, reach: 0.9 },
] as const;

/** The scarlet specks over the land. */
const SPECKS = (() => {
  const r = rng(1844);
  return Array.from({ length: 11 }, (_, i) => ({
    x: 140 + i * 160 + (r() - 0.5) * 80,
    y: 330 + r() * 230,
    s: 0.7 + r() * 0.6,
    seed: 90 + i,
  }));
})();

/** Rain streaks: a fixed field that scrolls down and a little left. */
const DROPS = (() => {
  const r = rng(7);
  return Array.from({ length: 160 }, () => ({ x: r() * 2200, y: r() * 1200, v: 0.8 + r() * 0.4 }));
})();

/** A watcher's hand, waving up at the angel as they turn (written per watcher). */
const WAVING: GestureAt = { to: [60, -190], reach: 0, grip: 'open' };

/** The rooftops that hold a watcher: every other block of the front row. */
const WATCHERS = CITY_FRONT.filter((_, i) => i % 2 === 1);

export const rain = drawing({
  timeline: {
    // Christ pleads before the ark from the cut, as `exchange` left him.
    plea: { at: 'start', dur: 0 },
    fall: { mark: 'spirit', offset: -0.3, dur: 0.8 },
    green: { mark: 'spirit', offset: 0.2, dur: 3.6, ease: 'linear' },
    tiltUp: { mark: 'blot', offset: -0.6, dur: 1.3 },
    bright: { mark: 'blot', offset: 0.4, dur: 1 },
    wink: { mark: 'blot', offset: 0.9, dur: 2, ease: 'linear' },
    down: { mark: 'loud', offset: -0.9, dur: 1.4 },
    stop: { mark: 'loud', offset: -0.9, dur: 0.8 },
    fly: { mark: 'loud', offset: -0.1, dur: 3, ease: 'linear' },
    // The angel has the banner in hand as it flies in, still off frame.
    grasp: { with: 'fly', dur: 0 },
    turn: { mark: 'loud', offset: 0.6, dur: 0.6 },
  },
  knobs: {
    // Tilted up to the sanctuary.
    up: [960, -40],
    // Down over the city on the horizon.
    city: [1000, 560],
    cityZoom: 1.7,
  },
  draw: (f) => {
    const { ctx, w, h, t } = f;
    const hand = (k: string) => f.hand(k);
    const green = f.at('green');
    const up = f.at('tiltUp') * (1 - f.at('down'));
    const down = f.at('down');
    const upAt = f.knob('up');
    const city = f.knob('city');
    const cam: Camera = {
      x: lerp(lerp(REST.x, upAt[0], up), city[0], down),
      y: lerp(lerp(REST.y, upAt[1], up), city[1], down),
      zoom: lerp(1, f.knob('cityZoom'), down),
    };
    const wink = f.at('wink');
    const turn = f.at('turn');

    sky(ctx, w, h, [
      [0, C.tealTop],
      [0.55, C.tealMid],
      [1, C.tealLow],
    ]);

    multiplane(
      ctx,
      cam,
      w,
      h,
      [
        {
          // Heaven: the sanctuary far above the land, Christ pleading before the ark.
          z: 1.3,
          draw: () =>
            at(ctx, { x: SANCTUARY[0], y: SANCTUARY[1], scale: 0.42 }, () => {
              ministry(ctx, hand, f.at('bright'), f.at('plea'));
              piece(ctx, blob(0, 40, 1400, 190, 88), C.cream, hand('cloud'), {
                role: 'scenery',
                line: 0,
                shadow: 0.2,
              });
            }),
        },
        {
          // The city on the horizon, a little way off.
          z: 1.5,
          draw: () =>
            at(ctx, { x: 960, y: 770, scale: 0.5 }, () =>
              at(ctx, { x: -960, y: -1080 }, () => {
                cityBack(ctx, hand);
                cityFront(ctx, hand);
                WATCHERS.forEach((b, i) => {
                  WAVING.to[0] = 60 + turn * Math.sin((t + i) * 9) * 18;
                  WAVING.reach = turn;
                  at(ctx, { x: b.x, y: b.top, scale: 0.9 }, () =>
                    person(
                      ctx,
                      {
                        tilt: -0.12 * turn,
                        look: [lerp(0, -3, turn), -4 * turn],
                        browL: 3 * turn,
                        browR: 3 * turn,
                        browTilt: 0.4 * turn,
                        near: WAVING,
                      },
                      sub(hand('watcher'), i),
                    ),
                  );
                });
              }),
            ),
        },
        {
          // The fields, greening back to front as the rain reaches them.
          z: 1,
          draw: () =>
            FIELDS.forEach((p, i) => {
              const g = clamp((green - p.reach * 0.6) / 0.4);
              piece(
                ctx,
                blob(p.x, p.y, p.w, p.h, p.seed),
                mix(i % 2 === 0 ? C.boardLight : C.board, i % 2 === 0 ? C.leaf : C.leafShade, g),
                hand(`field${i}`),
                { role: 'scenery', line: 0, torn: 3, shadow: 0.35 },
              );
            }),
        },
        {
          // The specks over the land, winking out as the sanctuary brightens.
          z: 1.2,
          draw: () =>
            SPECKS.forEach((s, i) => {
              const k = i / SPECKS.length;
              const gone = clamp((wink - k * 0.85) / 0.15);
              if (gone >= 1) return;
              const pop = keys(gone, [
                [0, 1],
                [0.4, 1.35, 'outCubic'],
                [1, 0, 'inCubic'],
              ]);
              const bob = Math.sin(t * 1.4 + i) * 6;
              glow(ctx, s.x, s.y + bob, 60 * s.s, C.glow, gone * 0.8);
              piece(
                ctx,
                blob(s.x, s.y + bob, 26 * s.s * pop, 22 * s.s * pop, s.seed),
                C.scarlet,
                sub(hand('speck'), i),
                { role: 'scenery', line: 0, shadow: 0.15 },
              );
            }),
        },
      ],
      { rest: [REST.x, REST.y], haze: C.tealLow, thickness: 0.35 },
    );

    // The rain, silver and gold, over everything near. Texture, not ink the
    // check measures: it falls before `stop` ends and the herald's banner (the
    // scene's only text) flies after, and the captions' plate covers it.
    const fall = f.at('fall') * (1 - f.at('stop'));
    if (fall > 0) {
      ctx.save();
      ctx.lineCap = 'round';
      unprobed(ctx, () =>
        DROPS.forEach((d, i) => {
          const y = ((((d.y + t * 1100 * d.v) % 1200) + 1200) % 1200) - 60;
          const x = ((((d.x - t * 180 * d.v) % 2200) + 2200) % 2200) - 140;
          ctx.globalAlpha = 0.75 * fall;
          ctx.strokeStyle = i % 4 === 0 ? C.gold : C.robe;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - 9, y + 46);
          ctx.stroke();
        }),
      );
      ctx.restore();
    }

    // The angel with the banner, across the sky above the city.
    const fly = f.cue('fly');
    if (t >= fly.start && t <= fly.end) {
      const k = (t - fly.start) / fly.dur;
      // In fast, a slow glide while the words can be read, out fast.
      const x = keys(k, [
        [0, -200],
        [0.25, 1150, 'outCubic'],
        [0.8, 1600, 'linear'],
        [1, 3400, 'inCubic'],
      ]);
      const written = clamp((k - 0.2) / 0.12);
      at(ctx, { x, y: 300 + Math.sin(k * 6) * 12, scale: 0.6 }, () =>
        herald(ctx, hand, t, written, f.at('grasp')),
      );
    }
  },
});
