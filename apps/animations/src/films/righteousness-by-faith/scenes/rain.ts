// The harvest ahead, drawn to its Board (`rain.harvest`, `rain.rain`,
// `rain.blot`): wide paper fields under the day's teal, the camera lifting
// over the near plants to them on `heading`; on `harvest` the grain ripens
// toward gold from the distance. On `like` the first flecks fall, gold as
// the seed was. On `rain` the picture cuts to the farmer at the field's edge
// as the rain comes on, silver and gold, the field greening and standing up
// under it; he lifts his face to it, his face at a third of the frame. On
// `blot`, a breath's callback to the cold open in its layout: the evidence on
// the prosecutor's table, and the bench's light, not the rain, runs over the
// sheets until their scarlet scribble is gone, white. On `ripe` back to the
// fields, the grain standing full and gold in the ear. No words are drawn
// (CRAFT rule 1).

import { type Box, at, drawing, knobCamera, multiplane, shotPath } from '@bible/film/canvas';
import { lerp } from '@bible/film/core';
import { EASE, type Expression, type Pt, acted, boilTime } from '@bible/film/style';
import { LANDING_RIGS, courtFigures, courtShadows, living, restPose } from '../court-cast.ts';
import { BENCH_BEAM, REST_POINT, backWall, benchWarm, floor } from '../court-set.ts';
import { FIELD_REST, farField, nearField, nearPlants, rain as rainFlecks } from '../fields.ts';
import { FARMER_ARM, FARMER_HANDS, FARMER_KNOBS } from '../rigs/farmer-rig.ts';
import { PANEL } from '../rigs/farmer-traced.ts';
import { farmerHandProp, farmerProp } from '../rigs/rigs.ts';

// ─── the farmer ──────────────────────────────────────────────────────────────

/** Waiting at the field's edge: easy, hopeful, the start of a smile. */
const WAITING: Expression = { ...EASE, browY: -0.6, browTilt: 0.18, mouth: 1.2 };
/** His face lifted to the rain, as rain.rain draws it: the brows up and in, glad. */
const LIFTED: Expression = {
  ...EASE,
  browY: -2.4,
  browTilt: 0.3,
  mouth: 2.8,
};

/** His feet and his size in the field: rain.rain's own, his face at a third of the frame, cut at his knees. */
const FARMER_AT: Pt = [PANEL.feet[0], PANEL.feet[1]];
const FARMER_SCALE = 1 / PANEL.scale;
/** His hands' size against the hand rig's: rain.rain's, 66 panel pixels across inside their ink. */
const HAND = 0.96;
/** Where he looks, from his feet in his units: across the field, then up into the rain. */
const GAZE = { field: [320, -380], up: [230, -640] } as const satisfies Record<string, Pt>;

/** The court's pose for the callback: no one at the table; the bench's light over it. */
const POSE = (() => {
  const p = restPose();
  p.prosecutor.shown = 0;
  p.stack = 6;
  p.laid = 1;
  p.lead.numbers.stain = 0;
  p.lead.numbers.robe = 1;
  return p;
})();

/** The farmer's numbers (scratch: rewritten each frame). */
const FN: Record<keyof typeof FARMER_KNOBS, number> = { ...FARMER_KNOBS };

export const rain = drawing({
  timeline: {
    // From low over the near plants up to the fields.
    lift: { mark: 'heading', dur: 2.4, ease: 'inOutSine' },
    // The grain ripening from the distance, and a slow push toward it.
    ripen: { mark: 'harvest', until: 'like', ease: 'inOutSine' },
    push: { after: 'lift', until: { cue: 'toFarmer', edge: 'start' }, ease: 'linear' },
    // The first flecks: His word coming down.
    drops: { mark: 'like', dur: 2.4, ease: 'inSine' },
    // Cut to the farmer as the rain comes on; the field greens; he lifts his face.
    toFarmer: { mark: 'rain', offset: -0.06, dur: 0 },
    onFarmer: { after: 'toFarmer', until: { cue: 'toBlot', edge: 'start' }, ease: 'linear' },
    pour: { mark: 'rain', dur: 1.4, ease: 'outQuad' },
    green: { mark: 'rain', offset: 0.3, dur: 2.6, ease: 'inOutSine' },
    lookUp: { mark: 'rain', offset: 0.4, dur: 1.2, ease: 'inOutSine' },
    open: { mark: 'rain', offset: 0.8, dur: 1.5, ease: 'outCubic' },
    // Cut to the prosecutor's table: the bench's light runs over the sheets.
    toBlot: { mark: 'blot', offset: -0.06, dur: 0 },
    onBlot: { after: 'toBlot', until: { cue: 'toRipe', edge: 'start' }, ease: 'linear' },
    blot: { mark: 'blot', offset: 0.4, dur: 2.4, ease: 'inOutSine' },
    // The bench warming as its light starts out.
    warm: { with: 'blot', dur: 1.2, ease: 'inOutSine' },
    // Back to the fields, the grain full and gold.
    toRipe: { mark: 'ripe', offset: -0.06, dur: 0 },
    full: { mark: 'ripe', dur: 1.6, ease: 'inOutSine' },
    settle: { after: 'toRipe', until: { at: 'end' }, ease: 'linear' },
  },
  knobs: {
    // Where the lift starts: low over the near plants.
    low: [768, 760],
    lowZoom: 1.5,
    // Where the push ends: in toward the far gold.
    far: [880, 470],
    farZoom: 1.4,
    // The farmer's shot creeps in on his face.
    farmer: [700, 505],
    farmerZoom: 1.34,
    // The prosecutor's table, the bench at its right (rain.blot).
    table: [842, 580],
    tableZoom: 3,
    // The fields at the end, a little wider.
    wide: [768, 500],
    wideZoom: 1.18,
  },
  // The court's rigs for the callback to its table, and the farmer.
  rigs: { ...LANDING_RIGS, farmer: farmerProp, farmerHand: farmerHandProp },
  draw: (f): Box | void => {
    const { ctx, w, h } = f;

    const cam = shotPath(knobCamera(f.knob('low'), f.knob('lowZoom')), [
      [f.at('lift'), FIELD_REST],
      [f.at('push'), knobCamera(f.knob('far'), f.knob('farZoom'))],
      [f.at('toFarmer'), FIELD_REST],
      [f.at('onFarmer'), knobCamera(f.knob('farmer'), f.knob('farmerZoom'))],
      [f.at('toBlot'), knobCamera(f.knob('table'), f.knob('tableZoom'))],
      [f.at('onBlot'), knobCamera(f.knob('table'), f.knob('tableZoom') * 1.05)],
      [f.at('toRipe'), FIELD_REST],
      [f.at('settle'), knobCamera(f.knob('wide'), f.knob('wideZoom'))],
    ]);

    // ── the callback: the evidence on the table, the bench's light over it
    if (f.at('toBlot') >= 1 && f.at('toRipe') < 1) {
      const blot = f.at('blot');
      POSE.blot = blot;
      POSE.judge.glow = 0.45 * f.at('warm');
      multiplane(
        ctx,
        cam,
        w,
        h,
        [
          { z: 1.12, draw: () => backWall(ctx) },
          {
            z: 1,
            draw: () => {
              floor(ctx);
              courtShadows(ctx);
              benchWarm(ctx, POSE.judge.glow);
              courtFigures(f, POSE);
              beam(ctx, blot);
            },
          },
        ],
        { rest: REST_POINT },
      );
      return;
    }

    // ── the fields
    const field = {
      ripe: lerp(0.4 * f.at('ripen'), 1, f.at('full')),
      green: f.at('green') * (1 - f.at('full')),
    };
    const farmer = f.at('toFarmer') >= 1 && f.at('toRipe') < 1;
    const count = lerp(0.12 * f.at('drops'), 1, f.at('pour')) * (1 - f.at('toRipe'));

    // His face lifts to the rain, his far hand opening to it.
    const up = f.at('lookUp');
    acted(FN, WAITING, [[LIFTED, up]]);
    FN.gazeX = lerp(GAZE.field[0], GAZE.up[0], up);
    FN.gazeY = lerp(GAZE.field[1], GAZE.up[1], up);
    FN.nod = -5 * up;
    FN.tilt = 0.03 * up + 0.015 * Math.sin(f.t * 0.6);
    // His far arm swings up from his side in its sleeve, its hand at its cuff.
    FN.farArm = lerp(FARMER_ARM.rest, 0, f.at('open'));
    const far = FARMER_ARM.hand(FN.farArm);
    const hand = (p: Pt) =>
      at(
        ctx,
        {
          x: FARMER_AT[0] + p[0] * FARMER_SCALE,
          y: FARMER_AT[1] + p[1] * FARMER_SCALE,
          scale: FARMER_SCALE * HAND,
        },
        () => f.rive('farmerHand', { timelines: [['boil', boilTime(f.boil)]] }),
      );

    multiplane(
      ctx,
      cam,
      w,
      h,
      [
        { z: 1.15, draw: () => farField(ctx) },
        {
          z: 1,
          draw: () => {
            nearField(ctx, field);
            if (farmer) {
              nearPlants(ctx, field, -Infinity, 600);
              // The rain falls behind him, as rain.rain lets it: none crosses his face.
              rainFlecks(ctx, f.t, count);
              at(ctx, { x: FARMER_AT[0], y: FARMER_AT[1], scale: FARMER_SCALE }, () =>
                f.rive('farmer', {
                  timelines: living(f, 5, 1.1),
                  numbers: FN,
                }),
              );
              hand(FARMER_HANDS.near);
              hand(far);
              nearPlants(ctx, field, 600);
            } else {
              nearPlants(ctx, field);
              rainFlecks(ctx, f.t, count);
            }
          },
        },
      ],
      { rest: [FIELD_REST.x, FIELD_REST.y] },
    );
  },
});

/** The bench's light laid across the table toward the dock, as far as it has run (`amount`). */
const beam = (ctx: CanvasRenderingContext2D, amount: number) => {
  if (amount <= 0) return;
  const front = lerp(BENCH_BEAM.from, BENCH_BEAM.to, amount);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(BENCH_BEAM.from, 0, front, 0);
  g.addColorStop(0, 'rgba(255, 236, 180, 0.22)');
  g.addColorStop(1, 'rgba(255, 236, 180, 0.08)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(BENCH_BEAM.from + 60, 380);
  ctx.lineTo(front, 572);
  ctx.lineTo(front, 640);
  ctx.lineTo(BENCH_BEAM.from + 60, 560);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};
