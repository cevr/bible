import { at } from '../../../engine/cutout.ts';
import type { Look } from '../../../engine/figure.ts';
import { clamp, ease, envelope, keys, progress } from '../../../engine/time.ts';
import { write } from '../../../engine/type.ts';
import { C, cite, hand, quote } from '../kit.ts';
import type { Drawing } from './index.ts';
import { brazen, changing, glow, snake, wilderness } from './props-3.ts';

const sick: Look = {
  robe: C.teal,
  skin: C.tealPale,
  ink: C.ink,
  hair: C.ink,
  rags: true,
  face: 'sad',
};
const well: Look = { robe: C.robe, skin: C.skin, ink: C.ink, hair: C.ink, face: 'joy' };

/** Look and live: the bronze serpent, the climber who is told to stop and look. */
export const serpent: Drawing = {
  enter: { kind: 'pan', dur: 1 },
  draw: (f) => {
    const { ctx, t } = f;
    const bitten = f.mark('bitten');
    const moses = f.mark('moses');
    const look = f.mark('look');
    const lifted = f.mark('lifted');
    const harder = f.mark('harder');
    const dnc = f.mark('dnc');
    const present = f.mark('present');
    const POLE = 1200;
    const GROUND = 900;

    wilderness(ctx, f.hand('camp'), progress(t, 0, f.dur, ease.linear));

    // The pole rises; it shines when Jesus names it, and again at the end.
    const rise = progress(t, moses, 1.8, ease.outBack);
    const shine = Math.max(
      progress(t, look - 0.2, 1) * 0.6,
      progress(t, lifted, 1.2),
      progress(t, present, 1.2) * 1.2,
    );
    brazen(ctx, POLE, GROUND, 520, rise, clamp(shine), f.hand('pole'));

    // Snakes slither in along the sand.
    const slither = progress(t, bitten - 0.6, 3, ease.linear);
    const leave = progress(t, look + 1, 2.5, ease.inCubic);
    if (slither > 0 && leave < 1) {
      const snakes: Array<[number, number, 1 | -1, number]> = [
        [-200, 960, 1, 0.9],
        [2100, 1000, -1, 1.1],
        [-300, 1030, 1, 0.8],
        [2200, 940, -1, 0.7],
      ];
      snakes.forEach(([x0, y, dir, s], i) => {
        const travel = 520 * slither + 900 * leave;
        snake(ctx, x0 + dir * travel, y, 260, t + i, dir, f.hand(`snake${i}`), s);
      });
    }

    // The camp: three stricken people. Two of them look up and live.
    const crowd: Array<[number, number, number]> = [
      [330, 920, 0.4],
      [560, 960, 0.46],
      [1650, 950, 0.42],
    ];
    crowd.forEach(([x, y, s], i) => {
      const down = progress(t, bitten + 0.3 + i * 0.3, 0.8);
      const up = progress(t, look + 0.2 + i * 0.5, 0.9);
      const heal = progress(t, look + 0.5 + i * 0.5, 1.4, ease.inOutCubic);
      glow(ctx, x, y - 180 * s * 2, 200, heal * (1 - progress(t, look + 3, 2)), '230, 179, 71');
      at(ctx, { x, y, scale: s }, () =>
        changing(
          ctx,
          {
            lean: (x < POLE ? 1 : -1) * (0.12 * down * (1 - up)),
            headTilt: (x < POLE ? 1 : -1) * (0.3 * down - 0.55 * up),
            armL: 0.1 + 0.3 * down,
            armR: 0.1 + 0.3 * down,
          },
          sick,
          well,
          heal,
          f.hand(`p${i}`),
        ),
      );
    });

    // The climber: walks to the pole, climbs, is told to stop, looks, lives.
    const walk = progress(t, harder - 0.2, 1.6);
    const climb = progress(t, harder + 1.3, dnc - harder - 1.3, ease.inOutSine);
    const slide = progress(t, dnc + 1.4, 1.2, ease.inOutCubic);
    const height = 300 * climb * (1 - slide);
    const x = keys(t, [
      [harder - 0.2, 870],
      [harder + 1.4, POLE - 70],
    ]);
    const turn = progress(t, dnc + 2.6, 0.8);
    const heal = progress(t, present, 1.6, ease.inOutCubic);
    const strain = climb > 0 && slide < 1 ? Math.sin(t * 18) * 0.06 : 0;
    const onPole = clamp(climb * 3) * (1 - slide);
    at(ctx, { x, y: GROUND + 20 - height, scale: 0.5 }, () =>
      changing(
        ctx,
        {
          armL: 0.15 + 2.9 * onPole + strain,
          armR: 0.15 + 2.5 * onPole - strain + 1.2 * heal * (1 - onPole),
          elbowL: 0.4 * onPole,
          elbowR: 0.5 * onPole,
          headTilt: -0.35 * turn + (walk > 0 && walk < 1 ? Math.sin(t * 9) * 0.04 : 0),
          lean: 0.08 * onPole,
        },
        sick,
        well,
        heal,
        f.hand('climber'),
      ),
    );
    if (heal > 0)
      glow(
        ctx,
        x,
        GROUND - 200,
        320 * heal,
        0.7 * (1 - progress(t, present + 2.2, 1.5)),
        '230, 179, 71',
      );

    // Words.
    quote(
      f,
      '“As Moses lifted up the serpent in the wilderness, even so must the Son of man be lifted up.”',
      960,
      190,
      1400,
      {
        from: 'lifted',
        to: 'harder',
        until: harder + 0.6,
        size: 58,
        align: 'center',
      },
    );
    quote(f, '“Do not climb the pole, but only look.”', 960, 200, 1500, {
      from: 'dnc',
      to: 'present',
      until: present - 0.5,
      size: 70,
      align: 'center',
    });
    quote(f, '“I present Christ to you. Look and live.”', 960, 210, 1500, {
      from: 'present',
      size: 84,
      align: 'center',
    });
    // "Whoever looked, lived" — a small handwritten note by the healed.
    const note = envelope(t, look + 0.3, lifted - 0.1, 0.4, 0.4);
    if (note > 0) {
      ctx.save();
      ctx.globalAlpha *= note;
      write(
        ctx,
        'whoever looked, lived',
        450,
        500,
        { ...hand(64, C.orange), align: 'center' },
        f.hand('note'),
        {
          progress: progress(t, look + 0.3, 1.2, ease.linear),
          reveal: 'write',
        },
      );
      ctx.restore();
    }

    cite(f, 'Numbers 21:8', moses - 0.2, lifted - 0.3);
    cite(f, 'John 3:14', lifted - 0.2, harder + 0.4);
    cite(f, 'Ellen G. White, Manuscript Releases, vol. 13', dnc - 0.2, f.dur);
  },
};
