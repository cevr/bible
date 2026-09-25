import { at, cutout } from '../../../engine/cutout.ts';
import { ellipseShape, rectShape } from '../../../engine/ink.ts';
import { hash2 } from '../../../engine/random.ts';
import { clamp, ease, envelope, lerp, progress } from '../../../engine/time.ts';
import { write } from '../../../engine/type.ts';
import { C, F, cite, hand, quote, star, sun } from '../kit.ts';
import type { Drawing } from './index.ts';
import { HILL, HILL_DARK, SEA, SKY, flower, hills, tree } from './props-1.ts';

/** Where righteousness comes from: back to the beginning, where the word made what it said. */
export const voidScene: Drawing = {
  enter: { kind: 'ink', dur: 0.9, color: C.night },
  draw: (f) => {
    const { ctx, t } = f;
    const back = f.mark('back');
    const dark = f.mark('dark');
    const spoke = f.mark('spoke');
    const spake = f.mark('spake');
    const atj = f.mark('atj');
    const produced = f.mark('produced');

    // ── "So where does righteousness come from?" A gold question mark.
    const qIn = progress(t, 0.3, 0.8, ease.outBack);
    const qOut = progress(t, back + 0.2, 0.6);
    if (qIn > 0 && qOut < 1) {
      ctx.save();
      ctx.globalAlpha *= 1 - qOut;
      write(ctx, '?', 960, 700, { ...hand(460, C.gold), align: 'center' }, f.hand('q'), {
        progress: qIn,
        reveal: 'pop',
      });
      write(
        ctx,
        'where does righteousness come from',
        960,
        860,
        { ...hand(56, C.inkSoft), align: 'center' },
        f.hand('where'),
        {
          progress: progress(t, 0.6, 1.4, ease.linear),
          reveal: 'write',
        },
      );
      ctx.restore();
    }

    // ── "Go back to the beginning": pages riffle backwards.
    for (let i = 0; i < 7; i++) {
      const p = progress(t, back + 0.2 + i * 0.16, 0.55, ease.inOutCubic);
      if (p <= 0 || p >= 1) continue;
      const x = lerp(2300, -400, p);
      const flip = Math.cos(p * Math.PI);
      at(ctx, { x, y: 540, sx: Math.max(0.08, Math.abs(flip)), rot: (p - 0.5) * 0.3 }, () =>
        cutout(
          ctx,
          rectShape(-300, -380, 600, 760),
          { color: i % 2 === 0 ? C.robe : '#efe4cc', torn: 2, rim: 0, shadow: 0.6, grain: 0.3 },
          f.hand(`page${i}`),
        ),
      );
    }

    // ── Darkness: a night sheet opens from the centre and fills the page.
    const night = progress(t, dark - 0.3, 1.3, ease.inOutCubic);
    const dawn = progress(t, atj - 0.2, 2.2, ease.inOutCubic);
    if (night > 0) {
      const r = night * 1250;
      ctx.save();
      cutout(
        ctx,
        ellipseShape(960, 540, r, r, 80),
        { color: C.night, torn: 6, rim: 3, shadow: 0.6, grain: 0.9 },
        f.hand('night'),
      );
      // Drifting specks — the only thing in the dark.
      for (let i = 0; i < 40; i++) {
        const x = (hash2(i, 1) * 2000 + t * 6 * (hash2(i, 2) - 0.5)) % 1920;
        const y = hash2(i, 3) * 1080;
        if (Math.hypot(x - 960, y - 540) > r) continue;
        star(ctx, x, y, 2 + hash2(i, 4) * 4, C.robe, 0.25 + 0.2 * Math.sin(t * 1.5 + i));
      }
      ctx.restore();
    }
    // "Emptiness": the Hebrew of Genesis 1:2, and what it means.
    const tohu = envelope(t, dark + 1.2, spoke - 0.3, 0.8, 0.8);
    if (tohu > 0) {
      ctx.save();
      ctx.globalAlpha *= tohu;
      write(
        ctx,
        'תֹהוּ וָבֹהוּ',
        960,
        560,
        { family: F.hebrew, size: 130, weight: 400, color: C.rose, align: 'center' },
        f.hand('tohu'),
        { progress: progress(t, dark + 1.2, 1.4, ease.linear) },
      );
      write(
        ctx,
        '“without form, and void” — Genesis 1:2',
        960,
        660,
        { ...hand(44, C.tealPale), align: 'center' },
        f.hand('gloss'),
        {
          progress: progress(t, dark + 1.8, 1.4, ease.linear),
          reveal: 'write',
        },
      );
      ctx.restore();
    }

    // ── Dawn: sky, sea and hills tear in behind the word's light.
    if (dawn > 0) {
      ctx.save();
      ctx.globalAlpha *= dawn;
      cutout(
        ctx,
        rectShape(-40, -40, 2000, 1160),
        { color: SKY, torn: 4, rim: 0, shadow: 0, grain: 0.7 },
        f.hand('sky'),
      );
      ctx.restore();
    }

    // ── God spoke: one word, written in light, bursts into a sun.
    const writeP = progress(t, spoke - 0.1, 0.9, ease.linear);
    const burst = progress(t, spake - 0.1, 0.6, ease.inCubic);
    if (writeP > 0 && burst < 1) {
      ctx.save();
      ctx.globalAlpha *= 1 - burst;
      const s = 1 + burst * 0.8;
      at(ctx, { x: 960, y: 560, scale: s }, () =>
        write(ctx, 'light', 0, 60, { ...hand(220, C.gold), align: 'center' }, f.hand('light'), {
          progress: writeP,
          reveal: 'write',
        }),
      );
      ctx.restore();
    }
    const sunGrow = progress(t, spake - 0.2, 1.4, ease.outCubic);
    const sunMove = progress(t, atj, 2.2, ease.inOutCubic);
    const sx = lerp(960, 330, sunMove);
    const sy = lerp(520, 400, sunMove);
    const sr = lerp(130, 80, sunMove);
    sun(ctx, sx, sy, sr, sunGrow, f.hand('sun'), t * 0.05);

    // Sea and hills rise from below.
    const sea = progress(t, atj + 0.2, 1.4, ease.outCubic);
    if (sea > 0) {
      ctx.save();
      ctx.translate(0, (1 - sea) * 500);
      cutout(
        ctx,
        rectShape(-40, 720, 2000, 400),
        { color: SEA, torn: 5, rim: 3, shadow: 0.5, grain: 0.7 },
        f.hand('sea'),
      );
      ctx.restore();
    }
    const land = progress(t, atj + 0.8, 1.4, ease.outCubic);
    if (land > 0) {
      ctx.save();
      ctx.translate(0, (1 - land) * 600);
      hills(ctx, 820, HILL, f.hand('hill1'), 3);
      ctx.translate(0, 60);
      hills(ctx, 900, HILL_DARK, f.hand('hill2'), 9);
      ctx.restore();
    }
    const trees: Array<[number, number]> = [
      [380, 850],
      [620, 880],
      [1300, 860],
      [1560, 890],
      [1760, 850],
    ];
    trees.forEach(([x, y], i) =>
      tree(ctx, x, y, progress(t, atj + 2 + i * 0.3, 0.6, ease.outBack) * 1.1, f.hand(`tree${i}`)),
    );
    // "The word spoken, itself produced the thing" — flowers answer each word.
    for (let i = 0; i < 14; i++) {
      const x = 120 + i * 130 + hash2(i, 8) * 60;
      const y = 930 + hash2(i, 9) * 50;
      const colors = [C.rose, C.robe, C.gold, C.orange];
      flower(
        ctx,
        x,
        y,
        progress(t, produced + i * 0.14, 0.5, ease.outBack) * 1.2,
        colors[i % 4] ?? C.rose,
        f.hand(`fl${i}`),
      );
    }

    // Words.
    const dayText = clamp(dawn * 2);
    quote(f, '“He spake, and it was done.”', 960, 200, 1400, {
      from: 'spake',
      to: 'atj',
      until: atj + 0.6,
      size: 72,
      align: 'center',
      color: C.robe,
    });
    cite(f, 'Psalm 33:9', spake - 0.2, atj + 0.6);
    quote(
      f,
      '“He spoke the word only, and it was so. The word spoken, itself produced the thing.”',
      1080,
      190,
      1400,
      {
        from: 'jones',
        size: 58,
        align: 'center',
        color: dayText > 0.5 ? C.ink : C.robe,
      },
    );
    cite(f, 'A. T. Jones, Lessons on Faith', f.mark('jones') - 0.2, f.dur);
  },
};
