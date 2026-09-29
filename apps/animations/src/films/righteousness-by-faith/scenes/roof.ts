// What the three gifts look like, in scripture. The question pushes through
// the faith icon of `message`'s row into a cardboard house in Capernaum: four
// friends on the flat roof lift its tiles away and let a paralysed man down on
// his bed into the packed room; Jesus looks up at the four faces in the hole
// (faith lights in the small row of icons along the top). Close on the man as
// the scarlet specks lift off him ("Son, your sins are forgiven": the robe
// lights), then back as he stands, rolls up his bed and carries it out through
// the crowd, screen-left (the heart lights). Cut to the temple court in the
// same light: the woman stands alone in her stained garment, the stones
// dropped in the dust about her, Jesus stooped beside the marks he writes,
// those who brought her walking out through the colonnade. He stands and
// asks; close on her face as she looks up ("No man, Lord": faith lights
// again). Reverse to his face as he speaks the quotation; "Neither" lights the
// robe and "go" the heart, and on "go" cut back wide as she walks out,
// screen-left, upright and clean. On "order" the story gives way to the page,
// the row flies down into `message`'s layout over the open hand, and faith,
// forgiveness and power light left to right as they are named.
//
// The receiver stands screen-left and Jesus screen-right throughout. The two
// sets (`gospel.ts`) are drawn once, so `robe` and `within` call them back in
// these framings.

import {
  type Camera,
  type Frame,
  type Pt,
  camera,
  drawing,
  knobCamera,
  shotPath,
} from '@bible/film/canvas';
import { lerp } from '@bible/film/core';
import { COURT_WIDE, WENT, house, temple } from '../gospel.ts';
import { C, ICON_X, gait } from '../kit.ts';
import { GIFTS_AT, GIFTS_S, giftHand, giftRow } from './message.ts';

const timeline = {
  // Through the faith icon of `message`'s row, into the house.
  open: { mark: 'see', dur: 0.4 },
  through: { mark: 'see', dur: 1.1, ease: 'inCubic' },
  band: { after: 'through', dur: 0.4 },
  // Up to the roof, the tiles lifted, and the bed let down into the room.
  up: { mark: 'roof', dur: 0.9, ease: 'inOutSine' },
  tiles: { mark: 'roof', offset: 0.3, dur: 0.8 },
  lower: { mark: 'roof', word: 'lower', until: 'saw', ease: 'inOutSine' },
  look: { mark: 'saw', dur: 0.6, ease: 'inOutSine' },
  faithLit: { mark: 'saw', word: 'faith', dur: 0.5 },
  // Close on the man; the specks lift off him as he is forgiven.
  push: { mark: 'son', offset: -0.6, dur: 0.6, ease: 'inOutCubic' },
  reach: { mark: 'son', dur: 0.6 },
  specks: { mark: 'son', word: 'sins', dur: 1.2, ease: 'inOutSine' },
  robeLit: { mark: 'son', word: 'forgiven', dur: 0.5 },
  glad: { after: 'specks', dur: 0.6 },
  // He stands, rolls up his bed and carries it out, screen-left.
  back: { mark: 'arise', dur: 0.9, ease: 'inOutCubic' },
  rise: { mark: 'arise', offset: 0.1, dur: 0.9, ease: 'inOutSine' },
  wonder: { mark: 'arise', offset: 0.3, dur: 0.8 },
  roll: { mark: 'arise', word: 'bed', dur: 0.8, ease: 'inOutSine' },
  walk: { mark: 'went', until: 'woman', ease: 'linear' },
  follow: { mark: 'went', until: 'woman', ease: 'inOutSine' },
  heartLit: { mark: 'went', dur: 0.5 },
  // The temple court: those who brought her go, he writes, then stands and asks.
  leave: { mark: 'woman', until: 'lord', ease: 'linear' },
  writing: { mark: 'woman', until: 'none', ease: 'linear' },
  courtPush: { mark: 'woman', until: 'lord', ease: 'inOutSine' },
  stand: { mark: 'none', dur: 1, ease: 'inOutSine' },
  asks: { mark: 'none', dur: 1.8, ease: 'linear' },
  raise: { mark: 'none', dur: 0.8 },
  // Close on her as she answers; faith lights again.
  herFace: { mark: 'lord', offset: -0.8, dur: 0.8, ease: 'inOutCubic' },
  lookUp: { mark: 'lord', dur: 0.6 },
  herPush: { mark: 'lord', until: 'told', ease: 'linear' },
  faithLit2: { mark: 'lord', dur: 0.5 },
  // Reverse to his face as he speaks: forgiveness on "Neither", power on "go".
  hisPush: { mark: 'told', until: 'order', ease: 'linear' },
  speaks: { mark: 'told', word: 'Neither', dur: 3.2, ease: 'linear' },
  robeLit2: { mark: 'told', word: 'Neither', dur: 0.5 },
  heartLit2: { mark: 'told', word: 'go', dur: 0.5 },
  // Wide as she walks out, clean.
  wash: { mark: 'told', word: 'go', dur: 0.6 },
  walkOut: { mark: 'told', word: 'go', offset: 0.3, dur: 2.2, ease: 'inQuad' },
  // Back to the page: the row into `message`'s layout, lit as each is named.
  toIdea: { mark: 'order', dur: 1.3, ease: 'inOutCubic' },
  handUp: { with: 'toIdea', offset: 0.3, dur: 1, ease: 'outCubic' },
  litFaith: { mark: 'order', word: 'faith', dur: 0.5 },
  litForgiveness: { mark: 'order', word: 'forgiveness', dur: 0.5 },
  litPower: { mark: 'order', word: 'power', dur: 0.5 },
} as const;

const knobs = {
  // The house, wide; up on the roof; down in the room; on Jesus looking up.
  wide: [960, 560],
  wideZoom: 1,
  up: [760, 330],
  upZoom: 1.5,
  room: [820, 650],
  roomZoom: 1.2,
  saw: [990, 600],
  sawZoom: 1.25,
  // Close on the man's face on his bed (a third of the frame), then back as he stands.
  manFace: [600, 830],
  manFaceZoom: 3.4,
  arise: [720, 690],
  ariseZoom: 1.7,
  // The court: in toward the two of them, close on her, and the reverse on him.
  twoShot: [980, 620],
  twoShotZoom: 1.18,
  herFace: [650, 600],
  herFaceZoom: 2.3,
  hisFace: [1310, 610],
  hisFaceZoom: 2.3,
  // The small row of icons along the top of the story.
  band: [960, 96],
} as const;

type RoofFrame = Frame<keyof typeof timeline & string, typeof knobs>;

/** The page at rest, where `message` leaves it: the unmoved frame. */
const PAGE = { x: 960, y: 540, zoom: 1 } as const;
/** Where the push through the faith icon ends (set on its disc each frame), close enough that the disc is past the frame's corners. */
const FAITH = { x: 0, y: 0, zoom: 14 };
/** The window into the house inside the icon's disc, in the icon's units: just inside its rim. */
const WINDOW_R = 140;
/** How far each close-up keeps pushing in while its face is on screen. */
const PUSH_ON = 1.18;
/** The band row's scale over the story. */
const BAND_S = 0.2;

/** The row's glow and the story's lights, rewritten every frame. */
const LIT: [number, number, number] = [0, 0, 0];
const ALL: readonly [number, number, number] = [1, 1, 1];
const LOOK: [number, number] = [0, 0];
const HER_LOOK: [number, number] = [0, 0];

export const roof = drawing({
  timeline,
  knobs,
  draw: (f) => {
    const toIdea = f.at('toIdea');
    if (f.at('through') < 1) opening(f);
    else if (toIdea < 1) story(f);
    if (toIdea > 0) closing(f, toIdea);
    row(f, f.at('band'), toIdea);
  },
});

/** The story: the house until "woman", then the temple court. */
const story = (f: RoofFrame) => (f.t < f.mark('woman') ? capernaum(f) : court(f));

/**
 * `message`'s page as it leaves it, pushing in through the faith icon: the
 * house shows inside the icon's disc, and the push carries the disc past the
 * frame's edges.
 */
const opening = (f: RoofFrame) => {
  const { ctx, w, h } = f;
  const hands = f.handsOf('message');
  const [gx, gy] = GIFTS_AT.gifts;
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, w, h);
  FAITH.x = gx + ICON_X[0] * GIFTS_S;
  FAITH.y = gy;
  const cam = into(PAGE, FAITH, f.at('through'));
  camera(ctx, cam, w, h, () => {
    giftHand(ctx, hands, GIFTS_AT.palm, 1, 1);
    giftRow(ctx, hands, GIFTS_AT.gifts, ALL, ALL);
  });
  const open = f.at('open');
  if (open <= 0) return;
  const zoom = cam.zoom ?? 1;
  ctx.save();
  ctx.beginPath();
  ctx.arc(
    w / 2 + (FAITH.x - cam.x) * zoom,
    h / 2 + (FAITH.y - cam.y) * zoom,
    WINDOW_R * GIFTS_S * zoom,
    0,
    Math.PI * 2,
  );
  ctx.clip();
  ctx.globalAlpha *= open;
  capernaum(f);
  ctx.restore();
};

/**
 * Part way (`p`) through a push from `a` into the point `b` looks at: the zoom
 * grows by a constant ratio and that point slides to the frame's centre as
 * it does, so it never swings out of the frame on the way (a straight blend
 * of centre and zoom, `lerpCamera`, does).
 */
const into = (a: Camera, b: Camera, p: number): Camera => {
  const za = a.zoom ?? 1;
  const zoom = za * ((b.zoom ?? 1) / za) ** p;
  const k = ((1 - p) * za) / zoom;
  PUSH.x = b.x - (b.x - a.x) * k;
  PUSH.y = b.y - (b.y - a.y) * k;
  PUSH.zoom = zoom;
  return PUSH;
};
const PUSH: Camera = { x: 0, y: 0, zoom: 1 };

/** The house in Capernaum, from the roof to the man walking out. */
const capernaum = (f: RoofFrame) => {
  const { ctx, w, h, t } = f;
  const walk = f.cue('walk');
  house(ctx, w, h, f.hand, {
    cam: shotPath(knobCamera(f.knob('wide'), f.knob('wideZoom')), [
      [f.at('up'), knobCamera(f.knob('up'), f.knob('upZoom'))],
      [f.at('lower'), knobCamera(f.knob('room'), f.knob('roomZoom'))],
      [f.at('look'), knobCamera(f.knob('saw'), f.knob('sawZoom'))],
      [f.at('push'), knobCamera(f.knob('manFace'), f.knob('manFaceZoom'))],
      [f.at('back'), knobCamera(f.knob('arise'), f.knob('ariseZoom'))],
      [f.at('follow'), WENT],
    ]),
    tiles: f.at('tiles'),
    lower: f.at('lower'),
    lookUp: f.at('look'),
    reach: f.at('reach'),
    lookAfter: f.at('rise'),
    specks: f.at('specks'),
    rise: f.at('rise'),
    roll: f.at('roll'),
    walk: f.at('walk'),
    bob: gait(t, walk),
    glad: f.at('glad'),
    wonder: f.at('wonder'),
  });
};

/** How far into a speaking cue the mouth moves: none at its edges, open through its middle. */
const talking = (k: number) => Math.min(1, 4 * Math.min(k, 1 - k));

/** The temple court: wide, in, close on her, the reverse on him, and wide as she goes. */
const court = (f: RoofFrame) => {
  const { ctx, w, h, t } = f;
  const told = t >= f.mark('told');
  const gone = t >= f.cue('wash').start;
  const cam = gone
    ? COURT_WIDE
    : told
      ? knobCamera(f.knob('hisFace'), f.knob('hisFaceZoom') * lerp(1, PUSH_ON, f.at('hisPush')))
      : shotPath(COURT_WIDE, [
          [f.at('courtPush'), knobCamera(f.knob('twoShot'), f.knob('twoShotZoom'))],
          [
            f.at('herFace'),
            knobCamera(
              f.knob('herFace'),
              f.knob('herFaceZoom') * lerp(1, PUSH_ON, f.at('herPush')),
            ),
          ],
        ]);
  const stand = f.at('stand');
  const talk = Math.max(talking(f.at('asks')), talking(f.at('speaks')));
  LOOK[0] = lerp(-3, -4, stand);
  LOOK[1] = lerp(4, 0.5, stand);
  const raise = f.at('raise');
  const up = f.at('lookUp');
  const walk = f.at('walkOut');
  HER_LOOK[0] = lerp(lerp(1, 3, up), -4, walk);
  HER_LOOK[1] = lerp(lerp(3, 0, raise), -3, up) * (1 - walk);
  temple(ctx, w, h, f.hand, {
    cam,
    leave: f.at('leave'),
    leaveBob: gait(t, f.cue('leave')),
    writing: f.at('writing'),
    stand,
    speak: 0.4 * talk * Math.abs(Math.sin(t * 8)),
    look: LOOK,
    woman: {
      walk,
      bob: gait(t, f.cue('walkOut')),
      washed: f.at('wash'),
      look: HER_LOOK,
      bowed: 1 - 0.5 * raise - 0.5 * up,
      glad: f.at('wash'),
      white: 0,
    },
  });
};

/** The page again, and the open hand rising under the row. */
const closing = (f: RoofFrame, toIdea: number) => {
  const { ctx, w, h } = f;
  ctx.save();
  ctx.globalAlpha *= toIdea;
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  giftHand(ctx, f.handsOf('message'), GIFTS_AT.palm, f.at('handUp'), 1);
};

/**
 * The three icons: a small row along the top over the story, lit as each
 * gift is given (and again for the woman), which comes down into `message`'s
 * layout on "order" and lights left to right as the gifts are named.
 */
const row = (f: RoofFrame, shown: number, toIdea: number) => {
  const { ctx } = f;
  if (shown <= 0) return;
  const court = f.t >= f.mark('woman');
  LIT[0] = court ? f.at('faithLit2') : f.at('faithLit');
  LIT[1] = court ? f.at('robeLit2') : f.at('robeLit');
  LIT[2] = court ? f.at('heartLit2') : f.at('heartLit');
  LIT[0] = Math.max(LIT[0] * (1 - toIdea), f.at('litFaith'));
  LIT[1] = Math.max(LIT[1] * (1 - toIdea), f.at('litForgiveness'));
  LIT[2] = Math.max(LIT[2] * (1 - toIdea), f.at('litPower'));
  const [bx, by] = f.knob('band');
  const [gx, gy] = GIFTS_AT.gifts;
  const at: Pt = [lerp(bx, gx, toIdea), lerp(by, gy, toIdea)];
  ctx.save();
  ctx.globalAlpha *= shown;
  giftRow(ctx, f.handsOf('message'), at, LIT, ALL, lerp(BAND_S, GIFTS_S, toIdea));
  ctx.restore();
};
