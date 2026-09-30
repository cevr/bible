// What the three gifts look like, in scripture: Mark 2, told and then
// counted. The question pushes through the faith icon of `message`'s row into
// a cardboard house in Capernaum: four friends on the flat roof lift its
// tiles away and let a paralysed man down on his bed into the packed room;
// Jesus looks up at the four faces in the hole. Close on the man as the
// scarlet specks lift off him ("Son, thy sins be forgiven thee"). On
// "scribes" the shot racks along the far wall to two scribes on their bench,
// brows down; on "easy" back to the man, still lying there: nothing anyone
// can see has changed. On "arise" he stands, rolls up his bed and carries it
// out through the crowd, screen-left.
//
// On "count" the band of three icons comes down into the upper frame, all
// three faded, and each spoken number cuts back to its moment in the story's
// own framing while its icon pops forward on a gold rim (the one before steps
// back to kept), and the gift shows in the picture too: "One", the four faces
// at the hole, lit gold (faith); "Two", the man's face as the specks lift and
// his garment goes white, the robe (forgiveness); "Three", the man walking
// out with his bed, his heart lit gold (power). On "proof" a thread of light
// runs back along the band from the heart to the robe: the walk vouching for
// the pardon.
//
// The receiver stands screen-left and Jesus screen-right throughout. The set
// (`gospel.ts`) is drawn once, so `look` and `within` call it back in these
// framings.

import {
  type Camera,
  type Frame,
  type Pt,
  camera,
  drawing,
  knobCamera,
  pushOn,
  pushInto,
  shotPath,
  stroke,
  type Posed,
  glow,
  reset,
} from '@bible/film/canvas';
import { clamp, lerp, gait } from '@bible/film/core';
import { type House, WENT, house } from '../gospel.ts';
import { C, type Hands, type IconCount, ICON_KEPT, ICON_LEAD, ICON_X, type Three } from '../kit.ts';
import { GIFTS_AT, GIFTS_S, TAKEN, giftHand, giftRow, message } from './message.ts';

const timeline = {
  // Through the faith icon of `message`'s row, into the house.
  open: { mark: 'see', dur: 0.4 },
  through: { mark: 'see', dur: 1.1, ease: 'inCubic' },
  // Up to the roof, the tiles lifted, and the bed let down into the room.
  up: { mark: 'roof', dur: 0.9, ease: 'inOutSine' },
  tiles: { mark: 'roof', offset: 0.3, dur: 0.8 },
  // The four take up the ropes, and let the bed down into the room.
  grasp: { with: 'lower', dur: 0.5, ends: true },
  lower: { mark: 'roof', word: 'lower', until: 'saw', ease: 'inOutSine' },
  look: { mark: 'saw', dur: 0.6, ease: 'inOutSine' },
  // Close on the man; the specks lift off him as he is forgiven.
  push: { mark: 'son', dur: 0.6, ends: true, ease: 'inOutCubic' },
  reach: { mark: 'son', dur: 0.6 },
  specks: { mark: 'son', word: 'sins', dur: 1.2, ease: 'inOutSine' },
  glad: { after: 'specks', dur: 0.6 },
  // Along the far wall to the scribes, brows coming down; back to the man, unchanged.
  rack: { mark: 'scribes', offset: -0.3, dur: 1, ease: 'inOutCubic' },
  doubt: { mark: 'scribes', offset: 0.4, dur: 1.2 },
  easy: { mark: 'easy', offset: -0.2, dur: 1, ease: 'inOutCubic' },
  // He stands, rolls up his bed and carries it out, screen-left.
  back: { mark: 'arise', dur: 0.9, ease: 'inOutCubic' },
  rise: { mark: 'arise', offset: 0.1, dur: 0.9, ease: 'inOutSine' },
  // As he stands the four let the ropes go, and Jesus's held-out hand comes back.
  letGo: { with: 'rise', dur: 0.3 },
  withdraw: { with: 'rise', dur: 0.6 },
  wonder: { mark: 'arise', offset: 0.3, dur: 0.8 },
  roll: { mark: 'arise', word: 'bed', dur: 0.8, ease: 'inOutSine' },
  // His hand rises to meet the bed as it rolls up, and steadies it on his shoulder.
  steady: { with: 'roll', dur: 0.8 },
  walk: { mark: 'went', until: 'count', ease: 'linear' },
  follow: { mark: 'went', dur: 1.4, ease: 'inOutSine' },
  // The count: the band in along the top; each number cuts back to its moment
  // and lights its icon on the number itself.
  band: { mark: 'count', dur: 0.6, ease: 'outCubic' },
  // Each number's icon pops forward, gold, on the number; the one before steps back.
  oneLit: { mark: 'one', dur: 0.55, ease: 'outBack' },
  oneHold: { mark: 'one', until: 'two', ease: 'linear' },
  twoLit: { mark: 'two', dur: 0.55, ease: 'outBack' },
  twoSpecks: { mark: 'two', word: 'forgiveness', dur: 1.2, ease: 'inOutSine' },
  // The specks lift off him on "forgiveness", and the robe comes over him with them.
  twoHold: { mark: 'two', until: 'three', ease: 'linear' },
  threeLit: { mark: 'three', dur: 0.55, ease: 'outBack' },
  threeWalk: { mark: 'three', until: 'proof', ease: 'linear' },
  // The echo of the third gift in the picture: the heart as he stands.
  heart: { mark: 'three', offset: 0.2, dur: 0.8, ease: 'outCubic' },
  // The walk vouches for the pardon: a thread of light from the heart back to the robe.
  proof: { mark: 'proof', dur: 1.2, ease: 'inOutSine' },
  proofWalk: { mark: 'proof', dur: 1.6, ease: 'linear' },
} as const;

const knobs = {
  // The house, wide; up on the roof; down in the room; on Jesus looking up.
  wide: [960, 560],
  wideZoom: 1,
  up: [760, 330],
  upZoom: 1.5,
  room: [820, 650],
  roomZoom: 1.2,
  saw: [990, 520],
  sawZoom: 1.25,
  // Racked across to where the scribes sit, on "scribes".
  scribes: [1420, 560],
  scribesZoom: 2.4,
  // Close on the man's face on his bed (a third of the frame), then back as he stands.
  manFace: [600, 808],
  manFaceZoom: 3.4,
  // The man still on his bed after the scribes: nothing seen has changed.
  lying: [690, 780],
  lyingZoom: 2.2,
  arise: [720, 690],
  ariseZoom: 1.7,
  // The row of icons along the top, over the story.
  band: [960, 262],
  // How far each held close-up keeps pushing in while it is on screen.
  pushOn: 1.12,
} as const;

type RoofFrame = Frame<keyof typeof timeline & string, typeof knobs>;

/** The page at rest, where `message` leaves it: the unmoved frame. */
const PAGE = { x: 960, y: 540, zoom: 1 } as const;
/** Where the push through the faith icon ends: on its disc in `message`'s row, close enough that the disc is past the frame's corners. */
const FAITH: Camera = {
  x: GIFTS_AT.gifts[0] + ICON_X[0] * GIFTS_S,
  y: GIFTS_AT.gifts[1],
  zoom: 14,
};
/** The window into the house inside the icon's disc, in the icon's units: just inside its rim. */
const WINDOW_R = 140;
/** The band row's scale over the story, and how far above the frame it waits. */
export const BAND_S = 0.32;
const BAND_ABOVE = -120;

/** The row's glow and lead, rewritten every frame. */
const LIT: [number, number, number] = [0, 0, 0];
const LEAD: [number, number, number] = [0, 0, 0];
const COUNT: Posed<IconCount> = { lead: LEAD, dim: 0 };
const ALL: readonly [number, number, number] = [1, 1, 1];

/**
 * The count's light on the band, from its three numbers' cues (`roof` and
 * `woman` count alike): each icon leads from its number until the next, then
 * steps back to kept; the unlit fade by `dim` while the band is up.
 */
export const counted = (
  lit: [number, number, number],
  lead: [number, number, number],
  [one, two, three]: Three,
) => {
  lit[0] = clamp(one) * lerp(1, ICON_KEPT, clamp(two));
  lit[1] = clamp(two) * lerp(1, ICON_KEPT, clamp(three));
  lit[2] = clamp(three);
  lead[0] = one * (1 - clamp(two));
  lead[1] = two * (1 - clamp(three));
  lead[2] = three;
};
/** The house's pose, rewritten every frame. */
const CAPERNAUM: Posed<House> = {
  cam: WENT,
  tiles: 0,
  lower: 0,
  ropes: 0,
  lookUp: 0,
  reach: 0,
  lookAfter: 0,
  specks: 0,
  rise: 0,
  roll: 0,
  steady: 0,
  walk: 0,
  bob: 0,
  glad: 0,
  wonder: 0,
  doubt: 0,
  holeLit: 0,
  robed: 0,
  heart: 0,
};

export const roof = drawing({
  timeline,
  knobs,
  draw: (f) => {
    if (f.at('through') < 1) opening(f, f.handsOf(message));
    else if (f.t < f.mark('one')) capernaum(f);
    else replay(f);
    band(f);
  },
});

/**
 * `message`'s page as it leaves it, pushing in through the faith icon: the
 * house shows inside the icon's disc, and the push carries the disc past the
 * frame's edges.
 */
const opening = (f: RoofFrame, hands: Hands) => {
  const { ctx, w, h } = f;
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, w, h);
  // A push fourteen times over: `pushInto` keeps the disc in frame all the way.
  const cam = shotPath(PAGE, [[f.at('through'), FAITH, pushInto]]);
  camera(ctx, cam, w, h, () => {
    giftHand(ctx, hands, GIFTS_AT.palm, 1, TAKEN);
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

/** The house in Capernaum, from the roof to the man walking out. */
const capernaum = (f: RoofFrame) => {
  const { ctx, w, h, t } = f;
  const s = CAPERNAUM;
  s.cam = shotPath(knobCamera(f.knob('wide'), f.knob('wideZoom')), [
    [f.at('up'), knobCamera(f.knob('up'), f.knob('upZoom'))],
    [f.at('lower'), knobCamera(f.knob('room'), f.knob('roomZoom'))],
    [f.at('look'), knobCamera(f.knob('saw'), f.knob('sawZoom'))],
    [f.at('push'), knobCamera(f.knob('manFace'), f.knob('manFaceZoom'))],
    [f.at('rack'), knobCamera(f.knob('scribes'), f.knob('scribesZoom'))],
    [f.at('easy'), knobCamera(f.knob('lying'), f.knob('lyingZoom'))],
    [f.at('back'), knobCamera(f.knob('arise'), f.knob('ariseZoom'))],
    [f.at('follow'), WENT],
  ]);
  s.tiles = f.at('tiles');
  s.lower = f.at('lower');
  s.lookUp = f.at('look');
  s.ropes = f.at('grasp') * (1 - f.at('letGo'));
  s.reach = f.at('reach') * (1 - f.at('withdraw'));
  s.lookAfter = f.at('rise');
  s.specks = f.at('specks');
  s.rise = f.at('rise');
  s.roll = f.at('roll');
  s.steady = f.at('steady');
  s.walk = f.at('walk');
  s.bob = gait(t, f.cue('walk'));
  s.glad = f.at('glad');
  s.wonder = f.at('wonder');
  s.doubt = f.at('doubt');
  s.holeLit = 0;
  s.robed = 0;
  s.heart = 0;
  house(ctx, w, h, f.hand, s);
};

/** The house as the four let him down, every pose `replay` starts from. */
const LET_DOWN: Omit<House, 'cam'> = {
  tiles: 1,
  lower: 1,
  ropes: 1,
  lookUp: 1,
  reach: 0,
  lookAfter: 0,
  specks: 0,
  rise: 0,
  roll: 0,
  steady: 0,
  walk: 0,
  bob: 0,
  glad: 0,
  wonder: 0,
  doubt: 0,
  holeLit: 0,
  robed: 0,
  heart: 0,
};

/**
 * The count: each spoken number cuts back to its moment, in the framing the
 * story gave it, held and breathing in a little while its icon lights.
 */
const replay = (f: RoofFrame) => {
  const { ctx, w, h, t } = f;
  const s = CAPERNAUM;
  // The house as the four let him down: the tiles off, the bed on the floor, the ropes held.
  reset(s, LET_DOWN);
  if (t < f.mark('two')) {
    // One: up on the four faces at the hole, as Jesus saw their faith, lit as its icon lights.
    s.holeLit = f.at('oneLit');
    s.cam = pushOn(knobCamera(f.knob('up'), f.knob('upZoom')), f.knob('pushOn'), f.at('oneHold'));
  } else if (t < f.mark('three')) {
    // Two: close on his face as the specks lift, and the robe comes over him.
    s.reach = 1;
    s.specks = f.at('twoSpecks');
    s.robed = f.at('twoSpecks');
    s.glad = clamp(2 * s.specks - 1);
    s.cam = pushOn(
      knobCamera(f.knob('manFace'), f.knob('manFaceZoom')),
      f.knob('pushOn'),
      f.at('twoHold'),
    );
  } else {
    // The robe he was given, and his heart lit as he stands.
    s.robed = 1;
    s.heart = f.at('heart');
    // Three: up, and out with his bed, in front of them all.
    s.ropes = 0;
    s.lookAfter = 1;
    s.specks = 1;
    s.rise = 1;
    s.roll = 1;
    s.steady = 1;
    s.glad = 1;
    s.wonder = 1;
    s.doubt = 1;
    const out = t < f.mark('proof') ? f.at('threeWalk') : 1;
    s.walk = lerp(0.1, 0.6, out) + 0.3 * f.at('proofWalk');
    s.bob = gait(t, f.cue('threeWalk')) + gait(t, f.cue('proofWalk'));
    s.cam = WENT;
  }
  house(ctx, w, h, f.hand, s);
};

/**
 * The band of three icons along the top, from "count", the unlit faded: each
 * pops forward in gold on its spoken number and steps back to kept on the
 * next; on "proof" a thread of light runs back along the band from the heart
 * to the robe.
 */
const band = (f: RoofFrame) => {
  const shown = f.at('band');
  if (shown <= 0) return;
  const { ctx } = f;
  counted(LIT, LEAD, [f.at('oneLit'), f.at('twoLit'), f.at('threeLit')]);
  COUNT.dim = shown;
  const [bx, by] = f.knob('band');
  const at: Pt = [bx, lerp(BAND_ABOVE, by, shown)];
  giftRow(ctx, f.hand, at, LIT, ALL, BAND_S, COUNT);
  const proof = f.at('proof');
  if (proof <= 0) return;
  // From the heart's disc (leading, so grown) back to the robe's, a gold thread drawn as it runs.
  const rim = 150 * BAND_S;
  const from = at[0] + ICON_X[2] * BAND_S - rim * (1 + ICON_LEAD * clamp(LEAD[2]));
  const x = lerp(from, at[0] + ICON_X[1] * BAND_S + rim, proof);
  glow(ctx, x, at[1], 40, C.glow, 0.9 * (1 - 0.5 * proof));
  stroke(
    ctx,
    [
      [from, at[1]],
      [x, at[1]],
    ],
    { color: C.gold, width: 5, jitter: 0.3, taper: 0.2, boil: 'crawl' },
    f.hand('proof'),
  );
};
