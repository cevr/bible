// The centurion. A warm cardboard street at midday: the soldier (grey, with a
// Roman crest and cape) before Jesus, who offers to go to the house. Close on
// the soldier's face, one hand up: stop, just speak the word. The camera
// pulls out over the town: a gold word of light leaves Jesus and flies over
// the rooftops like a paper plane to a house far off, where the servant in
// bed sits up. Close on the servant's face, well. Then a cut back to the
// soldier, holding out an open hand, and the word settles into it while the
// definition of faith is read, held in one shot.

import { type Camera, type Pt, at, drawing, multiplane, rectShape } from '@bible/film/canvas';
import { clamp, ease, lerp, rng } from '@bible/film/core';
import {
  C,
  HEAD,
  NECK,
  christ,
  contact,
  glow,
  person,
  piece,
  rounded,
  sky,
  sub,
  between,
} from '../kit.ts';
import { arc, flight, wordLight } from '../spoken.ts';

const SOLDIER: Pt = [820, 960];
const JESUS: Pt = [1330, 960];
/** The people's scale on the street. */
const S = 2.2;
/** The servant's house, far across town, and its open room. */
const HOUSE_X = -1100;
const ROOM = { x: HOUSE_X, y: 790, w: 420, h: 260 };
/** Where the servant's hips rest on the bed: he lies and sits up about them. */
const HIP: Pt = [HOUSE_X - 10, 872];

const STREET: Camera = { x: 1075, y: 640, zoom: 1.15 };
const FACE: Camera = { x: 930, y: 630, zoom: 2.5 };
const TOWN: Camera = { x: 130, y: 590, zoom: 0.62 };
const WINDOW: Camera = { x: HOUSE_X - 20, y: 790, zoom: 2.8 };
const HANDSHOT: Camera = { x: 800, y: 680, zoom: 2.3 };

interface Roof {
  readonly x: number;
  readonly w: number;
  readonly top: number;
  readonly lit: boolean;
}

/** A row of flat-roofed houses from x0 to x1, each `w` wide, standing to `top`. */
const roofs = (seed: number, x0: number, x1: number, low: number, high: number): Roof[] => {
  const r = rng(seed);
  const out: Roof[] = [];
  let x = x0;
  while (x < x1) {
    const w = lerp(180, 320, r());
    out.push({ x: x + w / 2, w, top: lerp(low, high, r()), lit: r() > 0.5 });
    x += w - 12;
  }
  return out;
};

const FAR = roofs(8, -2400, 2600, 420, 600);
/** The street's own houses, clear of the servant's. */
const NEAR = roofs(33, -800, 2400, 480, 640);

/** The soldier's helmet and crest, over a person's head turned by `tilt` and dropped by `nod`. */
const helmet = (
  ctx: CanvasRenderingContext2D,
  tilt: number,
  nod: number,
  hand: (k: string) => { boil: number; seed: number },
) => {
  ctx.save();
  ctx.translate(NECK[0], NECK[1] + nod);
  ctx.rotate(tilt);
  ctx.translate(-NECK[0], -NECK[1]);
  const [cx, cy] = HEAD;
  const dome: Pt[] = Array.from({ length: 17 }, (_, i): Pt => {
    const a = Math.PI + (Math.PI * i) / 16;
    return [cx + Math.cos(a) * 40, cy - 33 + Math.sin(a) * 22];
  });
  // The crest: a plume arched front to back over the helmet.
  const plume: Pt[] = [
    ...Array.from({ length: 13 }, (_, i): Pt => {
      const a = Math.PI + (Math.PI * i) / 12;
      return [cx + Math.cos(a) * 44, cy - 46 + Math.sin(a) * 32];
    }),
    ...Array.from({ length: 13 }, (_, i): Pt => {
      const a = 2 * Math.PI - (Math.PI * i) / 12;
      return [cx + Math.cos(a) * 32, cy - 44 + Math.sin(a) * 18];
    }),
  ];
  piece(ctx, plume, C.sunsetLow, hand('crest'), { line: 2.5 });
  piece(ctx, dome, C.boardDeep, hand('helmet'), { line: 3 });
  ctx.restore();
};

export const centurion = drawing({
  timeline: {
    worry: { mark: 'servant', dur: 0.5 },
    offer: { mark: 'offer', dur: 0.7 },
    push: { mark: 'only', offset: -0.2, dur: 0.9 },
    stop: { mark: 'only', offset: 0.25, dur: 0.4, ease: 'outBack' },
    pullOut: { mark: 'only', offset: 2.3, dur: 1.1 },
    fly: { mark: 'healed', offset: -1.75, dur: 1.7, ease: 'inOutSine' },
    sit: { mark: 'healed', dur: 0.8, ease: 'outBack' },
    toWindow: { mark: 'room', offset: -0.4, dur: 1.1 },
    handShot: { mark: 'exactly', offset: -0.2, dur: 1.2, ease: 'outCubic' },
    open: { mark: 'def', dur: 0.6 },
    settle: { mark: 'faith', offset: -0.8, dur: 1.5, ease: 'outCubic' },
    hold: { mark: 'faith', offset: 0.7, dur: 5.5, ease: 'linear' },
  },
  draw: (f) => {
    const { ctx, w, h, t } = f;
    const hand = (k: string) => f.hand(k);

    const shot = f.cue('handShot');
    const inHand = t >= shot.start;
    const cam = inHand
      ? {
          x: HANDSHOT.x,
          y: HANDSHOT.y,
          zoom: lerp(2.05, HANDSHOT.zoom ?? 1, f.at('handShot')) * lerp(1, 1.12, f.at('hold')),
        }
      : between(
          between(between(STREET, FACE, f.at('push')), TOWN, f.at('pullOut')),
          WINDOW,
          f.at('toWindow'),
        );

    sky(ctx, w, h, [
      [0, C.tealTop],
      [0.55, C.tealMid],
      [1, C.peachLow],
    ]);
    glow(ctx, 1500, 160, 600, C.glow, 0.6);

    const sit = f.at('sit');
    const worry = f.at('worry') * (1 - f.at('stop'));
    const stop = f.at('stop') * (1 - f.at('pullOut'));
    const open = f.at('open');
    const offer = f.at('offer') * (1 - f.at('push'));
    const flyPath = arc([JESUS[0] - 40, 600], [ROOM.x - 120, ROOM.y - 30], 520);

    multiplane(
      ctx,
      cam,
      w,
      h,
      [
        {
          // The far roofs of the town.
          z: 1.8,
          draw: () =>
            FAR.forEach((b, i) =>
              piece(
                ctx,
                rectShape(b.x - b.w / 2, b.top, b.w, 1300 - b.top),
                C.boardShade,
                sub(hand('far'), i),
                {
                  line: 0,
                  torn: 3,
                  shadow: 0.4,
                },
              ),
            ),
        },
        {
          // The street's houses, their windows lit or dark.
          z: 1.3,
          draw: () =>
            NEAR.forEach((b, i) => {
              piece(
                ctx,
                rectShape(b.x - b.w / 2, b.top, b.w, 1200 - b.top),
                C.boardLight,
                sub(hand('near'), i),
                {
                  line: 0,
                  torn: 3,
                  shadow: 0.5,
                },
              );
              piece(
                ctx,
                rounded(b.x, b.top + 90, 50, 64, 22),
                b.lit ? C.glow : C.boardDeep,
                sub(hand('nw'), i),
                {
                  line: 0,
                  torn: 1.4,
                  shadow: 0.2,
                },
              );
            }),
        },
        {
          z: 1,
          lift: 1.3,
          draw: () => {
            // The street.
            piece(ctx, rectShape(-2600, 950, 5400, 600), C.board, hand('street'), {
              line: 0,
              torn: 4,
            });

            // The servant's house, open to show the room.
            piece(ctx, rectShape(HOUSE_X - 330, 520, 660, 440), C.boardLight, hand('house'), {
              line: 3,
              torn: 2,
            });
            piece(ctx, rectShape(HOUSE_X - 360, 500, 720, 40), C.boardDeep, hand('roof'), {
              line: 3,
            });
            const room = rounded(ROOM.x, ROOM.y, ROOM.w, ROOM.h, 16);
            piece(ctx, room, C.peachLow, hand('room'), { line: 4, shadow: 0 });
            ctx.save();
            ctx.beginPath();
            room.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
            ctx.closePath();
            ctx.clip();
            glow(ctx, ROOM.x - 100, ROOM.y - 40, 300, C.glow, sit);
            piece(ctx, rounded(HOUSE_X, 905, 340, 44, 10), C.boardDeep, hand('bed'), { line: 3 });
            piece(ctx, rounded(HOUSE_X - 140, 868, 80, 30, 12), C.cream, hand('pillow'), {
              line: 2.5,
            });
            at(ctx, { x: HIP[0], y: HIP[1], rot: lerp(-Math.PI / 2 + 0.05, -0.06, sit) }, () =>
              at(ctx, { x: 0, y: 60 * 1.4, scale: 1.4 }, () =>
                person(
                  ctx,
                  {
                    skin: sit > 0.3 ? C.figure : C.figureShade,
                    body: C.figure,
                    look: [lerp(-1, 3, sit), lerp(2, -3, sit)],
                    browL: 3 * sit,
                    browR: 3 * sit,
                    browTilt: lerp(0.5, -0.1, sit),
                    mouth: 0.5 * sit * (1 - f.at('toWindow')) + 0.3 * f.at('toWindow'),
                  },
                  hand('servant'),
                ),
              ),
            );
            piece(ctx, rounded(HOUSE_X + 60, 890, 240, 44, 14), C.cream, hand('blanket'), {
              line: 3,
            });
            ctx.restore();

            // The soldier, his cape behind him.
            contact(ctx, SOLDIER[0], SOLDIER[1] + 4, 200);
            at(ctx, { x: SOLDIER[0], y: SOLDIER[1], scale: S }, () => {
              piece(
                ctx,
                [
                  [-40, -122],
                  [40, -122],
                  [62, -6],
                  [-62, -6],
                ],
                C.sunsetLow,
                hand('cape'),
                { line: 3 },
              );
              const tilt = 0.06 * worry - 0.05 * stop + 0.12 * open;
              const nod = 4 * worry + 5 * open;
              person(
                ctx,
                {
                  tilt,
                  nod,
                  look: inHand ? [2, lerp(0, 4, open)] : [lerp(3, -2, worry), worry],
                  browL: 3 * stop + 2 * worry,
                  browR: 2 * stop + 2 * worry,
                  browTilt: 0.45 * worry + 0.2 * stop,
                  mouth: 0.5 * stop,
                  handL: [lerp(-36, -80, worry), lerp(-40, -90, worry)],
                  handR: inHand
                    ? [lerp(40, 72, open), lerp(-40, -74, open)]
                    : [lerp(40, 84, stop), lerp(-40, -158, stop)],
                },
                hand('soldier'),
              );
              piece(ctx, rounded(0, -58, 70, 10, 4), C.boardDeep, hand('belt'), { line: 2 });
              helmet(ctx, tilt, nod, hand);
            });

            // Jesus, offering to go.
            contact(ctx, JESUS[0], JESUS[1] + 4, 200);
            glow(ctx, JESUS[0], JESUS[1] - 250, 320, C.glow, 0.7);
            at(ctx, { x: JESUS[0] - 20 * offer, y: JESUS[1], scale: S }, () =>
              christ(
                ctx,
                {
                  tilt: -0.05 * offer,
                  look: [-3, 1],
                  browTilt: 0.15,
                  handL: [lerp(-36, -118, offer), lerp(-40, -112, offer)],
                  handR: [34, -44],
                },
                hand,
              ),
            );

            // The word, over the roofs to the bed.
            const fly = f.at('fly');
            if (fly < 1) flight(ctx, flyPath, fly, hand('word'), 1.1);
            else if (!inHand)
              at(ctx, { x: ROOM.x - 120, y: ROOM.y - 40 + 5 * Math.sin(t * 2) }, () =>
                wordLight(ctx, hand('word'), 0.3, 1 - clamp((t - f.cue('fly').end) / 1.5)),
              );

            // In the soldier's open hand, the word settles.
            const settle = f.at('settle');
            if (inHand && settle > 0) {
              const palm: Pt = [SOLDIER[0] + 72 * S, SOLDIER[1] - 74 * S - 22];
              at(
                ctx,
                {
                  x: lerp(palm[0] + 260, palm[0], settle),
                  y: lerp(palm[1] - 320, palm[1], ease.outCubic(settle)) + 3 * Math.sin(t * 2),
                  rot: 0.3 * (1 - settle),
                },
                () => wordLight(ctx, hand('held'), 0.4, lerp(0.6, 1, settle)),
              );
            }
          },
        },
      ],
      { rest: [STREET.x, STREET.y], haze: C.tealLow, thickness: 0.35 },
    );
  },
});
