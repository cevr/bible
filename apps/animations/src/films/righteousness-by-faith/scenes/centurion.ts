import { at, cutout } from '../../../engine/cutout.ts';
import type { Frame } from '../../../engine/film.ts';
import { drawFigure } from '../../../engine/figure.ts';
import { type Pt, cubic, line, rectShape, stroke } from '../../../engine/ink.ts';
import { hash2 } from '../../../engine/random.ts';
import { clamp, ease, envelope, lerp, progress } from '../../../engine/time.ts';
import { write } from '../../../engine/type.ts';
import { C, cite, hand, quote, star, wordCard } from '../kit.ts';
import type { Drawing } from './index.ts';
import { bed, beard, helmet, plane } from './props-1.ts';

const FOLD = 1110;
const ROOM = '#f2ddb5';

/** Local start time of the first spoken word matching `text`. */
const wordAt = (f: Frame, text: string, after = 0) =>
  f.words.find((w) => w.start >= after && w.text.toLowerCase().replace(/[^a-z]/g, '') === text)
    ?.start ?? f.dur;

/** "Speak the word only": the word crosses the distance, and faith is expecting it to. */
export const centurion: Drawing = {
  enter: { kind: 'pan', dur: 1 },
  draw: (f) => {
    const { ctx, t } = f;
    const servant = f.mark('servant');
    const jesus = f.mark('jesus');
    const only = f.mark('only');
    const house = f.mark('house');
    const alone = f.mark('alone');
    const healed = f.mark('healed');
    const story = f.mark('story');
    const faith = f.mark('faith');

    // The whole story slides away when the definition arrives.
    const away = progress(t, story - 0.1, 1.1, ease.inOutCubic);
    ctx.save();
    ctx.translate(-away * 2000, 0);

    // ── The far room: a warm sheet beyond a torn fold, under a red roof.
    const room = progress(t, servant - 0.3, 0.9, ease.outCubic);
    if (room > 0) {
      ctx.save();
      ctx.translate((1 - room) * 900, 0);
      cutout(
        ctx,
        rectShape(FOLD, 340, 900, 780),
        { color: ROOM, torn: 6, rim: 4, shadow: 0.8, grain: 0.7 },
        f.hand('room'),
      );
      cutout(
        ctx,
        [
          [FOLD - 40, 360],
          [FOLD + 400, 250],
          [FOLD + 840, 360],
        ],
        { color: C.red, torn: 4, rim: 3, shadow: 0.6 },
        f.hand('roof'),
      );
      write(
        ctx,
        'far away',
        FOLD + 400,
        430,
        { ...hand(46, C.clay), align: 'center' },
        f.hand('far'),
        {
          progress: progress(t, servant + 0.4, 0.8, ease.linear),
          reveal: 'write',
        },
      );
      bed(ctx, 1500, 800, 560, C.tealPale, f.hand('bed'));
      // The servant: lying ill, then rising well.
      const rise = progress(t, healed - 0.1, 1.2, ease.outBack);
      const rot = lerp(-Math.PI / 2, 0, clamp(rise));
      const fx = lerp(1580, 1680, clamp(rise));
      const fy = lerp(790, 930, clamp(rise));
      at(ctx, { x: fx, y: fy, rot, scale: 0.72 }, () => {
        drawFigure(
          ctx,
          {
            armL: 0.15 + 2.4 * rise,
            armR: 0.15 + 2.4 * rise,
            elbowL: 0.1 + 0.3 * rise,
            elbowR: 0.1 + 0.3 * rise,
          },
          {
            robe: rise > 0.5 ? C.robe : C.tealPale,
            skin: C.skin,
            ink: C.ink,
            hair: C.clay,
            face: rise > 0.3 ? 'joy' : 'shut',
            grain: 0.6,
          },
          f.hand('servant'),
        );
      });
      // A blanket over the sick one, thrown off as they rise.
      const blanket = 1 - progress(t, healed - 0.2, 0.5);
      if (blanket > 0) {
        ctx.save();
        ctx.globalAlpha *= blanket;
        cutout(
          ctx,
          [
            [1330, 745],
            [1610, 735],
            [1630, 815],
            [1320, 818],
          ],
          { color: C.teal, torn: 3, rim: 2, shadow: 0.5 },
          f.hand('blanket'),
        );
        ctx.restore();
      }
      // Sparkles where the word lands.
      const spark = envelope(t, healed - 0.2, healed + 2.2, 0.3, 0.9);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const d = 140 + 60 * progress(t, healed - 0.2, 1.4, ease.outCubic);
        star(
          ctx,
          1680 + Math.cos(a) * d,
          660 + Math.sin(a) * d * 0.8,
          14 + 8 * hash2(i, 2),
          i % 2 ? C.gold : C.orange,
          spark,
        );
      }
      ctx.restore();
    }

    // ── The centurion: red cloak, crested helmet.
    const cIn = progress(t, 0.1, 0.8, ease.outBack);
    const stop = envelope(t, only - 0.4, house + 0.4, 0.4, 0.6);
    const cheer = progress(t, healed + 0.3, 0.6);
    at(ctx, { x: 330, y: 940, scale: 0.95 * cIn }, () => {
      drawFigure(
        ctx,
        {
          armR: 0.15 + 1.6 * stop + 2.3 * cheer,
          elbowR: 0.1 - 0.9 * stop,
          armL: 0.15 + 2.3 * cheer,
        },
        {
          robe: C.red,
          skin: C.skin,
          ink: C.ink,
          face: cheer > 0.5 ? 'joy' : t > servant && t < only ? 'sad' : 'calm',
        },
        f.hand('centurion'),
      );
      helmet(ctx, f.hand('helmet'));
    });
    write(ctx, 'a centurion', 330, 470, { ...hand(46, C.red), align: 'center' }, f.hand('cLabel'), {
      progress: progress(t, 0.5, 0.8, ease.linear) * (1 - progress(t, jesus, 0.5)),
      reveal: 'write',
    });

    // ── Jesus: offers to come, is stopped, and speaks the word from where he stands.
    const jIn = progress(t, jesus - 0.4, 0.8, ease.outBack);
    const walk =
      progress(t, jesus + 0.6, 1.4, ease.inOutQuad) *
      (1 - progress(t, only + 0.2, 0.8, ease.inOutCubic));
    const speak = envelope(t, alone - 0.3, healed + 0.8, 0.3, 0.6);
    if (jIn > 0) {
      const jx = 760 + walk * 150;
      const bob = Math.abs(Math.sin(t * 7)) * 10 * walk;
      at(ctx, { x: jx, y: 940 - bob, scale: 1 * jIn }, () => {
        drawFigure(
          ctx,
          { armR: 0.15 + 1.9 * speak, elbowR: 0.1 + 0.3 * speak, lean: 0.03 * walk },
          { robe: C.robe, skin: C.skin, ink: C.ink, hair: C.clay, face: 'calm' },
          f.hand('jesus'),
        );
        beard(ctx, C.clay, f.hand('beard'));
        // A gold sash.
        stroke(
          ctx,
          line([-70, -290], [80, -150], 0.04, 3),
          { color: C.gold, width: 22, taper: 0.02 },
          f.hand('sash'),
        );
      });
      // The road toward the house — offered, then not needed.
      const road = progress(t, jesus + 0.4, 1.3);
      if (road > 0) {
        const pts: Pt[] = cubic([900, 925], [960, 918], [1030, 912], [FOLD - 10, 905]);
        for (let i = 0; i < 6; i++) {
          const a = pts[Math.round((i / 6) * (pts.length - 1))] ?? [0, 0];
          const b = pts[Math.round(((i + 0.5) / 6) * (pts.length - 1))] ?? [0, 0];
          if (i / 6 < road)
            stroke(ctx, [a, b], { color: C.inkSoft, width: 5, alpha: 0.6 }, f.hand(`road${i}`));
        }
        const no = progress(t, house + 0.2, 0.5);
        if (no > 0) {
          stroke(
            ctx,
            line([965, 870], [1055, 945], 0.02, 1),
            { color: C.red, width: 10, progress: no },
            f.hand('no1'),
          );
          stroke(
            ctx,
            line([1055, 870], [965, 945], 0.02, 2),
            { color: C.red, width: 10, progress: clamp(no * 2 - 1) },
            f.hand('no2'),
          );
        }
      }
    }

    // ── The word flies: a paper plane carrying it across the fold.
    const fly = progress(t, alone + 0.2, 1.8, ease.inOutCubic);
    if (fly > 0 && fly < 1) {
      const path = cubic([880, 520], [1050, 330], [1300, 380], [1480, 720], 80);
      const i = Math.min(path.length - 2, Math.floor(fly * (path.length - 1)));
      const p = path[i] ?? [0, 0];
      const q = path[i + 1] ?? p;
      const angle = Math.atan2(q[1] - p[1], q[0] - p[0]);
      // A dotted trail behind it.
      for (let k = 0; k < i; k += 4) {
        const d = path[k] ?? [0, 0];
        ctx.save();
        ctx.globalAlpha *= 0.5;
        ctx.fillStyle = C.gold;
        ctx.beginPath();
        ctx.arc(d[0], d[1], 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      at(ctx, { x: p[0], y: p[1], rot: angle }, () => plane(ctx, 1.5, f.hand('plane')));
      write(
        ctx,
        'the word',
        p[0],
        p[1] + 90,
        { ...hand(48, C.orange), align: 'center' },
        f.hand('planeText'),
        { boil: 0.4 },
      );
    }
    ctx.restore();

    // ── Quotes and sources over the story.
    quote(f, '“Speak the word only, and my servant shall be healed.”', 960, 190, 1500, {
      from: 'only',
      to: 'house',
      until: story - 0.3,
      size: 62,
      align: 'center',
    });
    cite(f, 'Matthew 8:8', only - 0.2, story);

    // ── Jones's definition, on its own clean page.
    const bookIn = progress(t, story + 0.8, 0.7, ease.outBack);
    const bookOut = progress(t, faith - 0.4, 0.6);
    if (bookIn > 0 && bookOut < 1) {
      ctx.save();
      ctx.globalAlpha *= 1 - bookOut;
      at(ctx, { x: 960, y: 620, scale: bookIn, rot: -0.04 }, () => {
        cutout(
          ctx,
          rectShape(-170, -230, 340, 460),
          { color: C.clay, torn: 2, rim: 3, shadow: 0.8, grain: 0.8 },
          f.hand('cover'),
        );
        cutout(
          ctx,
          rectShape(-130, -150, 260, 150),
          { color: C.robe, torn: 2, rim: 0, shadow: 0.3 },
          f.hand('plate'),
        );
        write(
          ctx,
          'Lessons',
          0,
          -95,
          { family: 'Fraunces', size: 46, weight: 700, color: C.ink, align: 'center' },
          f.hand('bt1'),
          { boil: 0.3 },
        );
        write(
          ctx,
          'on Faith',
          0,
          -40,
          { family: 'Fraunces', size: 46, weight: 700, color: C.ink, align: 'center' },
          f.hand('bt2'),
          { boil: 0.3 },
        );
        write(ctx, 'A. T. Jones', 0, 90, { ...hand(40, C.glow), align: 'center' }, f.hand('bt3'), {
          boil: 0.3,
        });
      });
      ctx.restore();
    }
    wordCard(f, 960, 300, 'FAITH', { start: story + 0.4, until: faith - 0.5 });

    quote(
      f,
      '“Faith is the expecting the word of God to do what it says and the depending upon that word to do what it says.”',
      960,
      330,
      1500,
      {
        from: 'faith',
        size: 70,
        align: 'center',
      },
    );
    // Underline the two verbs of faith as they are spoken.
    const exp = wordAt(f, 'expecting', faith);
    const dep = wordAt(f, 'depending', faith);
    const tags: Array<[number, string, number]> = [
      [exp, 'expect it', 640],
      [dep, 'depend on it', 1280],
    ];
    tags.forEach(([at0, label, x], i) => {
      const p = progress(t, at0 + 0.1, 0.7, ease.outBack);
      if (p <= 0) return;
      at(ctx, { x, y: 780, scale: p, rot: i === 0 ? -0.05 : 0.05 }, () => {
        cutout(
          ctx,
          rectShape(-190, -60, 380, 110),
          { color: C.gold, torn: 3, rim: 3, shadow: 0.6 },
          f.hand(`tag${i}`),
        );
        write(ctx, label, 0, 16, { ...hand(58, C.ink), align: 'center' }, f.hand(`tagT${i}`), {
          boil: 0.4,
        });
      });
    });
    cite(f, 'A. T. Jones, Lessons on Faith', faith - 0.3, f.dur);
  },
};
