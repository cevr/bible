// The centurion. A warm cardboard street at midday: the soldier (grey, with a
// Roman crest and cape) before Jesus, who offers to go to the house. Close on
// the soldier's face, one hand up: stop, just speak the word. The camera
// pulls out over the town: a gold word of light leaves Jesus and flies over
// the rooftops like a paper plane to a house far off, where the servant in
// bed sits up. Close on the servant's face, well. Then a cut back to the
// soldier, holding out an open hand, and the word settles into it while the
// definition of faith is read, held in one shot until `gift`. On `gift` the
// frame pulls back from the gold word, now the word-bubble icon, to the three
// icons in a row, and on "faith" the word-bubble lights: the first gift.

import {
  type Camera,
  type Frame,
  type Pt,
  at,
  drawing,
  multiplane,
  rectShape,
  pushOn,
  shotPath,
  sub,
  type Posed,
  ground,
  glow,
  rounded,
  knobCamera,
  sky,
} from '@bible/film/canvas';
import { clamp, lerp, rng } from '@bible/film/core';
import {
  type GestureAt,
  type Hands,
  type HeadPiece,
  type Person,
  C,
  ICON_ROW,
  ICON_SKY,
  ICON_X,
  type IconCount,
  christ,
  handOf,
  icons,
  person,
  piece,
  shifted,
} from '../kit.ts';
import { arc, flight, wordLight } from '../spoken.ts';

/** The soldier's hands: out in worry, up to stop, and held open for the word after the cut. */
const WORRIED: GestureAt = { to: [-80, -90], reach: 0, grip: 'open' };
const STOPPING: GestureAt = { to: [84, -158], reach: 0, grip: 'palm' };
const OPEN_FOR_WORD: GestureAt = { to: [72, -74], reach: 0, grip: 'open' };
/** The open hand as `handOf` reads it, for where the word settles. */
const HOLDING_WORD: Person = { near: OPEN_FOR_WORD };
/** How far above the mitten's middle the word rests, in his units. */
const ON_PALM = 12;
/** Jesus's hand out to the soldier as he offers to go. */
const OFFERING: GestureAt = { to: [-118, -112], reach: 0, grip: 'open' };

/** The people's scale on the street. */
const S = 2.2;
/** The servant's house, far across town, and its open room. */
const HOUSE_X = -1100;
const ROOM = { x: HOUSE_X, y: 790, w: 420, h: 260 };
/** Where the servant's hips rest on the bed: he lies and sits up about them. */
const HIP: Pt = [HOUSE_X - 10, 872];

/** Close on the servant at his window: framed on the house, so it stays code. */
const WINDOW: Camera = { x: HOUSE_X - 20, y: 790, zoom: 2.8 };

/** Where the soldier and Jesus stand, and the street's framings: the street, his face, the town, his hand. */
const knobs = {
  soldier: [820, 960],
  jesus: [1330, 960],
  street: [1075, 640],
  streetZoom: 1.15,
  face: [930, 630],
  faceZoom: 2.5,
  town: [130, 590],
  townZoom: 0.62,
  // The word in his hand: the shot opens at `handShotWide` and settles in to
  // `handShotZoom`, then keeps pushing in by `pushOn` while it holds.
  handShot: [800, 680],
  handShotWide: 2.05,
  handShotZoom: 2.3,
  pushOn: 1.12,
  // Where faith's disc opens on the word in his hand, in frame px, and its size there.
  iconFrom: [1410, 790],
  iconFromZoom: 1.6,
} as const;

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

/**
 * The helmet's dome, and the crest's two edges (a plume arched front to back
 * over it), each about its own centre: `helmet` places them over the head's
 * centre, the dome 33 units up, the crest's edges 46 and 44.
 */
const DOME: Pt[] = Array.from({ length: 17 }, (_, i): Pt => {
  const a = Math.PI + (Math.PI * i) / 16;
  return [Math.cos(a) * 40, Math.sin(a) * 22];
});
const CREST_TOP: Pt[] = Array.from({ length: 13 }, (_, i): Pt => {
  const a = Math.PI + (Math.PI * i) / 12;
  return [Math.cos(a) * 44, Math.sin(a) * 32];
});
const CREST_UNDER: Pt[] = Array.from({ length: 13 }, (_, i): Pt => {
  const a = 2 * Math.PI - (Math.PI * i) / 12;
  return [Math.cos(a) * 32, Math.sin(a) * 18];
});

/**
 * The soldier's helmet and crest, as his person's `onHead`: seeded from the
 * scene's `headHands` (`crest`, `helmet`), or the person's own hand without.
 */
const helmet: HeadPiece = (ctx, [cx, cy], _r, hand, hands) => {
  const crest = [...shifted(CREST_TOP, cx, cy - 46), ...shifted(CREST_UNDER, cx, cy - 44)];
  piece(ctx, crest, C.cutRust, hands?.('crest') ?? sub(hand, 30), {
    role: 'figure',
    line: 2.5,
  });
  piece(ctx, shifted(DOME, cx, cy - 33), C.cutDeep, hands?.('helmet') ?? sub(hand, 31), {
    role: 'figure',
    line: 3,
  });
};

const timeline = {
  worry: { mark: 'servant', dur: 0.5 },
  offer: { mark: 'offer', dur: 0.7 },
  push: { mark: 'only', offset: -0.2, dur: 0.9 },
  stop: { mark: 'only', offset: 0.25, dur: 0.6, ease: 'outCubic' },
  // Out over the town as he says "come", and the word leaves with it.
  pullOut: { mark: 'only', word: 'come', dur: 1.1 },
  fly: { with: 'pullOut', offset: 0.07, dur: 1.7, ease: 'inOutSine' },
  // Landed by the bed, the word's light fades.
  landed: { after: 'fly', dur: 1.5, ease: 'linear' },
  sit: { mark: 'healed', dur: 0.8, ease: 'outBack' },
  toWindow: { mark: 'room', offset: -0.4, dur: 1.1 },
  handShot: { mark: 'room', word: 'room', dur: 1.2, ease: 'outCubic' },
  open: { mark: 'def', dur: 0.6 },
  settle: { mark: 'faith', offset: -0.8, dur: 1.5, ease: 'outCubic' },
  // The word's fall into the palm, beside its glide across: down fast, then
  // resting, so its path arcs over into the hand.
  drop: { with: 'settle', dur: 1.5, ease: 'outExpo' },
  hold: { mark: 'faith', offset: 0.7, until: 'gift', ease: 'linear' },
  // Faith's disc opens on the word in his hand and pulls back to the row's
  // place; the robe and the heart pop in beside it as it settles, so no disc
  // slides in cut by the frame.
  toIcons: { mark: 'gift', offset: -0.1, dur: 0.3 },
  pullBack: { with: 'toIcons', dur: 0.9, ease: 'inOutSine' },
  robeIn: { with: 'pullBack', offset: 0.45, dur: 0.4, ease: 'outBack' },
  heartIn: { with: 'pullBack', offset: 0.6, dur: 0.4, ease: 'outBack' },
  // The word-bubble lights on "faith", a word with no mark of its own.
  // Faith pops forward in gold on its word, the other two faded back.
  faithLit: { mark: 'gift', word: 'faith', dur: 0.6, ease: 'outBack' },
} as const;

type CenturionFrame = Frame<keyof typeof timeline & string, typeof knobs>;

/** The three icons' light, faith's set each frame (a scratch tuple, so the draw allocates none). */
const LIT: [number, number, number] = [0, 0, 0];
const LEAD: [number, number, number] = [0, 0, 0];
const COUNT: Posed<IconCount> = { lead: LEAD, dim: 0 };
/** Each icon's size as the row settles: faith from the word, the other two popping in. */
const SHOWN: [number, number, number] = [1, 0, 0];

export const centurion = drawing({
  knobs,
  timeline,
  draw: (f) => {
    const { ctx, w, h } = f;
    const hand = (k: string) => f.hand(k);
    const toIcons = f.at('toIcons');
    if (toIcons < 1) street(f, hand);

    // Pull back from the gold word to the three icons; faith's lights.
    if (toIcons > 0) {
      const pull = f.at('pullBack');
      const [fx, fy] = f.knob('iconFrom');
      const from = f.knob('iconFromZoom');
      SHOWN[1] = f.at('robeIn');
      SHOWN[2] = f.at('heartIn');
      ctx.save();
      ctx.globalAlpha *= toIcons;
      sky(ctx, w, h, ICON_SKY);
      at(
        ctx,
        {
          x: lerp(fx - ICON_X[0] * from, ICON_ROW.x, pull),
          y: lerp(fy, ICON_ROW.y, pull),
          scale: lerp(from, ICON_ROW.scale, pull),
        },
        () => {
          const lit = f.at('faithLit');
          LIT[0] = clamp(lit);
          LEAD[0] = lit;
          COUNT.dim = clamp(lit);
          icons(ctx, hand, LIT, SHOWN, COUNT);
        },
      );
      ctx.restore();
    }
  },
});

/** The street, the town and the servant's house, up to the word held in the soldier's hand. */
const street = (f: CenturionFrame, hand: Hands) => {
  const { ctx, w, h, t } = f;
  const STREET = knobCamera(f.knob('street'), f.knob('streetZoom'));

  const shot = f.cue('handShot');
  const inHand = t >= shot.start;
  const cam = inHand
    ? pushOn(
        shotPath(knobCamera(f.knob('handShot'), f.knob('handShotWide')), [
          [f.at('handShot'), knobCamera(f.knob('handShot'), f.knob('handShotZoom'))],
        ]),
        f.knob('pushOn'),
        f.at('hold'),
      )
    : shotPath(STREET, [
        [f.at('push'), knobCamera(f.knob('face'), f.knob('faceZoom'))],
        [f.at('pullOut'), knobCamera(f.knob('town'), f.knob('townZoom'))],
        [f.at('toWindow'), WINDOW],
      ]);

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
  // His hands: out in worry, then up to stop; after the cut to his hand, held
  // open for the word. Jesus's hand out as he offers to go.
  WORRIED.reach = worry;
  STOPPING.reach = stop;
  OPEN_FOR_WORD.reach = open;
  OFFERING.reach = offer;

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
                role: 'scenery',
                kind: 'cut',
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
                role: 'scenery',
                kind: 'cut',
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
                role: 'scenery',
                kind: 'cut',
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
          // Read on this plane, where the two of them are drawn, so the lab's handles land on them.
          const SOLDIER = f.knob('soldier');
          const JESUS = f.knob('jesus');
          const flyPath = arc([JESUS[0] - 40, 600], [ROOM.x - 120, ROOM.y - 30], 520);
          // The street.
          piece(ctx, rectShape(-2600, 950, 5400, 600), C.board, hand('street'), {
            role: 'scenery',
            line: 0,
            torn: 4,
          });

          // The servant's house, open to show the room.
          piece(ctx, rectShape(HOUSE_X - 330, 520, 660, 440), C.boardLight, hand('house'), {
            role: 'scenery',
            kind: 'cut',
            line: 3,
            torn: 2,
          });
          piece(ctx, rectShape(HOUSE_X - 360, 500, 720, 40), C.boardDeep, hand('roof'), {
            role: 'scenery',
            kind: 'cut',
            line: 3,
          });
          const room = rounded(ROOM.x, ROOM.y, ROOM.w, ROOM.h, 16);
          piece(ctx, room, C.peachLow, hand('room'), {
            role: 'scenery',
            kind: 'cut',
            line: 4,
            shadow: 0,
          });
          ctx.save();
          ctx.beginPath();
          room.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
          ctx.closePath();
          ctx.clip();
          glow(ctx, ROOM.x - 100, ROOM.y - 40, 300, C.glow, sit);
          piece(ctx, rounded(HOUSE_X, 905, 340, 44, 10), C.boardDeep, hand('bed'), {
            role: 'scenery',
            kind: 'cut',
            line: 3,
          });
          piece(ctx, rounded(HOUSE_X - 140, 868, 80, 30, 12), C.cream, hand('pillow'), {
            role: 'scenery',
            kind: 'cut',
            line: 2.5,
          });
          at(ctx, { x: HIP[0], y: HIP[1], rot: lerp(-Math.PI / 2 + 0.05, -0.06, sit) }, () =>
            at(ctx, { x: 0, y: 60 * 1.4, scale: 1.4 }, () =>
              person(
                ctx,
                {
                  skin: sit > 0.3 ? C.figure : C.figureShade,
                  body: C.figure,
                  // In bed: the blanket and the bed carry the shadows.
                  ground: 0,
                  look: [lerp(-1, 3, sit), lerp(2, -3, sit)],
                  browL: 3 * sit,
                  browR: 3 * sit,
                  browTilt: lerp(0.5, 0.3, sit),
                  eyes: sit,
                  smile: sit,
                  mouth: 0.5 * sit * (1 - f.at('toWindow')) + 0.3 * f.at('toWindow'),
                },
                hand('servant'),
              ),
            ),
          );
          piece(ctx, rounded(HOUSE_X + 60, 890, 240, 44, 14), C.cream, hand('blanket'), {
            role: 'scenery',
            kind: 'cut',
            line: 3,
          });
          ctx.restore();

          // The soldier, his cape behind him; his shadow lies under the cape too.
          ground(ctx, SOLDIER[0], SOLDIER[1] + 4, 200);
          at(ctx, { x: SOLDIER[0], y: SOLDIER[1], scale: S }, () => {
            piece(
              ctx,
              [
                [-40, -122],
                [40, -122],
                [62, -6],
                [-62, -6],
              ],
              C.cutRust,
              hand('cape'),
              { role: 'figure', line: 3 },
            );
            person(
              ctx,
              {
                ground: 0,
                tilt: 0.06 * worry - 0.05 * stop + 0.12 * open,
                nod: 4 * worry + 5 * open,
                onHead: helmet,
                headHands: hand,
                look: inHand ? [2, lerp(0, 4, open)] : [lerp(3, -2, worry), worry],
                browL: 3 * stop + 2 * worry,
                browR: 2 * stop + 2 * worry,
                browTilt: 0.45 * worry + 0.2 * stop,
                mouth: 0.5 * stop,
                far: WORRIED,
                near: inHand ? OPEN_FOR_WORD : STOPPING,
              },
              hand('soldier'),
            );
            piece(ctx, rounded(0, -58, 70, 10, 4), C.cutDeep, hand('belt'), {
              role: 'figure',
              line: 2,
            });
          });

          // Jesus, offering to go.
          glow(ctx, JESUS[0], JESUS[1] - 250, 320, C.glow, 0.7);
          at(ctx, { x: JESUS[0] - 20 * offer, y: JESUS[1], scale: S }, () =>
            christ(
              ctx,
              {
                tilt: -0.05 * offer,
                look: [-3, 1],
                browTilt: 0.15,
                far: OFFERING,
              },
              hand,
            ),
          );

          // The word, over the roofs to the bed.
          const fly = f.at('fly');
          if (fly < 1) flight(ctx, flyPath, fly, hand('word'), 1.1);
          else if (!inHand)
            at(ctx, { x: ROOM.x - 120, y: ROOM.y - 40 + 5 * Math.sin(t * 2) }, () =>
              wordLight(ctx, hand('word'), 0.3, 1 - f.at('landed')),
            );

          // In the soldier's open hand, the word settles.
          const settle = f.at('settle');
          if (inHand && settle > 0) {
            // On the open mitten, just above its middle.
            const [px, py] = handOf(HOLDING_WORD, 'near', hand('soldier'));
            const palm: Pt = [SOLDIER[0] + px * S, SOLDIER[1] + (py - ON_PALM) * S];
            at(
              ctx,
              {
                x: lerp(palm[0] + 260, palm[0], settle),
                y: lerp(palm[1] - 320, palm[1], f.at('drop')) + 3 * Math.sin(t * 2),
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
};
