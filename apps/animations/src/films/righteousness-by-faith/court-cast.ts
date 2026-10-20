// The court's people and what they handle, drawn into the v3 set
// (`court-set.ts`) in the Board's pixels: the judge behind his bench with
// the gavel, the prosecutor behind his table with the evidence, the plain
// lead behind the dock with the stain and the seal. Each figure is a Rive
// rig (`rigs/`), posed by the host from a `CourtPose` a scene writes each
// frame; the circle hands are the hand rig, drawn over what they work on.
// Back to front: the bench and the judge, the table and the prosecutor, the
// dock and the lead, so each group stands in front of the one behind it.

import { at, unprobed } from '@bible/film/canvas';
import { type Pt, boilTime } from '@bible/film/style';
import {
  BENCH_TOP,
  LAID_SHEETS,
  PLACE,
  STACK_SHEETS,
  bench,
  benchLit,
  benchShadow,
  block,
  blottedAt,
  chair,
  contact,
  dock,
  dockShadow,
  gavel,
  sheet,
  table,
  tableShadow,
} from './court-set.ts';
import { C } from './kit.ts';
import { SEAL_GOLD, type SeedPose, noSeed, seed as seedProp } from './props.ts';
import { CHRIST_KNOBS } from './rigs/christ-rig.ts';
import { JUDGE_KNOBS } from './rigs/judge-rig.ts';
import { LEAD, LEAD_ARMS, LEAD_HAND_SIZE, LEAD_KNOBS, reachHands } from './rigs/lead-rig.ts';
import { HAND_OUT_STEPS } from './rigs/hand-rig.ts';
import { PROSECUTOR_KNOBS } from './rigs/prosecutor-rig.ts';
import {
  christFrontProp,
  christHandOutProps,
  christHandProp,
  christProp,
  judgeProp,
  leadHandProp,
  leadProp,
  prosecutorProp,
  skinHandProp,
} from './rigs/rigs.ts';

/** The rigs a court scene declares (`drawing({ rigs: COURT_RIGS })`). */
export const COURT_RIGS = {
  lead: leadProp,
  leadHand: leadHandProp,
  judge: judgeProp,
  prosecutor: prosecutorProp,
  skinHand: skinHandProp,
} as const;

/** The rigs the landing's court declares: the court's, and Christ beside the accused. */
export const LANDING_RIGS = {
  ...COURT_RIGS,
  christ: christProp,
  christFront: christFrontProp,
  christHand: christHandProp,
  christHandOut1: christHandOutProps[0],
  christHandOut2: christHandOutProps[1],
  christHandOut3: christHandOutProps[2],
  christHandOut4: christHandOutProps[3],
} as const;

/** A circle hand's rig: a figure's paper, or Christ's held out a step bigger. */
type HandRig = 'leadHand' | 'skinHand' | 'christHand' | `christHandOut${1 | 2 | 3 | 4}`;

/** What drawing the court needs of a frame: its context, its boil tick and its seconds, and the rigs. */
export interface CourtFrame {
  readonly ctx: CanvasRenderingContext2D;
  readonly t: number;
  readonly boil: number;
  rive(name: 'lead', pose: { timelines: Timelines<'breath' | 'boil'>; numbers: LeadNumbers }): void;
  rive(
    name: 'judge',
    pose: { timelines: Timelines<'breath' | 'boil'>; numbers: JudgeNumbers },
  ): void;
  rive(
    name: 'prosecutor',
    pose: { timelines: Timelines<'breath' | 'boil'>; numbers: ProsecutorNumbers },
  ): void;
  rive(
    name: 'christ' | 'christFront',
    pose: { timelines: Timelines<'breath' | 'boil'>; numbers: ChristNumbers },
  ): void;
  rive(name: HandRig, pose: { timelines: Timelines<'boil'>; size: number }): void;
}
type Timelines<T extends string> = ReadonlyArray<readonly [T, number]>;
type LeadNumbers = Record<keyof typeof LEAD_KNOBS, number>;
type JudgeNumbers = Record<keyof typeof JUDGE_KNOBS, number>;
type ProsecutorNumbers = Record<keyof typeof PROSECUTOR_KNOBS, number>;
type ChristNumbers = Record<keyof typeof CHRIST_KNOBS, number>;

/** The seal: where it is (its centre, Board pixels), its turn, its size, and how far it shows. */
export interface SealPose {
  x: number;
  y: number;
  rot: number;
  scale: number;
  shown: number;
  /** A glint crossing its gold, 0..1 (0: none). */
  glint: number;
}

/**
 * One frame of the court: every figure's numbers and hands, the gavel, the
 * evidence and the seal; in the landing, Christ beside the accused and the
 * seeds in their hands.
 */
export interface CourtPose {
  readonly lead: {
    numbers: LeadNumbers;
    hands: [Pt, Pt];
    seal: SealPose;
    /** How far he stands off his place in the dock, Board pixels (the landing makes room beside him). */
    dx: number;
    /** How far he stands back behind Christ, as court.you sets him (0: beside Him; 1: a pace back, smaller and behind Him). */
    back: number;
    seed: SeedPose;
  };
  readonly prosecutor: {
    numbers: ProsecutorNumbers;
    hands: [Pt, Pt];
    carried: CarriedSheet;
    /** Whether he stands at his table: 0 his place empty. */
    shown: number;
  };
  readonly judge: {
    numbers: JudgeNumbers;
    hands: [Pt, Pt];
    grip: [number, number];
    rot: number;
    /** How bright the bench glows gold from within: 0 not at all. */
    glow: number;
  };
  readonly christ: {
    numbers: ChristNumbers;
    hands: [Pt, Pt];
    /** Whether He stands beside the accused: 0 not there. */
    shown: number;
    /** Whether He has turned to us (court.you): 1 His head as court.you draws it, facing the viewer. */
    front: number;
    /** His near hand's size against its rest, as He holds it out toward us. */
    reach: number;
    seed: SeedPose;
  };
  /** How many sheets lie on the stack (its last may be partway down, the fraction). */
  stack: number;
  /** Whether the two laid sheets lie on the table. */
  laid: number;
  /** How far the bench's light has run over the sheets, blotting their scribble out (0..1). */
  blot: number;
}

/** A sheet in the prosecutor's hand: where it is, its turn, and whether he holds one. */
export interface CarriedSheet {
  x: number;
  y: number;
  rot: number;
  shown: number;
}

/** Where the lead's hands hang at his sides, at his sleeves' ends, and the prosecutor's and judge's at rest. */
export const HANDS = {
  lead: [
    [PLACE.lead[0] + LEAD_ARMS.left.rest[0], PLACE.lead[1] + LEAD_ARMS.left.rest[1]],
    [PLACE.lead[0] + LEAD_ARMS.right.rest[0], PLACE.lead[1] + LEAD_ARMS.right.rest[1]],
  ],
  prosecutor: [
    [632, 548],
    [866, 552],
  ],
  judge: [
    [1192, BENCH_TOP - 6],
    [1360, BENCH_TOP - 6],
  ],
  /** Christ's, on the dock's rail beside the lead, where court-12 sets them. */
  christ: [
    [390, 576],
    [546, 573],
  ],
} as const satisfies Record<string, readonly [Pt, Pt]>;

/** The gavel lying on the bench: its grip, and its turn (its head up and to the left). */
export const GAVEL_REST = { grip: [1132, 364], rot: 0.57 } as const satisfies {
  readonly grip: Pt;
  readonly rot: number;
};

/** The court at rest: everyone in their place, nothing moving. A fresh pose (a scene keeps one and rewrites it). */
export const restPose = (): CourtPose => ({
  lead: {
    numbers: { ...LEAD_KNOBS },
    hands: [[...HANDS.lead[0]], [...HANDS.lead[1]]],
    seal: { x: 0, y: 0, rot: 0, scale: 1, shown: 0, glint: 0 },
    dx: 0,
    back: 0,
    seed: noSeed(),
  },
  prosecutor: {
    numbers: { ...PROSECUTOR_KNOBS },
    hands: [[...HANDS.prosecutor[0]], [...HANDS.prosecutor[1]]],
    carried: { x: 0, y: 0, rot: 0, shown: 0 },
    shown: 1,
  },
  judge: {
    numbers: { ...JUDGE_KNOBS },
    hands: [[...HANDS.judge[0]], [...HANDS.judge[1]]],
    grip: [GAVEL_REST.grip[0], GAVEL_REST.grip[1]],
    rot: GAVEL_REST.rot,
    glow: 0,
  },
  christ: {
    numbers: { ...CHRIST_KNOBS },
    hands: [[...HANDS.christ[0]], [...HANDS.christ[1]]],
    shown: 0,
    front: 0,
    reach: 1,
    seed: noSeed(),
  },
  stack: 6,
  laid: 1,
  blot: 0,
});

/** Where the stain's middle is on the lead as he leans `lean`, Board pixels: where the seal presses. */
export const stainAt = (lean: number): Pt => {
  const [fx, fy] = PLACE.lead;
  const { x, y } = LEAD.stain;
  const c = Math.cos(lean);
  const s = Math.sin(lean);
  return [fx + x * c - y * s, fy + x * s + y * c];
};

/** The seal's measures, units: its wax, the ring pressed round the R, the R, and its ribbon's scale. */
const SEAL = { wax: 23, ring: 16, letter: 22, ribbon: 0.85 } as const;

/**
 * The gold wax seal with its ribbon tail, the R pressed into its wax: at its
 * pose, over his stain, smaller than the stain so its scarlet shows round it.
 * A glint crosses the wax under the ring and the R, so the R stays clear.
 * Its lines and its R are the prop's own marks, under any card, so they are
 * drawn `unprobed`.
 */
export const seal = (ctx: CanvasRenderingContext2D, s: SealPose) => {
  if (s.shown <= 0) return;
  ctx.save();
  ctx.globalAlpha *= Math.min(1, s.shown);
  ctx.translate(s.x, s.y);
  ctx.rotate(s.rot);
  ctx.scale(s.scale, s.scale);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = C.outline;
  // The ribbon's two tails, forked at their ends, hanging under the wax.
  ctx.save();
  ctx.scale(SEAL.ribbon, SEAL.ribbon);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 4, 10);
    ctx.lineTo(side * 18, 48);
    ctx.lineTo(side * 10, 42);
    ctx.lineTo(side * 4, 50);
    ctx.lineTo(side * -6, 14);
    ctx.closePath();
    ctx.fillStyle = SEAL_GOLD.ribbon;
    ctx.fill();
    ctx.lineWidth = 2.5 / SEAL.ribbon;
    unprobed(ctx, () => ctx.stroke());
  }
  ctx.restore();
  // The wax: a pressed round with a soft, bumpy edge, creased like every piece.
  const wax = () => {
    ctx.beginPath();
    const n = 18;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * 2 * Math.PI;
      const r = SEAL.wax + 1.4 * Math.sin(a * 6 + 0.7);
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
  const g = ctx.createLinearGradient(-17, -20, 17, 20);
  g.addColorStop(0, SEAL_GOLD.wax);
  g.addColorStop(0.62, SEAL_GOLD.wax);
  g.addColorStop(0.63, SEAL_GOLD.shade);
  g.addColorStop(1, SEAL_GOLD.shade);
  ctx.fillStyle = g;
  wax();
  ctx.fill();
  // The glint: a narrow band of light crossing the wax, inside its outline.
  if (s.glint > 0 && s.glint < 1) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, SEAL.wax - 3, 0, 2 * Math.PI);
    ctx.clip();
    const x = -45 + 90 * s.glint;
    const shine = ctx.createLinearGradient(x - 14, -5, x + 14, 5);
    shine.addColorStop(0, '#fff6d000');
    shine.addColorStop(0.5, '#fff6d080');
    shine.addColorStop(1, '#fff6d000');
    ctx.fillStyle = shine;
    ctx.fillRect(-SEAL.wax, -SEAL.wax, 2 * SEAL.wax, 2 * SEAL.wax);
    ctx.restore();
  }
  ctx.lineWidth = 3;
  wax();
  unprobed(ctx, () => ctx.stroke());
  // The ring pressed round the R, and the R.
  ctx.beginPath();
  ctx.arc(0, 0, SEAL.ring, 0, 2 * Math.PI);
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = SEAL_GOLD.rim;
  unprobed(ctx, () => ctx.stroke());
  ctx.fillStyle = SEAL_GOLD.letter;
  ctx.font = `700 ${SEAL.letter}px Fraunces`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  unprobed(ctx, () => ctx.fillText('R', 0, 1.3));
  ctx.restore();
};

/**
 * A circle hand of `rig` at `p`, drawn `size` times the hand rig: its size is
 * the pose's, so the hand reads the shot its figure stands in.
 */
const handAt = (f: CourtFrame, rig: HandRig, p: Pt, size: number) =>
  at(f.ctx, { x: p[0], y: p[1] }, () =>
    f.rive(rig, { timelines: [['boil', boilTime(f.boil)]], size }),
  );

/** A figure's own timelines on this frame: its breath, offset so no two breathe as one, and its boil. */
export const living = (f: CourtFrame, period: number, offset: number) =>
  [
    ['breath', (f.t + offset) % period],
    ['boil', boilTime(f.boil)],
  ] as const;

/**
 * Each figure's hands' size against the hand rig's, so each is the share of
 * its head's width the concept draws: the judge's 0.45, the prosecutor's
 * 0.44 (the lead's are his sheet's, `LEAD_HAND_SIZE`).
 */
const HAND = { judge: 1.23, prosecutor: 1.14, christ: 1.08 } as const;

/** Christ's hand rigs by size: His own, then each held-out step. */
const CHRIST_HANDS = [
  [1, 'christHand'],
  [HAND_OUT_STEPS[0], 'christHandOut1'],
  [HAND_OUT_STEPS[1], 'christHandOut2'],
  [HAND_OUT_STEPS[2], 'christHandOut3'],
  [HAND_OUT_STEPS[3], 'christHandOut4'],
] as const;

/**
 * Christ's near hand held out `reach` times its size: the step nearest the
 * reach, scaled the rest of the way, so the circle grows as He reaches to us
 * and its ink stays the house line (within 8 %) rather than swelling with it.
 */
const heldOut = (f: CourtFrame, p: Pt, reach: number) => {
  const off = (size: number) => Math.abs(Math.log(reach / size));
  const [size, rig] = CHRIST_HANDS.reduce((a, b) => (off(b[0]) < off(a[0]) ? b : a));
  handAt(f, rig, p, (HAND.christ * reach) / size);
};

/** The bench and the judge behind it: his chair, the block and the gavel, his hands on the bench. */
const judgeGroup = (f: CourtFrame, p: CourtPose) => {
  const { ctx } = f;
  chair(ctx);
  at(ctx, { x: PLACE.judge[0], y: PLACE.judge[1] }, () =>
    f.rive('judge', { timelines: living(f, 5, 1.3), numbers: p.judge.numbers }),
  );
  bench(ctx);
  benchLit(ctx, p.judge.glow);
  block(ctx);
  gavel(ctx, p.judge.grip, p.judge.rot);
  for (const h of p.judge.hands) handAt(f, 'skinHand', h, HAND.judge);
};

/** The table and the prosecutor behind it: the evidence on it, the sheet in his hand, his hands. */
const prosecutorGroup = (f: CourtFrame, p: CourtPose) => {
  const { ctx } = f;
  const here = p.prosecutor.shown > 0;
  if (here) {
    contact(ctx, PLACE.prosecutor[0], PLACE.prosecutor[1] + 2, 130);
    at(ctx, { x: PLACE.prosecutor[0], y: PLACE.prosecutor[1] }, () =>
      f.rive('prosecutor', { timelines: living(f, 4.5, 0.4), numbers: p.prosecutor.numbers }),
    );
  }
  table(ctx);
  if (p.laid > 0)
    for (const [i, s] of LAID_SHEETS.entries()) sheet(ctx, s, 31 + i, 0.32, blottedAt(s.x, p.blot));
  const whole = Math.floor(p.stack);
  for (const [i, s] of STACK_SHEETS.entries()) {
    if (i >= Math.ceil(p.stack)) break;
    // The last sheet, partway down, settles from a little above.
    const fall = i === whole ? 1 - (p.stack - whole) : 0;
    sheet(
      ctx,
      { x: s.x, y: s.y - 30 * fall, rot: s.rot + 0.2 * fall },
      11 + i,
      0.32,
      blottedAt(s.x, p.blot),
    );
  }
  const c = p.prosecutor.carried;
  if (c.shown > 0) sheet(ctx, c, 97, 0.55);
  if (here) for (const h of p.prosecutor.hands) handAt(f, 'skinHand', h, HAND.prosecutor);
};

/** The lead a pace back (`back` 1): how much smaller he stands, and how far up the floor his feet go, Board pixels. */
const BACK = { scale: 0.28, rise: 100 } as const;

/**
 * The dock and who stands behind it: Christ beside the lead when He is
 * there, the lead in front of Him, or a pace behind Him when he is set
 * back (`back`); the seal over the lead's stain; their hands on the rail,
 * and the seeds in their hands.
 */
const leadGroup = (f: CourtFrame, p: CourtPose) => {
  const { ctx } = f;
  const christ = p.christ.shown > 0;
  const behind = p.lead.back > 0;
  const lx = PLACE.lead[0] + p.lead.dx;
  const ly = PLACE.lead[1];
  // Set back, he stands a pace behind Christ: smaller, about a point up the floor from his feet.
  const s = 1 - BACK.scale * p.lead.back;
  const asLead = (draw: () => void) => {
    ctx.save();
    ctx.translate(lx, ly - BACK.rise * p.lead.back);
    ctx.scale(s, s);
    ctx.translate(-lx, -ly);
    draw();
    ctx.restore();
  };
  // His arms reach for where the pose puts his hands, and his hands lie at the ends of his sleeves.
  const [left, right] = p.lead.hands;
  const reached = reachHands(
    p.lead.numbers,
    [left[0] - lx, left[1] - ly],
    [right[0] - lx, right[1] - ly],
  );
  const hands = [reached.left, reached.right].map(([x, y]): Pt => [lx + x, ly + y]);
  const leadFigure = () =>
    asLead(() => {
      contact(ctx, lx, ly + 2, 95);
      at(ctx, { x: lx, y: ly }, () =>
        f.rive('lead', { timelines: living(f, 4, 2.1), numbers: p.lead.numbers }),
      );
      seal(ctx, p.lead.seal);
    });
  const christFigure = () => {
    if (!christ) return;
    contact(ctx, PLACE.christ[0], PLACE.christ[1] + 2, 100);
    at(ctx, { x: PLACE.christ[0], y: PLACE.christ[1] }, () =>
      f.rive(p.christ.front >= 0.5 ? 'christFront' : 'christ', {
        timelines: living(f, 5, 3.4),
        numbers: p.christ.numbers,
      }),
    );
  };
  // Beside Him the lead stands in front of Christ; set back, behind Him.
  if (behind) {
    leadFigure();
    christFigure();
  } else {
    christFigure();
    leadFigure();
  }
  dock(ctx);
  asLead(() => {
    for (const h of hands) handAt(f, 'leadHand', h, LEAD_HAND_SIZE);
    seedProp(ctx, p.lead.seed);
  });
  if (!christ) return;
  const [near, far] = p.christ.hands;
  handAt(f, 'christHand', far, HAND.christ);
  heldOut(f, near, p.christ.reach);
  seedProp(ctx, p.christ.seed);
};

/**
 * How far each group stands off its panels' place, Board pixels: none in
 * `cold`; `title`'s wide spreads them over the floor as its panel does.
 */
interface CourtSpread {
  readonly lead: Pt;
  readonly prosecutor: Pt;
  readonly judge: Pt;
}
const IN_PLACE: CourtSpread = { lead: [0, 0], prosecutor: [0, 0], judge: [0, 0] };

/** `draw`, moved `by`. */
const moved = (ctx: CanvasRenderingContext2D, by: Pt, draw: () => void) => {
  ctx.save();
  ctx.translate(by[0], by[1]);
  draw();
  ctx.restore();
};

/** The furniture's shadows on the floor, under every group. */
export const courtShadows = (ctx: CanvasRenderingContext2D, spread = IN_PLACE) => {
  moved(ctx, spread.judge, () => benchShadow(ctx));
  moved(ctx, spread.prosecutor, () => tableShadow(ctx));
  moved(ctx, spread.lead, () => dockShadow(ctx));
};

/** The court's people and furniture at `p`, back to front, over the floor. */
export const courtFigures = (f: CourtFrame, p: CourtPose, spread = IN_PLACE) => {
  moved(f.ctx, spread.judge, () => judgeGroup(f, p));
  moved(f.ctx, spread.prosecutor, () => prosecutorGroup(f, p));
  moved(f.ctx, spread.lead, () => leadGroup(f, p));
};
