// Built things for a painted plate: houses and columns as lit volumes. A
// house is a box of wall seen nearly square on, its front face in the key's
// light, its side face turned into the shade, a parapet catching the light
// along its top, its windows and door dark or lit from inside. A column is
// a shaft shaded round, lit down one side, cool down the other. Each draws
// in world px, flat masses a painting's brush then paints over.

import { type Hex, clearOf, mix } from './colour.ts';

/** The light a built thing stands in: where it comes from, its warmth and its shade. */
export interface BuildLight {
  /** 1 lights from the left (the front and left faces lit), −1 from the right. */
  readonly side: 1 | -1;
  readonly key: Hex;
  readonly shade: Hex;
}

/** An opening in a face: where it sits (fractions of the face) and whether a lamp burns inside. */
export interface Opening {
  /** Left and top, as fractions of the face's width and height. */
  readonly u: number;
  readonly v: number;
  /** Width and height, as fractions. */
  readonly w: number;
  readonly h: number;
  /** A warm lamp inside, its colour; dark when none. */
  readonly lamp?: Hex;
  /** Arched top. */
  readonly arch?: boolean;
}

export interface House {
  /** The front face's left foot, in world px, and its size. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** How wide the side face shows, in px: on the right when the light is from the left. */
  readonly side: number;
  readonly wall: Hex;
  readonly light: BuildLight;
  readonly openings?: ReadonlyArray<Opening>;
  /** A low wall round the flat roof. Defaults to true. */
  readonly parapet?: boolean;
  /** Beams poking through the wall under the roof. Defaults to true. */
  readonly beams?: boolean;
}

/** A house: the side face in shade, the front face lit, the parapet's lit edge, its openings. */
export const house = (ctx: CanvasRenderingContext2D, b: House) => {
  ctx.save();
  const { x, y, w, h, side, wall, light } = b;
  const lit = mix(wall, light.key, 0.35);
  const shade = mix(wall, light.shade, 0.55);
  const away = light.side;
  // The side face, away from the light, slanting back.
  const sx = away > 0 ? x + w : x;
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.moveTo(sx, y);
  ctx.lineTo(sx, y - h);
  ctx.lineTo(sx + away * side, y - h - side * 0.18);
  ctx.lineTo(sx + away * side, y - side * 0.08);
  ctx.closePath();
  ctx.fill();
  // The front face: lit, a little warmer high up, cooler toward the ground.
  const g = ctx.createLinearGradient(0, y - h, 0, y);
  g.addColorStop(0, lit);
  g.addColorStop(0.7, mix(lit, wall, 0.5));
  g.addColorStop(1, mix(wall, light.shade, 0.25));
  ctx.fillStyle = g;
  ctx.fillRect(x, y - h, w, h);
  // The parapet's lip along the top, catching the light.
  if (b.parapet !== false) {
    ctx.fillStyle = mix(lit, light.key, 0.3);
    ctx.fillRect(x - 3, y - h - 8, w + 6, 10);
  }
  // Roof beams poking through under the roof line, each with its shadow.
  if (b.beams !== false) {
    const n = Math.max(2, Math.round(w / 60));
    for (let i = 0; i < n; i++) {
      const bx = x + ((i + 0.5) / n) * w;
      ctx.fillStyle = mix(wall, '#2a1a12', 0.6);
      ctx.fillRect(bx - 5, y - h + 14, 10, 9);
      ctx.fillStyle = mix(shade, '#000000', 0.2);
      ctx.fillRect(bx - 5 + 4 * away, y - h + 23, 10, 6);
    }
  }
  for (const o of b.openings ?? []) {
    const ox = x + o.u * w;
    const oy = y - h + o.v * h;
    const ow = o.w * w;
    const oh = o.h * h;
    const path = () => {
      ctx.beginPath();
      if (o.arch === true) {
        ctx.moveTo(ox, oy + oh);
        ctx.lineTo(ox, oy + ow / 2);
        ctx.arc(ox + ow / 2, oy + ow / 2, ow / 2, Math.PI, 0);
        ctx.lineTo(ox + ow, oy + oh);
        ctx.closePath();
      } else ctx.rect(ox, oy, ow, oh);
    };
    // The reveal: the wall's thickness on the lit side of the opening, in shade.
    ctx.fillStyle = shade;
    ctx.fillRect(ox - 4 * away, oy - 2, ow + 4, oh + 2);
    path();
    if (o.lamp !== undefined) {
      const lg = ctx.createRadialGradient(
        ox + ow / 2,
        oy + oh * 0.6,
        0,
        ox + ow / 2,
        oy + oh * 0.6,
        Math.max(ow, oh),
      );
      lg.addColorStop(0, mix(o.lamp, '#ffffff', 0.4));
      lg.addColorStop(0.6, o.lamp);
      lg.addColorStop(1, mix(o.lamp, '#3a1a10', 0.5));
      ctx.fillStyle = lg;
    } else ctx.fillStyle = mix(wall, '#120c10', 0.82);
    ctx.fill();
  }
  ctx.restore();
};

export interface Column {
  /** The shaft's foot centre, its width and height, in world px. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly stone: Hex;
  readonly light: BuildLight;
}

/** A column: a shaft shaded round, its capital and base, lit down the key's side. */
export const column = (ctx: CanvasRenderingContext2D, c: Column) => {
  ctx.save();
  const { x, y, w, h, stone, light } = c;
  const lit = mix(stone, light.key, 0.4);
  const shade = mix(stone, light.shade, 0.6);
  const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  const [a, b] = light.side > 0 ? [lit, shade] : [shade, lit];
  g.addColorStop(0, mix(a, b, 0.25));
  g.addColorStop(light.side > 0 ? 0.28 : 0.72, light.side > 0 ? a : b);
  g.addColorStop(light.side > 0 ? 0.75 : 0.25, light.side > 0 ? b : a);
  g.addColorStop(1, mix(b, light.shade, 0.3));
  ctx.fillStyle = g;
  ctx.fillRect(x - w / 2, y - h, w, h);
  // Flutes: faint shade lines down the shaft.
  ctx.fillStyle = mix(shade, '#000000', 0.15);
  ctx.save();
  ctx.globalAlpha *= 0.35;
  for (let k = 1; k < 5; k++) ctx.fillRect(x - w / 2 + (k * w) / 5 - 1, y - h + 20, 2, h - 40);
  ctx.restore();
  // Capital and base: wider slabs, their tops in the light.
  for (const [cy, ch] of [
    [y - h - 14, 22],
    [y - 18, 18],
  ] as const) {
    ctx.fillStyle = shade;
    ctx.fillRect(x - w * 0.68, cy, w * 1.36, ch);
    ctx.fillStyle = lit;
    ctx.fillRect(x - w * 0.68, cy, w * 1.36, ch * 0.35);
  }
  // A shadow cast on the ground beside it, away from the light.
  const sg = ctx.createLinearGradient(x, y, x + light.side * h * 0.5, y);
  sg.addColorStop(0, light.shade);
  sg.addColorStop(1, clearOf(light.shade));
  ctx.fillStyle = sg;
  ctx.save();
  ctx.globalAlpha *= 0.4;
  ctx.fillRect(Math.min(x, x + light.side * h * 0.5), y - 4, h * 0.5, 14);
  ctx.restore();
  ctx.restore();
};
