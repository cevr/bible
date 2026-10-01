import { UNMOVED, drawing, knobCamera, shotPath } from '@bible/film/canvas';
import { P, person, figure, stains, stage, oval, gifts, line } from '../kit.ts';

export const daily = drawing({
  timeline: {
    ask: { at: 'speech', dur: 0.4 },
    lead: { mark: 'joy', dur: 0.4 },
    toGate: { mark: 'joy', offset: -0.2, dur: 1, ease: 'inOutCubic' },
    notes: { mark: 'joy', offset: 0.3, dur: 0.8 },
    other: { mark: 'joy', offset: -0.2, dur: 0.5, ease: 'outBack' },
    ears: { mark: 'joy', offset: 0.5, dur: 0.7, ease: 'inOutSine' },
    toFig: { mark: 'keep', offset: -0.4, dur: 0.9, ease: 'inOutCubic' },
    askAgain: { mark: 'keep', dur: 0.4 },
    through: { mark: 'will', offset: -0.35, dur: 0.6, ease: 'inCubic' },
    // The room comes through the glow over the push's last stretch.
    roomIn: { after: 'through', dur: 0.16, ends: true, ease: 'linear' },
    dawn: { mark: 'will', until: 'matter', ease: 'outQuad' },
    // At the window they open their hand and turn it palm up, and on "choose"
    // it comes forward to us, close up; on "sab" it goes back to them, the
    // gifts in it.
    reach: { mark: 'choose', offset: -0.7, dur: 0.6 },
    palmUp: { mark: 'choose', offset: -0.4, dur: 0.3, ease: 'inOutSine' },
    handUp: { mark: 'choose', dur: 0.7, ease: 'inOutCubic' },
    handBack: { mark: 'sab', dur: 0.6, ease: 'inOutCubic' },
    lay: { mark: 'choose', offset: 0.6, dur: 1.2, ease: 'outBack', stagger: 0.6 },
    days: { mark: 'matter', until: 'sab', ease: 'linear', stagger: 0.8 },
    sixth: { mark: 'sab', dur: 1.3, ease: 'inOutSine' },
    field: { after: 'sixth', offset: -0.2, dur: 0.6 },
    settle: { after: 'field', dur: 2.5, ease: 'outCubic' },
    rest: { mark: 'rest', dur: 1.5 },

    travel: { at: 'start', until: { at: 'end' }, ease: 'linear' },
  },
  knobs: { close: [1060, 665], closeZoom: 1.14 },
  draw: (f) => {
    const { ctx } = f;
    const cam = shotPath(UNMOVED, [
      [f.at('travel'), knobCamera(f.knob('close'), f.knob('closeZoom'))],
    ]);

    const dawn = f.at('roomIn');
    const rest = f.at('rest');
    stage(f, 'field', cam, () => {
      ctx.save();
      ctx.globalAlpha *= 1 - dawn;
      ctx.fillStyle = P.gold;
      ctx.fillRect(1030, 385, 210, 450);
      oval(ctx, 1135, 395, 110, 95, P.gold);
      ctx.fillStyle = P.tealDeep;
      ctx.fillRect(1050, 410, 170, 415);
      figure(
        ctx,
        person(670, 947, 420, {
          marks: stains(),
          near: { to: [0.09, -0.81], grip: 'palm' },
          far: { to: [0.08, -0.81], grip: 'palm' },
          face: { brow: -0.5 },
        }),
      );
      ctx.restore();
      ctx.save();
      ctx.globalAlpha *= dawn * (1 - rest);
      ctx.fillStyle = P.woodLit;
      ctx.fillRect(500, 390, 390, 530);
      ctx.fillStyle = P.tealDay;
      ctx.fillRect(525, 410, 340, 470);
      figure(
        ctx,
        person(735, 950, 465, {
          robe: P.white,
          glow: { color: P.gold, amount: 0.8 },
          near: { to: [0.26, -0.65], grip: 'open' },
          face: { smile: 0.45 },
        }),
      );
      ctx.restore();
      const day = f.at('days');
      oval(
        ctx,
        250 + 1180 * day,
        580 - 230 * Math.abs(Math.sin(day * Math.PI * 6)),
        35,
        35,
        P.gold,
      );
      for (let i = 0; i < 6; i++) {
        const p = f.stagger('days', i, 6);
        line(
          ctx,
          [
            [850 + i * 70, 984],
            [850 + i * 70, 982 - 25 * p],
          ],
          P.sage,
          4,
        );
        oval(ctx, 850 + i * 70, 982 - 25 * p, 13 * p, 8 * p, P.gold);
      }
      ctx.save();
      ctx.globalAlpha *= rest;
      ctx.fillStyle = P.woodLit;
      ctx.fillRect(1345, 855, 120, 12);
      ctx.fillRect(1350, 867, 12, 110);
      ctx.fillRect(1450, 867, 12, 110);
      figure(
        ctx,
        person(1405, 977, 435, {
          pose: 'sit',
          robe: P.white,
          head: 'bare',
          lean: -0.1,
          face: { eyes: 0.3, smile: 0.5 },
        }),
      );
      ctx.fillStyle = P.woodLit;
      ctx.fillRect(960, 996, 280, 8);
      ctx.fillStyle = '#bbb5a0';
      ctx.fillRect(1210, 959, 52, 56);
      ctx.restore();
    });
    gifts(
      ctx,
      [f.stagger('lay', 0, 3), f.stagger('lay', 1, 3), f.stagger('lay', 2, 3)],
      f.at('lay'),
    );
  },
});
