// The message: Minneapolis, 1888. On "how" the grey figure from `mirror`,
// small in the rags of their own sewing, looks up at the one lit window of a
// cardboard meeting hall at dusk; on "year" the camera pushes through the
// window into the hall in warm peach light, two preachers at the front, the
// congregation in rows before them. On "reputation" the crowd splits: half hold small stone tablets up,
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
  camera,
  drawing,
  ellipse,
  ellipseShape,
  line,
  spline,
  multiplane,
  probePlate,
  pushInto,
  rectShape,
  shotPath,
  stroke,
  write,
  sub,
  glow,
  knobCamera,
  rounded,
  sky,
  plate,
} from '@bible/film/canvas';
import { clamp, lerp } from '@bible/film/core';
import {
  C,
  F,
  type GestureAt,
  type HandPush,
  type Hands,
  type IconCount,
  type Three,
  type Person,
  handOf,
  icons,
  handCloseUp,
  person,
  pushZoom,
  pushedHand,
  piece,
} from '../kit.ts';
import { FIGURE_STAINS, FIGURE_STAIN_SPOTS } from '../court.ts';
import { apron } from '../garden.ts';
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
  // Outside the hall at dusk, the figure from `mirror` looks up at its one
  // lit window; on "year" the camera pushes through the window into the hall.
  lookUp: { mark: 'how', offset: 0.3, dur: 0.8, ease: 'inOutSine' },
  window: { mark: 'year', offset: -0.3, dur: 1.3, ease: 'inCubic' },
  // Waggoner holds the open Bible from the cut: the hall opens on it.
  bible: { at: 'start', dur: 0 },
  placard: { after: 'window', dur: 0.5, ease: 'outBack' },
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
  // The angel has the banner in hand as it flies in, still off frame.
  grasp: { with: 'fly', dur: 0 },
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
  // The figure lifts its open hand, turns it palm up as it comes, and the
  // camera pushes into it: the insert, the same hand close up.
  offer: { with: 'handIn', dur: 0.6, ends: true },
  palmUp: { mark: 'gifts', offset: -0.7, dur: 0.3, ease: 'inOutSine' },
  handIn: { mark: 'gifts', offset: -0.4, dur: 0.7, ease: 'inOutCubic' },
  // Close on the palm, its fingers curl a little on "gifts": the hand that takes hold of them.
  take: { mark: 'gifts', dur: 0.7, ease: 'inOutSine' },
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
  // The law and the gospel's emblem, and how close the push through to the page comes on it.
  emblem: [960, 190],
  emblemZoom: 7,
  // The open hand's palm, and the row of gifts laid across it.
  palm: [960, 720],
  gifts: [960, 730],
} as const;

/**
 * Where the answer's shape lies on the page as `message` leaves it: the open
 * hand's palm and the row of gifts across it (its knobs, so `roof` opens
 * through that row and pulls back into it wherever the lab sets them).
 */
export const GIFTS_AT = { palm: knobs.palm, gifts: knobs.gifts } as const;

type MessageFrame = Frame<keyof typeof timeline & string, typeof knobs>;

/** A tall arched window of the hall, centred on (x, y), with peach light in it. */
const hallWindow = (ctx: CanvasRenderingContext2D, hand: Hand, x: number, y: number) => {
  at(ctx, { x, y }, () => {
    piece(ctx, tabletShape(130, 300), C.peachTop, hand, { role: 'scenery', kind: 'cut', line: 5 });
    glow(ctx, 0, 40, 160, C.glow, 0.5);
    stroke(
      ctx,
      line([0, -85], [0, 150]),
      { color: C.boardDeep, width: 5, jitter: 0.3, boil: 'none' },
      sub(hand, 1),
    );
    stroke(
      ctx,
      line([-65, 20], [65, 20]),
      { color: C.boardDeep, width: 5, jitter: 0.3, boil: 'none' },
      sub(hand, 2),
    );
  });
};

/** The hall from outside at dusk: its front, where it stands, and its one lit window (centre and size), which the camera pushes through. */
const HALL_FRONT = { x: 600, y: 330, w: 900, h: 600 } as const;
const HALL_GROUND = 930;
const LIT_WINDOW: Pt = [1180, 560];
const LIT_WINDOW_SHAPE = tabletShape(150, 330);
/** The dark windows either side of it. */
const DARK_WINDOWS = [720, 900] as const;
/**
 * Where the camera ends the push: on the centre of the window's arch (its
 * round top, `LIT_WINDOW_SHAPE`'s circle, 75 px across its radius), so the
 * push reads as the arch opening, close enough that the arch's circle is past
 * the frame's corners (75 × 16 = 1200 > the half-diagonal, 1101).
 */
const THROUGH_WINDOW: Camera = { x: LIT_WINDOW[0], y: LIT_WINDOW[1] - 90, zoom: 16 };
const OUTSIDE: Camera = { x: 960, y: 560, zoom: 1 };
/** The unmoved frame (the canvas itself, so not a knob): where the push through the emblem starts. */
const FRAME: Camera = { x: 960, y: 540, zoom: 1 };
/** The figure from `mirror`, small and screen-left, in the rags of their own sewing. */
const LOOKER: Pt = [330, HALL_GROUND + 20];
const LOOKER_S = 1.7;
const LOOKER_LOOK: [number, number] = [0, 0];
const LOOKER_P: Person = { look: LOOKER_LOOK };

/**
 * Outside the hall at dusk (`how`): the figure from `mirror`, small at the
 * left, looks up at the one lit window; on "year" the camera pushes through
 * it (`into` 0..1), the hall showing inside the window's arch, until the arch
 * is past the frame's edges and the hall is all there is (`inside`).
 */
const outside = (f: MessageFrame, into: number, inside: () => void) => {
  const { ctx, w, h } = f;
  sky(ctx, w, h, [
    [0, C.sunsetTop],
    [0.7, C.peachTop],
    [1, C.peachLow],
  ]);
  const cam = shotPath(OUTSIDE, [[into, THROUGH_WINDOW, pushInto]]);
  const up = f.at('lookUp');
  LOOKER_LOOK[0] = lerp(2, 4, up);
  LOOKER_LOOK[1] = lerp(1, -4, up);
  camera(
    ctx,
    cam,
    w,
    h,
    () => {
      piece(ctx, rectShape(-800, HALL_GROUND, 3500, 600), C.boardShade, f.hand('street'), {
        role: 'scenery',
        line: 0,
        torn: 4,
      });
      const { x, y, w: fw, h: fh } = HALL_FRONT;
      piece(ctx, rectShape(x, y, fw, fh), C.board, f.hand('front'), {
        role: 'scenery',
        kind: 'cut',
        line: 0,
        torn: 3,
        shadow: 0.4,
      });
      piece(
        ctx,
        [
          [x - 40, y + 4],
          [x + fw / 2, y - 190],
          [x + fw + 40, y + 4],
        ],
        C.boardDeep,
        f.hand('gable'),
        { role: 'scenery', kind: 'cut', line: 0, torn: 2 },
      );
      DARK_WINDOWS.forEach((wx, i) =>
        at(ctx, { x: wx, y: LIT_WINDOW[1] }, () =>
          piece(ctx, LIT_WINDOW_SHAPE, C.boardDeep, sub(f.hand('darkWindow'), i), {
            role: 'scenery',
            kind: 'cut',
            line: 4,
          }),
        ),
      );
      piece(ctx, rounded(1380, HALL_GROUND - 130, 120, 260, 10), C.boardDeep, f.hand('hallDoor'), {
        role: 'scenery',
        kind: 'cut',
        line: 4,
      });
      glow(ctx, LIT_WINDOW[0], LIT_WINDOW[1], 320, C.glow, 0.7);
      at(ctx, { x: LOOKER[0], y: LOOKER[1], scale: LOOKER_S }, () => {
        person(
          ctx,
          { ...LOOKER_P, tilt: -0.14 * up, browL: 2.5 * up, browR: 3 * up, browTilt: 0.3 * up },
          f.hand('looker'),
        );
        apron(ctx, f.hand('lookerApron'), 4, 1, 0);
      });
    },
    0,
  );
  // The window's arch, in frame px, and the hall inside it.
  ctx.save();
  const zoom = cam.zoom ?? 1;
  ctx.beginPath();
  let first = true;
  for (const [px, py] of LIT_WINDOW_SHAPE) {
    const sx = w / 2 + (LIT_WINDOW[0] + px - cam.x) * zoom;
    const sy = h / 2 + (LIT_WINDOW[1] + py - cam.y) * zoom;
    if (first) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
    first = false;
  }
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = C.peachTop;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha *= clamp(2 * into);
  inside();
  ctx.restore();
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
      const into = f.at('window');
      if (into < 1) outside(f, into, () => hall(f, up, roof));
      else hall(f, up, roof);

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
          herald(
            ctx,
            f.hand,
            t,
            fly < 1 ? 0 : Math.min(1, f.spoken('banner', 'hand') * 1.25),
            f.at('grasp'),
          ),
        );
        ctx.restore();
      }

      // The law and the gospel, hand in hand: a tablet and a cross meet.
      const meet = f.at('meet');
      if (meet > 0) {
        const [ex, ey] = f.knob('emblem');
        const cam = shotPath(FRAME, [
          [through, knobCamera(f.knob('emblem'), f.knob('emblemZoom')), pushInto],
        ]);
        // Held as framed (no drift): the emblem sits still until the push.
        camera(
          ctx,
          cam,
          w,
          h,
          () => at(ctx, { x: ex, y: ey, scale: 1.3 }, () => emblem(f, meet, f.at('golden'))),
          0,
        );
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
/** The open hand's scale, and the gifts' row scale across its palm (`roof` moves into and out of that row). */
const HAND_S = 1.75;
export const GIFTS_S = 0.5;
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
    const close = clamp(1 - 3 * noon) * settle;
    const [fx, fy] = f.knob('figureAt');
    const [hx, hy] = OFFERED.to;
    const push: HandPush = {
      from: [fx + hx * FIGURE_S, fy + hy * FIGURE_S],
      figureScale: FIGURE_S,
      to: f.knob('palm'),
      scale: HAND_S,
    };
    pushedHand(
      ctx,
      f.hand,
      push,
      handIn,
      (1 - TAKE_CURL * f.at('take')) * (1 - 0.3 * close),
      OFFERING_SIDE,
    );
    POPS[0] = f.at('faith');
    POPS[1] = f.at('forgiveness');
    POPS[2] = f.at('power');
    for (let i = 0; i < 3; i++) LIT[i] = (POPS[i] ?? 0) * (1 - dusk);
    giftRow(ctx, f.hand, f.knob('gifts'), LIT, POPS);
  }
};

/** How far the close-up's fingers curl as it takes the gifts: a hold, never a fist that hides them. */
const TAKE_CURL = 0.15;
/** The close-up hand once it has taken them: `roof` opens and closes on it, so the cuts match. */
export const TAKEN = 1 - TAKE_CURL;

/** Which of the page figure's hands the close-up is: the near one, `OFFERED`. */
const OFFERING_SIDE = 'near';

/**
 * The open hand of the answer's shape, the page figure's own hand close up,
 * palm out at `palm`: faded in as `shown` goes 0..1, and risen into place
 * from below as `rise` does (`message` pushes into it from the figure, so
 * it does not rise; `roof` lifts it back in); `open` 1 holds the fingers
 * straight. `roof` pulls back to it where `message` leaves it.
 */
export const giftHand = (
  ctx: CanvasRenderingContext2D,
  hand: Hands,
  [px, py]: Pt,
  shown: number,
  open: number,
  rise = shown,
) => {
  ctx.save();
  ctx.globalAlpha *= shown;
  at(ctx, { x: px, y: lerp(py + 400, py, rise), scale: HAND_S }, () =>
    handCloseUp(ctx, hand, open, OFFERING_SIDE),
  );
  ctx.restore();
};

/**
 * The three icons as `message` sets them across the palm, their row's centre
 * at `row`: `lit`, `shown` and `count` as `icons` reads them, `scale` the
 * row's (the palm's by default). `roof` opens through this row and pulls back
 * into it.
 */
export const giftRow = (
  ctx: CanvasRenderingContext2D,
  hand: Hands,
  [gx, gy]: Pt,
  lit: Three,
  shown?: Three,
  scale = GIFTS_S,
  count?: IconCount,
) => at(ctx, { x: gx, y: gy, scale }, () => icons(ctx, hand, lit, shown, count));

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
  piece(ctx, ellipseShape(x, y, 44, 44), C.gold, hand, { role: 'scenery', line: 0, shadow: 0.2 });
};

/** The page figure's open hand, lifted palm out on `offer` and turned palm up on `palmUp` (written each frame). */
const OFFERED: GestureAt = { to: [46, -140], reach: 0, grip: 'palm', turn: 0 };
/** How far the push into the figure's hand magnifies it: its palm-up hand to the close-up. */
const INTO_HAND = pushZoom(FIGURE_S, HAND_S);

/**
 * The grey figure: in after the push through, looking up on "three". On
 * "makes" a word of light falls from above into their chest (God makes), and
 * from it a warmth spreads that washes the stains out, the nearest first. On
 * `offer` they lift their open hand, turning it palm up, and on `handIn` the
 * camera pushes into it: the hand is magnified onto the palm knob, the close-up
 * over it in the same shape (`pushedHand`).
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
  const [px, py] = f.knob('palm');
  OFFERED.reach = f.at('offer');
  OFFERED.turn = f.at('palmUp');
  // The push: the figure magnified about its lifted hand, which slides onto the palm knob.
  const scale = FIGURE_S * shown * INTO_HAND ** handIn;
  const [hx, hy] = OFFERED.to;
  const handX = lerp(fx + hx * FIGURE_S * shown, px, handIn);
  const handY = lerp(fy + hy * FIGURE_S * shown, py, handIn);
  ctx.save();
  // Gone before the push ends, so the magnified face never sits over the close-up.
  ctx.globalAlpha *= 1 - clamp(1.6 * handIn);
  at(ctx, { x: handX - hx * scale, y: handY - hy * scale, scale }, () => {
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
        near: OFFERED,
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
              role: 'scenery',
              kind: 'cut',
              line: 0,
              torn: 3,
            });
            glow(ctx, 960, 300, 900, C.peachLow, 0.5);
            WINDOWS.forEach((x, i) => hallWindow(ctx, sub(f.hand('window'), i), x, 330));
            piece(ctx, rectShape(-500, -320, 2920, 70), C.boardShade, f.hand('beam'), {
              role: 'scenery',
              kind: 'cut',
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
            role: 'scenery',
            line: 0,
            torn: 3,
          });
          glow(ctx, 960, 520, lerp(80, 560, light), C.glow, light);
          glow(ctx, 960, 540, lerp(40, 260, light), C.gold, 0.55 * light);
          piece(ctx, rectShape(500, STAGE_Y, 920, 90), C.boardShade, f.hand('stage'), {
            role: 'scenery',
            kind: 'cut',
            line: 3,
            torn: 2,
          });
          piece(ctx, rounded(960, STAGE_Y - 100, 150, 200, 12), C.board, f.hand('pulpit'), {
            role: 'scenery',
            kind: 'cut',
            line: 3.5,
          });
          piece(ctx, rounded(960, STAGE_Y - 200, 190, 22, 6), C.boardDeep, f.hand('pulpitTop'), {
            role: 'scenery',
            kind: 'cut',
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
            const holds = seat.side < 0 && split > 0;
            TABLETS_UP.reach = seat.side < 0 ? split : 0;
            const wander = seat.side > 0 ? split * (1 - turn) : 0;
            const toward: Pt = [((960 - seat.x) / 700) * 5, -3];
            const glance: Pt = [4 * Math.sin(t * 1.7 + i * 1.3), 1];
            const look: Pt = [
              lerp(lerp(toward[0], glance[0], wander), (960 - seat.x) / 180, turn),
              lerp(lerp(toward[1], glance[1], wander), -4, turn),
            ];
            const who: Person = {
              look,
              tilt: 0.12 * wander * Math.sin(t * 1.1 + i) + turn * ((960 - seat.x) / 4000),
              browL: 3 * wander + 3 * turn + 2 * curious,
              browR: 2 * wander + 4 * turn + 3 * curious,
              browTilt: 0.45 * wander + 0.3 * turn + 0.3 * curious,
              mouth: 0.6 * turn * (i % 3 === 0 ? 1 : 0),
              near: TABLETS_UP,
            };
            const me = sub(f.hand('crowd'), i);
            at(ctx, { x: seat.x, y: seat.y, scale: seat.s }, () => {
              // The tablets first, riding on the hand, so the hand is drawn over their foot.
              if (holds) {
                const [hx, hy] = handOf(who, 'near', me);
                at(ctx, { x: hx, y: hy - TABLETS_ABOVE * split, scale: TABLETS_S * split }, () =>
                  tablets(ctx, (k) => sub(f.hand(k), i)),
                );
              }
              person(ctx, who, me);
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

/** A crowd member's hand under the tablets they hold up on the split (its reach written per seat). */
const TABLETS_UP: GestureAt = { to: [70, -150], reach: 0, grip: 'hold' };
/** The tablets they hold: their scale, and how far above the fist their middle rides (half their height, less the fingers over the foot). */
const TABLETS_S = 0.3;
const TABLETS_ABOVE = 22;
/** Waggoner's two hands on the open Bible, and Jones's lifted as he preaches. */
const ON_BIBLE_FAR: GestureAt = { to: [-10, -86], reach: 0, grip: 'hold' };
const ON_BIBLE_NEAR: GestureAt = { to: [30, -84], reach: 0, grip: 'hold' };
const PREACHING: GestureAt = { to: [58, -150], reach: 0, grip: 'open' };

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
      body: C.cutDeep,
      build: [1.05, 0.95],
      hair: C.cutShade,
      moustache: 0.35,
      onHead: (ctx, c, r, hand) => {
        piece(ctx, hairShape(c, r, 0), C.cutShade, sub(hand, 85), {
          role: 'figure',
          line: 2.5,
          shadow: 0.1,
        });
        for (const [i, x] of [-12, 13].entries())
          stroke(
            ctx,
            ellipse(c[0] + x, c[1] - 7, 8, 8, i),
            { color: C.outline, width: 2, jitter: 0.3, taper: 0, boil: 'crawl' },
            sub(hand, 80 + i),
          );
        stroke(
          ctx,
          line([c[0] - 4, c[1] - 8], [c[0] + 5, c[1] - 8]),
          { color: C.outline, width: 2, jitter: 0.3, taper: 0, boil: 'crawl' },
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
      hair: C.cutDeep,
      moustache: 1,
      onHead: (ctx, c, r, hand) =>
        piece(ctx, hairShape(c, r, 1), C.cutDeep, sub(hand, 85), {
          role: 'figure',
          line: 2.5,
          shadow: 0.1,
        }),
    },
  ],
];

/** Waggoner and Jones on the platform, Waggoner with the Bible open. */
const preachers = (f: MessageFrame) => {
  const { ctx } = f;
  const step = f.at('stepUp');
  const precious = f.at('precious');
  const turn = f.at('turn');
  ON_BIBLE_FAR.reach = f.at('bible');
  ON_BIBLE_NEAR.reach = ON_BIBLE_FAR.reach;
  PREACHING.reach = step;
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
          far: k === 0 ? ON_BIBLE_FAR : undefined,
          near: k === 0 ? ON_BIBLE_NEAR : PREACHING,
        },
        f.hand(`preacher${k}`),
      );
      if (k === 0) {
        glow(ctx, 10, -92, 90, C.gold, 0.6 * precious);
        piece(ctx, rounded(-4, -88, 44, 30, 3), C.cream, f.hand('bible'), {
          role: 'figure',
          line: 2.5,
        });
        piece(ctx, rounded(-4, -88, 3, 30, 1), C.inkSoft, f.hand('spine'), {
          role: 'figure',
          kind: 'ink',
          line: 0,
          shadow: 0,
        });
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
    piece(ctx, board, C.cream, f.hand('placard'), {
      role: 'scenery',
      kind: 'cut',
      line: 3,
      torn: 2,
    });
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
      role: 'scenery',
      kind: 'cut',
      line: 4.5,
      shadow: 0.5,
    }),
  );
  if (golden > 0) glow(ctx, 0, 0, 260, C.gold, 0.25 * golden);
};
