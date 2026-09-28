// The message: Minneapolis, 1888. A cardboard meeting hall in warm peach
// light, two young preachers at the front, the congregation in rows before
// them. On "reputation" the crowd splits: half hold small stone tablets up,
// half look about for something missing. On the answer ("It was") every face
// turns to a gold light rising behind the pulpit; the tablets stay up, the law
// is not dropped. On "angel" the roof lifts off the diorama and the angel of
// Rev 14 flies in with a banner that writes the third angel's message in its
// own words. On "hand" a tablet and a cross meet in one gold emblem; on
// "three" the camera pushes through it onto the parchment page, where the
// grey figure stands in their stains and looks up. On "makes" a word of light
// falls from above into their chest, and from it a warmth spreads that washes
// the stains out; on "gifts" an open hand rises in their place and the film's
// three icons are set across its palm one by one: faith, forgiveness and
// power. From "daily" to the last word the sun arcs over them three times,
// rising into the frame and setting out of it, the page dimming and the hand
// closing a little toward each dusk and opening again at dawn.

import {
  type Camera,
  type Frame,
  type Hand,
  type Pt,
  at,
  drawing,
  ellipse,
  ellipseShape,
  line,
  spline,
  multiplane,
  probePlate,
  rectShape,
  shotPath,
  stroke,
  write,
  sub,
} from '@bible/film/canvas';
import { clamp, ease, lerp } from '@bible/film/core';
import {
  C,
  F,
  type Person,
  contact,
  glow,
  knobCamera,
  icons,
  openHand,
  person,
  piece,
  rounded,
  sky,
  plate,
} from '../kit.ts';
import { FIGURE_STAINS, FIGURE_STAIN_SPOTS } from '../court.ts';
import { herald } from '../heaven.ts';
import { arc, flight } from '../spoken.ts';
import { crossShape, tabletShape, tablets } from '../law.ts';

/** The platform's front edge: the preachers stand on it. */
const STAGE_Y = 700;
const WINDOWS = [230, 590, 1330, 1690] as const;

/** The congregation: where each stands, their scale, and which side of the aisle. */
interface Seat {
  readonly x: number;
  readonly y: number;
  readonly s: number;
  readonly side: -1 | 1;
}
const CROWD: ReadonlyArray<Seat> = [
  { x: 170, y: 975, s: 1.5, side: -1 },
  { x: 430, y: 975, s: 1.5, side: -1 },
  { x: 690, y: 975, s: 1.5, side: -1 },
  { x: 1230, y: 975, s: 1.5, side: 1 },
  { x: 1490, y: 975, s: 1.5, side: 1 },
  { x: 1750, y: 975, s: 1.5, side: 1 },
  { x: 290, y: 1170, s: 1.95, side: -1 },
  { x: 640, y: 1170, s: 1.95, side: -1 },
  { x: 1280, y: 1170, s: 1.95, side: 1 },
  { x: 1630, y: 1170, s: 1.95, side: 1 },
];

const timeline = {
  placard: { mark: 'year', offset: 0.1, dur: 0.5, ease: 'outBack' },
  stepUp: { mark: 'two', dur: 0.6 },
  push: { mark: 'two', offset: 0.3, dur: 1.4, ease: 'inOutSine' },
  placardOut: { mark: 'two', offset: 0.1, dur: 0.4 },
  back: { mark: 'rep', dur: 1, ease: 'inOutSine' },
  split: { mark: 'rep', offset: 0.5, dur: 0.8, ease: 'outBack' },
  precious: { mark: 'precious', dur: 0.9 },
  curious: { mark: 'what', dur: 0.4 },
  light: { mark: 'answer', offset: -0.2, dur: 1.4 },
  turn: { mark: 'answer', dur: 0.6 },
  toPulpit: { mark: 'answer', offset: 0.2, dur: 1.6, ease: 'inOutSine' },
  roof: { mark: 'angel', dur: 1.1, ease: 'inCubic' },
  fly: { mark: 'angel', offset: 0.4, dur: 1.5, ease: 'outCubic' },
  flyOut: { mark: 'hand', offset: -0.2, dur: 0.9, ease: 'inCubic' },
  meet: { mark: 'hand', offset: 0.2, dur: 0.9, ease: 'outCubic' },
  golden: { after: 'meet', dur: 0.6 },
  through: { mark: 'three', offset: -0.1, dur: 0.6, ease: 'inCubic' },
  faith: { mark: 'faith', offset: -0.15, dur: 0.45, ease: 'outBack' },
  forgiveness: { mark: 'forgiveness', offset: -0.15, dur: 0.45, ease: 'outBack' },
  power: { mark: 'power', offset: -0.15, dur: 0.45, ease: 'outBack' },
  figureIn: { after: 'through', dur: 0.5, ease: 'outBack' },
  hear: { mark: 'three', offset: 0.9, dur: 0.5 },
  given: { mark: 'makes', offset: -0.6, dur: 0.8, ease: 'inOutSine' },
  warm: { after: 'given', dur: 1 },
  handIn: { mark: 'gifts', offset: -0.4, dur: 0.7, ease: 'inOutCubic' },
  // The days start on "daily" and run to the last word (`page` reads the speech's end).
  days: { mark: 'daily' },
} as const;
const knobs = {
  // The hall at rest.
  rest: [960, 560],
  restZoom: 1.1,
  // On the two preachers.
  preach: [960, 520],
  preachZoom: 1.5,
  // Toward the pulpit's light.
  pulpit: [960, 560],
  pulpitZoom: 1.15,
  // Where the figure on the page stands.
  figureAt: [960, 1010],
  angelAt: [1620, 330],
  emblem: [960, 190],
  // The open hand's palm, and the row of gifts laid across it.
  palm: [960, 860],
  gifts: [960, 875],
} as const;

type MessageFrame = Frame<keyof typeof timeline & string, typeof knobs>;

/** A tall arched window of the hall, centred on (x, y), with peach light in it. */
const hallWindow = (ctx: CanvasRenderingContext2D, hand: Hand, x: number, y: number) => {
  at(ctx, { x, y }, () => {
    piece(ctx, tabletShape(130, 300), C.peachTop, hand, { line: 5 });
    glow(ctx, 0, 40, 160, C.glow, 0.5);
    stroke(
      ctx,
      line([0, -85], [0, 150]),
      { color: C.boardDeep, width: 5, jitter: 0.3 },
      sub(hand, 1),
    );
    stroke(
      ctx,
      line([-65, 20], [65, 20]),
      { color: C.boardDeep, width: 5, jitter: 0.3 },
      sub(hand, 2),
    );
  });
};

export const message = drawing({
  timeline,
  knobs,
  draw: (f) => {
    const { ctx, w, h, t } = f;
    const through = f.at('through');

    if (through < 1) {
      sky(ctx, w, h, [
        [0, C.tealTop],
        [0.6, C.tealMid],
        [1, C.tealLow],
      ]);
      const REST = knobCamera(f.knob('rest'), f.knob('restZoom'));
      const cam = shotPath(REST, [
        [f.at('push'), knobCamera(f.knob('preach'), f.knob('preachZoom'))],
        [f.at('back'), REST],
        [f.at('toPulpit'), knobCamera(f.knob('pulpit'), f.knob('pulpitZoom'))],
      ]);
      const roof = f.at('roof');
      const up: Camera = { ...cam, y: cam.y - 60 * roof, zoom: lerp(cam.zoom ?? 1, 1, roof) };
      hall(f, up, roof);

      // The angel of Rev 14, with the message on its banner.
      const [ax, ay] = f.knob('angelAt');
      const fly = f.at('fly');
      const out = f.at('flyOut');
      if (fly > 0 && out < 1) {
        const x = lerp(-700, ax, fly) + 1500 * out;
        const y = ay + Math.sin(t * 2.2) * 8 - 120 * out;
        // The banner fades as the angel leaves; its words are written only
        // once the angel has come to rest.
        ctx.save();
        ctx.globalAlpha *= 1 - Math.min(1, out * 4);
        at(ctx, { x, y }, () =>
          herald(ctx, f.hand, t, fly < 1 ? 0 : Math.min(1, f.spoken('banner', 'hand') * 1.25)),
        );
        ctx.restore();
      }

      // The law and the gospel, hand in hand: a tablet and a cross meet.
      const meet = f.at('meet');
      if (meet > 0) {
        const [ex, ey] = f.knob('emblem');
        const zoom = lerp(1, 7, ease.inCubic(through));
        at(ctx, { x: ex, y: ey, scale: 1.3 * zoom }, () => emblem(f, meet, f.at('golden')));
      }
    }

    // Through to the parchment: the answer's shape.
    if (through > 0) {
      ctx.save();
      ctx.globalAlpha *= through;
      page(f);
      ctx.restore();
    }
  },
});

/** The figure on the page: its scale (where it stands is the `figureAt` knob). */
const FIGURE_S = 2.6;
/** The open hand's scale, and the gifts' row scale across its palm. */
const HAND_S = 2.2;
const GIFTS_S = 0.6;
/**
 * The sun's path across each day: the horizon's ends, and a horizon below
 * the frame, so it rises into view at dawn and sets out of it at dusk, and
 * the next day's dawn begins where nothing shows; and the noon height.
 */
const DAWN_X = 160;
const DUSK_X = 1760;
const HORIZON_Y = 1300;
const NOON_Y = 130;
const DAYS = 3;
/** How much of a day the days take to come in and to go: the dusk dims and the hand's close ease in and out over it. */
const DAYS_EASE = 0.5;
/** Where the word of light that falls into the figure's chest on "makes" starts, above the page. */
const MAKES_FROM: Pt = [1320, -120];
/** Each stain's reach from the light in the chest, and one scratch list of their wash. */
const STAIN_REACH = FIGURE_STAIN_SPOTS.map(([x, y]) => Math.hypot(x, y + 80) / 40);
const WASH: number[] = FIGURE_STAIN_SPOTS.map(() => 0);
/** The icons' glow and shown, reused every frame. */
const LIT: [number, number, number] = [0, 0, 0];
const POPS: [number, number, number] = [0, 0, 0];

/**
 * The parchment page: on "makes" the grey figure, a warm light rising in
 * the chest as the stains fade; on "gifts" the open hand rises in its place
 * and the three icons are set across its palm one by one; on "daily" the sun
 * arcs over them three times, the hand closing a little at each dusk and
 * opening again at dawn.
 */
const page = (f: MessageFrame) => {
  const { ctx, w, h } = f;
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, w, h);

  // The days, from "daily" to the last word: where the sun is in the current
  // one and how high, and how deep into dusk the page is, which eases in over
  // the first half day and out over the last, so the page, the icons and the
  // hand leave and rejoin the day before and after without a step.
  const from = f.cue('days').start;
  const days = clamp((f.t - from) / (f.speech.end - from));
  const k = (days * DAYS) % 1;
  const noon = Math.sin(Math.PI * k);
  const settle = clamp(Math.min(days, 1 - days) * (DAYS / DAYS_EASE));
  const dusk = (1 - noon) * settle;
  if (days > 0 && days < 1) sun(ctx, f.hand('sun'), k, noon, dusk, w, h);

  const handIn = f.at('handIn');
  if (handIn < 1) pageFigure(f, handIn);

  if (handIn > 0) {
    const [px, py] = f.knob('palm');
    const [gx, gy] = f.knob('gifts');
    const close = clamp(1 - 3 * noon) * settle;
    ctx.save();
    ctx.globalAlpha *= handIn;
    at(ctx, { x: px, y: lerp(py + 400, py, handIn), scale: HAND_S }, () =>
      openHand(ctx, f.hand, 1 - 0.3 * close),
    );
    ctx.restore();
    POPS[0] = f.at('faith');
    POPS[1] = f.at('forgiveness');
    POPS[2] = f.at('power');
    for (let i = 0; i < 3; i++) LIT[i] = (POPS[i] ?? 0) * (1 - dusk);
    at(ctx, { x: gx, y: gy, scale: GIFTS_S }, () => icons(ctx, f.hand, LIT, POPS));
  }
};

/** The sun at `k` across its day, `noon` its height 0..1, and the page dimmed by `dusk`. */
const sun = (
  ctx: CanvasRenderingContext2D,
  hand: Hand,
  k: number,
  noon: number,
  dusk: number,
  w: number,
  h: number,
) => {
  if (dusk > 0) {
    ctx.save();
    ctx.globalAlpha *= 0.35 * dusk;
    ctx.fillStyle = C.peachLow;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  const x = lerp(DAWN_X, DUSK_X, k);
  const y = lerp(HORIZON_Y, NOON_Y, noon);
  glow(ctx, x, y, 160, C.glow, 0.8);
  piece(ctx, ellipseShape(x, y, 44, 44), C.gold, hand, { line: 0, shadow: 0.2 });
};

/**
 * The grey figure: in after the push through, looking up on "three". On
 * "makes" a word of light falls from above into their chest (God makes), and
 * from it a warmth spreads that washes the stains out, the nearest first.
 */
const pageFigure = (f: MessageFrame, handIn: number) => {
  const { ctx } = f;
  const shown = f.at('figureIn');
  if (shown <= 0.01) return;
  const warm = f.at('warm');
  const hear = f.at('hear');
  for (let i = 0; i < WASH.length; i++) WASH[i] = clamp(2.2 * warm - (STAIN_REACH[i] ?? 0));
  const given = f.at('given');
  const [fx, fy] = f.knob('figureAt');
  ctx.save();
  ctx.globalAlpha *= 1 - handIn;
  at(ctx, { x: fx, y: fy, scale: FIGURE_S * shown * lerp(1, 1.4, handIn) }, () => {
    contact(ctx, 0, 4, 150);
    person(
      ctx,
      {
        look: [0, lerp(-4 * hear, 3, warm)],
        tilt: -0.08 * hear * (1 - warm),
        nod: 4 * warm,
        browL: 3 * hear + 2 * warm,
        browR: 4 * hear + 2 * warm,
        browTilt: 0.35 * hear * (1 - warm),
        smile: 0.8 * warm,
        stains: FIGURE_STAINS,
        washed: WASH,
      },
      f.hand('pageFigure'),
    );
    if (warm > 0) {
      glow(ctx, 0, -80, lerp(20, 70, warm), C.glow, 0.9 * warm);
      glow(ctx, 0, -80, 26, C.gold, 0.7 * warm);
    }
  });
  ctx.restore();
  // The word of light, over the figure as it lands in the chest.
  if (given > 0 && given < 1)
    flight(ctx, arc(MAKES_FROM, [fx, fy - 80 * FIGURE_S], 60), given, f.hand('given'), 0.4);
};

/** The hall of 1888: wall and windows (which lift away as the roof), the platform, and the crowd. */
const hall = (f: MessageFrame, cam: Camera, roof: number) => {
  const { ctx, w, h, t } = f;
  const split = f.at('split');
  const turn = f.at('turn');
  const curious = f.at('curious') * (1 - turn);
  const lift = -1150 * roof;
  multiplane(
    ctx,
    cam,
    w,
    h,
    [
      {
        z: 1.3,
        draw: () => {
          if (roof >= 1) return;
          at(ctx, { x: 0, y: lift }, () => {
            piece(ctx, rectShape(-500, -300, 2920, 1080), C.boardLight, f.hand('wall'), {
              line: 0,
              torn: 3,
            });
            glow(ctx, 960, 300, 900, C.peachLow, 0.5);
            WINDOWS.forEach((x, i) => hallWindow(ctx, sub(f.hand('window'), i), x, 330));
            piece(ctx, rectShape(-500, -320, 2920, 70), C.boardShade, f.hand('beam'), {
              line: 0,
              torn: 3,
            });
            placard(f);
          });
        },
      },
      {
        z: 1,
        draw: () => {
          // The light that turns every face, rising behind the pulpit.
          const light = f.at('light');
          piece(ctx, rectShape(-500, 770, 2920, 500), C.board, f.hand('floor'), {
            line: 0,
            torn: 3,
          });
          glow(ctx, 960, 520, lerp(80, 560, light), C.glow, light);
          glow(ctx, 960, 540, lerp(40, 260, light), C.gold, 0.55 * light);
          piece(ctx, rectShape(500, STAGE_Y, 920, 90), C.boardShade, f.hand('stage'), {
            line: 3,
            torn: 2,
          });
          piece(ctx, rounded(960, STAGE_Y - 100, 150, 200, 12), C.board, f.hand('pulpit'), {
            line: 3.5,
          });
          piece(ctx, rounded(960, STAGE_Y - 200, 190, 22, 6), C.boardDeep, f.hand('pulpitTop'), {
            line: 3,
          });
          preachers(f);
        },
      },
      {
        z: 0.85,
        lift: 1.3,
        draw: () =>
          CROWD.forEach((seat, i) => {
            contact(ctx, seat.x, seat.y + 4, 150 * seat.s);
            const holds = seat.side < 0 && split > 0;
            const wander = seat.side > 0 ? split * (1 - turn) : 0;
            const toward: Pt = [((960 - seat.x) / 700) * 5, -3];
            const glance: Pt = [4 * Math.sin(t * 1.7 + i * 1.3), 1];
            const look: Pt = [
              lerp(lerp(toward[0], glance[0], wander), (960 - seat.x) / 180, turn),
              lerp(lerp(toward[1], glance[1], wander), -4, turn),
            ];
            const handR: Pt = [lerp(40, 70, split), lerp(-70, -150, split)];
            at(ctx, { x: seat.x, y: seat.y, scale: seat.s }, () => {
              person(
                ctx,
                {
                  look,
                  tilt: 0.12 * wander * Math.sin(t * 1.1 + i) + turn * ((960 - seat.x) / 4000),
                  browL: 3 * wander + 3 * turn + 2 * curious,
                  browR: 2 * wander + 4 * turn + 3 * curious,
                  browTilt: 0.45 * wander + 0.3 * turn + 0.3 * curious,
                  mouth: 0.6 * turn * (i % 3 === 0 ? 1 : 0),
                  handR: holds ? handR : undefined,
                },
                sub(f.hand('crowd'), i),
              );
              if (holds)
                at(ctx, { x: 74, y: -176 * split - 70 * (1 - split), scale: 0.3 * split }, () =>
                  tablets(ctx, (k) => sub(f.hand(k), i)),
                );
            });
          }),
      },
    ],
    { rest: [960, 540], haze: C.peachLow, thickness: 0.4 },
  );
};

/**
 * Hair hugging a head centred on `c` with radii `r`, sideburn to sideburn,
 * its hairline arched over the brow: `sweep` 1 brushes it up and back
 * (Jones), 0 is a short crop (Waggoner).
 */
const hairShape = ([cx, cy]: Pt, [rx, ry]: Pt, sweep: number): Pt[] =>
  spline(
    [
      [cx - 0.98 * rx, cy - 0.05 * ry],
      [cx - 1.04 * rx, cy - 0.5 * ry],
      [cx - 0.8 * rx, cy - (0.92 + 0.06 * sweep) * ry],
      [cx - 0.2 * rx, cy - (1.06 + 0.1 * sweep) * ry],
      [cx + 0.5 * rx, cy - (1.02 + 0.08 * sweep) * ry],
      [cx + 0.94 * rx, cy - 0.7 * ry],
      [cx + 1.03 * rx, cy - 0.3 * ry],
      [cx + 0.98 * rx, cy - 0.05 * ry],
      [cx + 0.86 * rx, cy - 0.1 * ry],
      [cx + 0.84 * rx, cy - 0.5 * ry],
      [cx + 0.4 * rx, cy - (0.72 + 0.04 * sweep) * ry],
      [cx - 0.2 * rx, cy - (0.74 + 0.04 * sweep) * ry],
      [cx - 0.8 * rx, cy - 0.5 * ry],
      [cx - 0.86 * rx, cy - 0.1 * ry],
    ],
    6,
    true,
  );

/**
 * The two preachers, told apart by silhouette alone (no labels), after their
 * portraits: Waggoner short and stocky, in round spectacles with a trim
 * moustache, holding the open Bible; Jones tall and angular, his hair brushed
 * back and a full handlebar moustache. Each: x, scale and person.
 */
const PREACHERS: ReadonlyArray<readonly [x: number, s: number, who: Person]> = [
  [
    740,
    1.75,
    {
      body: C.boardDeep,
      build: [1.05, 0.95],
      hair: C.boardShade,
      moustache: 0.35,
      onHead: (ctx, c, r, hand) => {
        piece(ctx, hairShape(c, r, 0), C.boardShade, sub(hand, 85), { line: 2.5, shadow: 0.1 });
        for (const [i, x] of [-12, 13].entries())
          stroke(
            ctx,
            ellipse(c[0] + x, c[1] - 7, 8, 8, i),
            { color: C.outline, width: 2, jitter: 0.3, taper: 0 },
            sub(hand, 80 + i),
          );
        stroke(
          ctx,
          line([c[0] - 4, c[1] - 8], [c[0] + 5, c[1] - 8]),
          { color: C.outline, width: 2, jitter: 0.3, taper: 0 },
          sub(hand, 82),
        );
      },
    },
  ],
  [
    1180,
    1.85,
    {
      body: C.inkSoft,
      build: [0.9, 1.15],
      hair: C.boardDeep,
      moustache: 1,
      onHead: (ctx, c, r, hand) =>
        piece(ctx, hairShape(c, r, 1), C.boardDeep, sub(hand, 85), { line: 2.5, shadow: 0.1 }),
    },
  ],
];

/** Waggoner and Jones on the platform, Waggoner with the Bible open. */
const preachers = (f: MessageFrame) => {
  const { ctx } = f;
  const step = f.at('stepUp');
  const precious = f.at('precious');
  const turn = f.at('turn');
  for (const [k, [x, s, who]] of PREACHERS.entries()) {
    at(ctx, { x, y: STAGE_Y - 8 * step, scale: s }, () => {
      glow(ctx, 0, -110, 170, C.glow, 0.5 * step);
      person(
        ctx,
        {
          ...who,
          shade: C.outline,
          look: [lerp(k === 0 ? 3 : -3, 0, step), lerp(0, 2, step) - 3 * turn],
          browL: 2 * step,
          browR: 2 * step,
          browTilt: 0.1,
          handL: k === 0 ? [-10, -86] : undefined,
          handR: k === 0 ? [30, -84] : [58, lerp(-80, -150, step)],
        },
        f.hand(`preacher${k}`),
      );
      if (k === 0) {
        glow(ctx, 10, -92, 90, C.gold, 0.6 * precious);
        piece(ctx, rounded(-4, -88, 44, 30, 3), C.cream, f.hand('bible'), { line: 2.5 });
        piece(ctx, rounded(-4, -88, 3, 30, 1), C.inkSoft, f.hand('spine'), { line: 0, shadow: 0 });
      }
    });
  }
};

/** Minneapolis, 1888: a placard hung on the hall's wall. */
const placard = (f: MessageFrame) => {
  const { ctx } = f;
  const show = f.at('placard') * (1 - f.at('placardOut'));
  if (show <= 0.01) return;
  at(ctx, { x: 960, y: 190, scale: show, rot: -0.02 }, () => {
    const board = plate(0, 0, 620, 110);
    piece(ctx, board, C.cream, f.hand('placard'), { line: 3, torn: 2 });
    probePlate(ctx, board, () =>
      write(
        ctx,
        'Minneapolis, 1888',
        0,
        22,
        { family: F.display, size: 62, weight: 600, color: C.ink, align: 'center' },
        f.hand('placardText'),
        {
          progress: Math.min(1, f.spoken('year', 'two') * 2.2),
          reveal: 'write',
          boil: 0.3,
        },
      ),
    );
  });
};

/** A stone tablet and a cross come together, then turn gold. */
const emblem = (f: MessageFrame, meet: number, golden: number) => {
  const { ctx } = f;
  glow(ctx, 0, 0, 420, C.glow, golden);
  at(ctx, { x: lerp(-1300, -40, meet), y: 10, rot: lerp(-0.4, 0, meet) }, () =>
    tablets(ctx, f.hand, 10 * golden),
  );
  at(ctx, { x: lerp(1300, 70, meet), y: 0, rot: lerp(0.4, 0, meet) }, () =>
    piece(ctx, crossShape(1.35), golden > 0.5 ? C.gold : C.boardLight, f.hand('cross'), {
      line: 4.5,
      shadow: 0.5,
    }),
  );
  if (golden > 0) glow(ctx, 0, 0, 260, C.gold, 0.25 * golden);
};
