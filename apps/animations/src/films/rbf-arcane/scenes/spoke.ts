import { UNMOVED, drawing, knobCamera, shotPath, glow, stars } from '@bible/film/canvas';
import { P, stage, tree, wordLight, gifts, line } from '../kit.ts';

export const spoke = drawing({
  timeline: {
    // Faith pops forward in gold, the other two fade back: the section's gift.
    lead: { mark: 'gift', offset: 0.1, dur: 0.6, ease: 'outBack' },
    dim: { mark: 'gift', offset: 0.1, dur: 0.6 },
    curious: { mark: 'where', offset: -0.2, dur: 0.5 },
    shrug: { mark: 'where', offset: 0.1, dur: 0.5 },
    unshrug: { mark: 'from', offset: -0.2, dur: 0.4 },
    into: { mark: 'from', offset: -0.1, dur: 1.1, ease: 'inCubic' },
    // The bubble's gold fills the frame as the push goes through it.
    gold: { after: 'into', dur: 0.1, ends: true, ease: 'linear' },
    bookIn: { after: 'into', offset: -0.1, dur: 0.6, ease: 'outBack' },
    // The book opens in two halves: the clasp fades as the cover starts to
    // widen, then the pages spread as it widens the rest of the way.
    unclasp: { mark: 'back', offset: 0.1, dur: 0.3, ease: 'inCubic' },
    pages: { after: 'unclasp', dur: 0.3, ease: 'outCubic' },
    plunge: { mark: 'dark', offset: -1, dur: 1.1, ease: 'inCubic' },
    // The dark page fills the frame as the camera goes through it.
    night: { after: 'plunge', dur: 0.12, ends: true, ease: 'linear' },
    // In the dark, the camera drifts slowly back while the world is made.
    drift: { after: 'plunge', dur: 10.4, ease: 'linear' },
    flight: { mark: 'then', offset: 0.1, dur: 1.3, ease: 'inOutSine' },
    burst: { after: 'flight', dur: 0.6, ease: 'outCubic' },
    // The flying word is gone into the sun just after the burst begins.
    becomesSun: { with: 'burst', offset: 0.124, dur: 0 },
    flood: { mark: 'spake', offset: -0.5, dur: 1.4 },
    day: { after: 'flood', dur: 1.4 },
    land: { mark: 'spake', dur: 1.9, ease: 'linear' },
    hang: { mark: 'only', offset: 0.2, dur: 1.5, ease: 'inOutSine' },
    grow: { mark: 'itself', offset: -0.5, dur: 1.6, ease: 'linear' },

    travel: { at: 'start', until: { at: 'end' }, ease: 'linear' },
  },
  knobs: { close: [1060, 550], closeZoom: 1.18 },
  draw: (f) => {
    const { ctx, t } = f;
    const cam = shotPath(UNMOVED, [
      [f.at('travel'), knobCamera(f.knob('close'), f.knob('closeZoom'))],
    ]);

    const night = f.at('night') * (1 - f.at('day'));
    const creation = f.at('flood');
    stage(f, 'creation', cam, () => {
      ctx.save();
      ctx.globalAlpha *= f.at('bookIn') * (1 - f.at('plunge'));
      ctx.fillStyle = P.cream;
      ctx.fillRect(650, 430, 620, 300);
      line(
        ctx,
        [
          [960, 430],
          [960, 730],
        ],
        P.wood,
        10,
      );
      ctx.restore();
      ctx.save();
      ctx.globalAlpha *= night;
      ctx.fillStyle = P.night;
      ctx.fillRect(-500, -500, 3000, 2100);
      stars(ctx, t, {
        seed: 441,
        count: 80,
        box: [0, 0, 1920, 1080],
        size: [1, 3],
        color: P.tealRim,
        alpha: 0.3,
      });
      ctx.restore();
      const flight = f.at('flight');
      wordLight(
        ctx,
        240 + 1100 * flight,
        550 - 200 * Math.sin(flight * Math.PI),
        1.2 * flight * (1 - f.at('becomesSun')),
      );
      glow(ctx, 1340, 510, 420, P.gold, f.at('burst'));
      ctx.save();
      ctx.globalAlpha *= f.at('grow');
      ctx.translate(1280, 970);
      ctx.scale(1, f.at('grow'));
      tree(ctx, 0, 0, 1.1);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha *= creation;
      ctx.fillStyle = '#76a7a7';
      ctx.fillRect(-200, 790, 1100, 150);
      ctx.restore();
    });
    gifts(ctx, [1, 0, 0], 1 - f.at('into'));
  },
});
