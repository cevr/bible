// A face in firelight: one listener, close, in profile, turned toward the
// teacher off frame left. The fire burns below the frame's lower left, so
// the light comes up from under: it lights the beard, the lips, the
// underside of the nose and brow, and leaves the forehead and the cloth
// over the head to the cool night, with a cold rim of moonlight down the
// back of the headcloth. The face is painted twice, by the fire and without
// it, and the fire's flicker weighs the two, so the light on it breathes
// and wavers while every stroke holds still. Embers rise past him; a near
// shoulder, out of focus, frames the lower right.

import {
  type Brush,
  type Painting,
  type Plane,
  drawPainting,
  drawing,
  glow,
  knobCamera,
  mix,
  motes,
  multiplane,
  shotPath,
  unprobed,
} from '@bible/film/canvas';
import { flicker, rng } from '@bible/film/core';
import { type Shape, rimmed, tint } from '../kit.ts';
import { palette as P } from '../palette.ts';

/** The warm band where the fire's light turns to shadow: the blood under the skin. */
const SKIN_TURN = '#b8443a' as const;

/** The head's place and size: head units (crown to chin about 1) to world px. */
const HEAD = { x: 1040, y: 430, s: 560 } as const;

/** Where the fire is, in head units: below and in front of him. */
const FIRE = [-0.95, 1.05] as const;

/** The face's front edge, forehead to chin, then the beard round under the jaw. */
const PROFILE: ReadonlyArray<readonly [number, number]> = [
  [-0.27, -0.37],
  [-0.325, -0.25],
  [-0.345, -0.15],
  [-0.338, -0.11],
  [-0.322, -0.085],
  [-0.36, -0.02],
  [-0.4, 0.045],
  [-0.418, 0.075],
  [-0.4, 0.095],
  [-0.365, 0.1],
  [-0.352, 0.12],
  [-0.366, 0.152],
  [-0.352, 0.172],
  [-0.362, 0.2],
  [-0.338, 0.232],
];

/** The beard: from under the lip, round the chin and back under the jaw to the cloth. */
const BEARD: ReadonlyArray<readonly [number, number]> = [
  [-0.345, 0.198],
  [-0.372, 0.26],
  [-0.362, 0.32],
  [-0.318, 0.375],
  [-0.24, 0.405],
  [-0.14, 0.39],
  [-0.05, 0.33],
  [0.02, 0.25],
  [-0.05, 0.16],
  [-0.12, 0.2],
  [-0.2, 0.17],
  [-0.27, 0.205],
  [-0.31, 0.185],
];

/** The headcloth's edge round the face, from the forehead back down to the jaw. */
const CLOTH_EDGE: ReadonlyArray<readonly [number, number]> = [
  [0.04, 0.26],
  [0.0, 0.08],
  [-0.06, -0.1],
  [-0.14, -0.27],
  [-0.27, -0.37],
];

const path = (ctx: CanvasRenderingContext2D, pts: ReadonlyArray<readonly [number, number]>) => {
  for (const [i, [x, y]] of pts.entries()) {
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
};

/** The skin: the profile, down into the beard, back up the cloth's edge. */
const face: Shape = (ctx) => {
  path(ctx, PROFILE);
  ctx.lineTo(-0.2, 0.26);
  ctx.lineTo(0.04, 0.26);
  path(ctx, CLOTH_EDGE);
  ctx.closePath();
};

const beard: Shape = (ctx) => {
  path(ctx, BEARD);
  ctx.closePath();
};

/** The headcloth: over the crown, down the back, onto the shoulders. */
const cloth: Shape = (ctx) => {
  ctx.moveTo(-0.3, -0.36);
  ctx.quadraticCurveTo(-0.26, -0.56, -0.02, -0.6);
  ctx.quadraticCurveTo(0.24, -0.6, 0.29, -0.3);
  ctx.quadraticCurveTo(0.33, 0.1, 0.42, 0.48);
  ctx.quadraticCurveTo(0.5, 0.62, 0.56, 0.72);
  ctx.lineTo(0.06, 0.72);
  ctx.quadraticCurveTo(0.08, 0.5, 0.04, 0.26);
  path(ctx, CLOTH_EDGE);
  ctx.closePath();
};

/** The robe over the shoulders and chest, to below the frame. */
const robe: Shape = (ctx) => {
  ctx.moveTo(-0.5, 1.3);
  ctx.quadraticCurveTo(-0.5, 0.7, -0.2, 0.5);
  ctx.lineTo(0.1, 0.5);
  ctx.quadraticCurveTo(0.7, 0.55, 0.92, 0.9);
  ctx.lineTo(1.0, 1.3);
  ctx.closePath();
};

/** The light falling on the face from the fire: white-hot near it, peach, then the red of the turn. */
const fireOn = (ctx: CanvasRenderingContext2D, fire: number, reach: number) => {
  const g = ctx.createRadialGradient(FIRE[0], FIRE[1], 0, FIRE[0], FIRE[1], reach);
  g.addColorStop(0, tint(P.fireCore, fire));
  g.addColorStop(0.5, tint(P.fireCore, fire));
  g.addColorStop(0.62, tint(P.skinLit, fire));
  g.addColorStop(0.8, tint('#e07848', fire * 0.85));
  g.addColorStop(1, tint(SKIN_TURN, 0));
  return g;
};

/** What the fire reaches on the face: its front below the brow, bounded by a hard terminator. */
const litSide: Shape = (ctx) => {
  ctx.moveTo(-0.6, -0.12);
  ctx.lineTo(-0.335, -0.112);
  ctx.quadraticCurveTo(-0.25, -0.1, -0.2, -0.02);
  ctx.quadraticCurveTo(-0.15, 0.08, -0.12, 0.17);
  ctx.quadraticCurveTo(-0.07, 0.3, 0.02, 0.36);
  ctx.lineTo(0.12, 0.9);
  ctx.lineTo(-0.6, 0.9);
  ctx.closePath();
};

/** The throat, under the beard, down into the robe. */
const neck: Shape = (ctx) => {
  ctx.moveTo(-0.17, 0.36);
  ctx.quadraticCurveTo(-0.15, 0.46, -0.17, 0.56);
  ctx.quadraticCurveTo(-0.05, 0.6, 0.06, 0.55);
  ctx.lineTo(0.04, 0.26);
  ctx.closePath();
};

/** Shadow skin: the night's teal in it. */
const SKIN_NIGHT = '#34505e' as const;

/**
 * Skin lit as a painter lights it: all of `shape` in the night's teal; then,
 * where the fire reaches (`litSide`), a red band at the turn and the fire's
 * warmth inside it, hottest nearest the flame.
 */
const skin = (ctx: CanvasRenderingContext2D, shape: Shape, fire: number) => {
  ctx.save();
  ctx.beginPath();
  shape(ctx);
  ctx.fillStyle = SKIN_NIGHT;
  ctx.fill();
  ctx.clip();
  ctx.beginPath();
  litSide(ctx);
  ctx.fillStyle = tint(SKIN_TURN, 0.35 + 0.65 * fire);
  ctx.fill();
  ctx.translate(-0.022, 0.018);
  ctx.beginPath();
  litSide(ctx);
  ctx.fillStyle = fireOn(ctx, fire, 2);
  ctx.fill();
  ctx.restore();
};

/** A soft warm highlight where the fire strikes a plane square on. */
const hot = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fire: number) => {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, tint(P.fireCore, 0.85 * fire));
  g.addColorStop(1, tint(P.fireCore, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
};

/** The man, by the fire at `fire` (0 none, 1 full): one guide, painted twice. */
const listener =
  (fire: number) =>
  (ctx: CanvasRenderingContext2D): void => {
    ctx.translate(-600 + HEAD.x, 40 + HEAD.y);
    ctx.scale(HEAD.s, HEAD.s);
    // The robe: dark wool, the fire on its front, the moon down its back.
    const moonDown = ctx.createLinearGradient(0, -0.6, 0, 1.2);
    moonDown.addColorStop(0, P.tealRim);
    moonDown.addColorStop(0.6, P.teal);
    moonDown.addColorStop(1, P.tealDeep);
    rimmed(ctx, robe, mix(P.mantleShade, P.tealDeep, 0.55), moonDown, -0.008, 0.006);
    ctx.save();
    ctx.beginPath();
    robe(ctx);
    ctx.clip();
    // Wool takes the fire as a deep ember, not as skin does.
    const wool = ctx.createRadialGradient(FIRE[0], FIRE[1], 0, FIRE[0], FIRE[1], 1.5);
    wool.addColorStop(0, tint(P.fire, 0.7 * fire));
    wool.addColorStop(0.55, tint(P.fireDeep, 0.55 * fire));
    wool.addColorStop(0.85, tint(P.mantle, 0.3 * fire));
    wool.addColorStop(1, tint(P.mantle, 0));
    ctx.fillStyle = wool;
    ctx.fillRect(-0.6, 0.4, 1.7, 1);
    ctx.strokeStyle = tint(P.night, 0.35);
    ctx.lineWidth = 0.06;
    for (const [x0, x1] of [
      [-0.1, -0.3],
      [0.15, 0.05],
      [0.4, 0.42],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(x0, 0.56);
      ctx.quadraticCurveTo(x0 - 0.04, 0.9, x1, 1.3);
      unprobed(ctx, () => ctx.stroke());
    }
    ctx.restore();
    // The throat, in the beard's shade.
    skin(ctx, neck, fire * 0.08);
    // The cloth: cool, the moon down its back from above.
    rimmed(ctx, cloth, mix(P.teal, P.tealDeep, 0.72), moonDown, -0.007, 0.007);
    ctx.save();
    ctx.beginPath();
    cloth(ctx);
    ctx.clip();
    ctx.fillStyle = fireOn(ctx, fire * 0.5, 1.15);
    ctx.fillRect(-0.4, -0.7, 1.2, 1.5);
    // Its folds, as soft darker runs down the back.
    ctx.strokeStyle = tint(P.tealDeep, 0.4);
    ctx.lineWidth = 0.05;
    for (const [x0, x1] of [
      [0.1, 0.24],
      [0.22, 0.4],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(x0, -0.4);
      ctx.quadraticCurveTo(x0 + 0.1, 0.1, x1, 0.7);
      unprobed(ctx, () => ctx.stroke());
    }
    ctx.restore();
    // The face, and the shade the cloth's edge throws across the brow.
    skin(ctx, face, fire);
    ctx.save();
    ctx.beginPath();
    face(ctx);
    ctx.clip();
    const brim = ctx.createLinearGradient(0, -0.38, 0, -0.16);
    brim.addColorStop(0, tint(P.tealDeep, 0.85));
    brim.addColorStop(1, tint(P.tealDeep, 0));
    ctx.fillStyle = brim;
    ctx.fillRect(-0.5, -0.4, 0.6, 0.26);
    // The nose's shadow, thrown up the cheek by the light below it.
    ctx.fillStyle = tint(SKIN_NIGHT, 0.8);
    ctx.beginPath();
    ctx.moveTo(-0.37, 0.09);
    ctx.quadraticCurveTo(-0.31, 0.03, -0.29, -0.06);
    ctx.quadraticCurveTo(-0.33, -0.02, -0.395, 0.07);
    ctx.fill();
    // Where the fire strikes square: under the nose, the lips, the cheek under the eye.
    hot(ctx, -0.39, 0.1, 0.04, fire);
    hot(ctx, -0.355, 0.19, 0.035, fire);
    hot(ctx, -0.26, 0.03, 0.06, fire * 0.7);
    ctx.restore();
    // The eye, the brow, the nostril and the mouth.
    ctx.fillStyle = P.hair;
    ctx.beginPath();
    ctx.moveTo(-0.315, -0.07);
    ctx.quadraticCurveTo(-0.29, -0.085, -0.255, -0.072);
    ctx.quadraticCurveTo(-0.285, -0.058, -0.315, -0.07);
    ctx.fill();
    ctx.fillStyle = tint(P.fire, 0.4 + 0.6 * fire);
    ctx.beginPath();
    ctx.arc(-0.302, -0.066, 0.005, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = P.hair;
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.022;
    ctx.beginPath();
    ctx.moveTo(-0.34, -0.125);
    ctx.quadraticCurveTo(-0.29, -0.14, -0.22, -0.12);
    unprobed(ctx, () => ctx.stroke());
    ctx.lineWidth = 0.008;
    ctx.beginPath();
    ctx.moveTo(-0.375, 0.088);
    ctx.quadraticCurveTo(-0.355, 0.074, -0.34, 0.088);
    unprobed(ctx, () => ctx.stroke());
    ctx.beginPath();
    ctx.moveTo(-0.355, 0.176);
    ctx.quadraticCurveTo(-0.33, 0.182, -0.3, 0.175);
    unprobed(ctx, () => ctx.stroke());
    // The beard: dark, the fire catching its underside.
    ctx.save();
    ctx.beginPath();
    beard(ctx);
    ctx.fillStyle = mix('#3a2420', SKIN_NIGHT, 0.3);
    ctx.fill();
    ctx.clip();
    const under = ctx.createLinearGradient(-0.3, 0.42, -0.2, 0.22);
    under.addColorStop(0, tint(P.fire, 0.95 * fire));
    under.addColorStop(0.35, tint(SKIN_TURN, 0.6 * fire));
    under.addColorStop(1, tint(SKIN_TURN, 0));
    ctx.fillStyle = under;
    ctx.fillRect(-0.45, 0.15, 0.6, 0.35);
    const r = rng(19);
    ctx.lineWidth = 0.003;
    for (let i = 0; i < 90; i++) {
      const x = -0.36 + r() * 0.38;
      const y = 0.2 + r() * 0.2;
      ctx.strokeStyle = r() > 0.5 ? tint(P.hair, 0.8) : tint(P.fire, 0.4 * fire);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x - 0.01, y + 0.03, x - 0.005 + (r() - 0.5) * 0.02, y + 0.06);
      unprobed(ctx, () => ctx.stroke());
    }
    ctx.restore();
    // The fire's rim down the profile's front edge.
    ctx.save();
    ctx.beginPath();
    face(ctx);
    ctx.clip();
    ctx.strokeStyle = tint(P.fireCore, 0.35 + 0.65 * fire);
    ctx.lineWidth = 0.008;
    ctx.beginPath();
    path(ctx, PROFILE.slice(4));
    unprobed(ctx, () => ctx.stroke());
    ctx.restore();
  };

/** Small strokes that keep the face's drawing. */
const faceBrush: Brush = {
  seed: 202,
  flow: 1.1,
  jitter: 0.07,
  bristle: 0.55,
  layers: [
    { size: 16, alpha: 0.75 },
    { size: 7, alpha: 0.85, detail: 0.06 },
    { size: 3, alpha: 0.9, detail: 0.25 },
  ],
  hatch: { color: P.tealDeep, angle: -0.8, spacing: 6, below: 0.1, alpha: 0.25, width: 1 },
};

/** The plate the man is painted on: his head and shoulders, with room for the camera's drift. */
const PLATE = { x: 600, y: -40, w: 1220, h: 1180 } as const;

const lit: Painting = { w: PLATE.w, h: PLATE.h, scale: 1.2, brush: faceBrush, guide: listener(1) };
const dim: Painting = {
  w: PLATE.w,
  h: PLATE.h,
  scale: 1.2,
  brush: faceBrush,
  guide: listener(0.25),
};

/** The night behind him, out of focus: other fires, other listeners, the dark hill. */
const night: Painting = {
  w: 2400,
  h: 1400,
  blur: 7,
  brush: {
    seed: 303,
    flow: -0.2,
    jitter: 0.05,
    layers: [
      { size: 34, alpha: 0.6 },
      { size: 14, alpha: 0.7, detail: 0.05 },
    ],
  },
  guide: (ctx) => {
    ctx.translate(240, 160);
    const g = ctx.createLinearGradient(0, -160, 0, 1240);
    g.addColorStop(0, P.night);
    g.addColorStop(0.45, mix(P.tealDeep, P.indigo, 0.5));
    g.addColorStop(1, P.tealDeep);
    ctx.fillStyle = g;
    ctx.fillRect(-240, -160, 2400, 1400);
    // Other fires down the slope.
    const r = rng(9);
    for (let i = 0; i < 9; i++) {
      const x = 80 + r() * 1700;
      const y = 640 + r() * 300;
      const s = 30 + r() * 70;
      const fireGlow = ctx.createRadialGradient(x, y, 0, x, y, s * 3);
      fireGlow.addColorStop(0, tint(P.fire, 0.9));
      fireGlow.addColorStop(0.2, tint(P.fireDeep, 0.5));
      fireGlow.addColorStop(1, tint(P.fireDeep, 0));
      ctx.fillStyle = fireGlow;
      ctx.fillRect(x - s * 3, y - s * 3, s * 6, s * 6);
      // Someone sitting by it, dark against it.
      ctx.fillStyle = P.tealDeep;
      ctx.beginPath();
      ctx.ellipse(x + s * 0.6, y - s * 0.2, s * 0.32, s * 0.55, 0, 0, Math.PI * 2);
      ctx.ellipse(x + s * 0.6, y - s * 0.9, s * 0.2, s * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // The ridge against the sky.
    ctx.fillStyle = mix(P.tealDeep, P.night, 0.5);
    ctx.beginPath();
    ctx.moveTo(-240, 520);
    ctx.quadraticCurveTo(700, 420, 1300, 500);
    ctx.quadraticCurveTo(1800, 560, 2160, 470);
    ctx.lineTo(2160, 620);
    ctx.lineTo(-240, 640);
    ctx.fill();
  },
};

/** A near listener's shoulder and head at the frame's lower right, out of focus. */
const near: Painting = {
  w: 1000,
  h: 800,
  blur: 14,
  brush: { seed: 404, flow: 1.3, layers: [{ size: 30, alpha: 0.7 }] },
  guide: (ctx) => {
    ctx.translate(-1500, -700);
    rimmed(
      ctx,
      (c) => {
        c.moveTo(1560, 1500);
        c.quadraticCurveTo(1600, 1000, 1880, 930);
        c.quadraticCurveTo(1960, 820, 2080, 800);
        c.quadraticCurveTo(2260, 800, 2320, 960);
        c.lineTo(2500, 1500);
        c.closePath();
      },
      P.tealDeep,
      P.fireDeep,
      26,
      10,
    );
  },
};

/**
 * The fire's tongues at the frame's lower left, near and out of focus: each
 * a teardrop of light that leaps and sways with its own flicker, added over
 * what is behind it.
 */
const flames = (ctx: CanvasRenderingContext2D, t: number) => {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.filter = 'blur(18px)';
  glow(ctx, 260, 1120, 420, P.fireDeep, 0.5 + 0.3 * flicker(t, 39, 3));
  for (let i = 0; i < 8; i++) {
    const x = 60 + i * 52 + 18 * Math.sin(t * 1.7 + i * 2.1);
    const y = 1150;
    const h = 200 + 240 * flicker(t, 40 + i, 3.4) * (1 - Math.abs(i - 3.5) / 5);
    const w = 60 + 26 * flicker(t, 60 + i, 2);
    const lean = 26 * Math.sin(t * 2.3 + i * 1.3);
    const g = ctx.createLinearGradient(x, y, x, y - h);
    g.addColorStop(0, tint(P.fireCore, 0.95));
    g.addColorStop(0.35, tint(P.fire, 0.85));
    g.addColorStop(0.75, tint(P.fireDeep, 0.6));
    g.addColorStop(1, tint(P.fireDeep, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x - w * 0.9, y - h * 0.5, x + lean, y - h);
    ctx.quadraticCurveTo(x + w * 0.9, y - h * 0.5, x + w, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
};

export const fire = drawing({
  drift: 0,
  timeline: {
    drift: { at: 'start', until: { at: 'end' }, ease: 'inOutSine' },
  },
  knobs: {
    from: [930, 560],
    fromZoom: 1.04,
    to: [1010, 530],
    toZoom: 1.1,
  },
  draw: (f) => {
    const { ctx, w, h, t } = f;
    const cam = shotPath(knobCamera(f.knob('from'), f.knob('fromZoom')), [
      [f.at('drift'), knobCamera(f.knob('to'), f.knob('toZoom'))],
    ]);
    const flame = flicker(t, 11, 2.6);
    const breath = Math.sin(t * 1.25);
    const fireAt = [HEAD.x + FIRE[0] * HEAD.s, HEAD.y + FIRE[1] * HEAD.s] as const;
    const planes: Plane[] = [
      { z: 3.5, draw: () => drawPainting(ctx, night, -240, -160) },
      {
        z: 1,
        draw: () => {
          ctx.save();
          // His breath: the shoulders rise and the head with them.
          ctx.translate(0, -3 * breath);
          drawPainting(ctx, dim, PLATE.x, PLATE.y);
          ctx.globalAlpha = 0.45 + 0.55 * flame;
          drawPainting(ctx, lit, PLATE.x, PLATE.y);
          ctx.restore();
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          glow(ctx, fireAt[0], fireAt[1], 900, P.fireDeep, 0.18 + 0.2 * flame);
          ctx.restore();
          motes(ctx, t, {
            seed: 23,
            count: 46,
            box: [100, -120, 1500, 1300],
            size: [1.2, 3.2],
            color: P.fire,
            drift: [26, -70],
            sway: 30,
            alpha: 0.95,
            twinkle: 0.7,
            halo: 5,
          });
        },
      },
      {
        z: 0.5,
        draw: () => {
          drawPainting(ctx, near, 1500, 700);
          flames(ctx, t);
          motes(ctx, t, {
            seed: 29,
            count: 8,
            box: [-200, -200, 2300, 1500],
            size: [5, 10],
            color: P.fire,
            drift: [30, -110],
            sway: 50,
            alpha: 0.55,
            twinkle: 0.5,
            halo: 4,
          });
        },
      },
    ];
    multiplane(ctx, cam, w, h, planes, {
      drift: 0,
      fibre: 0,
      thickness: 0.12,
      haze: [
        [0, '#0c1c2a'],
        [1, '#123642'],
      ],
    });
    // The fire itself, just out of frame: its light flooding up from the corner.
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    glow(ctx, 60, 1180, 760, P.fireDeep, 0.35 + 0.25 * flame);
    glow(ctx, 120, 1160, 340, P.fire, 0.25 + 0.3 * flame);
    ctx.restore();
  },
});
