// The credits, over the landing's last shot: the camera goes on easing back
// from where `thesis` leaves the city, the two of them still sitting together
// on the rooftop, while the film's name and its sources roll up a torn paper
// strip at the left. The sources are each beat's `cite`, by author and work
// (`credits.ts`). Then the strip goes and the city holds, clear, for the end
// screens. It does not breathe: the film has stopped breathing by its last
// card, and the pull back is its only move.

import {
  type Camera,
  drawing,
  knobCamera,
  probePlate,
  rectShape,
  shotPath,
  write,
} from '@bible/film/canvas';
import { clamp } from '@bible/film/core';
import { landingSky, rooftop } from '../city.ts';
import { C, F, glow, piece } from '../kit.ts';
import { CREDITS } from '../credits.ts';

const STYLES = {
  name: { family: F.display, size: 52, weight: 700, color: C.ink, align: 'center' },
  head: { family: F.display, size: 30, weight: 700, color: C.ink, align: 'center' },
  item: { family: F.body, size: 26, color: C.inkSoft, align: 'center' },
} as const;
/** Each line's height by its type. */
const LEADING = { name: 72, head: 46, item: 38 } as const;

/** Each line's baseline down the roll from its top. */
const BASELINES = CREDITS.reduce<number[]>((ys, c, i) => {
  ys.push((i === 0 ? 0 : (ys[i - 1] ?? 0)) + c.gap + LEADING[c.kind]);
  return ys;
}, []);
/** Each line's hand key, made once. */
const KEYS = CREDITS.map((_, i) => `credit${i}`);

/** The torn paper strip the credits roll up, at the frame's left, clear of the rooftop. */
const STRIP = { x: 90, y: 70, w: 700, h: 940 } as const;
const STRIP_SHAPE = rectShape(STRIP.x, STRIP.y, STRIP.w, STRIP.h);
/** How far inside the strip's top and bottom a line fades out, and the margin it never crosses. */
const FADE = 90;
const MARGIN = 24;

/**
 * Where the roll's top stands as it starts and as it ends. It starts with the
 * film's name just risen through the bottom fade, whole, as the strip arrives,
 * and ends with the last line whole just under the top fade, as the strip
 * goes: never a moment of empty plate.
 */
const LAST = CREDITS.length - 1;
const TOP_FROM = STRIP.y + STRIP.h - MARGIN - FADE - (BASELINES[0] ?? 0);
const TOP_TO =
  STRIP.y + MARGIN + FADE + STYLES[CREDITS[LAST]?.kind ?? 'item'].size - (BASELINES[LAST] ?? 0);

export const end = drawing({
  drift: 0,
  timeline: {
    // The strip comes in, the credits roll up it, and it goes: the rest is clear for the end screens.
    stripIn: { scene: 'start', dur: 0.8 },
    roll: { scene: 'start', dur: 22, ease: 'linear' },
    stripOut: { after: 'roll', dur: 0.8 },
    // The pull back, from where `thesis` leaves the city, settling as the strip goes.
    back: { with: 'roll', dur: 24, ease: 'inOutSine' },
  },
  knobs: {
    // Where `thesis` leaves the city (its `city` knob), and the wider city the card ends on.
    from: [1200, 640],
    fromZoom: 1.3,
    wide: [1060, 560],
    wideZoom: 1,
  },
  draw: (f) => {
    const { ctx, w, h } = f;
    landingSky(ctx, w, h);
    glow(ctx, 960, 380, 750, C.glow, 0.55);
    const cam: Camera = shotPath(knobCamera(f.knob('from'), f.knob('fromZoom')), [
      [f.at('back'), knobCamera(f.knob('wide'), f.knob('wideZoom'))],
    ]);
    // `thesis`'s rooftop, its paper cut as it was, the two turned to each other.
    rooftop(ctx, w, h, f.handsOf('thesis'), cam, 1);

    const shown = f.at('stripIn') * (1 - f.at('stripOut'));
    if (shown <= 0) return;
    ctx.save();
    ctx.globalAlpha *= shown;
    piece(ctx, STRIP_SHAPE, C.cream, f.hand('strip'), {
      role: 'scenery',
      kind: 'cut',
      line: 0,
      torn: 3,
      shadow: 0.5,
    });
    // The roll rises from its first line at the bottom to its last at the
    // top; a line shows only while it is wholly on the strip, fading at its
    // top and bottom.
    const top = TOP_FROM + f.at('roll') * (TOP_TO - TOP_FROM);
    const cx = STRIP.x + STRIP.w / 2;
    probePlate(ctx, STRIP_SHAPE, () =>
      CREDITS.forEach((c, i) => {
        const y = top + (BASELINES[i] ?? 0);
        const above = y - STYLES[c.kind].size - STRIP.y - MARGIN;
        const below = STRIP.y + STRIP.h - MARGIN - y;
        if (above < 0 || below < 0) return;
        write(ctx, c.text, cx, y, STYLES[c.kind], f.hand(KEYS[i] ?? i), {
          alpha: clamp(Math.min(above, below) / FADE),
          boil: 0,
        });
      }),
    );
    ctx.restore();
  },
});
