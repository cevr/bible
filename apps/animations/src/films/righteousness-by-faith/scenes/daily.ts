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
// rises palm up and the three small icons are laid in it. On "matter" six
// quick suns arc over the window: each dusk the hand's fingers curl, each
// dawn it opens again, and a flower springs up on the path outside each day
// (the path from `within`). On "sab" the seventh sun sets gold and the shot
// dissolves to the Sabbath field (garden.ts `restingField`): tools set down,
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
import { restingField } from '../garden.ts';
import {
  C,
  type Person,
  blob,
  contact,
  glow,
  icons,
  mix,
  openHand,
  person,
  piece,
  rounded,
  sky,
} from '../kit.ts';

// ─── A: the parchment ────────────────────────────────────────────────────────

/** The robed figure on the page: where they stand and their scale. */
const FIG: Pt = [560, 930];
const FIG_SCALE = 2.3;
/** The heart's place on the chest, in the person's units. */
const CHEST: Pt = [0, -80];
/** The small grey figure in their stains beside the gate, and their scale. */
const OTHER_DX = 380;
const OTHER_SCALE = 1.5;

/** The cameras on the page: on the robed figure, and on the gate. */
const ON_FIG = { x: 640, y: 650, zoom: 1.45 } as const;
const ON_GATE = { x: 1460, y: 600, zoom: 1.25 } as const;
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
const HORIZON = 60;
const SUN_ARC = 300;
/** The view's hill and path, in the view's units (the path from `within`). */
const VIEW_SCALE = 0.62;
const HILL = blob(0, 280, 1300, 560, 61);
const PATH: Pt[] = [
  [-360, 250],
  [-180, 200],
  [-40, 110],
  [110, 40],
  [260, -60],
  [380, -130],
];
const FLOWER_STEM: Pt[] = [
  [0, 0],
  [0, -30],
];
const FLOWER_HEAD = ellipseShape(0, -34, 14, 14, 16);

/** The robed figure at the window: feet below the frame, face a third of it. */
const AT_WINDOW: Pt = [1420, 1250];
const WINDOW_SCALE = 4.7;
/** The open hand in the room, risen, and its scale. */
const HAND_AT: Pt = [880, 890];
const HAND_SCALE = 1.05;
/** The icons in the palm: their scale and where they sit on it. */
const ICONS_IN_HAND = 0.24;
const PALM_Y = -20;

/** The working days, each a sun's arc; the seventh is the Sabbath. */
const DAYS = 6;

/** The robe, as `robe` gives it. */
const ROBED: Person = { body: C.robe, shade: C.robe, garment: 'robe' };

const knobs = { gate: [1420, 930], window: [620, 440] } as const;

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
  handUp: { mark: 'choose', dur: 0.7, ease: 'outCubic' },
  lay: { mark: 'choose', offset: 0.6, dur: 1.2, ease: 'outBack', stagger: 0.6 },
  days: { mark: 'matter', until: 'sab', ease: 'linear', stagger: 0.83 },
  seventh: { mark: 'sab', dur: 1.3, ease: 'inOutSine' },
  field: { after: 'seventh', offset: -0.2, dur: 0.6 },
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
const OTHER_LOOK: [number, number] = [0, 0];
const EARS_L: [number, number] = [0, 0];
const EARS_R: [number, number] = [0, 0];
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
  const chestY = FIG[1] + CHEST[1] * FIG_SCALE;
  const push = through;
  const x = lerp(lerp(ON_FIG.x, ON_GATE.x, toGate), FIG[0], push);
  const y = lerp(lerp(ON_FIG.y, ON_GATE.y, toGate), chestY, push);
  const zoom = lerp(lerp(ON_FIG.zoom, ON_GATE.zoom, toGate), THROUGH_ZOOM, push);
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
  const hand = (k: string) => f.hand(k);
  const [gx, gy] = f.knob('gate');
  ctx.save();
  ctx.translate(gx, gy);
  glow(ctx, 0, -300, 620, C.glow, 0.9);
  piece(ctx, WALL_L, C.boardLight, hand('wallL'), { line: 3 });
  piece(ctx, WALL_R, C.boardLight, hand('wallR'), { line: 3 });
  piece(ctx, OPENING, C.cream, hand('opening'), { line: 3, shadow: 0 });
  glow(ctx, 0, -260, 260, C.glow, 1);
  for (const px of PILLAR_X) {
    ctx.save();
    ctx.translate(px, 0);
    piece(ctx, PILLAR, C.gold, sub(hand('pillar'), px), { line: 4 });
    ctx.restore();
  }
  piece(ctx, ARCH, C.gold, hand('arch'), { line: 4 });
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
      piece(ctx, NOTE_HEAD, C.gold, sub(hand('note'), i), { line: 2.5, shadow: 0.1 });
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
  contact(ctx, x, gy + 4, 70 * OTHER_SCALE);
  ctx.save();
  ctx.translate(x, gy);
  ctx.scale(OTHER_SCALE * pop, OTHER_SCALE * pop);
  // Their hands come up from the sides to the ears.
  EARS_L[0] = lerp(-30, -40, ears);
  EARS_L[1] = lerp(-58, -160, ears);
  EARS_R[0] = lerp(30, 40, ears);
  EARS_R[1] = lerp(-58, -160, ears);
  OTHER_LOOK[0] = lerp(-3, 0, ears);
  OTHER_LOOK[1] = -1;
  person(
    ctx,
    {
      tilt: 0.1 * ears,
      look: OTHER_LOOK,
      eyes: lerp(1, 0.2, ears),
      browL: -1 * ears,
      browR: -1 * ears,
      browTilt: 0.3 * ears,
      smile: -0.45 * ears,
      handL: EARS_L,
      handR: EARS_R,
      stains: FIGURE_STAINS,
    },
    f.hand('other'),
  );
  ctx.restore();
};

/** The robed figure on the page, heart glowing: asking, looking to the gate, asking again. */
const robedOnPage = (f: DailyFrame, toGate: number) => {
  const { ctx } = f;
  const ask = f.at('ask') * (1 - f.at('lead')) + f.at('askAgain');
  LOOK[0] = lerp(lerp(1, 2, ask), 4, toGate);
  LOOK[1] = lerp(lerp(0, -4, ask), -1, toGate);
  contact(ctx, FIG[0], FIG[1] + 4, 80 * FIG_SCALE);
  ctx.save();
  ctx.translate(FIG[0], FIG[1]);
  ctx.scale(FIG_SCALE, FIG_SCALE);
  person(
    ctx,
    {
      ...ROBED,
      tilt: -0.12 * ask,
      look: LOOK,
      browL: 4 * ask,
      browR: 2 * ask,
      browTilt: 0.1 + 0.25 * ask,
      mouth: 0.5 * ask,
      smile: 0.3 * (1 - ask),
    },
    f.hand('robed'),
  );
  glow(ctx, CHEST[0], CHEST[1], 70, C.glow, 1);
  glow(ctx, CHEST[0], CHEST[1], 28, C.gold, 0.7);
  ctx.restore();
};

/**
 * Where the sun is in its arc 0..1 over the window: the first morning risen
 * a little by "choose", each working day one arc over `days`, and the
 * seventh arc setting gold.
 */
const sunArc = (f: DailyFrame): number => {
  const seventh = f.at('seventh');
  if (seventh > 0) return seventh;
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = f.stagger('days', i, DAYS);
    if (d <= 0) continue;
    return i === 0 ? lerp(0.15, 1, d) : d;
  }
  return 0.15 * f.at('dawn');
};

/** B: the room at dawn, the robed figure at the window, the open hand and its icons. */
const room = (f: DailyFrame, alpha: number) => {
  const { ctx, w, h } = f;
  const hand = (k: string) => f.hand(k);
  const [wx, wy] = f.knob('window');
  const arc = sunArc(f);
  const day = Math.sin(Math.PI * arc);
  const gold = f.at('seventh');
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
  piece(ctx, ellipseShape(sx, sy, 44, 44, 24), C.gold, hand('sun'), { line: 0 });
  ctx.save();
  ctx.translate(wx, wy + 40);
  ctx.scale(VIEW_SCALE, VIEW_SCALE);
  piece(ctx, HILL, C.leaf, hand('hill'), { line: 0, shadow: 0.2 });
  stroke(ctx, PATH, { color: C.boardLight, width: 44, jitter: 0.4, taper: 0.5 }, hand('path'));
  flowers(f);
  ctx.restore();
  ctx.restore();

  // The frame, its bars and sill.
  ctx.save();
  ctx.translate(wx, wy);
  for (let i = 0; i < WIN_FRAME.length; i++)
    piece(ctx, WIN_FRAME[i] ?? WIN_BAR_V, C.boardDeep, sub(hand('frame'), i), { line: 3 });
  piece(ctx, WIN_BAR_V, C.boardDeep, hand('barV'), { line: 3 });
  piece(ctx, WIN_BAR_H, C.boardDeep, hand('barH'), { line: 3 });
  piece(ctx, SILL, C.boardShade, hand('sill'), { line: 3 });
  ctx.restore();

  robedAtWindow(f, day);
  inHand(f, arc);
  ctx.restore();
};

/** One flower on the path for each working day done. */
const flowers = (f: DailyFrame) => {
  const { ctx } = f;
  const hand = (k: string) => f.hand(k);
  for (let i = 0; i < DAYS; i++) {
    const grown = clamp((f.stagger('days', i, DAYS) - 0.55) / 0.35);
    if (grown <= 0) continue;
    const k = (i + 0.5) / DAYS;
    const seg = k * (PATH.length - 1);
    const j = Math.min(PATH.length - 2, Math.floor(seg));
    const a = PATH[j] ?? PATH[0] ?? [0, 0];
    const b = PATH[j + 1] ?? a;
    const side = i % 2 === 0 ? -1 : 1;
    ctx.save();
    ctx.translate(lerp(a[0], b[0], seg - j) + side * 40, lerp(a[1], b[1], seg - j) + 10);
    const s = grown * (2.2 - 0.8 * k);
    ctx.scale(s, s);
    stroke(ctx, FLOWER_STEM, { color: C.leafShade, width: 4, jitter: 0.3 }, sub(hand('stem'), i));
    piece(ctx, FLOWER_HEAD, i % 3 === 0 ? C.gold : C.robe, sub(hand('flower'), i), { line: 2 });
    ctx.restore();
  }
};

/** The robed figure at the window, face to the light, heart glowing. */
const robedAtWindow = (f: DailyFrame, day: number) => {
  const { ctx } = f;
  LOOK[0] = -3;
  LOOK[1] = -1;
  ctx.save();
  ctx.translate(AT_WINDOW[0], AT_WINDOW[1]);
  ctx.scale(WINDOW_SCALE, WINDOW_SCALE);
  person(
    ctx,
    { ...ROBED, tilt: -0.06, look: LOOK, browL: 1.5, browR: 1.5, browTilt: 0.1, smile: 0.5 },
    f.hand('atWindow'),
  );
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
  const up = f.at('handUp');
  if (up <= 0) return;
  const working = f.at('days') > 0 && f.at('seventh') < 1;
  const night = 1 - Math.sin(Math.PI * arc);
  const open = working ? 1 - 0.55 * night * night : 1;
  ctx.save();
  ctx.translate(HAND_AT[0], lerp(1400, HAND_AT[1], up));
  ctx.scale(HAND_SCALE, HAND_SCALE);
  glow(ctx, 0, PALM_Y, 260, C.glow, 0.5 * open);
  openHand(ctx, f.hand, open);
  LAID[0] = f.stagger('lay', 0, 3);
  LAID[1] = f.stagger('lay', 1, 3);
  LAID[2] = f.stagger('lay', 2, 3);
  LIT[0] = LAID[0] * open;
  LIT[1] = LAID[1] * open;
  LIT[2] = LAID[2] * open;
  ctx.translate(0, PALM_Y);
  ctx.scale(ICONS_IN_HAND, ICONS_IN_HAND);
  icons(ctx, f.hand, LIT, LAID);
  ctx.restore();
};

/** C: the Sabbath field, the robed figure at rest against the tree, heart glowing. */
const sabbath = (f: DailyFrame, alpha: number) => {
  const { ctx, w, h } = f;
  ctx.save();
  ctx.globalAlpha *= alpha;
  restingField(ctx, w, h, f.hand, f.at('settle'), f.at('rest'), ROBED, 1);
  ctx.restore();
};
