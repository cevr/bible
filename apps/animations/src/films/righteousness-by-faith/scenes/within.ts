// The law moves in, and the third gift: power. On the parchment page the
// gold circle from `word`, as big as the universe, comes back around the grey
// figure; on "never" it shrinks and settles into their chest, and on "write"
// it is a warm heart with the two tablets inside it, still legible. On
// "power" the pull back to the three icons, and the heart lights. On "not"
// the figure again, their arms coming out, and the glow runs from the heart
// along the arms to the open hands. On "become" close on the face, and the
// grey paper of the figure warms toward cream and gold, the gold of the word
// in `declared`: they become what they are called. Then two panels, one after
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
  stroke,
  sub,
} from '@bible/film/canvas';
import { clamp, lerp } from '@bible/film/core';
import {
  C,
  type Person,
  blob,
  contact,
  gait,
  glow,
  heart as drawHeart,
  icons,
  mix,
  person,
  piece,
  rounded,
  sky,
  between,
} from '../kit.ts';

/** The figure on the page: where they stand, and where they stand aside. */
const CENTRE: Pt = [960, 930];
const ASIDE: Pt = [420, 930];
/** The panel beside them. */
const PANEL: Pt = [1260, 520];
const PANEL_W = 900;
const PANEL_H = 640;

/** The page at rest, and close on the figure's face (a third of the frame) on "become". */
const PAGE: Camera = { x: 960, y: 540, zoom: 1 };
const FACE: Camera = { x: 960, y: 590, zoom: 2.1 };

/** The heart's place on the chest, in the person's units. */
const CHEST: Pt = [0, -80];
/** Each hand held out open at the side, and at rest; and the shoulder the glow runs through. */
const OPEN_HAND: Pt = [78, -80];
const REST_HAND: Pt = [30, -58];
const SHOULDER: Pt = [26, -112];
/** How many glows light the arm from the shoulder to the hand. */
const RUN_STEPS = 6;
/** The warmed figure: grey paper toward cream, touched with the word's gold. */
const WARM_BODY = mix(C.cream, C.gold, 0.22);
const WARM_SHADE = mix(C.cream, C.gold, 0.45);

/** The path ahead, in the panel's units, from near left to far right. */
const PATH: Pt[] = [
  [-360, 250],
  [-180, 200],
  [-40, 110],
  [110, 40],
  [260, -60],
  [380, -130],
];

const along = (t: number): Pt => {
  const k = clamp(t) * (PATH.length - 1);
  const i = Math.min(PATH.length - 2, Math.floor(k));
  const a = PATH[i] ?? [0, 0];
  const b = PATH[i + 1] ?? a;
  return [lerp(a[0], b[0], k - i), lerp(a[1], b[1], k - i)];
};

const timeline = {
  ask: { mark: 'out', dur: 0.4 },
  shrink: { mark: 'never', dur: 1.5, ease: 'inOutCubic' },
  heart: { mark: 'write', offset: -0.1, dur: 0.5, ease: 'outBack' },
  toIcons: { mark: 'power', dur: 0.3 },
  pullBack: { with: 'toIcons', dur: 0.7, ease: 'outCubic' },
  heartLit: { after: 'pullBack', dur: 0.4 },
  backIn: { mark: 'not', offset: -0.3, dur: 0.3 },
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

type WithinFrame = Frame<keyof typeof timeline & string>;

export const within = drawing({
  timeline,
  draw: (f) => {
    // The icons cover the page from their pull back until the figure comes back.
    const shown = f.at('toIcons') * (1 - f.at('backIn'));
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
  const cam = between(between(PAGE, FACE, f.at('closeUp')), PAGE, f.at('closeOut'));
  camera(ctx, cam, w, h, () => {
    const aside = f.at('aside');
    const [fx, fy] = [lerp(CENTRE[0], ASIDE[0], aside), lerp(CENTRE[1], ASIDE[1], aside)];
    const scale = lerp(2.4, 1.9, aside);
    circle(f, [fx, fy - 92 * scale]);
    contact(ctx, fx, fy + 4, 90 * scale);
    at(ctx, { x: fx, y: fy, scale }, () => figure(f, aside));
    if (aside > 0) panel(f, aside);
  });
};

/** The circle, as big as the universe, coming home to the chest; gone once the heart is in. */
const circle = (f: WithinFrame, chest: Pt) => {
  const { ctx } = f;
  const heart = f.at('heart');
  if (heart >= 0.6) return;
  const hand = (k: string) => f.hand(k);
  const shrink = f.at('shrink');
  const r = lerp(720, 40, shrink);
  const [cx, cy] = [lerp(960, chest[0], shrink), lerp(470, chest[1], shrink)];
  ctx.save();
  ctx.globalAlpha *= 1 - clamp(heart / 0.6);
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
      { line: 2, alpha: 1 - shrink },
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

/** Where the hand on `side` is as the arms open `open` 0..1 from rest. */
const handAt = (side: -1 | 1, open: number): Pt => [
  side * lerp(REST_HAND[0], OPEN_HAND[0], open),
  lerp(REST_HAND[1], OPEN_HAND[1], open),
];

/**
 * The figure, in their own units: asking, then the heart in the chest; after
 * the icons, arms out with the glow running to the open hands, warming on
 * "become", and the hands lowered again on "plain".
 */
const figure = (f: WithinFrame, aside: number) => {
  const { ctx } = f;
  const hand = (k: string) => f.hand(k);
  const ask = f.at('ask') * (1 - f.at('heart'));
  const heart = f.at('heart');
  const lit = f.at('heartLit');
  const warm = f.at('warm');
  const open = f.at('arms') * (1 - f.at('closeOut'));
  const settled = heart * (1 - aside) * (1 - open);
  // After the icons the arms are there, at rest until they open out.
  const armed = f.at('backIn') > 0;
  const body = mix(C.figure, WARM_BODY, warm);
  const pose: Person = {
    body,
    skin: body,
    shade: mix(C.figureShade, WARM_SHADE, warm),
    tilt: -0.12 * ask + 0.08 * settled,
    nod: 4 * settled,
    look: [lerp(0, 2, ask) + 2 * aside, lerp(-4 * ask, 3, settled)],
    browL: 4 * ask + 2 * heart + 1.5 * warm,
    browR: 2 * ask + 2 * heart + 1.5 * warm,
    browTilt: 0.35 * ask + 0.25 * warm,
    mouth: 0.6 * ask,
    smile: 0.55 * warm,
    handL: armed ? handAt(-1, open) : undefined,
    handR: armed ? handAt(1, open) : undefined,
  };
  person(ctx, pose, hand('figure'));
  if (heart > 0)
    at(ctx, { x: CHEST[0], y: CHEST[1], scale: 0.36 * heart }, () => {
      glow(ctx, 0, 0, 220 + 140 * lit, C.glow, 0.8 + 0.2 * lit);
      // The icon's heart, warm, its tablets still legible.
      drawHeart(ctx, hand, mix(C.peachTop, C.gold, 0.4 * lit), true);
    });
  if (armed) running(f, open);
};

/** The glow running from the heart up each arm to its open hand, over `run`. */
const running = (f: WithinFrame, open: number) => {
  const { ctx } = f;
  const run = f.at('run');
  if (run <= 0 || open <= 0) return;
  for (const side of SIDES) {
    const shoulder: Pt = [side * SHOULDER[0], SHOULDER[1]];
    const end = handAt(side, open);
    for (let i = 1; i <= RUN_STEPS; i++) {
      const k = i / RUN_STEPS;
      if (k > run + 0.001) break;
      const [x, y] =
        k < 0.4 ? toward(CHEST, shoulder, k / 0.4) : toward(shoulder, end, (k - 0.4) / 0.6);
      glow(ctx, x, y, 44, C.glow, 0.9 * open);
      glow(ctx, x, y, 22, C.gold, 0.6 * open);
    }
    if (run < 1) continue;
    glow(ctx, end[0], end[1], 70, C.glow, open);
    glow(ctx, end[0], end[1], 34, C.gold, 0.7 * open);
  }
};
const SIDES = [-1, 1] as const;
const toward = (a: Pt, b: Pt, k: number): Pt => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];

/** The panel: first the past, closed and forgiven; then the path ahead. */
const panel = (f: WithinFrame, aside: number) => {
  const { ctx } = f;
  const hand = (k: string) => f.hand(k);
  const swap = f.at('swap');
  at(ctx, { x: PANEL[0] + (1 - aside) * 900, y: PANEL[1] }, () => {
    piece(ctx, rounded(0, 0, PANEL_W, PANEL_H, 24), C.cream, hand('panel'), {
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
        piece(ctx, rounded(0, 0, 420, 300, 14), C.boardDeep, hand('cover'), { line: 4 });
        piece(ctx, rounded(8, 0, 380, 264, 8), C.inkSoft, hand('coverInset'), {
          line: 0,
        });
        // The ribbon tied across it.
        piece(ctx, rectShape(-40, -160, 40, 320), C.gold, hand('ribbon'), { line: 3 });
        piece(ctx, blob(-20, -8, 90, 60, 9), C.gold, hand('bow'), { line: 3 });
      });
    }
    if (swap > 0) at(ctx, { x: (1 - swap) * 900, y: 0 }, () => path(f));
    ctx.restore();
  });
};

/** The hills, the path ahead and the figure walking it, flowers where they have stepped. */
const path = (f: WithinFrame) => {
  const { ctx } = f;
  const hand = (k: string) => f.hand(k);
  piece(ctx, blob(0, 260, 1100, 420, 31), C.leaf, hand('hill'), {
    line: 0,
    shadow: 0.2,
  });
  stroke(ctx, PATH, { color: C.boardLight, width: 44, jitter: 0.4, taper: 0.5 }, hand('path'));
  const walk = f.at('walk');
  // Flowers where the figure has already stepped.
  for (let i = 0; i < 9; i++) {
    const k = i / 9;
    const age = (walk - k) * 6;
    if (age <= 0) continue;
    const [px, py] = along(k);
    const s = clamp(age);
    const side = i % 2 === 0 ? -1 : 1;
    at(ctx, { x: px + side * 34, y: py + 10, scale: s * (1 - 0.4 * k) }, () => {
      stroke(ctx, STEM, { color: C.leafShade, width: 4, jitter: 0.3 }, sub(hand('stem'), i));
      piece(
        ctx,
        ellipseShape(0, -34, 14, 14),
        i % 3 === 0 ? C.gold : C.robe,
        sub(hand('flower'), i),
        { line: 2 },
      );
    });
  }
  const [wx, wy] = along(walk);
  // The film's one walk: the kit's step, from the cue's start.
  const bob = gait(f.t, f.cue('walk'));
  at(ctx, { x: wx, y: wy - bob, scale: 0.9 - 0.4 * walk }, () => {
    glow(ctx, 0, -90, 90, C.glow, 0.6);
    // The same figure, still warm.
    person(
      ctx,
      { body: WARM_BODY, skin: WARM_BODY, shade: WARM_SHADE, look: [3, -1], browTilt: 0.1 },
      hand('walker'),
    );
  });
};
const STEM: Pt[] = [
  [0, 0],
  [0, -30],
];

/** B: the three icons on "power", faith and forgiveness lit, the heart lighting. */
const iconsShot = (f: WithinFrame, alpha: number) => {
  const { ctx, w, h } = f;
  const hand = (k: string) => f.hand(k);
  const pull = f.at('pullBack');
  ctx.save();
  ctx.globalAlpha *= alpha;
  sky(ctx, w, h, [
    [0, C.glow],
    [1, C.peachLow],
  ]);
  at(ctx, { x: 960, y: lerp(-160, 540, pull), scale: lerp(2.3, 1, pull) }, () =>
    icons(ctx, hand, [0.7, 0.7, 0.4 + 0.6 * f.at('heartLit')]),
  );
  ctx.restore();
};
