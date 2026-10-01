import { UNMOVED, drawing, knobCamera, figurePoint, shotPath, mix } from '@bible/film/canvas';
import { P, person, christ, figure, stage, oval, heart, gifts, bed, line } from '../kit.ts';

export const within = drawing({
  timeline: {
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

    travel: { at: 'start', until: { at: 'end' }, ease: 'linear' },
  },
  knobs: {
    close: [875, 630],
    closeZoom: 1.18,
    faceAt: [760, 516],
    faceZoom: 5.4,
  },
  draw: (f) => {
    const { ctx } = f;
    const cam = shotPath(UNMOVED, [
      [f.at('travel'), knobCamera(f.knob('close'), f.knob('closeZoom'))],
      [f.at('closeUp'), knobCamera(f.knob('faceAt'), f.knob('faceZoom'))],
      [f.at('closeOut'), UNMOVED],
    ]);

    const power = f.at('heart');
    const walking = f.at('walk');
    stage(f, 'page', cam, () => {
      figure(
        ctx,
        person(760 + 390 * walking, 960, 485, {
          head: 'bare',
          robe: mix('#84918c', P.white, f.at('warm')),
          glow: { color: P.gold, amount: power },
          near: { to: [0.23, -0.63], grip: 'open' },
          far: { to: [0.15, -0.63], grip: 'open' },
          pose: 'walk',
          step: walking * Math.PI * 6,
          face: { smile: 0.65 * power },
        }),
      );
      const chest = figurePoint(
        person(760 + 390 * walking, 960, 485, { pose: 'walk', step: walking * Math.PI * 6 }),
        'chest',
      );
      heart(ctx, chest[0], chest[1], 0.62 * power);
      ctx.save();
      ctx.globalAlpha *= f.at('book') * (1 - f.at('swap'));
      ctx.fillStyle = P.woodLit;
      ctx.fillRect(1230, 640, 310, 140);
      ctx.fillStyle = P.cream;
      ctx.fillRect(1245, 650, 290, 17);
      ctx.restore();
      for (let i = 0; i < 7; i++) {
        const bloom = f.stagger('walk', i, 7);
        line(
          ctx,
          [
            [800 + i * 50, 982],
            [800 + i * 50, 960 - 18 * bloom],
          ],
          P.sage,
          4,
        );
        oval(ctx, 800 + i * 50, 960 - 18 * bloom, 11 * bloom, 7 * bloom, P.gold);
      }
    });
    ctx.save();
    ctx.globalAlpha *= f.at('wentIn') * (1 - f.at('backIn'));
    stage(f, 'roof', cam, () => {
      figure(ctx, christ(1240, 937, 450));
      figure(
        ctx,
        person(730 - 490 * f.at('going'), 945, 430, {
          robe: P.white,
          pose: 'walk',
          step: f.at('going') * Math.PI * 8,
          near: { to: [0.08, -0.84], grip: 'hold' },
        }),
      );
      bed(ctx, 730 - 490 * f.at('going'), 615, 0.7, 1);
    });
    ctx.restore();
    gifts(
      ctx,
      [1, 1, f.at('heartLit')],
      1 - f.at('toPage') + f.at('toIcons') * (1 - f.at('backIn')),
    );
  },
});
