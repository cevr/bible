import { UNMOVED, drawing, knobCamera, shotPath, mix } from '@bible/film/canvas';
import { P, person, figure, stains, stage, oval, wordLight, gifts, line } from '../kit.ts';

export const look = drawing({
  timeline: {
    wonder: { mark: 'faith', dur: 0.5 },
    holdUp: { mark: 'saviour', dur: 0.6, ends: true, ease: 'outBack' },
    // Their hands go up to where the stack comes down into them, and down once it has slid off.
    handsUp: { mark: 'saviour', offset: -0.9, dur: 0.8, ease: 'inOutSine' },
    // The stack slides off one piece at a time, each falling over the rest of the cue.
    slide: { mark: 'saviour', word: 'said', offset: -0.2, dur: 1.3, ease: 'linear', stagger: 0.41 },
    armsDown: { after: 'slide', dur: 0.5 },
    handsDown: { after: 'slide', dur: 0.8, ease: 'inOutSine' },
    // As the stack goes, their near hand comes down open, and the camera
    // pushes into it: the close-up. Once the light is laid in it, back out
    // to them holding it.
    offer: { with: 'handIn', dur: 0.5, ends: true },
    // Coming down, the hand that held the stack turns palm up: the close-up's shape.
    palmUp: { mark: 'hand', offset: -0.85, dur: 0.25, ease: 'inOutSine' },
    handIn: { mark: 'hand', dur: 0.6, ends: true, ease: 'inOutCubic' },
    light: { mark: 'hand', offset: 0.3, dur: 1, ease: 'outCubic' },
    handOut: { after: 'light', dur: 0.6, ease: 'inOutCubic' },
    toDesert: { mark: 'desert', offset: -0.4, dur: 0.6 },
    rise: { mark: 'pole', offset: -0.2, dur: 1.2, ease: 'outBack' },
    approach: { mark: 'harder', offset: -0.6, dur: 0.7, ease: 'inOutSine' },
    climb: { mark: 'harder', offset: 0.2, dur: 2.2 },
    // Their hands take the pole as they start to climb, and let go as they slide down.
    grasp: { with: 'climb', dur: 0.6, ease: 'inOutSine' },
    slideDown: { mark: 'climb', dur: 0.5, ease: 'inCubic' },
    letGo: { with: 'slideDown', until: { cue: 'slideDown' } },
    stepBack: { mark: 'climb', offset: 0.6, dur: 0.7, ease: 'inOutSine' },
    // Stepped back, he looks up and the camera pushes in.
    lookUp: { after: 'stepBack', offset: 0.1, dur: 0.6 },
    push: { with: 'lookUp', dur: 1.6, ease: 'inOutCubic' },
    // Healed on "I present Christ".
    heal: { mark: 'climb', word: 'christ', offset: 0.12, dur: 1.5 },
    // 0.75 s into the healing, the bites are gone.
    bitesGone: { with: 'heal', offset: 0.75, dur: 0 },
    // After the last word: the face gives way to faith's icon close, pulled back
    // to the row, faith glowing; for a breath, under it, the four faces at the
    // hole in the roof, lit gold (the callback to `roof`).
    toIcons: { at: 'speechEnd', offset: 0.1, dur: 0.4 },
    pullBack: { at: 'speechEnd', offset: 0.1, dur: 0.9, ease: 'inOutSine' },
    // Faith pops forward in gold as the row settles, the other two faded back.
    iconGlow: { at: 'speechEnd', offset: 0.3, dur: 0.6, ease: 'outBack' },
    hole: { at: 'speechEnd', offset: 1, dur: 0.6, ease: 'inOutSine' },
    holeOut: { at: 'end', offset: -0.6, dur: 0.5, ease: 'inOutSine' },

    travel: { at: 'start', until: { at: 'end' }, ease: 'linear' },
  },
  knobs: {
    close: [1090, 605],
    closeZoom: 1.25,
    faceAt: [925, 540],
    faceZoom: 5.3,
    holeAt: [855, 410],
    holeZoom: 2.5,
  },
  draw: (f) => {
    const { ctx } = f;
    const cam = shotPath(UNMOVED, [
      [f.at('travel'), knobCamera(f.knob('close'), f.knob('closeZoom'))],
      [f.at('push'), knobCamera(f.knob('faceAt'), f.knob('faceZoom'))],
      [f.at('pullBack'), UNMOVED],
      [f.at('hole'), knobCamera(f.knob('holeAt'), f.knob('holeZoom'))],
    ]);

    const climb = f.at('climb') * (1 - f.at('slideDown'));
    const healed = f.at('heal');
    stage(f, 'desert', cam, () => {
      for (let i = 0; i < 6; i++)
        line(
          ctx,
          [
            [180 + i * 235, 958],
            [203 + i * 235, 947],
            [232 + i * 235, 965],
            [258 + i * 235, 953],
          ],
          P.scarlet,
          7,
        );
      ctx.fillStyle = P.woodLit;
      ctx.fillRect(1190, 915 - 585 * f.at('rise'), 20, 585 * f.at('rise'));
      line(
        ctx,
        [
          [1180, 390],
          [1235, 370],
          [1248, 396],
          [1210, 420],
          [1184, 449],
          [1236, 466],
        ],
        P.gold,
        18 * f.at('rise'),
      );
      figure(
        ctx,
        person(775 + 360 * f.at('approach') - 210 * f.at('stepBack'), 944 - 210 * climb, 440, {
          marks: stains(1 - healed),
          robe: mix('#83918a', P.white, healed),
          near: { to: [0.22, -0.73], grip: 'open' },
          nod: -0.25 * f.at('lookUp'),
          face: { brow: 0.45, smile: healed * 0.7 },
        }),
      );
      wordLight(ctx, 840, 625, 0.7 * f.at('light') * (1 - f.at('toDesert')));
      ctx.save();
      ctx.globalAlpha *= 1 - f.at('slide');
      for (let i = 0; i < 8; i++) oval(ctx, 740 + i * 19, 732 - i * 4, 18, 7, P.gold);
      ctx.restore();
    });
    gifts(ctx, [1, 0, 0], f.at('toIcons'));
    ctx.save();
    ctx.globalAlpha *= f.at('hole') * (1 - f.at('holeOut'));
    ctx.fillStyle = P.wood;
    ctx.fillRect(655, 480, 470, 45);
    for (let i = 0; i < 4; i++)
      figure(
        ctx,
        person(695 + i * 118, 490, 170, {
          pose: 'kneel',
          robe: (['#716d85', '#a18b6c', '#52787b', '#955e58'] as const)[i] ?? P.teal,
          glow: { color: P.gold, amount: 0.7 },
          seed: 101 + i,
        }),
      );
    ctx.restore();
  },
});
