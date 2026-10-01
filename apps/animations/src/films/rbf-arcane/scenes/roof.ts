import { UNMOVED, drawing, knobCamera, shotPath, mix } from '@bible/film/canvas';
import {
  P,
  tablets,
  person,
  christ,
  figure,
  stains,
  stage,
  paintedCrowd,
  gifts,
  bed,
  sleeping,
  line,
} from '../kit.ts';

export const roof = drawing({
  timeline: {
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
    steady: { with: 'roll', until: { cue: 'roll' } },
    walk: { mark: 'went', until: 'count', ease: 'linear' },
    follow: { mark: 'went', dur: 1.4, ease: 'inOutSine' },
    // The count: the band in along the top; each number cuts back to its moment
    // and lights its icon on the number itself.
    band: { mark: 'count', dur: 0.6, ease: 'outCubic' },
    // Each number's icon pops forward, gold, on the number; the one before steps back.
    oneLit: { mark: 'one', dur: 0.55, ease: 'outBack' },
    oneHold: { mark: 'one', until: 'two', ease: 'linear' },
    twoLit: { mark: 'two', dur: 0.55, ease: 'outBack' },
    // The specks lift off him on "forgiveness", and the robe comes over him with them.
    twoSpecks: { mark: 'two', word: 'forgiveness', dur: 1.2, ease: 'inOutSine' },
    twoHold: { mark: 'two', until: 'three', ease: 'linear' },
    threeLit: { mark: 'three', dur: 0.55, ease: 'outBack' },
    threeWalk: { mark: 'three', until: 'proof', ease: 'linear' },
    // The echo of the third gift in the picture: the heart as he stands.
    heart: { mark: 'three', offset: 0.2, dur: 0.8, ease: 'outCubic' },
    // The walk vouches for the pardon: a thread of light from the heart back to the robe.
    proof: { mark: 'proof', dur: 1.2, ease: 'inOutSine' },
    proofWalk: { mark: 'proof', dur: 1.6, ease: 'linear' },

    travel: { at: 'start', until: { at: 'end' }, ease: 'linear' },
  },
  knobs: {
    close: [850, 620],
    closeZoom: 1.15,
    roofFace: [775, 275],
    roofFaceZoom: 2.4,
    teacherFace: [1240, 525],
    teacherFaceZoom: 5.4,
    manFace: [605, 780],
    manFaceZoom: 3.8,
    doubtFace: [1545, 740],
    doubtFaceZoom: 3.5,
    lying: [810, 760],
    lyingZoom: 1.6,
  },
  draw: (f) => {
    const { ctx } = f;
    const cam = shotPath(UNMOVED, [
      [f.at('travel'), knobCamera(f.knob('close'), f.knob('closeZoom'))],
      [f.at('up'), knobCamera(f.knob('roofFace'), f.knob('roofFaceZoom'))],
      [f.at('look'), knobCamera(f.knob('teacherFace'), f.knob('teacherFaceZoom'))],
      [f.at('push'), knobCamera(f.knob('manFace'), f.knob('manFaceZoom'))],
      [f.at('rack'), knobCamera(f.knob('doubtFace'), f.knob('doubtFaceZoom'))],
      [f.at('easy'), knobCamera(f.knob('lying'), f.knob('lyingZoom'))],
      [f.at('back'), UNMOVED],
      [f.at('oneLit'), knobCamera(f.knob('roofFace'), f.knob('roofFaceZoom'))],
      [f.at('twoLit'), knobCamera(f.knob('manFace'), f.knob('manFaceZoom'))],
      [f.at('threeLit'), UNMOVED],
    ]);

    const count = f.at('band');
    const rise = f.at('rise') * (1 - count) + f.at('threeLit') * count;
    const walk =
      f.at('walk') * (1 - count) + (f.at('threeWalk') + f.at('proofWalk') * 0.25) * count;
    const clean = f.at('specks') * (1 - count) + f.at('twoSpecks') * count;
    stage(f, 'roof', cam, () => {
      for (const [i, x] of [1460, 1610].entries()) {
        ctx.fillStyle = P.wood;
        ctx.fillRect(x - 55, 935, 110, 18);
        figure(
          ctx,
          person(x, 937, 350, {
            pose: 'sit',
            head: 'hood',
            robe: i === 0 ? '#596b72' : '#796663',
            near: { to: [0.13, -0.5], grip: 'hold' },
            face: { brow: -0.65 * f.at('doubt') },
            nod: 0.15 * f.at('doubt'),
            seed: 701 + i,
          }),
        );
        tablets(ctx, x + 38, 775, 0.45);
      }

      for (const p of paintedCrowd(51, 1200, 12)) figure(ctx, { ...p, y: p.y - 10 });
      for (let i = 0; i < 4; i++)
        figure(
          ctx,
          person(590 + i * 116, 335, 185, {
            dir: i < 2 ? 1 : -1,
            pose: 'kneel',
            robe: (['#716d85', '#a18b6c', '#52787b', '#955e58'] as const)[i] ?? P.teal,
            near: { to: [0.24, -0.41], grip: 'hold' },
            seed: 101 + i,
          }),
        );
      const by = 390 + 425 * f.at('lower');
      ctx.save();
      ctx.globalAlpha *= 1 - rise;
      line(
        ctx,
        [
          [605, 330],
          [605, by],
        ],
        P.cream,
        4,
      );
      line(
        ctx,
        [
          [930, 330],
          [930, by],
        ],
        P.cream,
        4,
      );
      bed(ctx, 770, by);
      sleeping(ctx, 770, by, 1, clean);
      ctx.restore();
      figure(
        ctx,
        christ(1240, 937, 450, {
          near: { to: [0.26, -0.65], grip: 'open' },
          nod: -0.16 * f.at('look'),
        }),
      );
      figure(
        ctx,
        person(730 - 490 * walk, 945, 430, {
          robe: mix('#86918b', P.white, clean),
          marks: stains(1 - clean),
          alpha: rise,
          pose: 'walk',
          step: walk * Math.PI * 8,
          glow: { color: P.gold, amount: f.at('heart') },
          near: { to: [0.08, -0.84], grip: 'hold' },
        }),
      );
      ctx.save();
      ctx.globalAlpha *= rise;
      bed(ctx, 730 - 490 * walk, 615, 0.7, f.at('roll'));
      ctx.restore();
    });
    gifts(ctx, [f.at('oneLit'), f.at('twoLit'), f.at('threeLit')], f.at('band'));
    if (f.at('proof') > 0)
      line(
        ctx,
        [
          [1270, 235],
          [960, 235],
        ],
        P.gold,
        6 * f.at('proof'),
      );
  },
});
