// Daily: sanctification is the daily choice to keep receiving the gifts, and
// the Sabbath is rest in His works, not ours. First the parchment: the robed
// figure from `robe`, heart glowing, asks "am I done?"; on "kingdom" the
// camera pans to a gold city gate with light and small music notes drifting
// out; on "joy" a small grey figure stands beside it in the cold open's
// scarlet stains, the film's picture of sin, hands over ears, the notes
// jangling for them (a light moment; never robed: a robe over the stains
// would be a cloak for sin). On "keep" back to
// the robed figure asking again. On "will" the camera pushes through their
// glowing heart into STORY: a cardboard room at dawn, the same figure at the
// window, face at a third of the frame. On "choose" the open hand from `look`
// rises palm up and the three small icons are laid in it. From "matter" six
// suns arc over the window, the six working days: each dusk the hand's fingers curl, each
// dawn it opens again, and a flower springs up on the path outside each day
// (the path from `within`). On "sab" the sixth sun sets gold, and as it sets
// the Sabbath begins: the shot dissolves on that sunset to the Sabbath field
// (garden.ts `restingField`), the seventh day the rest itself: tools set down,
// the robed figure resting against the tree, heart still glowing, face calm
// on "rest", held through "rest in his", the scene's last words. Nothing
// here is earned: the hand only receives.

import {
  type Frame,
  type Pt,
  drawing,
  ellipseShape,
  spline,
  stroke,
  sub,
} from '@bible/film/canvas';
import { clamp, lerp } from '@bible/film/core';
import { FIGURE_STAINS } from '../court.ts';
import { PATH_AHEAD, PATH_HILL, alongPath, restingField } from '../garden.ts';
import {
  type ArmAt,
  C,
  CHEST,
  type Person,
  glow,
  icons,
  mix,
  type HandPush,
  person,
  pushedHand,
  piece,
  rounded,
  sky,
} from '../kit.ts';

// ─── A: the parchment ────────────────────────────────────────────────────────

/** The robed figure's scale on the page (where they stand is the `fig` knob). */
const FIG_SCALE = 2.3;
/** The small grey figure in their stains beside the gate, and their scale. */
const OTHER_DX = 380;
const OTHER_SCALE = 1.5;

/** How far the push through the heart zooms in. */
const THROUGH_ZOOM = 9;
/** How far into the push the room starts to come through the glow. */
const THROUGH_CUT = 0.4;

/** The gate's pieces, its sill at (0, 0). */
const PILLAR = rounded(0, -260, 96, 520, 10);
const PILLAR_X = [-200, 200] as const;
const ARCH = spline(
  [
    [-250, -500],
    [-200, -640],
    [0, -720],
    [200, -640],
    [250, -500],
    [250, -470],
    [-250, -470],
  ],
  8,
  true,
);
const OPENING = rounded(0, -240, 300, 480, 12);
const WALL_L = rounded(-420, -200, 340, 400, 6);
const WALL_R = rounded(420, -200, 340, 400, 6);

/** The music drifting out of the gate. */
const NOTES = 8;
const NOTE_HEAD = ellipseShape(0, 0, 15, 11, 20);
const NOTE_STEM: Pt[] = [
  [13, -2],
  [13, -54],
];
const NOTE_FLAG: Pt[] = [
  [13, -54],
  [30, -40],
  [26, -24],
];
/** How fast each note drifts out, in drifts per second. */
const NOTE_RATE = 0.22;

const PAPER_SKY = [
  [0, C.paper],
  [1, C.paper],
] as const;

// ─── B: the room at the window ───────────────────────────────────────────────

/** The window's opening, half its width and height. */
const WIN_HW = 320;
const WIN_HH = 300;
/** The frame around the opening: top, bottom, left and right. */
const WIN_FRAME = [
  rounded(0, -WIN_HH - 20, WIN_HW * 2 + 80, 44, 6),
  rounded(0, WIN_HH + 20, WIN_HW * 2 + 80, 44, 6),
  rounded(-WIN_HW - 20, 0, 44, WIN_HH * 2 + 80, 6),
  rounded(WIN_HW + 20, 0, 44, WIN_HH * 2 + 80, 6),
] as const;
const WIN_BAR_V = rounded(0, 0, 22, WIN_HH * 2, 4);
const WIN_BAR_H = rounded(0, 0, WIN_HW * 2, 22, 4);
const SILL = rounded(0, WIN_HH + 40, WIN_HW * 2 + 120, 30, 6);
/** Where the sun rises and sets in the window, and how high it arcs. */
const HORIZON = 150;
const SUN_ARC = 300;
/** The view's scale: `within`'s hill and path, seen through the window. */
const VIEW_SCALE = 0.75;
/** How far below the window's centre the view's origin sits, so the hill fills the sill. */
const VIEW_DROP = 110;
const FLOWER_STEM: Pt[] = [
  [0, 0],
  [0, -30],
];
const FLOWER_HEAD = ellipseShape(0, -34, 14, 14, 16);

/** The robed figure at the window: feet below the frame, face a third of it. */
const AT_WINDOW: Pt = [1420, 1250];
const WINDOW_SCALE = 4.7;
/** The robed figure's hand at the window, open low toward it, palm up (in their units). */
const OPEN_AT: Pt = [-70, -118];
/** Their palm-up hand come forward in the room, close up: its palm's middle, and its scale. */
const HAND_AT: Pt = [880, 860];
const HAND_SCALE = 1.3;
/** Their hand at the window coming forward to us as the close-up, and back. */
const FORWARD: HandPush = {
  from: [AT_WINDOW[0] + OPEN_AT[0] * WINDOW_SCALE, AT_WINDOW[1] + OPEN_AT[1] * WINDOW_SCALE],
  figureScale: WINDOW_SCALE,
  to: HAND_AT,
  scale: HAND_SCALE,
};
/** Where the close-up's arm comes in: up from below, a little from the right, where they stand. */
const FROM_THEM: Pt = [300, 700];
/** The icons in the palm's middle: their scale. */
const ICONS_IN_HAND = 0.24;

/** The working days, each a sun's arc; the Sabbath begins as the last one sets. */
const DAYS = 6;

/** The robe, as `robe` gives it. */
const ROBED: Person = { body: C.robe, shade: C.robe, garment: 'robe' };

/**
 * The gate and the window; where the robed figure stands on the page; and the
 * page's cameras, on the robed figure and on the gate.
 */
const knobs = {
  gate: [1420, 930],
  window: [620, 440],
  fig: [560, 930],
  onFig: [640, 650],
  onFigZoom: 1.45,
  onGate: [1460, 600],
  onGateZoom: 1.25,
} as const;

const timeline = {
  ask: { scene: 'speech', dur: 0.4 },
  lead: { mark: 'kingdom', dur: 0.4 },
  toGate: { mark: 'kingdom', offset: -0.2, dur: 1, ease: 'inOutCubic' },
  notes: { mark: 'kingdom', offset: 0.3, dur: 0.8 },
  other: { mark: 'joy', offset: -0.2, dur: 0.5, ease: 'outBack' },
  ears: { mark: 'joy', offset: 0.5, dur: 0.4, ease: 'outBack' },
  toFig: { mark: 'keep', offset: -0.4, dur: 0.9, ease: 'inOutCubic' },
  askAgain: { mark: 'keep', dur: 0.4 },
  through: { mark: 'will', offset: -0.35, dur: 0.6, ease: 'inCubic' },
  dawn: { mark: 'will', until: 'matter', ease: 'outQuad' },
  // At the window they open their hand and turn it palm up, and on "choose"
  // it comes forward to us, close up; on "sab" it goes back to them, the
  // gifts in it.
  reach: { mark: 'choose', offset: -0.7, dur: 0.6 },
  palmUp: { mark: 'choose', offset: -0.4, dur: 0.3, ease: 'inOutSine' },
  handUp: { mark: 'choose', dur: 0.7, ease: 'inOutCubic' },
  handBack: { mark: 'sab', dur: 0.6, ease: 'inOutCubic' },
  lay: { mark: 'choose', offset: 0.6, dur: 1.2, ease: 'outBack', stagger: 0.6 },
  days: { mark: 'matter', until: 'sab', ease: 'linear', stagger: 0.8 },
  sixth: { mark: 'sab', dur: 1.3, ease: 'inOutSine' },
  field: { after: 'sixth', offset: -0.2, dur: 0.6 },
  settle: { after: 'field', dur: 2.5, ease: 'outCubic' },
  rest: { mark: 'rest', dur: 1.5 },
} as const;

type DailyFrame = Frame<keyof typeof timeline & string, typeof knobs>;

export const daily = drawing({
  timeline,
  knobs,
  draw: (f) => {
    const through = f.at('through');
    const field = f.at('field');
    if (through < 1) page(f, through);
    if (through > THROUGH_CUT && field < 1) room(f, (through - THROUGH_CUT) / (1 - THROUGH_CUT));
    if (field > 0) sabbath(f, field);
  },
});

// Scratch the draw reuses every frame, so no pose or tuple is made per frame.
const LOOK: [number, number] = [0, 0];
const AT: [number, number] = [0, 0];
const OTHER_LOOK: [number, number] = [0, 0];
const ASKING: Person = { ...ROBED, look: LOOK };
/** The other's hands over their ears, grown on `ears`. */
const OVER_EAR_L: ArmAt = { to: [-40, -160], grow: 0, grip: 'open' };
const OVER_EAR_R: ArmAt = { to: [40, -160], grow: 0, grip: 'open' };
const OTHER: Person = {
  look: OTHER_LOOK,
  far: OVER_EAR_L,
  near: OVER_EAR_R,
  stains: FIGURE_STAINS,
};
/** The robed figure's hand at the window, open toward it, then turned palm up (`palmUp`). */
const OPENED: ArmAt = { to: [OPEN_AT[0], OPEN_AT[1]], grow: 0, grip: 'palm', turn: 0 };
/** At the window, face to the light. */
const AT_THE_WINDOW: Person = {
  ...ROBED,
  far: OPENED,
  tilt: -0.06,
  look: [-3, -1],
  browL: 1.5,
  browR: 1.5,
  browTilt: 0.1,
  smile: 0.5,
};
const LAID: [number, number, number] = [0, 0, 0];
const LIT: [number, number, number] = [0, 0, 0];
const SKY_TOP: [number, string] = [0, C.tealTop];
const SKY_LOW: [number, string] = [1, C.tealLow];
const WINDOW_SKY = [SKY_TOP, SKY_LOW] as const;

/** A: the page, the robed figure, the gate and the one at it. */
const page = (f: DailyFrame, through: number) => {
  const { ctx, w, h } = f;
  sky(ctx, w, h, PAPER_SKY);
  const toGate = f.at('toGate') * (1 - f.at('toFig'));
  const FIG = f.knob('fig');
  const [fx, fy] = f.knob('onFig');
  const [gx, gy] = f.knob('onGate');
  const chestY = FIG[1] + CHEST[1] * FIG_SCALE;
  const push = through;
  const x = lerp(lerp(fx, gx, toGate), FIG[0], push);
  const y = lerp(lerp(fy, gy, toGate), chestY, push);
  const zoom = lerp(lerp(f.knob('onFigZoom'), f.knob('onGateZoom'), toGate), THROUGH_ZOOM, push);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-x, -y);
  gate(f);
  other(f);
  robedOnPage(f, toGate);
  ctx.restore();
};

/** The gold city gate, light and music drifting out of it. */
const gate = (f: DailyFrame) => {
  const { ctx, t } = f;
  const { hand } = f;
  const [gx, gy] = f.knob('gate');
  ctx.save();
  ctx.translate(gx, gy);
  glow(ctx, 0, -300, 620, C.glow, 0.9);
  piece(ctx, WALL_L, C.boardLight, hand('wallL'), { role: 'scenery', kind: 'cut', line: 3 });
  piece(ctx, WALL_R, C.boardLight, hand('wallR'), { role: 'scenery', kind: 'cut', line: 3 });
  piece(ctx, OPENING, C.cream, hand('opening'), {
    role: 'scenery',
    kind: 'cut',
    line: 3,
    shadow: 0,
  });
  glow(ctx, 0, -260, 260, C.glow, 1);
  for (const px of PILLAR_X) {
    ctx.save();
    ctx.translate(px, 0);
    piece(ctx, PILLAR, C.gold, sub(hand('pillar'), px), {
      role: 'scenery',
      kind: 'cut',
      line: 4,
    });
    ctx.restore();
  }
  piece(ctx, ARCH, C.gold, hand('arch'), { role: 'scenery', kind: 'cut', line: 4 });
  const notes = f.at('notes');
  // The notes going right, toward the one at the gate, jangle when their ears are covered.
  const jangle = f.at('ears') * (1 - f.at('toFig'));
  if (notes > 0)
    for (let i = 0; i < NOTES; i++) {
      const drift = (t * NOTE_RATE + i / NOTES) % 1;
      const side = i % 2 === 0 ? -1 : 1;
      const shake = side > 0 ? jangle : 0;
      const nx = side * (40 + 360 * drift) + shake * 10 * Math.sin(t * 31 + i);
      const ny = -300 - 220 * drift + 18 * Math.sin(t * 2 + i) + shake * 8 * Math.cos(t * 27 + i);
      ctx.save();
      ctx.globalAlpha *= notes * Math.sin(Math.PI * drift);
      ctx.translate(nx, ny);
      ctx.rotate(0.15 * Math.sin(t * 1.5 + i) + shake * 0.6 * Math.sin(t * 23 + i * 1.7));
      piece(ctx, NOTE_HEAD, C.gold, sub(hand('note'), i), {
        role: 'scenery',
        kind: 'cut',
        line: 2.5,
        shadow: 0.1,
      });
      stroke(ctx, NOTE_STEM, { color: C.ink, width: 3, jitter: 0.3 }, sub(hand('stem'), i));
      if (i % 3 !== 0)
        stroke(ctx, NOTE_FLAG, { color: C.ink, width: 3, jitter: 0.3 }, sub(hand('flag'), i));
      ctx.restore();
    }
  ctx.restore();
};

/** The small grey figure in the scarlet stains beside the gate, hands over their ears. */
const other = (f: DailyFrame) => {
  const { ctx } = f;
  const pop = f.at('other');
  if (pop <= 0) return;
  const ears = f.at('ears');
  const [gx, gy] = f.knob('gate');
  const x = gx + OTHER_DX;
  ctx.save();
  ctx.translate(x, gy);
  ctx.scale(OTHER_SCALE * pop, OTHER_SCALE * pop);
  // Their hands grow up from the shoulders to the ears.
  OVER_EAR_L.grow = ears;
  OVER_EAR_R.grow = ears;
  OTHER_LOOK[0] = lerp(-3, 0, ears);
  OTHER_LOOK[1] = -1;
  OTHER.tilt = 0.1 * ears;
  OTHER.eyes = lerp(1, 0.2, ears);
  OTHER.browL = -1 * ears;
  OTHER.browR = -1 * ears;
  OTHER.browTilt = 0.3 * ears;
  OTHER.smile = -0.45 * ears;
  person(ctx, OTHER, f.hand('other'));
  ctx.restore();
};

/** The robed figure on the page, heart glowing: asking, looking to the gate, asking again. */
const robedOnPage = (f: DailyFrame, toGate: number) => {
  const { ctx } = f;
  const ask = f.at('ask') * (1 - f.at('lead')) + f.at('askAgain');
  LOOK[0] = lerp(lerp(1, 2, ask), 4, toGate);
  LOOK[1] = lerp(lerp(0, -4, ask), -1, toGate);
  const FIG = f.knob('fig');
  ctx.save();
  ctx.translate(FIG[0], FIG[1]);
  ctx.scale(FIG_SCALE, FIG_SCALE);
  ASKING.tilt = -0.12 * ask;
  ASKING.browL = 4 * ask;
  ASKING.browR = 2 * ask;
  ASKING.browTilt = 0.1 + 0.25 * ask;
  ASKING.mouth = 0.5 * ask;
  ASKING.smile = 0.3 * (1 - ask);
  person(ctx, ASKING, f.hand('robed'));
  glow(ctx, CHEST[0], CHEST[1], 70, C.glow, 1);
  glow(ctx, CHEST[0], CHEST[1], 28, C.gold, 0.7);
  ctx.restore();
};

/** Working day `i`'s sun, 0..1 across its arc: the first five over `days`, the sixth on "sab". */
const dayArc = (f: DailyFrame, i: number): number =>
  i < DAYS - 1 ? f.stagger('days', i, DAYS - 1) : f.at('sixth');

/**
 * Where the sun is in its arc 0..1 over the window: the first morning risen
 * a little by "choose", then each working day's arc, the sixth setting gold.
 */
const sunArc = (f: DailyFrame): number => {
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = dayArc(f, i);
    if (d <= 0) continue;
    return i === 0 ? lerp(0.15, 1, d) : d;
  }
  return 0.15 * f.at('dawn');
};

/** B: the room at dawn, the robed figure at the window, the open hand and its icons. */
const room = (f: DailyFrame, alpha: number) => {
  const { ctx, w, h } = f;
  const { hand } = f;
  const [wx, wy] = f.knob('window');
  const arc = sunArc(f);
  const day = Math.sin(Math.PI * arc);
  const gold = f.at('sixth');
  ctx.save();
  ctx.globalAlpha *= alpha;
  // The chipboard wall, lit from the window.
  ctx.fillStyle = C.board;
  ctx.fillRect(0, 0, w, h);
  glow(ctx, wx + 200, wy + 200, 900, mix(C.peachLow, C.glow, day), 0.55);

  // The view: sky, the sun on its arc, the hill and the path with a flower a day.
  ctx.save();
  ctx.beginPath();
  ctx.rect(wx - WIN_HW, wy - WIN_HH, WIN_HW * 2, WIN_HH * 2);
  ctx.clip();
  const skyTop = mix(C.peachTop, C.tealTop, day);
  SKY_TOP[1] = skyTop;
  const skyLow = mix(mix(C.peachLow, C.tealLow, day), C.gold, 0.6 * gold);
  SKY_LOW[1] = skyLow;
  sky(ctx, w, h, WINDOW_SKY);
  const sx = wx + lerp(-WIN_HW + 60, WIN_HW - 60, arc);
  const sy = wy + HORIZON - SUN_ARC * day;
  glow(ctx, sx, sy, 200, C.glow, 0.9);
  // Built where it stands: the ink reads a shape's own points, so a moved copy draws other pixels.
  piece(ctx, ellipseShape(sx, sy, 44, 44, 24), C.gold, hand('sun'), { role: 'scenery', line: 0 });
  ctx.save();
  ctx.translate(wx, wy + VIEW_DROP);
  ctx.scale(VIEW_SCALE, VIEW_SCALE);
  piece(ctx, PATH_HILL, C.leaf, hand('hill'), { role: 'scenery', line: 0, shadow: 0.2 });
  stroke(
    ctx,
    PATH_AHEAD,
    { color: C.boardLight, width: 44, jitter: 0.4, taper: 0.5, boil: 'none' },
    hand('path'),
  );
  flowers(f);
  ctx.restore();
  ctx.restore();

  // The frame, its bars and sill.
  ctx.save();
  ctx.translate(wx, wy);
  for (let i = 0; i < WIN_FRAME.length; i++)
    piece(ctx, WIN_FRAME[i] ?? WIN_BAR_V, C.boardDeep, sub(hand('frame'), i), {
      role: 'scenery',
      kind: 'cut',
      line: 3,
    });
  piece(ctx, WIN_BAR_V, C.boardDeep, hand('barV'), { role: 'scenery', kind: 'cut', line: 3 });
  piece(ctx, WIN_BAR_H, C.boardDeep, hand('barH'), { role: 'scenery', kind: 'cut', line: 3 });
  piece(ctx, SILL, C.boardShade, hand('sill'), { role: 'scenery', kind: 'cut', line: 3 });
  ctx.restore();

  robedAtWindow(f, day);
  inHand(f, arc);
  ctx.restore();
};

/** One flower on the path for each working day done. */
const flowers = (f: DailyFrame) => {
  const { ctx } = f;
  const { hand } = f;
  for (let i = 0; i < DAYS; i++) {
    const grown = clamp((dayArc(f, i) - 0.55) / 0.35);
    if (grown <= 0) continue;
    const k = (i + 0.5) / DAYS;
    alongPath(k, AT);
    const side = i % 2 === 0 ? -1 : 1;
    ctx.save();
    ctx.translate(AT[0] + side * 40, AT[1] + 10);
    const s = grown * (2.2 - 0.8 * k);
    ctx.scale(s, s);
    stroke(
      ctx,
      FLOWER_STEM,
      { color: C.leafShade, width: 4, jitter: 0.3, boil: 'none' },
      sub(hand('stem'), i),
    );
    piece(ctx, FLOWER_HEAD, i % 3 === 0 ? C.gold : C.robe, sub(hand('flower'), i), {
      role: 'scenery',
      line: 2,
    });
    ctx.restore();
  }
};

/** The robed figure at the window, face to the light, heart glowing. */
const robedAtWindow = (f: DailyFrame, day: number) => {
  const { ctx } = f;
  // Their hand opens toward the window, gives way to the close-up as it comes
  // forward, and grows back as it returns.
  OPENED.grow = f.at('reach') * (1 - f.at('handUp') * (1 - f.at('handBack')));
  OPENED.turn = f.at('palmUp');
  ctx.save();
  ctx.translate(AT_WINDOW[0], AT_WINDOW[1]);
  ctx.scale(WINDOW_SCALE, WINDOW_SCALE);
  person(ctx, AT_THE_WINDOW, f.hand('atWindow'));
  glow(ctx, CHEST[0], CHEST[1], 60, C.glow, 0.8 + 0.2 * day);
  glow(ctx, CHEST[0], CHEST[1], 24, C.gold, 0.6);
  ctx.restore();
};

/**
 * The open hand rising palm up on "choose", the three icons laid in it; each
 * working day its fingers curl toward dusk and open again at dawn.
 */
const inHand = (f: DailyFrame, arc: number) => {
  const { ctx } = f;
  // 0 their hand at the window, 1 come forward to us.
  const up = f.at('handUp') * (1 - f.at('handBack'));
  if (up <= 0) return;
  const working = f.at('days') > 0;
  const night = 1 - Math.sin(Math.PI * arc);
  const open = working ? 1 - 0.55 * night * night : 1;
  LAID[0] = f.stagger('lay', 0, 3);
  LAID[1] = f.stagger('lay', 1, 3);
  LAID[2] = f.stagger('lay', 2, 3);
  LIT[0] = LAID[0] * open;
  LIT[1] = LAID[1] * open;
  LIT[2] = LAID[2] * open;
  // Their palm-up hand at the window comes forward as the close-up, the same
  // shape growing, and goes back into their hand the same way.
  pushedHand(ctx, f.hand, FORWARD, up, open, FROM_THEM, {
    under: () => glow(ctx, 0, 0, 260, C.glow, 0.5 * open),
    over: () => {
      ctx.save();
      ctx.scale(ICONS_IN_HAND, ICONS_IN_HAND);
      icons(ctx, f.hand, LIT, LAID);
      ctx.restore();
    },
  });
};

/** C: the Sabbath field, the robed figure at rest against the tree, heart glowing. */
const sabbath = (f: DailyFrame, alpha: number) => {
  const { ctx, w, h } = f;
  ctx.save();
  ctx.globalAlpha *= alpha;
  restingField(ctx, w, h, f.hand, f.at('settle'), f.at('rest'), ROBED, 1);
  ctx.restore();
};
