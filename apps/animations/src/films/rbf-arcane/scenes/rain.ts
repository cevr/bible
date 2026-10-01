import {
  UNMOVED,
  drawing,
  knobCamera,
  shotPath,
  glow,
  rain as fallingRain,
} from '@bible/film/canvas';
import {
  P,
  person,
  christ,
  figure,
  stage,
  mass,
  oval,
  tree,
  tablets,
  inscription,
} from '../kit.ts';

export const rain = drawing({
  timeline: {
    // Christ pleads before the ark from the cut, as `exchange` left him.
    plea: { at: 'start', dur: 0 },
    fall: { mark: 'spirit', offset: -0.3, dur: 0.8 },
    // The fields green back to front: each starts as the rain reaches it
    // (over the first 0.6 of the cue) and takes the rest to turn.
    green: { mark: 'spirit', offset: 0.2, dur: 3.6, ease: 'linear', stagger: 0.6 },
    tiltUp: { mark: 'blot', offset: -0.6, dur: 1.3 },
    bright: { mark: 'blot', offset: 0.4, dur: 1 },
    // The specks wink out one after another, each quickly.
    wink: { mark: 'blot', offset: 0.9, dur: 2, ease: 'linear', stagger: 0.85 },
    down: { mark: 'loud', offset: -0.9, dur: 1.4 },
    stop: { mark: 'loud', offset: -0.9, dur: 0.8 },
    fly: { mark: 'loud', offset: -0.1, dur: 3, ease: 'linear' },
    // The angel has the banner in hand as it flies in, still off frame.
    grasp: { with: 'fly', dur: 0 },
    turn: { mark: 'loud', offset: 0.6, dur: 0.6 },

    travel: { at: 'start', until: { at: 'end' }, ease: 'linear' },
  },
  knobs: { close: [1040, 525], closeZoom: 1.16 },
  draw: (f) => {
    const { ctx, t } = f;
    const cam = shotPath(UNMOVED, [
      [f.at('travel'), knobCamera(f.knob('close'), f.knob('closeZoom'))],
    ]);

    const fall = f.at('fall');
    const green = f.at('green');
    stage(f, 'field', cam, () => {
      ctx.save();
      ctx.globalAlpha *= green;
      mass(ctx, '#5a926c', () => {
        ctx.moveTo(-300, 990);
        ctx.quadraticCurveTo(820, 850, 2300, 930);
        ctx.lineTo(2300, 1320);
        ctx.lineTo(-300, 1320);
        ctx.closePath();
      });
      ctx.restore();
      for (let i = 0; i < 9; i++) {
        const alive = f.stagger('green', i, 9);
        tree(ctx, 150 + i * 190, 980, 0.2 + 0.18 * alive);
        oval(
          ctx,
          150 + i * 190,
          770,
          14 * (1 - f.stagger('wink', i, 9)),
          9 * (1 - f.stagger('wink', i, 9)),
          P.scarlet,
        );
      }
      glow(ctx, 1050, 360, 330, P.gold, 0.25 + f.at('bright') * 0.45);
      ctx.fillStyle = P.gold;
      ctx.fillRect(890, 280, 320, 100);
      tablets(ctx, 1050, 323, 0.55);
      figure(
        ctx,
        christ(1050, 965, 450, {
          alpha: 1 - fall,
          near: { to: [0.24, -0.85], grip: 'open' },
          far: { to: [-0.2, -0.83], grip: 'open' },
        }),
      );
      fallingRain(ctx, t, {
        seed: 123,
        count: 150,
        box: [-100, 120, 2150, 960],
        slant: 0.16,
        speed: 390,
        length: 38,
        width: 1.7,
        color: P.sunCore,
        alpha: 0.45 * fall * (1 - f.at('stop')),
      });
      for (let i = 0; i < 5; i++)
        figure(
          ctx,
          person(370 + i * 270, 965, 210, {
            robe: P.white,
            alpha: fall,
            nod: -0.3,
            near: { to: [0.17, -0.88], grip: 'open' },
            seed: 601 + i,
          }),
        );
    });
    const fly = f.at('fly');
    ctx.save();
    ctx.globalAlpha *= fly;
    figure(
      ctx,
      christ(300 + 1230 * fly, 440, 180, { shadow: 0, near: { to: [0.28, -0.55], grip: 'hold' } }),
    );
    mass(ctx, P.cream, () => {
      ctx.moveTo(1300 * fly + 135, 345);
      ctx.quadraticCurveTo(1300 * fly + 110, 170, 1300 * fly + 340, 230);
      ctx.quadraticCurveTo(1300 * fly + 260, 270, 1300 * fly + 260, 345);
    });
    ctx.fillStyle = P.cream;
    ctx.fillRect(440, 475, 1060, 96);
    ctx.restore();
    inscription(
      f,
      'The commandments of God, and the faith of Jesus',
      970,
      536,
      39,
      1,
      fly,
      0,
      P.ink,
    );
  },
});
