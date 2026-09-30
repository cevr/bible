// The word: righteousness, on the parchment page, opened on a match cut from
// the title: its first word drops from where the title left it and lands as
// the word card, the rest of the name falling away. The card flips to
// its plain meaning, right doing; a measuring tape drops and hangs there,
// asking by whose measure. Then the answer: the two tablets set down and
// their ten lines light gold as the psalm is read, their glow rising into a
// warm light with no face in it (the law is a transcript of God's character),
// and on "circle" their outline widens into a gold circle that keeps growing
// past the page, planets and stars inside it. The viewer's stand-in watches
// from the left, shrugging at the start and open-mouthed at the end.

import {
  type Camera,
  type Frame,
  type Gesture,
  at,
  camera,
  drawing,
  line,
  measure,
  probePlate,
  stroke,
  write,
  sub,
  type Posed,
  ground,
  glow,
  rounded,
  plate,
  knobCamera,
  shotPath,
} from '@bible/film/canvas';
import { clamp, hash2, lerp } from '@bible/film/core';
import { C, F, person, piece } from '../kit.ts';
import { planet, ring, star, tablets } from '../law.ts';
import { NAME } from './title.ts';

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
  // The match cut: the title's first word, where the title left it, drops
  // onto the page and lands as the card's word; the rest of the name falls away.
  match: { at: 'start', offset: 0.2, dur: 0.9, ease: 'inOutCubic' },
  fall: { at: 'start', dur: 0.6, ease: 'inQuad' },
  // The card comes up under the word as it lands.
  card: { after: 'match', dur: 0.3, ends: true, ease: 'outCubic' },
  shrug: { mark: 'church', offset: 0.2, dur: 0.4, ease: 'outBack' },
  unshrug: { mark: 'fair', dur: 0.5 },
  flip: { mark: 'right', offset: -0.1, dur: 0.5, ease: 'inOutSine' },
  cardOut: { mark: 'whose', offset: -0.2, dur: 0.4, ease: 'inCubic' },
  tape: { mark: 'whose', offset: 0.1, dur: 0.9, ease: 'outCubic' },
  wonder: { mark: 'whose', offset: 0.3, dur: 0.4 },
  tapeUp: { mark: 'psalm', offset: 0.2, dur: 0.6, ease: 'inCubic' },
  drop: { mark: 'all', dur: 0.5, ends: true, ease: 'outBack' },
  light: { mark: 'char', dur: 1.6 },
  grow: { mark: 'circle', offset: 0.1, dur: 1.9, ease: 'inCubic' },
  awe: { mark: 'circle', offset: 0.3, dur: 0.5 },
  lean: { mark: 'all', offset: -0.3, dur: 2.4, ease: 'inOutSine' },
  wide: { mark: 'circle', offset: 0.1, dur: 1.9, ease: 'inOutSine' },
} as const;
const knobs = {
  figure: [460, 1000],
  card: [1230, 330],
  law: [1230, 600],
  // In on the tablets and the figure as the law drops, then out past the
  // page as the circle grows.
  lean: [1060, 580],
  leanZoom: 1.18,
  wide: [960, 560],
  wideZoom: 0.92,
} as const;

/** The unmoved frame (the canvas itself, so not a knob). */
const REST: Camera = { x: 960, y: 540, zoom: 1 };

type WordFrame = Frame<keyof typeof timeline & string, typeof knobs>;

export const word = drawing({
  timeline,
  knobs,
  draw: (f) => {
    const { ctx, w, h } = f;
    const cam = shotPath(REST, [
      [f.at('lean'), knobCamera(f.knob('lean'), f.knob('leanZoom'))],
      [f.at('wide'), knobCamera(f.knob('wide'), f.knob('wideZoom'))],
    ]);
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
  matchCut(f);
  tape(f);

  const drop = f.at('drop');
  if (drop > 0) {
    ground(ctx, lx, ly + 180, 520 * drop);
    at(ctx, { x: lx, y: lerp(-400, ly, drop), scale: 1.9 }, () =>
      tablets(ctx, f.hand, 10 * clamp(f.spoken('all', 'char') * 1.15)),
    );
  }

  viewer(f);
};

/** The viewer's two hands at the shrug, palms up by the shoulders; their reach rewritten each frame (scratch). */
const SHRUG_FAR: Posed<Gesture> = { to: [-66, -104], reach: 0, grip: 'palm' };
const SHRUG_NEAR: Posed<Gesture> = { to: [66, -104], reach: 0, grip: 'palm' };

/** The viewer's stand-in, on the left. */
const viewer = (f: WordFrame) => {
  const { ctx } = f;
  const [x, y] = f.knob('figure');
  const shrug = f.at('shrug') * (1 - f.at('unshrug'));
  const wonder = f.at('wonder') * (1 - f.at('drop'));
  const awe = f.at('awe');
  // Both palms out at the shrug, the hands up on it and back down on "fair".
  SHRUG_FAR.reach = shrug;
  SHRUG_NEAR.reach = shrug;
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
        far: SHRUG_FAR,
        near: SHRUG_NEAR,
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
  // It comes up under the landing word, fading in at nearly its size (never a speck over the word).
  at(
    ctx,
    {
      x,
      y: y - 300 * f.at('cardOut'),
      scale: lerp(0.92, 1, f.at('card')) * (1 - 0.6 * f.at('cardOut')),
      rot: CARD_TILT,
    },
    () => {
      ctx.save();
      ctx.globalAlpha *= show;
      ctx.scale(1, Math.max(0.02, Math.abs(Math.cos(flip * Math.PI))));
      const board = plate(0, 0, 820, 210);
      piece(ctx, board, C.cream, f.hand('card'), {
        role: 'scenery',
        kind: 'cut',
        line: 4,
        torn: 2,
      });
      // The word is the title's, still in flight, until it lands.
      if (f.at('match') >= 1)
        probePlate(ctx, board, () =>
          write(
            ctx,
            text,
            0,
            CARD_BASELINE,
            {
              family: turned ? F.hand : F.display,
              size: turned ? 120 : CARD_SIZE,
              weight: turned ? 400 : 700,
              color: turned ? C.inkSoft : C.ink,
              align: 'center',
            },
            f.hand(turned ? 'meaning' : 'word'),
            { boil: 0.4 },
          ),
        );
      ctx.restore();
    },
  );
};

/** The card's word: its size, its baseline below the card's centre, and the card's tilt. */
const CARD_SIZE = 104;
const CARD_BASELINE = 34;
const CARD_TILT = -0.02;

/**
 * The match cut from the title: its first word, in the ink it has on the
 * page, starts exactly where the title left it and lands as the card's word,
 * shrinking to the card's size; the rest of the name falls off the page.
 */
const matchCut = (f: WordFrame) => {
  const match = f.at('match');
  if (match >= 1) return;
  const { ctx } = f;
  const style = { ...NAME.style, color: C.ink, align: 'left' } as const;
  const firstW = measure(ctx, NAME.first, style);
  const fullW = measure(ctx, NAME.first + NAME.rest, style);
  const left = NAME.x - fullW / 2;
  const [cx, cy] = f.knob('card');
  const k = CARD_SIZE / NAME.style.size;
  at(
    ctx,
    {
      x: lerp(left + firstW / 2, cx, match),
      y: lerp(NAME.y, cy + CARD_BASELINE, match),
      rot: CARD_TILT * match,
      scale: lerp(1, k, match),
    },
    () =>
      write(ctx, NAME.first, 0, 0, { ...style, align: 'center' }, f.hand('word'), { boil: 0.4 }),
  );
  const fall = f.at('fall');
  if (fall >= 1) return;
  at(ctx, { x: left + firstW, y: NAME.y + 900 * fall * fall, rot: 0.25 * fall }, () =>
    write(ctx, NAME.rest, 0, 0, style, f.hand('titleRest'), { alpha: 1 - fall, boil: 0.4 }),
  );
};

/** The measuring tape that drops and hangs: by whose measure? */
const tape = (f: WordFrame) => {
  const { ctx } = f;
  const [x] = f.knob('card');
  const len = 820 * f.at('tape') * (1 - f.at('tapeUp'));
  if (len <= 4) return;
  const sway = Math.sin(f.t * 1.6) * 0.02;
  at(ctx, { x, y: -30, rot: sway }, () => {
    piece(ctx, rounded(0, len / 2, 70, len, 4), C.gold, f.hand('tape'), {
      role: 'scenery',
      kind: 'cut',
      line: 3,
      shadow: 0.3,
    });
    for (let yy = 30; yy < len - 10; yy += 30) {
      const long = yy % 150 === 0;
      stroke(
        ctx,
        line([-35, yy], [-35 + (long ? 30 : 14), yy]),
        { color: C.ink, width: long ? 3.5 : 2.5, jitter: 0.3, boil: 'none' },
        sub(f.hand('tick'), yy),
      );
    }
    piece(ctx, rounded(0, len + 8, 84, 22, 4), C.boardDeep, f.hand('tapeEnd'), {
      role: 'scenery',
      kind: 'cut',
      line: 3,
    });
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
