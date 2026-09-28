// The word: righteousness, on the parchment page. A word card, which flips to
// its plain meaning, right doing; a measuring tape drops and hangs there,
// asking by whose measure. Then the answer: the two tablets set down and
// their ten lines light gold as the psalm is read, their glow rising into a
// warm light with no face in it (the law is a transcript of God's character),
// and on "circle" their outline widens into a gold circle that keeps growing
// past the page, planets and stars inside it. The viewer's stand-in watches
// from the left, shrugging at the start and open-mouthed at the end.

import {
  type Frame,
  type Pt,
  at,
  camera,
  drawing,
  line,
  probePlate,
  stroke,
  write,
} from '@bible/film/canvas';
import { clamp, hash2, lerp } from '@bible/film/core';
import { C, F, contact, glow, person, piece, rounded, sub, plate } from '../kit.ts';
import { planet, ring, star, tablets } from '../law.ts';

const WORD_CARD = 'Righteousness';
const MEANING = 'right doing';

/** Where things sit inside the circle as it grows past them: distance, angle, radius, colour. */
const SKY: ReadonlyArray<readonly [number, number, number, string]> = [
  [360, -2.5, 34, C.peachTop],
  [520, -0.5, 26, C.tealTop],
  [700, 2.6, 44, C.boardLight],
  [840, -1.3, 30, C.scarletShade],
  [980, 0.7, 52, C.peachLow],
  [1150, -2.0, 36, C.tealMid],
];

const timeline = {
  card: { scene: 'start', offset: 0.3, dur: 0.5, ease: 'outBack' },
  shrug: { mark: 'church', offset: 0.2, dur: 0.4, ease: 'outBack' },
  unshrug: { mark: 'fair', dur: 0.5 },
  flip: { mark: 'right', offset: -0.1, dur: 0.5, ease: 'inOutSine' },
  cardOut: { mark: 'whose', offset: -0.2, dur: 0.4, ease: 'inCubic' },
  tape: { mark: 'whose', offset: 0.1, dur: 0.9, ease: 'outCubic' },
  wonder: { mark: 'whose', offset: 0.3, dur: 0.4 },
  tapeUp: { mark: 'psalm', offset: 0.2, dur: 0.6, ease: 'inCubic' },
  drop: { mark: 'all', offset: -0.5, dur: 0.5, ease: 'outBack' },
  light: { mark: 'char', dur: 1.6 },
  grow: { mark: 'circle', offset: 0.1, dur: 1.9, ease: 'inCubic' },
  awe: { mark: 'circle', offset: 0.3, dur: 0.5 },
  lean: { mark: 'all', offset: -0.3, dur: 2.4, ease: 'inOutSine' },
  wide: { mark: 'circle', offset: 0.1, dur: 1.9, ease: 'inOutSine' },
} as const;
const knobs = { figure: [460, 1000], card: [1230, 330], law: [1230, 600] } as const;

type WordFrame = Frame<keyof typeof timeline & string, typeof knobs>;

export const word = drawing({
  timeline,
  knobs,
  draw: (f) => {
    const { ctx, w, h } = f;
    const lean = f.at('lean');
    const wide = f.at('wide');
    const cam = {
      x: lerp(lerp(960, 1060, lean), 960, wide),
      y: lerp(lerp(540, 580, lean), 560, wide),
      zoom: lerp(lerp(1, 1.18, lean), 0.92, wide),
    };
    camera(ctx, cam, w, h, () => page(f));
  },
});

const page = (f: WordFrame) => {
  const { ctx } = f;
  const [lx, ly] = f.knob('law');

  // The law's glow, and the circle it opens into.
  const light = f.at('light');
  glow(ctx, lx, ly - 60, lerp(200, 760, light), C.glow, light);
  glow(ctx, lx, ly - 60, lerp(100, 360, light), C.gold, 0.45 * light);
  universe(f, lx, ly);

  card(f);
  tape(f);

  const drop = f.at('drop');
  if (drop > 0) {
    contact(ctx, lx, ly + 180, 520 * drop);
    at(ctx, { x: lx, y: lerp(-400, ly, drop), scale: 1.9 }, () =>
      tablets(ctx, f.hand, 10 * clamp(f.spoken('all', 'char') * 1.15)),
    );
  }

  viewer(f);
};

/** The viewer's stand-in, on the left. */
const viewer = (f: WordFrame) => {
  const { ctx } = f;
  const [x, y] = f.knob('figure');
  const shrug = f.at('shrug') * (1 - f.at('unshrug'));
  const wonder = f.at('wonder') * (1 - f.at('drop'));
  const awe = f.at('awe');
  const handL: Pt = [lerp(-30, -66, shrug), lerp(-58, -104, shrug)];
  const handR: Pt = [lerp(30, 66, shrug), lerp(-58, -104, shrug)];
  contact(ctx, x, y + 4, 270);
  at(ctx, { x, y, scale: 2.6 }, () =>
    person(
      ctx,
      {
        look: [lerp(4, 3, awe), lerp(-1, -5, awe) - 2 * wonder],
        tilt: 0.12 * shrug - 0.08 * wonder - 0.06 * awe,
        nod: -3 * shrug,
        browL: 4 * shrug + 3 * wonder + 5 * awe,
        browR: 5 * shrug + 4 * wonder + 5 * awe,
        browTilt: 0.35 * shrug + 0.4 * wonder + 0.3 * awe,
        mouth: Math.max(0.35 * shrug, awe),
        handL: shrug > 0.02 ? handL : undefined,
        handR: shrug > 0.02 ? handR : undefined,
      },
      f.hand('viewer'),
    ),
  );
};

/** The word card: righteousness, then flipped to right doing. */
const card = (f: WordFrame) => {
  const { ctx } = f;
  const [x, y] = f.knob('card');
  const show = f.at('card') * (1 - f.at('cardOut'));
  if (show <= 0.01) return;
  const flip = f.at('flip');
  const turned = flip >= 0.5;
  const text = turned ? MEANING : WORD_CARD;
  at(ctx, { x, y: y - 500 * f.at('cardOut'), scale: show, rot: -0.02 }, () => {
    ctx.save();
    ctx.scale(1, Math.max(0.02, Math.abs(Math.cos(flip * Math.PI))));
    const board = plate(0, 0, 820, 210);
    piece(ctx, board, C.cream, f.hand('card'), { line: 4, torn: 2 });
    probePlate(ctx, board, () =>
      write(
        ctx,
        text,
        0,
        34,
        {
          family: turned ? F.hand : F.display,
          size: turned ? 120 : 104,
          weight: turned ? 400 : 700,
          color: turned ? C.inkSoft : C.ink,
          align: 'center',
        },
        f.hand(turned ? 'meaning' : 'word'),
        { boil: 0.4 },
      ),
    );
    ctx.restore();
  });
};

/** The measuring tape that drops and hangs: by whose measure? */
const tape = (f: WordFrame) => {
  const { ctx } = f;
  const [x] = f.knob('card');
  const len = 820 * f.at('tape') * (1 - f.at('tapeUp'));
  if (len <= 4) return;
  const sway = Math.sin(f.t * 1.6) * 0.02;
  at(ctx, { x, y: -30, rot: sway }, () => {
    piece(ctx, rounded(0, len / 2, 70, len, 4), C.gold, f.hand('tape'), { line: 3, shadow: 0.3 });
    for (let yy = 30; yy < len - 10; yy += 30) {
      const long = yy % 150 === 0;
      stroke(
        ctx,
        line([-35, yy], [-35 + (long ? 30 : 14), yy]),
        { color: C.ink, width: long ? 3.5 : 2.5, jitter: 0.3 },
        sub(f.hand('tick'), yy),
      );
    }
    piece(ctx, rounded(0, len + 8, 84, 22, 4), C.boardDeep, f.hand('tapeEnd'), { line: 3 });
  });
};

/** The law's outline widening into a circle as big as the universe. */
const universe = (f: WordFrame, x: number, y: number) => {
  const { ctx } = f;
  const grow = f.at('grow');
  if (grow <= 0) return;
  const r = lerp(250, 2300, grow);
  const cy = y - 20;
  for (let i = 0; i < 26; i++) {
    const d = 260 + 1300 * hash2(i, 41);
    if (d > r) continue;
    const a = 2 * Math.PI * hash2(i, 42);
    const pop = clamp((r - d) / 120);
    star(
      ctx,
      sub(f.hand('star'), i),
      x + Math.cos(a) * d,
      cy + Math.sin(a) * d * 0.62,
      (18 + 14 * hash2(i, 43)) * pop,
    );
  }
  SKY.forEach(([d, a, pr, color], i) => {
    if (d > r) return;
    const pop = clamp((r - d) / 160);
    planet(
      ctx,
      sub(f.hand('planet'), i),
      x + Math.cos(a) * d,
      cy + Math.sin(a) * d * 0.62,
      pr * 1.3 * pop,
      color,
    );
  });
  ring(ctx, f.hand('ring'), x, cy, r);
};
