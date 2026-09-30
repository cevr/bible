// Heaven: the sanctuary in two apartments where Christ ministers (`exchange`,
// `rain`), Christ as high priest, and the angel of Rev 14 with the third
// angel's banner (`message`, `rain`).

import {
  type Pt,
  at,
  ellipseShape,
  line,
  probePlate,
  quad,
  spline,
  stroke,
  write,
  sub,
  glow,
  plate,
  rounded,
} from '@bible/film/canvas';
import { lerp } from '@bible/film/core';
import { type GestureAt, C, F, type Person, christ, person, piece, type Hands } from './kit.ts';

/** Christ as high priest: the white robe and sash, and the breastplate over them. */
const highPriest = (ctx: CanvasRenderingContext2D, pose: Person, hand: Hands, plate = 1) => {
  christ(ctx, pose, hand);
  if (plate <= 0) return;
  piece(ctx, rounded(0, -88, 40, 44, 5), C.gold, hand('breastplate'), {
    role: 'figure',
    line: 2.5,
    alpha: plate,
  });
  const gems = [C.scarlet, C.glow, C.cutLight];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 3; c++) {
      ctx.save();
      ctx.globalAlpha *= plate;
      ctx.fillStyle = gems[(r + c) % 3] ?? C.glow;
      ctx.beginPath();
      ctx.ellipse(-11 + c * 11, -103 + r * 10, 3.4, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
};

// ─── the heavenly sanctuary ──────────────────────────────────────────────────
// Two apartments, never one (Heb 8:1–2; 9:2–3): the holy place with the
// lampstand, the table and the altar of incense, and past the veil the most
// holy place with the ark. Floor centre at the origin, about 1120 × 560.

/** Where Christ stands in each apartment, in the sanctuary's units. */
export const HOLY_PLACE: Pt = [-90, 0];
const MOST_HOLY: Pt = [230, 0];
/** The sanctuary's scale for a figure standing in it. */
export const IN_SANCTUARY = 1.55;

const VEIL_X = 120;

/**
 * The gold sanctuary in heaven, cut away to show both rooms. `veil` 0..1
 * draws the veil up into its folds; `light` 0..1 brightens its glory.
 * `inside` draws what stands in the rooms (a figure), over the floor and
 * behind the altar of incense.
 */
export const sanctuary = (
  ctx: CanvasRenderingContext2D,
  hand: Hands,
  veil = 0,
  light = 0,
  inside: () => void = () => {},
) => {
  glow(ctx, 0, -280, 900, C.glow, 0.55 + 0.45 * light);
  // The walls and roof, and the rooms' warm insides.
  piece(ctx, rounded(0, -300, 1160, 600, 24), C.gold, hand('walls'), {
    role: 'scenery',
    kind: 'cut',
    line: 5,
    shadow: 0.4,
  });
  piece(ctx, rounded(0, -620, 1220, 60, 16), C.gold, hand('roof'), {
    role: 'scenery',
    kind: 'cut',
    line: 5,
  });
  piece(ctx, rounded(-200, -265, 620, 510, 10), C.cream, hand('holy'), {
    role: 'scenery',
    kind: 'cut',
    line: 4,
    shadow: 0,
  });
  piece(ctx, rounded(345, -265, 390, 510, 10), C.glow, hand('mostHoly'), {
    role: 'scenery',
    kind: 'cut',
    line: 4,
    shadow: 0,
  });
  // The glory between the cherubim.
  glow(ctx, 400, -250, 260, C.robe, 0.5 + 0.5 * light);

  // The holy place: the lampstand, the table with its bread.
  at(ctx, { x: -420, y: 0 }, () => {
    piece(ctx, rounded(0, -130, 12, 260, 4), C.gold, hand('stem'), {
      role: 'scenery',
      kind: 'cut',
      line: 2.5,
    });
    piece(ctx, rounded(0, -4, 70, 12, 4), C.gold, hand('foot'), {
      role: 'scenery',
      kind: 'cut',
      line: 2.5,
    });
    for (const [i, r] of [
      [1, 30],
      [2, 58],
      [3, 86],
    ] as const)
      stroke(
        ctx,
        quad([-r, -250], [0, -250 + r * 1.6], [r, -250]),
        { color: C.gold, width: 9, jitter: 0.3, taper: 0, boil: 'none' },
        sub(hand('branch'), i),
      );
    for (const x of [-86, -58, -30, 0, 30, 58, 86]) {
      glow(ctx, x, -268, 26, C.glow, 0.9);
      piece(ctx, ellipseShape(x, -264, 6, 10, 14), C.glow, sub(hand('flame'), x), {
        role: 'scenery',
        line: 1.5,
      });
    }
  });
  at(ctx, { x: -230, y: 0 }, () => {
    piece(ctx, rounded(0, -110, 150, 16, 4), C.gold, hand('table'), {
      role: 'scenery',
      kind: 'cut',
      line: 2.5,
    });
    for (const x of [-60, 60])
      piece(ctx, rounded(x, -52, 12, 104, 3), C.gold, sub(hand('leg'), x), {
        role: 'scenery',
        kind: 'cut',
        line: 2,
      });
    for (const [x, k] of [
      [-36, 1],
      [36, 2],
    ] as const)
      for (let i = 0; i < 3; i++)
        piece(
          ctx,
          rounded(x, -126 - i * 12, 52, 12, 6),
          C.boardLight,
          sub(hand('bread'), k * 10 + i),
          {
            role: 'scenery',
            kind: 'cut',
            line: 2,
            shadow: 0.1,
          },
        );
  });

  inside();

  // The altar of incense, before the veil, and its smoke.
  at(ctx, { x: 40, y: 0 }, () => {
    piece(ctx, rounded(0, -60, 64, 120, 6), C.gold, hand('altar'), {
      role: 'scenery',
      kind: 'cut',
      line: 2.5,
    });
    piece(ctx, rounded(0, -124, 80, 12, 4), C.gold, hand('altarTop'), {
      role: 'scenery',
      kind: 'cut',
      line: 2.5,
    });
    stroke(
      ctx,
      quad([0, -134], [-30, -190], [8, -240]),
      { color: C.robe, width: 10, jitter: 0.6, taper: 0.6, alpha: 0.8, boil: 'none' },
      hand('smoke'),
    );
  });

  // The ark, and the two cherubim over it.
  at(ctx, { x: 420, y: 0 }, () => {
    piece(ctx, rounded(0, -45, 150, 90, 8), C.gold, hand('ark'), {
      role: 'scenery',
      kind: 'cut',
      line: 3,
    });
    piece(ctx, rounded(0, -96, 170, 14, 4), C.gold, hand('mercySeat'), {
      role: 'scenery',
      kind: 'cut',
      line: 3,
    });
    for (const side of [-1, 1] as const)
      piece(
        ctx,
        [
          [side * 70, -100],
          [side * 20, -190],
          [side * 8, -118],
        ],
        C.gold,
        sub(hand('wing'), side),
        { role: 'scenery', kind: 'cut', line: 2.5 },
      );
  });

  // The veil: a hanging of fine linen, drawn up into its folds as it opens.
  const drop = 510 * (1 - 0.88 * veil);
  const top = -520;
  piece(ctx, rounded(VEIL_X, top + drop / 2, 46, drop, 6), C.robe, hand('veil'), {
    role: 'scenery',
    kind: 'cut',
    line: 3,
  });
  for (const x of [-10, 8])
    stroke(
      ctx,
      line([VEIL_X + x, top + 12], [VEIL_X + x, top + drop - 12]),
      { color: C.paperTone, width: 2, jitter: 0.4, boil: 'none' },
      sub(hand('fold'), x),
    );
  piece(ctx, rounded(VEIL_X, top, 60, 14, 4), C.gold, hand('rod'), {
    role: 'scenery',
    kind: 'cut',
    line: 2.5,
  });
};

/** The high priest's hands, lifted in pleading: their scratch, written each frame. */
const PLEA_FAR: GestureAt = { to: [0, 0], reach: 0, grip: 'palm' };
const PLEA_NEAR: GestureAt = { to: [0, 0], reach: 0, grip: 'palm' };

/**
 * Christ as high priest standing at `spot` in the sanctuary's units: his
 * hands go up as `plead` goes 0..1 on the caller's cue, lifted as high as
 * `lift` 0..1 (a little at the altar of incense, fully before the ark);
 * `plate` 0..1 shows the breastplate.
 */
export const priestAt = (
  ctx: CanvasRenderingContext2D,
  hand: Hands,
  spot: Pt,
  plead: number,
  lift: number,
  plate: number,
) => {
  for (const [g, side] of [
    [PLEA_FAR, -1],
    [PLEA_NEAR, 1],
  ] as const) {
    g.to[0] = side * lerp(46, 72, lift);
    g.to[1] = lerp(-110, -196, lift);
    g.reach = plead;
  }
  at(ctx, { x: spot[0], y: spot[1], scale: IN_SANCTUARY }, () =>
    highPriest(
      ctx,
      {
        look: [3, -1 - 2 * plead * lift],
        browTilt: 0.3 + 0.2 * plead * lift,
        far: PLEA_FAR,
        near: PLEA_NEAR,
      },
      hand,
      plate,
    ),
  );
};

/**
 * The ministry now: the sanctuary with the veil drawn up and Christ pleading
 * before the ark in the most holy place, where `exchange` leaves him and
 * `rain` looks up to him. `light` 0..1 brightens its glory; `plead` 0..1
 * lifts his hands in pleading, on the caller's cue (`exchange` raises
 * them after its cut; `rain` finds them raised).
 */
export const ministry = (
  ctx: CanvasRenderingContext2D,
  hand: Hands,
  light: number,
  plead: number,
) => sanctuary(ctx, hand, 1, light, () => priestAt(ctx, hand, MOST_HOLY, plead, 1, 1));

// ─── the angel of Rev 14 ─────────────────────────────────────────────────────

/** Where `herald` hangs the banner's middle, left of the angel. */
const BANNER_X = -800;
/**
 * Where the angel's far hand takes the banner's leading pole, in the angel's
 * own units (`herald` hangs the banner at (`BANNER_X`, -150) and draws the
 * angel at 1.1, turned 0.06): the pole's near edge, the farthest back the
 * hand reaches.
 */
const POLE: Pt = [-135, -125];
/** The far hand on the pole: its scratch, its reach written each frame. */
const ON_POLE: GestureAt = { to: [POLE[0], POLE[1]], reach: 0, grip: 'hold' };

/**
 * The angel of Rev 14, feet at the origin, flying (+x): a person in white
 * with two cut-paper wings on its back. `flap` 0..1 raises the wings;
 * `hold` 0..1 sends its far hand back to the banner's pole (`herald` passes
 * its caller's cue; 0 leaves it at rest).
 */
export const angel = (ctx: CanvasRenderingContext2D, hand: Hands, flap: number, hold: number) => {
  const wing = (side: -1 | 1) =>
    at(ctx, { x: -18, y: -110, rot: side * (0.5 + 0.35 * flap) - 0.4 }, () =>
      piece(
        ctx,
        spline(
          [
            [0, 0],
            [-60, -40],
            [-150, -60],
            [-120, -20],
            [-150, 0],
            [-100, 20],
            [-40, 20],
          ],
          6,
          true,
        ),
        C.cream,
        sub(hand('wing'), side),
        { role: 'figure', line: 3.5 },
      ),
    );
  // Both wings behind the body, so the hand that holds the banner reaches
  // back over them to its pole.
  wing(-1);
  wing(1);
  ON_POLE.reach = hold;
  person(
    ctx,
    {
      body: C.robe,
      shade: C.robe,
      garment: 'robe',
      // Flying: no ground under the feet.
      ground: 0,
      tilt: 0.08,
      look: [4, -1],
      browTilt: 0.1,
      far: ON_POLE,
    },
    hand('angel'),
  );
};

/** The third angel's message, as Rev 14:12 words it. */
const BANNER = 'the commandments of God, and the faith of Jesus';

/**
 * The angel of Rev 14 flying in with the third angel's banner trailing to its
 * left, the angel's feet at the origin. `t` (seconds) sways the banner and
 * beats the wings; `written` 0..1 writes the banner's words (0 draws none);
 * `hold` 0..1 sends the angel's hand to the banner's pole, on the caller's cue.
 */
export const herald = (
  ctx: CanvasRenderingContext2D,
  hand: Hands,
  t: number,
  written: number,
  hold: number,
) => {
  at(ctx, { x: BANNER_X, y: -150 + Math.sin(t * 3) * 6, rot: 0.01 * Math.sin(t * 2) }, () => {
    const banner = plate(0, 0, 1220, 110);
    piece(ctx, banner, C.cream, hand('banner'), {
      role: 'scenery',
      kind: 'cut',
      line: 3.5,
      torn: 2,
    });
    for (const side of [-1, 1] as const)
      piece(ctx, rounded(side * 628, 0, 36, 96, 6), C.gold, sub(hand('bannerEnd'), side), {
        role: 'scenery',
        kind: 'cut',
        line: 3,
      });
    if (written <= 0) return;
    probePlate(ctx, banner, () =>
      write(
        ctx,
        BANNER,
        0,
        17,
        { family: F.display, size: 50, weight: 600, color: C.ink, align: 'center' },
        hand('bannerText'),
        { progress: written, reveal: 'write', boil: 0.3 },
      ),
    );
  });
  at(ctx, { x: 0, y: 0, scale: 1.1, rot: 0.06 }, () =>
    angel(ctx, hand, 0.5 + 0.5 * Math.sin(t * 5), hold),
  );
};
