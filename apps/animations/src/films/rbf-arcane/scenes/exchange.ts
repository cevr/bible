import { UNMOVED, drawing, knobCamera, shotPath, glow, mix } from '@bible/film/canvas';
import { P, person, christ, figure, stains, stage, oval, tablets, cross, robe } from '../kit.ts';

export const exchange = drawing({
  timeline: {
    turn: { at: 'speech', dur: 0.6 },
    sun: { at: 'speech', until: 'cross', ease: 'linear' },
    puzzle: { mark: 'fair', dur: 0.4 },
    walkIn: { mark: 'fair', word: 'fair', until: 'notes', ease: 'inOutSine' },
    close: { mark: 'treated', offset: -0.4, dur: 1, ease: 'inOutCubic' },
    // The figure's hand to the cloth on their chest, it lifts across to him, and his hand takes it.
    give: { with: 'lift', dur: 0.4, ends: true },
    lift: { mark: 'took', dur: 1.2, ease: 'inOutSine' },
    // The figure's stains go with the cloth as it starts to lift.
    unstained: { with: 'lift', offset: 0.172, dur: 0 },
    // Halfway through the lift one hand lets the cloth go as the other takes it.
    letGo: { with: 'lift', offset: 0.5, dur: 0.5 },
    // Back out on "that we might take His righteousness", and he walks up the hill.
    back: { mark: 'took', word: 'take', offset: -0.05, dur: 1.3, ease: 'inOutCubic' },
    walkUp: { with: 'back', offset: 0.2, dur: 1.9, ease: 'inOutSine' },
    // The figure turns to watch him over the first half of his walk up.
    watch: { with: 'walkUp', dur: 0.95, ease: 'inSine' },
    dark: { mark: 'cross', offset: -0.4, dur: 0.9, ease: 'inOutSine' },
    dawn: { mark: 'rose', offset: -0.3, dur: 1, ease: 'inOutSine' },
    ascend: { mark: 'up', dur: 0.9, ease: 'inOutCubic' },
    robed: { after: 'ascend', dur: 0.5 },
    minister: { after: 'robed', dur: 0.6, ease: 'inOutSine' },
    cut: { mark: 'now', dur: 0 },
    hands: { after: 'cut', offset: 0.1, dur: 0.8, ease: 'inOutSine' },

    travel: { at: 'start', until: { at: 'end' }, ease: 'linear' },
  },
  knobs: { close: [950, 625], closeZoom: 1.15 },
  draw: (f) => {
    const { ctx } = f;
    const cam = shotPath(UNMOVED, [
      [f.at('travel'), knobCamera(f.knob('close'), f.knob('closeZoom'))],
    ]);

    const dark = f.at('dark') * (1 - f.at('dawn'));
    const up = f.at('ascend');
    const take = f.at('lift');
    stage(f, 'cross', cam, () => {
      ctx.save();
      ctx.globalAlpha *= 1 - dark;
      figure(
        ctx,
        person(530, 935, 420, {
          marks: stains(1 - take),
          robe: mix('#84918c', P.white, take),
          face: { brow: 0.7 * (1 - take) },
        }),
      );
      figure(
        ctx,
        christ(1110 + 180 * f.at('walkUp'), 920 - 100 * f.at('walkUp'), 450, {
          mantle: mix('#ab6553', P.scarlet, take),
          near: { to: [0.23, -0.65], grip: 'hold' },
          alpha: 1 - f.at('dawn'),
        }),
      );
      ctx.save();
      ctx.globalAlpha *= take * (1 - f.at('walkUp'));
      robe(ctx, 580 + 500 * take, 660 - 120 * Math.sin(take * Math.PI), 1.6, P.scarlet);
      ctx.restore();
      ctx.restore();
      ctx.save();
      ctx.globalAlpha *= dark;
      ctx.fillStyle = P.shade;
      ctx.fillRect(-300, -200, 2600, 1500);
      oval(ctx, 1260, 1150, 730, 330, P.ink);
      cross(ctx, 1260, 845, 1.7, P.ink);
      figure(
        ctx,
        christ(1260, 795, 350, {
          robe: P.ink,
          mantle: P.ink,
          skin: P.ink,
          light: { from: -2, key: P.ink, shade: P.ink, rim: P.ink },
          near: { to: [0.28, -0.73] },
          far: { to: [-0.28, -0.73] },
          shadow: 0,
        }),
      );
      ctx.restore();
      ctx.save();
      ctx.globalAlpha *= f.at('dawn') * (1 - up);
      oval(ctx, 1050, 897, 300, 213, '#9a9a7d');
      oval(ctx, 1040, 910, 175, 149, P.tealDeep);
      oval(ctx, 1140 + 265 * f.at('dawn'), 968, 145, 145, '#bab291');
      ctx.fillStyle = P.white;
      ctx.fillRect(970, 930, 130, 20);
      ctx.fillRect(968, 956, 107, 13);
      glow(ctx, 1050, 900, 320, P.gold, 0.33);
      ctx.restore();
    });
    ctx.save();
    ctx.globalAlpha *= up;
    stage(f, 'sanctuary', cam, () => {
      ctx.fillStyle = P.gold;
      ctx.fillRect(1240, 550, 280, 110);
      tablets(ctx, 1380, 575, 0.75);
      figure(
        ctx,
        christ(910, 934, 460, {
          near: { to: [0.22, -0.82], grip: 'open' },
          far: { to: [0.2, -0.8], grip: 'open' },
        }),
      );
    });
    ctx.restore();
  },
});
