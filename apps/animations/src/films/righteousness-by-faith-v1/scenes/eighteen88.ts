import { drawFigure } from '../figure.ts';
import { at, drawing, write } from '@bible/film/canvas';
import { hash2, clamp, ease, lerp, progress } from '@bible/film/core';
import { C, F, cite, hand, quote, sheet, star, tablets } from '../kit.ts';
import { angel, glow, newspaper, silhouette, stamp } from './props-3.ts';

/** Minneapolis, 1888: two editors, a most precious message, the third angel. */
export const eighteen88 = drawing({
  enter: { kind: 'ink', dur: 0.9, color: C.clay },
  lead: 0.7,
  timeline: {
    /** The year, stamped big onto the page. */
    yearStamp: { mark: 'year', offset: -0.2, dur: 0.6, ease: 'outBack' },
  },
  knobs: {
    /** Where MINNEAPOLIS sits, between the masthead rules (y 210) and the columns (y 250), in the page's own (moving, tilted) space. */
    city: [960, 242],
  },
  draw: (f) => {
    const { ctx, t } = f;
    const names = f.mark('names');
    const lost = f.mark('lost');
    const precious = f.mark('precious');
    const asked = f.mark('asked');
    const verity = f.mark('verity');

    // ── The newspaper page ──────────────────────────────────────────────────
    const away = progress(t, asked, 1.4, ease.inOutCubic);
    if (away < 1) {
      // At 0.9 about the frame's centre, the masthead clears the cite slot (top left).
      at(ctx, { x: 96 - away * 2100, y: 57, rot: -0.015 * (1 - away), scale: 0.9 }, () => {
        newspaper(ctx, 300, 70, 1320, 1000, 'GENERAL CONFERENCE', f.hand('paper'));
        const [cityX, cityY] = f.knob('city');
        write(
          ctx,
          'MINNEAPOLIS',
          cityX,
          cityY,
          {
            family: F.display,
            size: 34,
            weight: 600,
            color: C.inkSoft,
            align: 'center',
            tracking: 0.4,
          },
          f.hand('city'),
          { boil: 0.2 },
        );

        // The year, stamped big; it steps back when the portraits arrive.
        const yp = f.at('yearStamp');
        const shrink = progress(t, names - 0.3, 0.9, ease.inOutCubic);
        if (yp > 0)
          write(
            ctx,
            '1888',
            960,
            lerp(560, 360, shrink),
            {
              family: F.display,
              size: lerp(300, 120, shrink),
              weight: 800,
              color: C.orange,
              align: 'center',
            },
            f.hand('year'),
            {
              progress: yp,
              reveal: 'pop',
            },
          );

        // The two editors, as silhouettes.
        silhouette(
          ctx,
          660,
          740,
          0.62,
          'A. T. Jones',
          progress(t, names - 0.1, 1, ease.outBack),
          f.hand('jones'),
        );
        silhouette(
          ctx,
          1260,
          740,
          0.62,
          'E. J. Waggoner',
          progress(t, names + 1, 1, ease.outBack),
          f.hand('waggoner'),
        );

        // A church that had lost sight of Jesus: heads bowed over the law.
        const crowd = progress(t, lost - 0.2, 1);
        if (crowd > 0) {
          ctx.save();
          ctx.globalAlpha *= crowd;
          tablets(ctx, 960, 940, 0.3, f.hand('smalltabs'));
          for (let i = 0; i < 6; i++) {
            const side = i < 3 ? -1 : 1;
            const x = 960 + side * (110 + (i % 3) * 70);
            const pop = progress(t, lost + i * 0.12, 0.6, ease.outBack);
            if (pop <= 0) continue;
            at(ctx, { x, y: 950, scale: 0.2 * pop, sx: side }, () =>
              drawFigure(
                ctx,
                { headTilt: 0.35, lean: 0.08, armL: 0.5, armR: 0.5, elbowL: 0.9, elbowR: 0.9 },
                { robe: C.teal, skin: C.tealPale, ink: C.ink, hair: C.ink, face: 'shut' },
                f.hand(`crowd${i}`),
              ),
            );
          }
          ctx.restore();
        }

        stamp(
          ctx,
          960,
          540,
          ['A MOST PRECIOUS', 'MESSAGE'],
          progress(t, precious - 0.1, 0.5, ease.outCubic),
          f.hand('stamp'),
        );
      });
    }
    cite(f, 'Ellen G. White, Testimonies to Ministers, 91', precious - 0.2, asked + 0.3);

    // ── The sky of Revelation 14 ────────────────────────────────────────────
    const sky = progress(t, asked, 1.4, ease.inOutCubic);
    if (sky > 0) {
      at(ctx, { x: (1 - sky) * 2100, y: 0 }, () => {
        sheet(ctx, C.night, f.hand('sky'));
        for (let i = 0; i < 90; i++)
          star(
            ctx,
            hash2(i, 1) * 1920,
            hash2(i, 2) * 1080,
            3 + hash2(i, 3) * 8,
            i % 6 === 0 ? C.gold : C.robe,
            0.4 + 0.5 * Math.abs(Math.sin(t * 1.5 + i)),
          );
        const fly = progress(t, asked + 0.6, verity + 1.6 - asked, ease.inOutSine);
        const ax = lerp(-250, 1500, fly);
        const ay = 470 + Math.sin(fly * Math.PI * 1.5) * 40;
        glow(ctx, ax, ay, 420, 0.6, '230, 179, 71');
        at(ctx, { x: ax, y: ay, sx: -1 }, () => angel(ctx, 0, 0, 0.55, t * 5, f.hand('angel')));
        const label = clamp(progress(t, asked + 1.6, 1.2, ease.linear));
        if (label > 0)
          write(
            ctx,
            'the third angel · Revelation 14',
            ax + 20,
            ay + 190,
            { ...hand(46, C.gold), align: 'center' },
            f.hand('rev'),
            {
              progress: label,
              reveal: 'write',
              alpha: 1 - progress(t, verity - 0.4, 0.5),
            },
          );
      });
    }
    quote(f, '“It is the third angel’s message in verity.”', 960, 730, 1500, {
      from: 'verity',
      size: 84,
      align: 'center',
      color: C.robe,
    });
    cite(f, 'Ellen G. White, Review and Herald, April 1, 1890', verity - 0.2, f.dur);
  },
});
