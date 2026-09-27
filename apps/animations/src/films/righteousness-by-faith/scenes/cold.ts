// The cold open: a parchment courtroom in three sheets of paper. The accused
// stands nearest (a grey figure in a stained garment, the evidence stacking
// up beside them), the bench and the judge on the sheet behind, a faint wall
// behind that. The gavel falls on "righteous" and the verdict stamps across
// the bench; on "wait" the camera pushes in to the accused's face, curious
// rather than cross; on "job" it pulls back wide and Job's question writes
// itself above the bench, the only words on screen.

import {
  type Camera,
  type Pt,
  at,
  drawing,
  ellipseShape,
  line,
  multiplane,
  probePlate,
  rectShape,
  stroke,
  write,
} from '@bible/film/canvas';
import { lerp, rng } from '@bible/film/core';
import { C, F, blob, contact, person, piece, rounded, sub, between } from '../kit.ts';
import { ACCUSED, GAVEL, JUDGE, QUESTION, REST, WIDE, questionStyle } from '../court.ts';

/** Close on the accused's face (the court's REST and WIDE are in court.ts): the front sheet's parallax is folded in. */
const FACE: Camera = { x: 669, y: 682, zoom: 4, rot: 0.06 };

const STAINS = [blob(10, -76, 30, 38, 7), blob(-14, -52, 14, 16, 11)];

const SHEETS = (() => {
  const r = rng(1889);
  return Array.from({ length: 9 }, (_, i) => ({
    x: 765 + (r() - 0.5) * 12,
    y: 853 - i * 13,
    rot: (r() - 0.5) * 0.1,
  }));
})();

export const cold = drawing({
  timeline: {
    drop: { mark: 'evidence', dur: 1.4, ease: 'inCubic', stagger: 0.857 },
    bow: { mark: 'did', dur: 0.35 },
    lean: { mark: 'judge', dur: 0.4 },
    gavel: { mark: 'righteous', offset: -0.37, dur: 0.59 },
    stamp: { mark: 'righteous', offset: -0.03, dur: 0.2, ease: 'outBack' },
    lift: { mark: 'righteous', offset: 0.1, dur: 0.37 },
    stampOut: { mark: 'wait', offset: -0.17, dur: 0.17 },
    push: { mark: 'wait', dur: 0.9 },
    puzzle: { mark: 'wait', offset: 0.17, dur: 0.25 },
    back: { mark: 'bible', dur: 1 },
    stampBack: { after: 'back', dur: 0.25 },
    rest: { mark: 'oldest', dur: 0.57 },
    stampGone: { mark: 'oldest', dur: 0.33 },
    wide: { mark: 'oldest', offset: 1.2, dur: 1.6 },
    lookUp: { mark: 'job', dur: 0.6 },
  },
  draw: (f) => {
    const { ctx, w, h } = f;

    const push = f.at('push');
    const back = f.at('back');
    const cam = between(between(between(REST, FACE, push), REST, back), WIDE, f.at('wide'));

    // The accused's face: head down on "you did it", up at the verdict,
    // puzzled on "wait", looking up at the question on "job".
    const bow = f.at('bow') * (1 - f.at('lift'));
    const puzzle = f.at('puzzle') * (1 - back);
    const up = f.at('lookUp');
    const look: Pt = [lerp(-2 * bow, 3, up), lerp(3 * bow, -5, up)];
    const face = {
      tilt: 0.2 * bow - 0.14 * puzzle - 0.12 * up,
      nod: 6 * bow,
      look,
      browL: 5 * puzzle + 3 * up,
      browR: 1 * puzzle + 4 * up,
      browTilt: 0.35 * puzzle + 0.4 * up,
      mouth: puzzle,
      stains: STAINS,
    };

    const stamp =
      f.at('stamp') * (1 - f.at('stampOut')) + f.at('stampBack') * (1 - f.at('stampGone'));
    const popScale = f.keys('stamp', [
      [0, 1.2],
      [0.6, 0.97, 'outCubic'],
      [1, 1, 'inOutCubic'],
    ]);
    const swing =
      f.keys('gavel', [
        [0, 0.35],
        [0.373, -0.3],
        [0.627, 1.62, 'inCubic'],
        [0.797, 1.4, 'outQuad'],
        [1, 1.58],
      ]) *
        (1 - f.at('rest')) +
      0.35 * f.at('rest');
    const lean = f.at('lean') * (1 - f.at('rest'));

    multiplane(
      ctx,
      cam,
      w,
      h,
      [
        {
          // The wall: tall sheets of toned paper, and the floor's edge.
          z: 1.35,
          draw: () => {
            for (const [x, k] of [
              [300, 1],
              [1580, 2],
            ] as const)
              piece(ctx, rectShape(x, 80, 200, 800), `${C.paperTone}30`, f.hand(`pillar${k}`), {
                line: 0,
                torn: 3,
                shadow: 0.2,
              });
            piece(ctx, rectShape(-400, 868, 2700, 400), `${C.paperTone}38`, f.hand('floor'), {
              line: 0,
              torn: 5,
              shadow: 0.25,
            });
          },
        },
        {
          // The bench, and the judge behind it.
          z: 1,
          draw: () => {
            contact(ctx, 1180, 860, 820);
            at(ctx, { x: JUDGE[0], y: JUDGE[1] + 10 * lean }, () => {
              piece(ctx, rounded(0, 120, 250, 120, 40), C.ink, f.hand('judgeRobe'));
              for (const x of [-9, 9])
                piece(ctx, rounded(x, 88, 14, 30, 3), C.paper, f.hand(`band${x}`), { line: 2 });
              piece(ctx, ellipseShape(0, 0, 60, 65), C.figure, f.hand('judgeHead'));
              const [ex, ey] = [-12 * lean, 5 * lean];
              ctx.fillStyle = C.outline;
              for (const x of [-22, 22]) {
                ctx.beginPath();
                ctx.ellipse(x + ex, -8 + ey, 4.5, 5.5, 0, 0, Math.PI * 2);
                ctx.fill();
              }
              for (const side of [-1, 1] as const)
                stroke(
                  ctx,
                  line([side * 22 - 13, -28], [side * 22 + 13, -28]),
                  { color: C.outline, width: 5, jitter: 0.3, taper: 0.2 },
                  f.hand(`judgeBrow${side}`),
                );
              stroke(
                ctx,
                line([-11, 30], [11, 30]),
                { color: C.outline, width: 4, jitter: 0.3 },
                f.hand('judgeMouth'),
              );
            });
            piece(ctx, rectShape(860, 475, 640, 380), C.paperTone, f.hand('bench'), { torn: 2 });
            [980, 1180, 1380].forEach((x, i) => {
              const panel = rounded(x, 680, 170, 280, 10);
              stroke(
                ctx,
                [...panel, panel[0] ?? [x, 540]],
                { color: C.inkSoft, width: 3, jitter: 0.5, taper: 0 },
                f.hand(`panel${i}`),
              );
            });
            piece(ctx, rounded(1180, 472, 690, 34, 6), C.inkSoft, f.hand('rim'));
            piece(ctx, rounded(1436, 448, 76, 14, 4), C.boardDeep, f.hand('block'), { line: 2 });
            at(ctx, { x: GAVEL[0], y: GAVEL[1], rot: swing }, () => {
              piece(ctx, rounded(0, -52, 12, 100, 4), C.inkSoft, f.hand('handle'), { line: 2 });
              piece(ctx, rounded(0, -104, 64, 34, 8), C.boardDeep, f.hand('gavelHead'), {
                line: 2.5,
              });
              piece(ctx, ellipseShape(0, 0, 15, 13), C.figure, f.hand('gavelHand'), { line: 2.5 });
            });
            // The verdict, stamped on a torn label across the bench.
            if (stamp > 0.01)
              at(ctx, { x: 1180, y: 672, rot: -0.07, scale: popScale }, () => {
                ctx.save();
                ctx.globalAlpha *= Math.min(1, stamp);
                piece(ctx, rectShape(-250, -78, 500, 118), C.cream, f.hand('label'), {
                  line: 0,
                  torn: 3,
                  shadow: 0.4,
                });
                probePlate(ctx, 'Righteous', -250, -78, 500, 118);
                write(
                  ctx,
                  'Righteous',
                  0,
                  12,
                  { family: F.display, size: 100, weight: 700, color: C.gold, align: 'center' },
                  f.hand('stamp'),
                  { boil: 0.4 },
                );
                ctx.restore();
              });
          },
        },
        {
          // The accused and the evidence against them.
          z: 0.9,
          lift: 1.3,
          draw: () => {
            contact(ctx, ACCUSED[0], ACCUSED[1] + 4, 170);
            // The sheets fall one after another across `drop`, each eased by its ease.
            const landed = SHEETS.filter((_, i) => f.stagger('drop', i, SHEETS.length) > 0).length;
            if (landed > 0) contact(ctx, 765, 864, 150 + 10 * landed);
            SHEETS.forEach((s, i) => {
              const k = f.stagger('drop', i, SHEETS.length);
              if (k <= 0) return;
              const fall = lerp(-300, 0, k);
              at(ctx, { x: s.x, y: s.y + fall, rot: s.rot }, () =>
                piece(ctx, rectShape(-75, -5.5, 150, 11), C.paper, sub(f.hand('sheet'), i), {
                  line: 2,
                  outline: C.ink,
                }),
              );
            });
            at(ctx, { x: ACCUSED[0], y: ACCUSED[1] }, () => person(ctx, face, f.hand('accused')));
          },
        },
      ],
      { rest: [REST.x, REST.y], haze: C.paper, thickness: 0.6 },
    );

    // Job's question, the only words on screen.
    write(ctx, QUESTION, 960, 205, questionStyle, f.hand('question'), {
      progress: f.spoken('job'),
      reveal: 'write',
      boil: 0.4,
    });
  },
});
