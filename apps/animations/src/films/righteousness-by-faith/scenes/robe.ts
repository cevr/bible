// The robe: the heavenly court from `accuser`, now quiet. Those standing by
// lift the filthy clothes off Joshua and carry them out (Zech 3:4); the last
// speck lifts from his cheek; Christ reaches out to him. Then a push into
// the light, where a loom weaves a robe with no hand at it but light, and
// the robe settles on Joshua. The ask's doubt is a tiny cloak dropped over a
// stain and flicked away; the answer is a look beneath the robe, where there
// is nothing to hide: clean grey paper, the sin carried off. Last, the pull
// back to the film's three icons, the robe's lit.

import {
  type Camera,
  type Frame,
  type Pt,
  at,
  camera,
  drawing,
  ellipseShape,
  rectShape,
  stroke,
  sub,
} from '@bible/film/canvas';
import { clamp, ease, lerp } from '@bible/film/core';
import { C, ROBE, blob, christ, gait, glow, icons, person, piece, rounded, sky } from '../kit.ts';
import {
  AS,
  CHEEK,
  JOSHUA,
  JS,
  SPECKS,
  TUNIC,
  TUNIC_STAINS,
  accuser,
  court,
  courtWall,
} from '../court.ts';

const LOOM: Pt = [1045, 560];

/** Where the flakes that lifted from him hang in the air. */
const FLAKES: ReadonlyArray<Pt> = [
  [440, 330],
  [530, 430],
  [480, 520],
  [1480, 350],
  [1400, 460],
  [1520, 530],
];

/** A little loom, as a shape of light. */
const loomFrame = (
  ctx: CanvasRenderingContext2D,
  s: number,
  hand: (k: string) => { boil: number; seed: number },
) => {
  for (const x of [-70, 70])
    piece(ctx, rounded(x * s, 0, 14 * s, 190 * s, 4 * s), C.gold, hand(`post${x}`), { line: 2.5 });
  for (const y of [-86, 86])
    piece(ctx, rounded(0, y * s, 170 * s, 16 * s, 4 * s), C.gold, hand(`beam${y}`), { line: 2.5 });
};

const timeline = {
  lift: { mark: 'take', offset: 0.33, dur: 1.5 },
  carry: { mark: 'take', offset: 2.1, dur: 2.75, ease: 'inOutSine' },
  specks: { mark: 'take', offset: 2.5, dur: 0.8 },
  speck: { mark: 'pass', dur: 1.17 },
  reachOut: { mark: 'clothe', dur: 0.75 },
  loomIn: { mark: 'loom', offset: -0.33, dur: 0.67 },
  pushLoom: { mark: 'loom', offset: 0.33, dur: 1.17 },
  weave: { mark: 'woven', offset: -0.4, dur: 2.9, ease: 'linear' },
  robeUp: { after: 'weave', dur: 0.4 },
  settle: { after: 'robeUp', dur: 0.75, ease: 'outSoft' },
  lookDown: { after: 'settle', dur: 0.5 },
  hover: { mark: 'nicer', dur: 0.4 },
  cover: { mark: 'just', offset: 0.1, dur: 0.4, ease: 'outBack' },
  flick: { mark: 'no', dur: 0.5, ease: 'inCubic' },
  lens: { mark: 'cloak', offset: 0.1, dur: 0.57, ease: 'outBack' },
  shut: { mark: 'away', offset: -0.2, dur: 0.33 },
  carried: { mark: 'away', dur: 0.8, ease: 'inCubic' },
  toIcons: { mark: 'away', offset: 0.57, dur: 0.27 },
  pullBack: { with: 'toIcons', dur: 0.7, ease: 'outCubic' },
  iconGlow: { after: 'pullBack', dur: 0.4 },
} as const;

type RobeFrame = Frame<keyof typeof timeline & string>;

export const robe = drawing({
  timeline,
  draw: (f) => {
    const { t } = f;
    if (t < f.cue('pushLoom').end) courtWide(f);
    else if (t < f.cue('robeUp').end) weaving(f);
    else if (t < f.mark('nicer')) robed(f);
    else if (t < f.mark('cloak')) cloaked(f);
    else {
      const toIcons = f.at('toIcons');
      if (toIcons < 1) beneath(f);
      if (toIcons > 0) iconsBack(f, toIcons);
    }
  },
});

/** A: the court, wide, until the push reaches the loom. */
const courtWide = (f: RobeFrame) => {
  const { ctx, w, h, t } = f;
  const hand = (k: string) => f.hand(k);
  const lift = f.at('lift');
  const carry = f.at('carry');
  const bob = gait(t, f.cue('carry'));
  const away = -1250 * carry;
  const push = f.at('pushLoom');
  const cam: Camera = {
    x: lerp(960, LOOM[0], push),
    y: lerp(540, LOOM[1], push),
    zoom: lerp(1, 4.2, ease.inCubic(push)),
  };
  courtWall(ctx, w, h);
  camera(ctx, cam, w, h, () => {
    court(ctx, hand);
    at(ctx, { x: 300, y: 950, scale: 0.9 }, () => accuser(ctx, hand));

    // Christ, in white and gold, reaching out on "clothe".
    const reachOut = f.at('reachOut');
    glow(ctx, 1330, 950 - 250, 310, C.glow, 0.8);
    at(ctx, { x: 1330, y: 950, scale: 2.1 }, () =>
      christ(
        ctx,
        {
          tilt: -0.06 * reachOut,
          look: [-3, 1],
          browTilt: 0.15,
          handL: [lerp(-30, -110, reachOut), lerp(-58, -118, reachOut)],
          handR: [30, -58],
        },
        hand,
      ),
    );

    // Joshua, the specks going from his skin.
    at(ctx, { x: JOSHUA[0], y: JOSHUA[1], scale: JS }, () => {
      const pass = f.at('speck');
      person(
        ctx,
        {
          turban: true,
          tilt: 0.1 * (1 - pass),
          look: [2 * reachOut, 0],
          browTilt: 0.2 + 0.3 * pass,
        },
        hand('joshua'),
      );
      const fade = 1 - f.at('specks');
      SPECKS.forEach((speck, i) =>
        piece(ctx, speck, C.scarlet, sub(hand('speck'), i), {
          line: 0,
          shadow: 0.1,
          alpha: fade,
        }),
      );
      const [cx, cy] = CHEEK;
      if (pass < 1)
        piece(ctx, blob(cx, cy - 66 * pass, 6, 5, 11), C.scarlet, hand('cheek'), {
          line: 0,
          shadow: 0.1,
          alpha: 1 - clamp((pass - 0.3) / 0.7),
        });
    });

    // The filthy clothes, lifted over his head and carried out left.
    const tunicY = JOSHUA[1] - 250 * lift - bob;
    const tunicX = JOSHUA[0] + away;
    const helper = (x0: number, side: -1 | 1, k: number) => {
      const x = x0 + away;
      const y = JOSHUA[1] - (k === 1 ? bob : 5 - bob);
      // Hands on the tunic's near side, a little below its shoulder.
      const grip: Pt = [tunicX - side * 44 * JS, tunicY - 90 * JS];
      const local: Pt = [(grip[0] - x) / AS, (grip[1] - y) / AS];
      at(ctx, { x, y, scale: AS }, () =>
        person(
          ctx,
          {
            body: C.figureShade,
            skin: C.figureShade,
            look: [side * 2, -2 * lift],
            ...(side === 1 ? { handR: local } : { handL: local }),
          },
          sub(hand('helper'), k),
        ),
      );
    };
    helper(610, 1, 1);
    helper(910, -1, 2);
    at(ctx, { x: tunicX, y: tunicY, scale: JS }, () => {
      piece(ctx, TUNIC, C.boardShade, hand('tunic'), { torn: 2.5, line: 2 });
      TUNIC_STAINS.forEach((stain, i) =>
        piece(ctx, stain, i % 2 === 0 ? C.scarlet : C.scarletShade, sub(hand('stain'), i), {
          line: 0,
          torn: 3,
          shadow: 0.1,
        }),
      );
    });

    // The loom gathers in the light.
    const loomIn = f.at('loomIn');
    if (loomIn > 0)
      at(ctx, { x: LOOM[0], y: LOOM[1] }, () => {
        ctx.save();
        ctx.globalAlpha *= loomIn;
        glow(ctx, 0, 0, 180, C.robe, 0.9);
        loomFrame(ctx, 1, hand);
        for (let x = -54; x <= 54; x += 12)
          piece(ctx, rectShape(x - 1, -80, 2.5, 160), C.robe, sub(hand('warpS'), x), {
            line: 0,
            torn: 0,
            shadow: 0,
          });
        ctx.restore();
      });
  });
};

/** B: the loom in the light, weaving through the quotation. */
const weaving = (f: RobeFrame) => {
  const { ctx, w, h } = f;
  const hand = (k: string) => f.hand(k);
  const weave = f.at('weave');
  const robeUp = f.at('robeUp');
  ctx.fillStyle = C.gold;
  ctx.fillRect(0, 0, w, h);
  glow(ctx, 960, 540, 1200, C.robe, 1);
  glow(ctx, 960, 540, 800, C.glow, 0.8);
  at(ctx, { x: 960, y: 560 }, () => loomFrame(ctx, 4.8, hand));
  // The cloth grows down the warp, row by row.
  const bottom = lerp(190, 850, weave);
  ctx.save();
  ctx.globalAlpha *= 1 - robeUp;
  piece(ctx, rectShape(600, 190, 720, bottom - 190), C.robe, hand('cloth'), {
    line: 0,
    torn: 0,
    shadow: 0.3,
  });
  for (let y = 212; y < bottom; y += 22) {
    ctx.fillStyle = `${C.paperTone}40`;
    ctx.fillRect(600, y, 720, 2);
  }
  ctx.restore();
  for (let x = 612; x < 1320; x += 24)
    piece(ctx, rectShape(x, 180, 3, 760), `${C.robe}b0`, sub(hand('warp'), x), {
      line: 0,
      torn: 0,
      shadow: 0,
    });
  // The shuttle: a spark of light crossing and recrossing.
  if (weave < 1) {
    const pass = weave * 30;
    const along = ease.inOutSine(pass % 1);
    const x = Math.floor(pass) % 2 === 0 ? lerp(600, 1320, along) : lerp(1320, 600, along);
    glow(ctx, x, bottom, 110, C.robe, 1);
    piece(ctx, ellipseShape(x, bottom, 17, 17), C.robe, hand('spark'), { line: 0, shadow: 0 });
  }
  if (robeUp > 0)
    at(ctx, { x: 960, y: 540 - 70 * robeUp }, () => {
      ctx.save();
      ctx.globalAlpha *= robeUp;
      piece(ctx, ROBE, C.robe, hand('bigRobe'), { line: 6 });
      ctx.restore();
    });
};

/** B2: close on Joshua's face as the robe settles on him. */
const robed = (f: RobeFrame) => {
  const { ctx, w, h, t } = f;
  const hand = (k: string) => f.hand(k);
  const settle = f.cue('settle');
  const down = f.at('lookDown');
  // The robe comes up onto him from below, clear of his face.
  const drop = lerp(560, 0, f.at('settle'));
  courtWall(ctx, w, h);
  at(ctx, { x: 960, y: 430 + 165 * 6, scale: 6 }, () =>
    person(
      ctx,
      { turban: true, look: [0, 4 * down], nod: 1.5 * down, browTilt: 0.25 * down },
      hand('face'),
    ),
  );
  glow(ctx, 960, 720, 450, C.glow, (1 - Math.abs(down - 0.6)) * clamp((t - settle.end) * 4));
  at(ctx, { x: 960, y: 660 + drop }, () =>
    piece(
      ctx,
      [
        [-150, -10],
        [150, -10],
        [600, 280],
        [640, 520],
        [-640, 520],
        [-600, 280],
      ],
      C.robe,
      hand('robeOn'),
      { line: 7 },
    ),
  );
};

/** C: the doubt, a tiny cloak over a stain. */
const cloaked = (f: RobeFrame) => {
  const { ctx, w, h, t } = f;
  const hand = (k: string) => f.hand(k);
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, w, h);
  piece(ctx, blob(960, 700, 330, 210, 41), C.scarlet, hand('stainC'), { line: 0, torn: 4 });
  const cover = f.at('cover');
  const flick = f.at('flick');
  const hover = f.at('hover');
  const bob = Math.sin((t - f.mark('nicer')) * 3.2) * 14 * (1 - cover);
  at(
    ctx,
    {
      x: 960 + 740 * flick,
      y: lerp(400 + bob, 655, cover) - 200 * flick,
      rot: 1.1 * flick,
      scale: hover * (cover > 0 && cover < 1 ? 1 + 0.12 * Math.sin(cover * Math.PI) : 1),
    },
    () => {
      ctx.save();
      ctx.globalAlpha *= 1 - flick;
      piece(
        ctx,
        [
          [-40, -80],
          [40, -80],
          [130, 90],
          [60, 70],
          [0, 96],
          [-60, 70],
          [-130, 90],
        ],
        C.inkSoft,
        hand('cloak'),
        { line: 5, outline: C.ink },
      );
      piece(ctx, ellipseShape(0, -70, 11, 11), C.gold, hand('clasp'), { line: 3 });
      ctx.restore();
    },
  );
};

/** D: beneath the robe, nothing to hide. */
const beneath = (f: RobeFrame) => {
  const { ctx, w, h, t } = f;
  const hand = (k: string) => f.hand(k);
  courtWall(ctx, w, h);
  const carried = f.at('carried');
  glow(ctx, 960, 850, 650, C.glow, 0.85 * f.at('carried'));
  at(ctx, { x: 960, y: 330 + 165 * 4.6, scale: 4.6 }, () =>
    person(ctx, { turban: true, look: [0, 3.5], browTilt: 0.25 }, hand('faceD')),
  );
  piece(
    ctx,
    [
      [840, 550],
      [1080, 550],
      [1520, 790],
      [1580, 1250],
      [340, 1250],
      [400, 790],
    ],
    C.robe,
    hand('robeD'),
    { line: 7 },
  );
  // The lens: the robe cut away on clean grey paper.
  const open = f.at('lens') * (1 - f.at('shut'));
  if (open > 0.01)
    at(ctx, { x: 960, y: 850, scale: open }, () => {
      piece(ctx, ellipseShape(0, 0, 190, 190), C.figure, hand('lensBody'), {
        line: 0,
        torn: 0,
      });
      stroke(
        ctx,
        [...ellipseShape(0, 0, 190, 190), [190, 0]],
        { color: C.outline, width: 8, jitter: 0.8, taper: 0 },
        hand('lensRing'),
      );
      stroke(
        ctx,
        Array.from({ length: 12 }, (_, i): Pt => {
          const a = Math.PI * (1.08 + 0.3 * (i / 11));
          return [Math.cos(a) * 160, Math.sin(a) * 160];
        }),
        { color: C.robe, width: 7, alpha: 0.85, taper: 0.3 },
        hand('lensLight'),
      );
    });
  // The flakes the court saw lift from him, carried off out of frame.
  const drift = f.cue('lens');
  FLAKES.forEach(([x, y], i) => {
    const out = x < 960 ? -1 : 1;
    const shown = clamp((t - drift.start - 0.8 - i * 0.1) / 0.5);
    if (shown <= 0) return;
    const float = Math.sin((t + i) * 1.3) * 8;
    at(
      ctx,
      { x: x + out * 700 * carried, y: y + float - 460 * carried, rot: out * 2.4 * carried },
      () =>
        piece(ctx, blob(0, 0, 38, 30, 70 + i), C.scarlet, hand(`flake${i}`), {
          line: 0,
          shadow: 0.15,
          alpha: shown,
        }),
    );
  });
};

/** E: pull back to the three icons, the robe's lit, as `toIcons` fades them in. */
const iconsBack = (f: RobeFrame, toIcons: number) => {
  const { ctx, w, h } = f;
  const hand = (k: string) => f.hand(k);
  const pull = f.at('pullBack');
  ctx.save();
  ctx.globalAlpha *= toIcons;
  sky(ctx, w, h, [
    [0, C.glow],
    [1, C.peachLow],
  ]);
  at(ctx, { x: 960, y: lerp(-160, 540, pull), scale: lerp(2.3, 1, pull) }, () => {
    icons(ctx, hand, [0, 0.4 + 0.6 * f.at('iconGlow'), 0]);
  });
  ctx.restore();
};
