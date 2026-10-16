// The court's people and what they handle, drawn into the v3 set
// (`court-set.ts`) in the Board's pixels: the judge behind his bench with
// the gavel, the prosecutor behind his table with the evidence, the plain
// lead behind the dock with the stain and the seal. Each figure is a Rive
// rig (`rigs/`), posed by the host from a `CourtPose` a scene writes each
// frame; the circle hands are the hand rig, drawn over what they work on.
// Back to front: the bench and the judge, the table and the prosecutor, the
// dock and the lead, so each group stands in front of the one behind it.

import { at, unprobed } from '@bible/film/canvas';
import { type Pt, boilTime } from '../cold-studies/looks/rive/parts.ts';
import {
  BENCH_TOP,
  LAID_SHEETS,
  PLACE,
  STACK_SHEETS,
  bench,
  benchShadow,
  block,
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
import { JUDGE_KNOBS } from './rigs/judge-rig.ts';
import { LEAD, LEAD_KNOBS } from './rigs/lead-rig.ts';
import { PROSECUTOR_KNOBS } from './rigs/prosecutor-rig.ts';
import { judgeProp, leadHandProp, leadProp, prosecutorProp, skinHandProp } from './rigs/rigs.ts';

/** The rigs a court scene declares (`drawing({ rigs: COURT_RIGS })`). */
export const COURT_RIGS = {
  lead: leadProp,
  leadHand: leadHandProp,
  judge: judgeProp,
  prosecutor: prosecutorProp,
  skinHand: skinHandProp,
} as const;

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
  rive(name: 'leadHand' | 'skinHand', pose: { timelines: Timelines<'boil'> }): void;
}
type Timelines<T extends string> = ReadonlyArray<readonly [T, number]>;
type LeadNumbers = Record<keyof typeof LEAD_KNOBS, number>;
type JudgeNumbers = Record<keyof typeof JUDGE_KNOBS, number>;
type ProsecutorNumbers = Record<keyof typeof PROSECUTOR_KNOBS, number>;

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

/** One frame of the court: every figure's numbers and hands, the gavel, the evidence and the seal. */
export interface CourtPose {
  readonly lead: { numbers: LeadNumbers; hands: [Pt, Pt]; seal: SealPose };
  readonly prosecutor: { numbers: ProsecutorNumbers; hands: [Pt, Pt]; carried: CarriedSheet };
  readonly judge: { numbers: JudgeNumbers; hands: [Pt, Pt]; grip: [number, number]; rot: number };
  /** How many sheets lie on the stack (its last may be partway down, the fraction). */
  stack: number;
}

/** A sheet in the prosecutor's hand: where it is, its turn, and whether he holds one. */
export interface CarriedSheet {
  x: number;
  y: number;
  rot: number;
  shown: number;
}

/** Where the lead's hands rest on the dock's top rail, and the prosecutor's and judge's at rest. */
export const HANDS = {
  lead: [
    [212, 606],
    [392, 606],
  ],
  prosecutor: [
    [662, 548],
    [836, 552],
  ],
  judge: [
    [1192, BENCH_TOP - 6],
    [1428, BENCH_TOP - 6],
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
  },
  prosecutor: {
    numbers: { ...PROSECUTOR_KNOBS },
    hands: [[...HANDS.prosecutor[0]], [...HANDS.prosecutor[1]]],
    carried: { x: 0, y: 0, rot: 0, shown: 0 },
  },
  judge: {
    numbers: { ...JUDGE_KNOBS },
    hands: [[...HANDS.judge[0]], [...HANDS.judge[1]]],
    grip: [GAVEL_REST.grip[0], GAVEL_REST.grip[1]],
    rot: GAVEL_REST.rot,
  },
  stack: 6,
});

/** Where the stain's middle is on the lead as he leans `lean`, Board pixels: where the seal presses. */
export const stainAt = (lean: number): Pt => {
  const [fx, fy] = PLACE.lead;
  const { x, y } = LEAD.stain;
  const c = Math.cos(lean);
  const s = Math.sin(lean);
  return [fx + x * c - y * s, fy + x * s + y * c];
};

/** The seal's gold, its shade, its rim, and its ribbon. */
const GOLD = {
  wax: C.gold,
  shade: '#cf8a2e',
  rim: '#b9781f',
  ribbon: '#d49a32',
  letter: '#8a5a12',
} as const;

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
    ctx.fillStyle = GOLD.ribbon;
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
  g.addColorStop(0, GOLD.wax);
  g.addColorStop(0.62, GOLD.wax);
  g.addColorStop(0.63, GOLD.shade);
  g.addColorStop(1, GOLD.shade);
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
  ctx.strokeStyle = GOLD.rim;
  unprobed(ctx, () => ctx.stroke());
  ctx.fillStyle = GOLD.letter;
  ctx.font = `700 ${SEAL.letter}px Fraunces`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  unprobed(ctx, () => ctx.fillText('R', 0, 1.3));
  ctx.restore();
};

/** A circle hand of `rig` at `p`, `scale` times its size. */
const handAt = (f: CourtFrame, rig: 'leadHand' | 'skinHand', p: Pt, scale = 1) =>
  at(f.ctx, { x: p[0], y: p[1], scale }, () =>
    f.rive(rig, { timelines: [['boil', boilTime(f.boil)]] }),
  );

/** A figure's own timelines on this frame: its breath, offset so no two breathe as one, and its boil. */
const living = (f: CourtFrame, period: number, offset: number) =>
  [
    ['breath', (f.t + offset) % period],
    ['boil', boilTime(f.boil)],
  ] as const;

/** The bench and the judge behind it: his chair, the block and the gavel, his hands on the bench. */
const judgeGroup = (f: CourtFrame, p: CourtPose) => {
  const { ctx } = f;
  chair(ctx);
  at(ctx, { x: PLACE.judge[0], y: PLACE.judge[1] }, () =>
    f.rive('judge', { timelines: living(f, 5, 1.3), numbers: p.judge.numbers }),
  );
  bench(ctx);
  block(ctx);
  gavel(ctx, p.judge.grip, p.judge.rot);
  for (const h of p.judge.hands) handAt(f, 'skinHand', h, 1.15);
};

/** The table and the prosecutor behind it: the evidence on it, the sheet in his hand, his hands. */
const prosecutorGroup = (f: CourtFrame, p: CourtPose) => {
  const { ctx } = f;
  contact(ctx, PLACE.prosecutor[0], PLACE.prosecutor[1] + 2, 130);
  at(ctx, { x: PLACE.prosecutor[0], y: PLACE.prosecutor[1] }, () =>
    f.rive('prosecutor', { timelines: living(f, 4.5, 0.4), numbers: p.prosecutor.numbers }),
  );
  table(ctx);
  for (const [i, s] of LAID_SHEETS.entries()) sheet(ctx, s, 31 + i);
  const whole = Math.floor(p.stack);
  for (const [i, s] of STACK_SHEETS.entries()) {
    if (i >= Math.ceil(p.stack)) break;
    // The last sheet, partway down, settles from a little above.
    const fall = i === whole ? 1 - (p.stack - whole) : 0;
    sheet(ctx, { x: s.x, y: s.y - 30 * fall, rot: s.rot + 0.2 * fall }, 11 + i);
  }
  const c = p.prosecutor.carried;
  if (c.shown > 0) sheet(ctx, c, 97, 0.55);
  for (const h of p.prosecutor.hands) handAt(f, 'skinHand', h, 1.1);
};

/** The dock and the lead behind it: the seal over his stain, his hands on the rail. */
const leadGroup = (f: CourtFrame, p: CourtPose) => {
  const { ctx } = f;
  contact(ctx, PLACE.lead[0], PLACE.lead[1] + 2, 95);
  at(ctx, { x: PLACE.lead[0], y: PLACE.lead[1] }, () =>
    f.rive('lead', { timelines: living(f, 4, 2.1), numbers: p.lead.numbers }),
  );
  seal(ctx, p.lead.seal);
  dock(ctx);
  for (const h of p.lead.hands) handAt(f, 'leadHand', h, 1.12);
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
