import { UNMOVED, drawing, knobCamera, shotPath, glow, mix } from '@bible/film/canvas';
import {
  P,
  person,
  christ,
  figure,
  stains,
  stage,
  oval,
  robe as robeIcon,
  gifts,
  bench,
  loom,
} from '../kit.ts';

export const robe = drawing({
  timeline: {
    lift: { mark: 'take', offset: 0.33, dur: 1.5 },
    carry: { mark: 'take', word: 'him', offset: -0.1, dur: 2.75, ease: 'inOutSine' },
    specks: { with: 'carry', offset: 0.4, dur: 0.8 },
    speck: { mark: 'pass', dur: 1.17 },
    // The speck on his cheek fades as it lifts, gone as it reaches the top.
    cheekOff: { after: 'speck', dur: 0.68, ends: true, ease: 'outCubic' },
    reachOut: { mark: 'clothe', dur: 0.75 },
    loomIn: { mark: 'loom', offset: -0.33, dur: 0.67 },
    pushLoom: { mark: 'loom', offset: 0.33, dur: 1.17 },
    // The loom weaves as soon as the push reaches it, so the robe rises from it
    // before "So is it a cover-up?" and the cloak's hover plays on its word.
    weave: { after: 'pushLoom', dur: 2.9, ease: 'linear' },
    robeUp: { after: 'weave', dur: 0.4 },
    settle: { after: 'robeUp', dur: 0.75, ease: 'outSoft' },
    lookDown: { after: 'settle', dur: 0.5 },
    // The robe's glow comes up on him once it has settled.
    glowUp: { after: 'settle', dur: 0.25, ease: 'linear' },
    hover: { mark: 'nicer', dur: 0.4 },
    cover: { mark: 'just', offset: 0.1, dur: 0.4, ease: 'outBack' },
    flick: { mark: 'no', dur: 0.5, ease: 'inCubic' },
    lens: { mark: 'cloak', offset: 0.1, dur: 0.57, ease: 'outBack' },
    flakes: { mark: 'away', dur: 0.9, ease: 'inQuad', stagger: 0.5 },
    shut: { after: 'flakes', dur: 0.33 },
    drift: { mark: 'judicial', until: 'reclaim', ease: 'linear' },
    beyond: { mark: 'judicial', until: 'reclaim', ease: 'inOutSine' },
    warm: { mark: 'reclaim', offset: 0.4, dur: 2.2, ease: 'inOutSine' },
    glad: { mark: 'reclaiming', dur: 0.6 },
    toIcons: { at: 'speechEnd', dur: 0.27 },
    pullBack: { with: 'toIcons', dur: 0.7, ease: 'outCubic' },
    // The robe pops forward in gold as the row settles, the heart faded back.
    iconGlow: { after: 'toIcons', dur: 0.6, ease: 'outBack' },
    // The callback to `roof`'s court under the robe, arriving with the pull back and held to the scene's end (the tail).
    forgiven: { with: 'toIcons', dur: 0.3 },

    travel: { at: 'start', until: { at: 'end' }, ease: 'linear' },
  },
  knobs: {
    close: [820, 625],
    closeZoom: 1.2,
    faceAt: [570, 540],
    faceZoom: 5.4,
  },
  draw: (f) => {
    const { ctx } = f;
    const cam = shotPath(UNMOVED, [
      [f.at('travel'), knobCamera(f.knob('close'), f.knob('closeZoom'))],
      [f.at('warm'), knobCamera(f.knob('faceAt'), f.knob('faceZoom'))],
      [f.at('pullBack'), UNMOVED],
    ]);

    const removed = f.at('specks');
    const woven = f.at('weave');
    const settle = f.at('settle');
    stage(f, 'court', cam, () => {
      bench(ctx, 0.25);
      figure(
        ctx,
        person(570, 944, 450, {
          head: 'turban',
          robe: mix('#84918c', P.white, settle),
          cloth: mix('#a68b68', P.white, settle),
          marks: stains(1 - removed),
          glow: { color: P.gold, amount: f.at('warm') },
          face: { smile: f.at('glad') * 0.8 },
          near: { to: [0.1, -0.62], grip: 'open' },
        }),
      );
      figure(ctx, christ(1130, 930, 450, { near: { to: [0.25, -0.6], grip: 'open' } }));
      ctx.save();
      ctx.globalAlpha *= f.at('lift') * (1 - f.at('carry'));
      robeIcon(ctx, 570, 735 - 400 * f.at('lift'), 1.7);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha *= f.at('loomIn') * (1 - settle);
      ctx.fillStyle = P.tealDeep;
      ctx.fillRect(400, 255, 1040, 615);
      loom(ctx, woven);
      glow(ctx, 970, 470, 230, P.gold, woven * 0.3);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha *= f.at('lens') * (1 - f.at('shut'));
      oval(ctx, 1400, 540, 116, 116, P.cream);
      oval(ctx, 1400, 540, 55 * (1 - f.at('flakes')), 67 * (1 - f.at('flakes')), P.scarlet);
      ctx.restore();
    });
    ctx.save();
    ctx.globalAlpha *= f.at('forgiven');
    stage(f, 'temple', cam, () => {
      figure(
        ctx,
        person(690, 948, 455, {
          head: 'veil',
          robe: P.white,
          cloth: P.white,
          face: { smile: 0.5 },
        }),
      );
      figure(ctx, christ(1200, 945, 450));
      for (let i = 0; i < 7; i++) oval(ctx, 350 + i * 150, 980, 11, 8, '#8d8d7b');
    });
    ctx.restore();
    gifts(ctx, [1, f.at('iconGlow'), 0], f.at('toIcons'));
  },
});
