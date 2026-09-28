// The message: Minneapolis, 1888. A cardboard meeting hall in warm peach
// light, two young preachers at the front, the congregation in rows before
// them. On "reputation" the crowd splits: half hold small stone tablets up,
// half look about for something missing. On the answer ("It was") every face
// turns to a gold light rising behind the pulpit; the tablets stay up, the law
// is not dropped. On "angel" the roof lifts off the diorama and the angel of
// Rev 14 flies in with a banner that writes the third angel's message in its
// own words. On "hand" a tablet and a cross meet in one gold emblem; on
// "three" the camera pushes through it onto the parchment page, where the
// film's three icons appear one by one: the three gifts, faith, forgiveness
// and power. (The script's `makes`, `gifts` and `daily` shots are not drawn
// yet.)

import {
  type Camera,
  type Frame,
  type Hand,
  type Pt,
  at,
  drawing,
  line,
  multiplane,
  probePlate,
  rectShape,
  stroke,
  write,
  sub,
} from '@bible/film/canvas';
import { ease, lerp } from '@bible/film/core';
import { C, F, contact, glow, icons, person, piece, rounded, sky, plate, between } from '../kit.ts';
import { herald } from '../heaven.ts';
import { crossShape, tabletShape, tablets } from '../law.ts';

const REST: Camera = { x: 960, y: 560, zoom: 1.1 };
/** On the two preachers. */
const PREACH: Camera = { x: 960, y: 520, zoom: 1.5 };
/** Toward the pulpit's light. */
const PULPIT: Camera = { x: 960, y: 560, zoom: 1.15 };

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
} as const;
const knobs = { angelAt: [1620, 330], emblem: [960, 190] } as const;

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
      const cam = between(
        between(between(REST, PREACH, f.at('push')), REST, f.at('back')),
        PULPIT,
        f.at('toPulpit'),
      );
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

    // Through to the parchment: the answer's shape in three icons.
    if (through > 0) {
      ctx.save();
      ctx.globalAlpha *= through;
      ctx.fillStyle = C.paper;
      ctx.fillRect(0, 0, w, h);
      const pops = [f.at('faith'), f.at('forgiveness'), f.at('power')] as const;
      at(ctx, { x: 960, y: 540 }, () => icons(ctx, f.hand, pops, pops));
      ctx.restore();
    }
  },
});

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

/** Waggoner and Jones on the platform, one with the Bible open. */
const preachers = (f: MessageFrame) => {
  const { ctx } = f;
  const step = f.at('stepUp');
  const precious = f.at('precious');
  const turn = f.at('turn');
  for (const [k, x, s] of [
    [0, 740, 1.75],
    [1, 1180, 1.85],
  ] as const) {
    at(ctx, { x, y: STAGE_Y - 8 * step, scale: s }, () => {
      glow(ctx, 0, -110, 170, C.glow, 0.5 * step);
      person(
        ctx,
        {
          body: C.boardDeep,
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
