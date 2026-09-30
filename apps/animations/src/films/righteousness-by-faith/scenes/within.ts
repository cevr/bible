// The third gift: power, and the law moves in. The scene opens on `robe`'s
// closing icon row (`ICON_ROW`), faith and forgiveness glowing and the woman
// in white fading from under the robe as the row settles; on "power" the
// heart lights. On "out" the page: the gold circle from `word`, as big as
// the universe, comes back around the grey figure; on "never" it shrinks and
// settles into their chest, and on "write" it is a warm heart with the two
// tablets inside it, still legible. On "bed" the row again, the heart lit,
// calling back `roof`'s house on a plate under it, the tablets left whole:
// the man forgiven, walking out with his bed as on "went". On "not" the
// figure again, their hands going out, and the glow runs straight from the
// heart to the open hands. On "become" close on the face, and the grey paper of the
// figure warms toward cream and gold, the gold of the word in `declared`: they
// become what they are called. Then two panels, one after
// the other: a closed book with a gold ribbon (the past, forgiven: "first"),
// and a path ahead with the figure walking it and flowers springing up in
// their footprints ("second"). The Sabbath rest is `daily`'s.

import {
  type Camera,
  type Frame,
  type Pt,
  at,
  camera,
  drawing,
  ellipse,
  ellipseShape,
  rectShape,
  shotPath,
  stroke,
  sub,
  type Posed,
  blob,
  glow,
  knobCamera,
  mix,
  rounded,
  sky,
} from '@bible/film/canvas';
import { clamp, lerp, gait } from '@bible/film/core';
import {
  type GestureAt,
  C,
  CHEST,
  ICON_KEPT,
  ICON_ROW,
  ICON_SKY,
  ICON_X,
  type IconCount,
  type Person,
  handOf,
  heart as drawHeart,
  icons,
  person,
  piece,
} from '../kit.ts';
import { PATH_AHEAD, PATH_HILL, alongPath } from '../garden.ts';
import { COURT_FORGIVEN, RECALL_RISE, house, recall, temple, went } from '../gospel.ts';

/** The panel beside them. */
const PANEL: Pt = [1260, 520];
const PANEL_W = 900;
const PANEL_H = 640;

/** The page at rest: the unmoved frame (the canvas itself, so not a knob). */
const PAGE: Camera = { x: 960, y: 540, zoom: 1 };

/** Each hand held out open at the side, at the heart's height. */
const OPEN_HAND: Pt = [78, -80];
/** How many glows light the way from the heart out to each hand. */
const RUN_STEPS = 6;
/** The warmed figure: grey paper toward cream, touched with the word's gold. */
const WARM_BODY = mix(C.cream, C.gold, 0.22);
const WARM_SHADE = mix(C.cream, C.gold, 0.45);

const timeline = {
  ask: { mark: 'out', dur: 0.4 },
  shrink: { mark: 'never', dur: 1.5, ease: 'inOutCubic' },
  heart: { mark: 'write', offset: -0.1, dur: 0.5, ease: 'outBack' },
  // The circle fades as the heart pops in, gone by the time it is well in.
  heartOut: { with: 'heart', dur: 0.08, ease: 'linear' },
  // `robe`'s row: the woman's plate goes as the row settles, and the heart lights on "power".
  settle: { at: 'start', dur: 0.8, ease: 'inOutCubic' },
  heartLit: { mark: 'power', dur: 0.55, ease: 'outBack' },
  toPage: { mark: 'out', offset: -0.3, dur: 0.4 },
  // The row again on "bed", the callback to `roof`'s house under the heart:
  // he walks on until the figure comes back, just after "not".
  toIcons: { mark: 'bed', offset: -0.2, dur: 0.3 },
  wentIn: { mark: 'bed', dur: 0.4 },
  going: { mark: 'bed', until: 'not', ease: 'linear' },
  backIn: { mark: 'not', offset: 0.1, dur: 0.3 },
  arms: { mark: 'not', dur: 0.8, ease: 'inOutSine' },
  run: { mark: 'not', offset: 0.4, until: 'become', ease: 'inOutSine' },
  closeUp: { mark: 'become', offset: -0.3, dur: 1, ease: 'inOutCubic' },
  warm: { mark: 'become', offset: 0.2, until: 'plain', ease: 'inOutSine' },
  closeOut: { mark: 'plain', dur: 0.8, ease: 'inOutCubic' },
  aside: { mark: 'first', offset: -0.4, dur: 0.8 },
  book: { mark: 'first', dur: 0.5, ease: 'outBack' },
  swap: { mark: 'second', offset: -0.3, dur: 0.6 },
  walk: { mark: 'second', offset: 0.3, dur: 2, ease: 'linear' },
} as const;

const knobs = {
  // The figure on the page, and where they stand aside for the panel.
  centre: [960, 930],
  aside: [420, 930],
  // Close on the figure's face (a third of the frame) on "become".
  face: [960, 590],
  faceZoom: 2.1,
} as const;

type WithinFrame = Frame<keyof typeof timeline & string, typeof knobs>;

export const within = drawing({
  timeline,
  knobs,
  draw: (f) => {
    // The icons cover the page until "out", and again from "bed" until the figure comes back.
    const shown = Math.max(1 - f.at('toPage'), f.at('toIcons') * (1 - f.at('backIn')));
    if (shown < 1) page(f);
    if (shown > 0) iconsShot(f, shown);
  },
});

/** A: the page, the figure on it, and later the panel beside them. */
const page = (f: WithinFrame) => {
  const { ctx, w, h } = f;
  sky(ctx, w, h, [
    [0, C.paper],
    [1, C.paper],
  ]);
  const cam = shotPath(PAGE, [
    [f.at('closeUp'), knobCamera(f.knob('face'), f.knob('faceZoom'))],
    [f.at('closeOut'), PAGE],
  ]);
  camera(ctx, cam, w, h, () => {
    const aside = f.at('aside');
    const centre = f.knob('centre');
    const side = f.knob('aside');
    const [fx, fy] = [lerp(centre[0], side[0], aside), lerp(centre[1], side[1], aside)];
    const scale = lerp(2.4, 1.9, aside);
    circle(f, [fx, fy - 92 * scale]);
    at(ctx, { x: fx, y: fy, scale }, () => figure(f, aside));
    if (aside > 0) panel(f, aside);
  });
};

/** The circle, as big as the universe, coming home to the chest; gone once the heart is in. */
const circle = (f: WithinFrame, chest: Pt) => {
  const { ctx } = f;
  const gone = f.at('heartOut');
  if (gone >= 1) return;
  const { hand } = f;
  const shrink = f.at('shrink');
  const r = lerp(720, 40, shrink);
  const [cx, cy] = [lerp(960, chest[0], shrink), lerp(470, chest[1], shrink)];
  ctx.save();
  ctx.globalAlpha *= 1 - gone;
  glow(ctx, cx, cy, r * 1.1, C.glow, 0.5);
  stroke(
    ctx,
    ellipse(cx, cy, r, r),
    { color: C.gold, width: lerp(16, 8, shrink), jitter: 0.6, taper: 0 },
    hand('circle'),
  );
  // A few worlds inside it, going as it shrinks.
  WORLDS.forEach(([sx, sy, sr], i) =>
    piece(
      ctx,
      ellipseShape(cx + sx * r, cy + sy * r, sr, sr),
      i % 2 === 0 ? C.gold : C.inkSoft,
      sub(hand('world'), i),
      { role: 'scenery', line: 2, alpha: 1 - shrink },
    ),
  );
  ctx.restore();
};
const WORLDS = [
  [-0.5, -0.3, 22],
  [0.35, -0.45, 14],
  [0.55, 0.2, 30],
  [-0.3, 0.45, 12],
  [0.05, -0.7, 9],
] as const;

// Scratch the draw rewrites every frame, so no pose or point is made per frame.
/** Both hands open out on `arms`, from their rest beside the body, and brought back on `closeOut`. */
const OPEN_FAR: GestureAt = { to: [-OPEN_HAND[0], OPEN_HAND[1]], reach: 0, grip: 'open' };
const OPEN_NEAR: GestureAt = { to: [OPEN_HAND[0], OPEN_HAND[1]], reach: 0, grip: 'open' };
const LOOK: [number, number] = [0, 0];
const POSE: Person = { look: LOOK, far: OPEN_FAR, near: OPEN_NEAR };
const GLOW_AT: [number, number] = [0, 0];

/**
 * The figure, in their own units: asking, then the heart in the chest; after
 * the icons, hands out with the glow running to them open, warming on
 * "become", and the hands lowered again on "plain".
 */
const figure = (f: WithinFrame, aside: number) => {
  const { ctx } = f;
  const { hand } = f;
  const ask = f.at('ask') * (1 - f.at('heart'));
  const heart = f.at('heart');
  const lit = clamp(f.at('heartLit'));
  const warm = f.at('warm');
  const open = f.at('arms') * (1 - f.at('closeOut'));
  const settled = heart * (1 - aside) * (1 - open);
  const body = mix(C.figure, WARM_BODY, warm);
  LOOK[0] = lerp(0, 2, ask) + 2 * aside;
  LOOK[1] = lerp(-4 * ask, 3, settled);
  POSE.body = body;
  POSE.skin = body;
  POSE.shade = mix(C.figureShade, WARM_SHADE, warm);
  POSE.tilt = -0.12 * ask + 0.08 * settled;
  POSE.nod = 4 * settled;
  POSE.browL = 4 * ask + 2 * heart + 1.5 * warm;
  POSE.browR = 2 * ask + 2 * heart + 1.5 * warm;
  POSE.browTilt = 0.35 * ask + 0.25 * warm;
  POSE.mouth = 0.6 * ask;
  POSE.smile = 0.55 * warm;
  OPEN_FAR.reach = open;
  OPEN_NEAR.reach = open;
  person(ctx, POSE, hand('figure'));
  if (heart > 0)
    at(ctx, { x: CHEST[0], y: CHEST[1], scale: 0.36 * heart }, () => {
      glow(ctx, 0, 0, 220 + 140 * lit, C.glow, 0.8 + 0.2 * lit);
      // The icon's heart, warm, its tablets still legible.
      drawHeart(ctx, hand, mix(C.peachTop, C.gold, 0.4 * lit), true);
    });
  running(f, open);
};

/**
 * The glow running out from the heart to each open hand, over `run`: straight
 * from the heart to the hand, the way the power goes, never up through the
 * shoulders along an arm that is not there.
 */
const running = (f: WithinFrame, open: number) => {
  const { ctx } = f;
  const run = f.at('run');
  if (run <= 0 || open <= 0) return;
  for (const side of SIDES) {
    const end = handOf(POSE, side < 0 ? 'far' : 'near', f.hand('figure'));
    for (let i = 1; i <= RUN_STEPS; i++) {
      const k = i / RUN_STEPS;
      if (k > run + 0.001) break;
      const [x, y] = toward(CHEST, end, k, GLOW_AT);
      glow(ctx, x, y, 44, C.glow, 0.9 * open);
      glow(ctx, x, y, 22, C.gold, 0.6 * open);
    }
    if (run < 1) continue;
    glow(ctx, end[0], end[1], 70, C.glow, open);
    glow(ctx, end[0], end[1], 34, C.gold, 0.7 * open);
  }
};
const SIDES = [-1, 1] as const;
/** The point `k` of the way from `a` to `b`, written into `out`. */
const toward = (a: Pt, b: Pt, k: number, out: [number, number]): [number, number] => {
  out[0] = lerp(a[0], b[0], k);
  out[1] = lerp(a[1], b[1], k);
  return out;
};

/** The panel: first the past, closed and forgiven; then the path ahead. */
const panel = (f: WithinFrame, aside: number) => {
  const { ctx } = f;
  const { hand } = f;
  const swap = f.at('swap');
  at(ctx, { x: PANEL[0] + (1 - aside) * 900, y: PANEL[1] }, () => {
    piece(ctx, rounded(0, 0, PANEL_W, PANEL_H, 24), C.cream, hand('panel'), {
      role: 'scenery',
      kind: 'cut',
      line: 4,
      torn: 1,
    });
    ctx.save();
    ctx.beginPath();
    ctx.rect(-PANEL_W / 2 + 6, -PANEL_H / 2 + 6, PANEL_W - 12, PANEL_H - 12);
    ctx.clip();
    if (swap < 1) {
      const book = f.at('book');
      at(ctx, { x: -swap * 900, y: 20, scale: book, rot: -0.06 }, () => {
        piece(ctx, rounded(0, 0, 420, 300, 14), C.boardDeep, hand('cover'), {
          role: 'scenery',
          kind: 'cut',
          line: 4,
        });
        piece(ctx, rounded(8, 0, 380, 264, 8), C.inkSoft, hand('coverInset'), {
          role: 'scenery',
          kind: 'cut',
          line: 0,
        });
        // The ribbon tied across it.
        piece(ctx, RIBBON, C.gold, hand('ribbon'), { role: 'scenery', kind: 'cut', line: 3 });
        piece(ctx, blob(-20, -8, 90, 60, 9), C.gold, hand('bow'), {
          role: 'scenery',
          kind: 'cut',
          line: 3,
        });
      });
    }
    if (swap > 0) at(ctx, { x: (1 - swap) * 900, y: 0 }, () => path(f));
    ctx.restore();
  });
};

/** The hills, the path ahead and the figure walking it, flowers where they have stepped. */
const path = (f: WithinFrame) => {
  const { ctx } = f;
  const { hand } = f;
  piece(ctx, PATH_HILL, C.leaf, hand('hill'), {
    role: 'scenery',
    line: 0,
    shadow: 0.2,
  });
  stroke(
    ctx,
    PATH_AHEAD,
    { color: C.boardLight, width: 44, jitter: 0.4, taper: 0.5, boil: 'none' },
    hand('path'),
  );
  const walk = f.at('walk');
  // Flowers where the figure has already stepped.
  for (let i = 0; i < 9; i++) {
    const k = i / 9;
    const age = (walk - k) * 6;
    if (age <= 0) continue;
    const [px, py] = alongPath(k, AT);
    const s = clamp(age);
    const side = i % 2 === 0 ? -1 : 1;
    at(ctx, { x: px + side * 34, y: py + 10, scale: s * (1 - 0.4 * k) }, () => {
      stroke(
        ctx,
        STEM,
        { color: C.leafShade, width: 4, jitter: 0.3, boil: 'none' },
        sub(hand('stem'), i),
      );
      piece(
        ctx,
        ellipseShape(0, -34, 14, 14),
        i % 3 === 0 ? C.gold : C.robe,
        sub(hand('flower'), i),
        { role: 'scenery', line: 2 },
      );
    });
  }
  const [wx, wy] = alongPath(walk, AT);
  // The film's one walk: the kit's step, from the cue's start.
  const bob = gait(f.t, f.cue('walk'));
  at(ctx, { x: wx, y: wy - bob, scale: 0.9 - 0.4 * walk }, () => {
    glow(ctx, 0, -90, 90, C.glow, 0.6);
    // The same figure, still warm.
    person(ctx, WALKER, hand('walker'));
  });
};
/** The walker: the same figure, still warm. */
const WALKER: Person = {
  body: WARM_BODY,
  skin: WARM_BODY,
  shade: WARM_SHADE,
  look: [3, -1],
  browTilt: 0.1,
};
/** The ribbon tied across the closed book. */
const RIBBON = rectShape(-40, -160, 40, 320);
/** Scratch for a point along the path. */
const AT: [number, number] = [0, 0];
const STEM: Pt[] = [
  [0, 0],
  [0, -30],
];

/** The row's glow: faith kept, forgiveness settling from `robe`'s full glow, the heart lighting. */
const LIT: [number, number, number] = [ICON_KEPT, 1, 0];
/** The robe leading as `robe` left it, until the heart pops forward on "power"; the unlit faded. */
const LEAD: [number, number, number] = [0, 1, 0];
const COUNT: Posed<IconCount> = { lead: LEAD, dim: 1 };

/**
 * B: the section head's icon row, as `robe` leaves it (the woman's plate
 * under the robe going as the row settles), the heart lighting on "power";
 * on "bed" the plate under the heart.
 */
const iconsShot = (f: WithinFrame, alpha: number) => {
  const { ctx, w, h } = f;
  const { hand } = f;
  const settle = f.at('settle');
  const wentIn = f.at('wentIn');
  const court = 1 - settle;
  const heart = f.at('heartLit');
  LIT[1] = lerp(1, ICON_KEPT, clamp(heart));
  LIT[2] = clamp(heart);
  LEAD[1] = 1 - clamp(heart);
  LEAD[2] = heart;
  ctx.save();
  ctx.globalAlpha *= alpha;
  sky(ctx, w, h, ICON_SKY);
  // The row rises as a callback opens under it, its icon left whole.
  const y = ICON_ROW.y - RECALL_RISE * Math.max(court, wentIn);
  at(ctx, { x: ICON_ROW.x, y, scale: ICON_ROW.scale }, () => {
    icons(ctx, hand, LIT, undefined, COUNT);
    at(ctx, { x: ICON_X[1], y: 0 }, () =>
      recall(
        ctx,
        hand,
        court,
        () => temple(ctx, w, h, f.handsOf('woman'), COURT_FORGIVEN),
        LEAD[1],
      ),
    );
    at(ctx, { x: ICON_X[2], y: 0 }, () =>
      recall(
        ctx,
        hand,
        wentIn,
        () =>
          house(
            ctx,
            w,
            h,
            f.handsOf('roof'),
            went(lerp(WALKED[0], WALKED[1], f.at('going')), gait(f.t, f.cue('going'))),
          ),
        LEAD[2],
      ),
    );
  });
  ctx.restore();
};

/** How far out he has walked as the heart lights, and by the time the figure comes back. */
const WALKED = [0.35, 0.85] as const;
