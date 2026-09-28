// The mirror: measured by the law's circle, we come up short. In a peach
// garden the gold circle from `word` closes round one small grey figure, far
// too big for them. Up close they sew fig leaves into an apron (Gen 3:7),
// the seams stained scarlet, add patch after patch, raise a hand in a
// promise, catch the viewer's eye, and the apron wilts into rags. Then the
// two tablets stand up and become a tall mirror;
// the figure looks in, and the glass shows every stain the leaves were
// hiding. They scrub the glass; the reflection stays stained; they give the
// mirror a look.

import {
  type Camera,
  type Frame,
  at,
  camera,
  drawing,
  line,
  multiplane,
  rectShape,
  shotPath,
  stroke,
  sub,
} from '@bible/film/canvas';
import { clamp, lerp } from '@bible/film/core';
import { C, blob, ground, glow, knobCamera, person, piece, sky } from '../kit.ts';
import { apron, tree } from '../garden.ts';
import { ring, tabletShape, tablets } from '../law.ts';

/** The garden's rest: the unmoved frame (the canvas itself, so not a knob). */
const GARDEN: Camera = { x: 960, y: 540, zoom: 1 };

/** The stains the leaves hide and the mirror shows, in a person's units. */
const STAINS = [
  blob(-14, -96, 26, 22, 31),
  blob(16, -62, 32, 26, 32),
  blob(-18, -36, 20, 16, 33),
  blob(12, -112, 14, 12, 34),
];

const timeline = {
  shrink: { mark: 'short', dur: 1.8, ease: 'inOutSine' },
  toSew: { mark: 'fig', offset: -0.2, dur: 0.9, ease: 'inOutSine' },
  leaves: { mark: 'fig', offset: 0.4, dur: 2, ease: 'linear' },
  patches: { mark: 'harder', dur: 1.1, ease: 'linear' },
  toPatch: { mark: 'harder', dur: 0.6, ease: 'inOutSine' },
  promise: { mark: 'promise', dur: 0.4, ease: 'outBack' },
  sheepish: { mark: 'going', offset: 0.1, dur: 0.4 },
  droop: { mark: 'rags', offset: 0.3, dur: 1.2, ease: 'outCubic' },
  wide: { mark: 'rags', dur: 1.4, ease: 'inOutSine' },
  stand: { mark: 'mirror', dur: 0.5, ease: 'outBack' },
  become: { mark: 'mirror', offset: 0.6, dur: 0.8, ease: 'inOutSine' },
  flare: { mark: 'stain', dur: 0.8 },
  push: { mark: 'stain', dur: 1, ease: 'inOutSine' },
  scrub: { mark: 'wash', offset: -0.1, dur: 0.4 },
  back: { mark: 'wash', dur: 1, ease: 'inOutSine' },
  // Once the camera is back, he glances out at us.
  glance: { after: 'back', offset: 0.3, dur: 0.4 },
} as const;
const knobs = {
  figure: [960, 930],
  mirror: [1250, 560],
  viewer: [860, 990],
  // Close on the sewing, then on the patch.
  sew: [960, 700],
  sewZoom: 2.2,
  patch: [960, 670],
  patchZoom: 1.7,
  // The mirror's rest, and the push on the stains.
  glass: [1060, 580],
  glassZoom: 1.05,
  stained: [1170, 565],
  stainedZoom: 1.24,
} as const;

type MirrorFrame = Frame<keyof typeof timeline & string, typeof knobs>;

export const mirror = drawing({
  timeline,
  knobs,
  draw: (f) => {
    if (f.t < f.mark('mirror')) garden(f);
    else glass(f);
  },
});

/** The garden: the circle closes round the figure, who sews fig leaves. */
const garden = (f: MirrorFrame) => {
  const { ctx, w, h, t } = f;
  const [fx, fy] = f.knob('figure');
  sky(ctx, w, h, [
    [0, C.peachTop],
    [1, C.peachLow],
  ]);
  const cam = shotPath(GARDEN, [
    [f.at('toSew'), knobCamera(f.knob('sew'), f.knob('sewZoom'))],
    [f.at('toPatch'), knobCamera(f.knob('patch'), f.knob('patchZoom'))],
    [f.at('wide'), GARDEN],
  ]);
  const sewing = f.at('toSew') * (1 - f.at('promise'));
  const promise = f.at('promise') * (1 - f.at('sheepish'));
  const sheepish = f.at('sheepish') * (1 - f.at('droop'));
  const droop = f.at('droop');
  const stitch = Math.sin(t * 9);
  multiplane(
    ctx,
    cam,
    w,
    h,
    [
      {
        z: 1.5,
        draw: () => {
          for (const [x, s, k] of [
            [180, 1.5, 1],
            [560, 1.1, 2],
            [1420, 1.2, 3],
            [1760, 1.6, 4],
          ] as const)
            at(ctx, { x, y: 900, scale: s }, () =>
              tree(ctx, f.hand(`tree${k}`), {
                height: 230,
                trunk: 44,
                lobes: 5,
                spread: 70,
                leaves: [C.leaf, C.leafPale],
                seed: k,
              }),
            );
          piece(ctx, rectShape(-600, 880, 3120, 500), C.boardLight, f.hand('ground'), {
            role: 'scenery',
            line: 0,
            torn: 3,
          });
        },
      },
      {
        z: 1,
        lift: 1.2,
        draw: () => {
          ring(ctx, f.hand('ring'), fx, fy - 200, lerp(1400, 640, f.at('shrink')));
          at(ctx, { x: fx, y: fy, scale: 1.8 }, () => {
            person(
              ctx,
              {
                look: [
                  lerp(lerp(0, -1, sewing), 0, sheepish),
                  lerp(lerp(-2, 4, sewing) - 4 * promise, 1.5, sheepish),
                ],
                nod: 5 * sewing * (1 - sheepish),
                tilt: 0.08 * sewing - 0.1 * sheepish,
                browL: -1 * sewing + 2 * promise + 4 * sheepish + 3 * droop,
                browR: -1 * sewing + 3 * promise + 5 * sheepish + 4 * droop,
                browTilt: -0.25 * sewing + 0.45 * sheepish + 0.4 * droop,
                mouth: 0.4 * droop,
                handL: sewing > 0.05 ? [-28, -84] : undefined,
                handR:
                  sewing + promise > 0.05
                    ? [lerp(22 + 14 * stitch, 40, promise), lerp(-86 - 10 * stitch, -184, promise)]
                    : undefined,
              },
              f.hand('sewer'),
            );
            apron(ctx, f.hand('apron'), 1 + 1.2 * f.at('leaves') + 3.8 * f.at('patches'), droop);
            // The needle and its thread, while they sew.
            if (sewing > 0.05 && promise < 0.5) {
              const nx = 22 + 14 * stitch;
              const ny = -86 - 10 * stitch;
              stroke(
                ctx,
                line([nx, ny], [nx + 10, ny - 22]),
                { color: C.inkSoft, width: 2.5, jitter: 0.2, boil: 'crawl' },
                f.hand('needle'),
              );
              stroke(
                ctx,
                line([nx + 10, ny - 22], [-6, -70]),
                { color: C.scarlet, width: 1.5, jitter: 0.6, boil: 'crawl' },
                f.hand('thread'),
              );
            }
          });
          // A leaf or two falls as the apron wilts.
          for (const k of [0, 1] as const) {
            const fall = clamp(f.at('droop') * 1.4 - k * 0.3);
            if (fall <= 0) continue;
            at(
              ctx,
              {
                x: fx + (k - 0.5) * 120 + 40 * fall,
                y: fy - 150 + 150 * fall,
                rot: 1.8 * fall * (k - 0.5),
              },
              () =>
                piece(ctx, blob(0, 0, 40, 28, 50 + k), C.boardShade, sub(f.hand('fallen'), k), {
                  role: 'scenery',
                  line: 2,
                  alpha: 1 - 0.3 * fall,
                }),
            );
          }
        },
      },
    ],
    { rest: [960, 540], haze: C.peachLow, thickness: 0.5 },
  );
};

/** The tablets stand up as a mirror; the glass shows every stain. */
const glass = (f: MirrorFrame) => {
  const { ctx, w, h, t } = f;
  const [mx, my] = f.knob('mirror');
  const [vx, vy] = f.knob('viewer');
  const stand = f.at('stand');
  const become = f.at('become');
  const flare = f.at('flare');
  const scrub = f.at('scrub') * (1 - f.at('glance'));
  const glance = f.at('glance');
  const GLASS = knobCamera(f.knob('glass'), f.knob('glassZoom'));
  const cam = shotPath(GLASS, [
    [f.at('push'), knobCamera(f.knob('stained'), f.knob('stainedZoom'))],
    [f.at('back'), GLASS],
  ]);
  const rub = Math.sin(t * 13) * 16 * scrub;
  const handR: [number, number] = [lerp(30, 70, scrub), lerp(-60, -124, scrub) + rub];

  camera(ctx, cam, w, h, () => {
    // The tablets, standing up...
    if (become < 1)
      at(ctx, { x: mx, y: my + 200 * (1 - stand), scale: 2.2 }, () => {
        ctx.save();
        ctx.globalAlpha *= 1 - become;
        ctx.scale(1, Math.max(0.05, stand));
        tablets(ctx, f.hand);
        ctx.restore();
      });
    // ...and the mirror they become.
    if (become > 0) {
      ground(ctx, mx, my + 400, 600);
      at(ctx, { x: mx, y: my, scale: lerp(0.7, 1, become) }, () => {
        ctx.save();
        ctx.globalAlpha *= become;
        piece(ctx, tabletShape(520, 780), C.stone, f.hand('frame'), {
          role: 'scenery',
          kind: 'cut',
          line: 5,
        });
        const pane = tabletShape(440, 700);
        piece(ctx, pane, C.dawnTop, f.hand('glass'), {
          role: 'scenery',
          kind: 'cut',
          line: 3,
          shadow: 0,
        });
        // The reflection: the same person, with nothing hiding the stains.
        ctx.save();
        ctx.beginPath();
        pane.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        ctx.closePath();
        ctx.clip();
        glow(ctx, 0, -40, 300, C.robe, 0.35);
        at(ctx, { x: 0, y: 330, scale: 2 }, () => {
          ctx.scale(-1, 1);
          person(
            ctx,
            {
              look: [lerp(5, 0, glance), lerp(0, 2, glance)],
              stains: STAINS,
              handR: scrub > 0.05 ? handR : undefined,
            },
            f.hand('reflection'),
          );
          // Each stain rings as the glass shows it: sharp and true.
          if (flare > 0)
            STAINS.forEach((stain, i) => {
              const cx = stain.reduce((acc, [x]) => acc + x, 0) / stain.length;
              const cy = stain.reduce((acc, [, y]) => acc + y, 0) / stain.length;
              const k = 1 + 0.9 * flare;
              stroke(
                ctx,
                [...stain, stain[0] ?? [cx, cy]].map(([x, y]): [number, number] => [
                  cx + (x - cx) * k,
                  cy + (y - cy) * k,
                ]),
                { color: C.scarlet, width: 3, jitter: 0.4, alpha: 1 - flare, closed: true },
                sub(f.hand('flare'), i),
              );
            });
        });
        // Streaks on the glass.
        for (const [x, k] of [
          [-120, 1],
          [-80, 2],
        ] as const)
          stroke(
            ctx,
            line([x, -120], [x + 90, -220]),
            { color: C.robe, width: 8, jitter: 0.3, alpha: 0.5, boil: 'none' },
            sub(f.hand('streak'), k),
          );
        ctx.restore();
        ctx.restore();
      });
    }

    // The one looking in, in the rags of their own sewing.
    at(ctx, { x: vx, y: vy, scale: 2.4 }, () => {
      person(
        ctx,
        {
          look: [lerp(5, 0, glance), lerp(0, 2, glance)],
          tilt: 0.06 * flare - 0.05 * glance,
          browL: 3 * flare - 1.5 * glance,
          browR: 4 * flare - 1.5 * glance,
          browTilt: 0.4 * flare * (1 - glance) - 0.3 * glance,
          mouth: 0.5 * flare * (1 - scrub),
          handR: scrub > 0.05 ? handR : undefined,
        },
        f.hand('viewer'),
      );
      apron(ctx, f.hand('apron'), 4, 1, 0);
      if (scrub > 0.05)
        piece(ctx, blob(handR[0] + 6, handR[1], 26, 20, 90), C.cream, f.hand('cloth'), {
          role: 'figure',
          line: 2.5,
        });
    });
  });
};
