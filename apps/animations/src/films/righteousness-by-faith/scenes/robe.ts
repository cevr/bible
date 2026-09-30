// The robe: the heavenly court from `accuser`, now quiet. Those standing by
// lift the filthy clothes off Joshua and carry them out left (Zech 3:4); the
// last speck lifts from his cheek; Christ reaches out to him. Then a push
// into the light, where a loom weaves a robe with no hand at it but light,
// and the robe settles on Joshua. The doubt is a tiny cloak dropped
// over a stain and flicked away; the answer is a look beneath the robe: the
// stain is there on the grey paper, and on "away" it breaks up and is carried
// out of the frame the way the clothes went, leaving clean paper (never a
// flight into the sky, as if sin had no destination). On "judicial" the court
// again, Joshua robed, the cold open's gavel resting on the bench: the ruling
// stands, and a warm glow begins to rise in Joshua's chest, more than the
// ruling. On "reclaim" close on Joshua's face, and under the robe that glow
// rises where the heart is, a preview
// of the third gift, and he looks up glad on "reclaiming". The close-up
// holds through the quotation's last word; then, in the scene's tail, the
// pull back to the icon row at the section head (`ICON_ROW`), faith still
// glowing and the robe (forgiveness) lit; as it lights, a plate under the
// robe calls back `woman`'s temple court, framed wide as on "go", the woman
// forgiven and in white. `within` opens on this row.

import {
  type Camera,
  type Frame,
  type Gesture,
  type Pt,
  at,
  camera,
  drawing,
  ellipseShape,
  rectShape,
  stroke,
  sub,
} from '@bible/film/canvas';
import { clamp, ease, lerp } from '@bible/film/core';
import {
  C,
  ICON_KEPT,
  ICON_ROW,
  ICON_SKY,
  ICON_X,
  type IconCount,
  type Person,
  type Posed,
  ROBE,
  blob,
  gait,
  glow,
  icons,
  person,
  piece,
  rounded,
  sky,
  turban,
} from '../kit.ts';
import { COURT_BENCH, JOSHUA, JS, ZECH_REST, courtWall, gavel, zechCourt } from '../court.ts';
import { COURT_FORGIVEN, RECALL_RISE, recall, temple } from '../gospel.ts';
import { LIGHT } from '../light.ts';

const LOOM: Pt = [1045, 560];

/** The stain beneath the robe, as the flakes it breaks into: each one's place in the lens, and its size. */
const FLAKES: ReadonlyArray<readonly [number, number, number]> = [
  [-40, -30, 70],
  [30, -46, 60],
  [52, 12, 66],
  [-6, 30, 74],
  [-58, 34, 52],
  [14, -4, 58],
];
/** How far left the flakes are carried: out of the frame, the way the clothes went. */
const CARRIED = 1500;

/** Where the gavel lies on the bench: its handle's foot, the head to its left. */
const GAVEL_ON: Pt = [COURT_BENCH[0], COURT_BENCH[1] - 36];
/** Lying on its side, the handle down the bench to the left of its head. */
const GAVEL_LIE = -Math.PI / 2 + 0.22;
/** Joshua's chest in the court: `JS` times the person's chest height above his feet. */
const JOSHUA_CHEST_Y = JOSHUA[1] - 80 * JS;

/** Christ's hand reaching out to Joshua on "clothe", open; its reach rewritten each frame (scratch). */
const REACHING: Posed<Gesture> = { to: [-64, -108], reach: 0, grip: 'open' };
const reachingOut = (reach: number): Gesture => {
  REACHING.reach = reach;
  return REACHING;
};

/** A little loom, as a shape of light. */
const loomFrame = (
  ctx: CanvasRenderingContext2D,
  s: number,
  hand: (k: string) => { boil: number; seed: number },
) => {
  for (const x of [-70, 70])
    piece(ctx, rounded(x * s, 0, 14 * s, 190 * s, 4 * s), C.gold, hand(`post${x}`), {
      role: 'scenery',
      kind: 'cut',
      line: 2.5,
    });
  for (const y of [-86, 86])
    piece(ctx, rounded(0, y * s, 170 * s, 16 * s, 4 * s), C.gold, hand(`beam${y}`), {
      role: 'scenery',
      kind: 'cut',
      line: 2.5,
    });
};

const timeline = {
  lift: { mark: 'take', offset: 0.33, dur: 1.5 },
  carry: { mark: 'take', word: 'him', offset: -0.1, dur: 2.75, ease: 'inOutSine' },
  specks: { with: 'carry', offset: 0.4, dur: 0.8 },
  speck: { mark: 'pass', dur: 1.17 },
  reachOut: { mark: 'clothe', dur: 0.75 },
  loomIn: { mark: 'loom', offset: -0.33, dur: 0.67 },
  pushLoom: { mark: 'loom', offset: 0.33, dur: 1.17 },
  // The loom weaves as soon as the push reaches it, so the robe rises from it
  // before "So is it a cover-up?" and the cloak's hover plays on its word.
  weave: { after: 'pushLoom', dur: 2.9, ease: 'linear' },
  robeUp: { after: 'weave', dur: 0.4 },
  settle: { after: 'robeUp', dur: 0.75, ease: 'outSoft' },
  lookDown: { after: 'settle', dur: 0.5 },
  // The robe's glow comes up on him once it has settled.
  glowUp: { after: 'settle', dur: 0.25, ease: 'linear' },
  hover: { mark: 'nicer', dur: 0.4 },
  cover: { mark: 'just', offset: 0.1, dur: 0.4, ease: 'outBack' },
  flick: { mark: 'no', dur: 0.5, ease: 'inCubic' },
  lens: { mark: 'cloak', offset: 0.1, dur: 0.57, ease: 'outBack' },
  flakes: { mark: 'away', dur: 0.9, ease: 'inQuad', stagger: 0.5 },
  shut: { after: 'flakes', dur: 0.33 },
  drift: { mark: 'judicial', until: 'reclaim', ease: 'linear' },
  beyond: { mark: 'judicial', until: 'reclaim', ease: 'inOutSine' },
  warm: { mark: 'reclaim', offset: 0.4, dur: 2.2, ease: 'inOutSine' },
  glad: { mark: 'reclaiming', dur: 0.6 },
  toIcons: { at: 'speechEnd', dur: 0.27 },
  pullBack: { with: 'toIcons', dur: 0.7, ease: 'outCubic' },
  // The robe pops forward in gold as the row settles, the heart faded back.
  iconGlow: { after: 'toIcons', dur: 0.6, ease: 'outBack' },
  // The callback to `roof`'s court under the robe, arriving with the pull back and held to the scene's end (the tail).
  forgiven: { with: 'toIcons', dur: 0.3 },
} as const;

const knobs = {
  /** The court on "judicial", framed on Joshua, the Angel and the bench; it drifts in toward "reclaim". */
  judged: [1180, 600],
  /** How much of the first light is left once the loom has woven: the rest is day. */
  woven: 0.5,
} as const;
const JUDGED_ZOOM = [1.22, 1.3] as const;

type RobeFrame = Frame<keyof typeof timeline & string, typeof knobs>;

/** The first light, its amount rewritten each frame (scratch). */
const DAWN = { ...LIGHT.firstLight, amount: 1 };

export const robe = drawing({
  timeline,
  knobs,
  // The day comes up as the loom weaves the robe: the first light lifts.
  light: (f) => {
    DAWN.amount = 1 - (1 - f.knob('woven')) * f.at('weave');
    return DAWN;
  },
  draw: (f) => {
    const { t } = f;
    if (t < f.cue('pushLoom').end) courtWide(f);
    else if (t < f.cue('robeUp').end) weaving(f);
    else if (t < f.mark('nicer')) robed(f);
    else if (t < f.mark('cloak')) cloaked(f);
    else if (t < f.mark('judicial')) beneath(f);
    else if (t < f.mark('reclaim')) judged(f);
    else {
      const toIcons = f.at('toIcons');
      if (toIcons < 1) reclaimed(f);
      if (toIcons > 0) iconsBack(f, toIcons);
    }
  },
});

/** A: the court, wide, until the push reaches the loom. */
const courtWide = (f: RobeFrame) => {
  const { ctx, w, h, t } = f;
  const { hand } = f;
  const lift = f.at('lift');
  const carry = f.at('carry');
  const bob = gait(t, f.cue('carry'));
  const away = -1250 * carry;
  const push = f.at('pushLoom');
  const cam: Camera = {
    x: lerp(ZECH_REST.x, LOOM[0], push),
    y: lerp(ZECH_REST.y, LOOM[1], push),
    zoom: lerp(ZECH_REST.zoom ?? 1, 4.2, ease.inCubic(push)),
  };
  courtWall(ctx, w, h);
  camera(ctx, cam, w, h, () => {
    const reachOut = f.at('reachOut');
    const pass = f.at('speck');
    zechCourt(ctx, hand, {
      sun: 0,
      accuser: { enter: 1, shrink: 1, point: 0 },
      // Christ, in white and gold, reaching out to Joshua on "clothe".
      angel: { lift: 0, tilt: -0.06 * reachOut, reach: reachingOut(reachOut) },
      // Joshua, the specks going from his skin.
      joshua: { tilt: 0.1 * (1 - pass), look: [2 * reachOut, 0], browTilt: 0.2 + 0.3 * pass },
      specks: 1 - f.at('specks'),
      cheek: { dy: -66 * pass, alpha: 1 - clamp((pass - 0.3) / 0.7) },
      // The filthy clothes, lifted over his head and carried out left.
      tunic: { at: [JOSHUA[0] + away, JOSHUA[1] - 250 * lift - bob], flare: () => 0 },
      helpers: { grip: 1, dx: away, bob, up: lift },
    });

    // The loom gathers in the light.
    const loomIn = f.at('loomIn');
    if (loomIn > 0)
      at(ctx, { x: LOOM[0], y: LOOM[1] }, () => {
        ctx.save();
        ctx.globalAlpha *= loomIn;
        glow(ctx, 0, 0, 180, C.robe, 0.9);
        loomFrame(ctx, 1, hand);
        for (let x = -54; x <= 54; x += 12)
          piece(ctx, rectShape(x - 1, -80, 2.5, 160), C.robe, sub(hand('warpS'), x), {
            role: 'scenery',
            kind: 'cut',
            line: 0,
            torn: 0,
            shadow: 0,
          });
        ctx.restore();
      });
  });
};

/** B: the loom in the light, weaving through the quotation. */
const weaving = (f: RobeFrame) => {
  const { ctx, w, h } = f;
  const { hand } = f;
  const weave = f.at('weave');
  const robeUp = f.at('robeUp');
  ctx.fillStyle = C.gold;
  ctx.fillRect(0, 0, w, h);
  glow(ctx, 960, 540, 1200, C.robe, 1);
  glow(ctx, 960, 540, 800, C.glow, 0.8);
  at(ctx, { x: 960, y: 560 }, () => loomFrame(ctx, 4.8, hand));
  // The cloth grows down the warp, row by row.
  const bottom = lerp(190, 850, weave);
  ctx.save();
  ctx.globalAlpha *= 1 - robeUp;
  piece(ctx, rectShape(600, 190, 720, bottom - 190), C.robe, hand('cloth'), {
    role: 'scenery',
    kind: 'cut',
    line: 0,
    torn: 0,
    shadow: 0.3,
  });
  for (let y = 212; y < bottom; y += 22) {
    ctx.fillStyle = `${C.paperTone}40`;
    ctx.fillRect(600, y, 720, 2);
  }
  ctx.restore();
  for (let x = 612; x < 1320; x += 24)
    piece(ctx, rectShape(x, 180, 3, 760), `${C.robe}b0`, sub(hand('warp'), x), {
      role: 'scenery',
      kind: 'cut',
      line: 0,
      torn: 0,
      shadow: 0,
    });
  // The shuttle: a spark of light crossing and recrossing.
  if (weave < 1) {
    const pass = weave * 30;
    const along = ease.inOutSine(pass % 1);
    const x = Math.floor(pass) % 2 === 0 ? lerp(600, 1320, along) : lerp(1320, 600, along);
    glow(ctx, x, bottom, 110, C.robe, 1);
    piece(ctx, ellipseShape(x, bottom, 17, 17), C.robe, hand('spark'), {
      role: 'scenery',
      line: 0,
      shadow: 0,
    });
  }
  if (robeUp > 0)
    at(ctx, { x: 960, y: 540 - 70 * robeUp }, () => {
      ctx.save();
      ctx.globalAlpha *= robeUp;
      piece(ctx, ROBE, C.robe, hand('bigRobe'), { role: 'scenery', kind: 'cut', line: 6 });
      ctx.restore();
    });
};

/** B2: close on Joshua's face as the robe settles on him. */
const robed = (f: RobeFrame) => {
  const { ctx, w, h } = f;
  const { hand } = f;
  const down = f.at('lookDown');
  // The robe comes up onto him from below, clear of his face.
  const drop = lerp(560, 0, f.at('settle'));
  courtWall(ctx, w, h);
  at(ctx, { x: 960, y: 430 + 165 * 6, scale: 6 }, () =>
    person(
      ctx,
      { onHead: turban, look: [0, 4 * down], nod: 1.5 * down, browTilt: 0.25 * down },
      hand('face'),
    ),
  );
  glow(ctx, 960, 720, 450, C.glow, (1 - Math.abs(down - 0.6)) * f.at('glowUp'));
  at(ctx, { x: 960, y: 660 + drop }, () =>
    piece(
      ctx,
      [
        [-150, -10],
        [150, -10],
        [600, 280],
        [640, 520],
        [-640, 520],
        [-600, 280],
      ],
      C.robe,
      hand('robeOn'),
      { role: 'figure', line: 7 },
    ),
  );
};

/** C: the doubt, a tiny cloak over a stain. */
const cloaked = (f: RobeFrame) => {
  const { ctx, w, h, t } = f;
  const { hand } = f;
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, w, h);
  piece(ctx, blob(960, 700, 330, 210, 41), C.scarlet, hand('stainC'), {
    role: 'scenery',
    line: 0,
    torn: 4,
  });
  const cover = f.at('cover');
  const flick = f.at('flick');
  const hover = f.at('hover');
  const bob = Math.sin((t - f.mark('nicer')) * 3.2) * 14 * (1 - cover);
  at(
    ctx,
    {
      x: 960 + 740 * flick,
      y: lerp(400 + bob, 655, cover) - 200 * flick,
      rot: 1.1 * flick,
      scale: hover * (cover > 0 && cover < 1 ? 1 + 0.12 * Math.sin(cover * Math.PI) : 1),
    },
    () => {
      ctx.save();
      ctx.globalAlpha *= 1 - flick;
      piece(
        ctx,
        [
          [-40, -80],
          [40, -80],
          [130, 90],
          [60, 70],
          [0, 96],
          [-60, 70],
          [-130, 90],
        ],
        C.inkSoft,
        hand('cloak'),
        { role: 'scenery', kind: 'cut', line: 5, outline: C.ink },
      );
      piece(ctx, ellipseShape(0, -70, 11, 11), C.gold, hand('clasp'), {
        role: 'scenery',
        kind: 'cut',
        line: 3,
      });
      ctx.restore();
    },
  );
};

/** Close on Joshua in the robe, his face at human scale: `beneath` and `reclaimed` share it. */
const closeOnJoshua = (f: RobeFrame, pose: Person) => {
  const { ctx, w, h, hand } = f;
  courtWall(ctx, w, h);
  ctx.save();
  ctx.translate(960, 330 + 165 * FACE_SCALE);
  ctx.scale(FACE_SCALE, FACE_SCALE);
  person(ctx, pose, hand('faceD'));
  ctx.restore();
  piece(ctx, ROBE_D, C.robe, hand('robeD'), { role: 'figure', line: 7 });
};
/** Joshua's scale close on his face. */
const FACE_SCALE = 4.6;
const ROBE_D: Pt[] = [
  [840, 550],
  [1080, 550],
  [1520, 790],
  [1580, 1250],
  [340, 1250],
  [400, 790],
];
const JOSHUA_DOWN: Person = { onHead: turban, look: [0, 3.5], browTilt: 0.25 };
/** Joshua reclaimed, looking up glad: rewritten each frame, never made per frame. */
const GLAD_LOOK: [number, number] = [0, 0];
const GLAD: Person = { onHead: turban, look: GLAD_LOOK };

/**
 * D: beneath the robe. The lens opens on the stain there, and on "away" it
 * breaks into its flakes and each is carried out left, the way the clothes
 * went, leaving clean grey paper; then the lens shuts.
 */
const beneath = (f: RobeFrame) => {
  const { ctx } = f;
  const { hand } = f;
  closeOnJoshua(f, JOSHUA_DOWN);
  const open = f.at('lens') * (1 - f.at('shut'));
  if (open > 0.01)
    at(ctx, { x: 960, y: 850, scale: open }, () => {
      piece(ctx, ellipseShape(0, 0, 190, 190), C.figure, hand('lensBody'), {
        role: 'figure',
        line: 0,
        torn: 0,
      });
      stroke(
        ctx,
        [...ellipseShape(0, 0, 190, 190), [190, 0]],
        { color: C.outline, width: 8, jitter: 0.8, taper: 0, boil: 'crawl', closed: true },
        hand('lensRing'),
      );
      stroke(
        ctx,
        Array.from({ length: 12 }, (_, i): Pt => {
          const a = Math.PI * (1.08 + 0.3 * (i / 11));
          return [Math.cos(a) * 160, Math.sin(a) * 160];
        }),
        { color: C.robe, width: 7, alpha: 0.85, taper: 0.3, boil: 'crawl' },
        hand('lensLight'),
      );
    });
  // The stain, as its flakes, carried off out of frame.
  FLAKES.forEach(([x, y, s], i) => {
    const p = f.stagger('flakes', i, FLAKES.length);
    const shown = p > 0 ? 1 : open;
    if (shown <= 0.01) return;
    at(
      ctx,
      {
        x: 960 + x - CARRIED * p,
        y: 850 + y + 160 * p,
        rot: -0.8 * p,
        scale: p > 0 ? 1 : open,
      },
      () =>
        piece(ctx, blob(0, 0, s, s * 0.8, 70 + i), C.scarlet, hand(`flake${i}`), {
          role: 'figure',
          line: 0,
          shadow: 0.15,
        }),
    );
  });
};

/**
 * D2: the court on "judicial", Joshua robed. The cold open's gavel rests on
 * the bench, the ruling standing; over the line a warm glow rises in
 * Joshua's chest, the "more than" a ruling.
 */
const judged = (f: RobeFrame) => {
  const { ctx, w, h } = f;
  const { hand } = f;
  const beyond = f.at('beyond');
  const [jx, jy] = f.knob('judged');
  courtWall(ctx, w, h);
  camera(
    ctx,
    { x: jx, y: jy, zoom: lerp(JUDGED_ZOOM[0], JUDGED_ZOOM[1], f.at('drift')) },
    w,
    h,
    () => {
      zechCourt(ctx, hand, {
        sun: 0,
        accuser: { enter: 1, shrink: 1, point: 0 },
        angel: { lift: 0, tilt: 0 },
        joshua: {
          body: C.robe,
          shade: C.robe,
          garment: 'robe',
          look: [2, 0],
          browTilt: 0.25,
          smile: 0.2,
        },
        specks: 0,
        cheek: { dy: 0, alpha: 0 },
        // The clothes and those who carried them, gone out left.
        tunic: { at: [JOSHUA[0] - 1250, JOSHUA[1]], flare: () => 0 },
        helpers: { grip: 1, dx: -1250, bob: 0, up: 1 },
      });
      gavel(ctx, hand, { x: GAVEL_ON[0], y: GAVEL_ON[1], rot: GAVEL_LIE });
      // The glow rising in his chest, beyond the verdict.
      glow(ctx, JOSHUA[0], JOSHUA_CHEST_Y, 90 + 110 * beyond, C.glow, 0.8 * beyond);
      glow(ctx, JOSHUA[0], JOSHUA_CHEST_Y, 40 + 40 * beyond, C.gold, 0.4 * beyond);
    },
  );
};

/**
 * D3: on "reclaim", close on Joshua's face again; under the robe a warm glow
 * rises where the heart is, and he looks up, glad, on "reclaiming".
 */
const reclaimed = (f: RobeFrame) => {
  const { ctx } = f;
  const warm = f.at('warm');
  const glad = f.at('glad');
  ctx.save();
  // A slow push in on him while the glow rises.
  ctx.translate(960, 700);
  ctx.scale(1 + 0.06 * warm, 1 + 0.06 * warm);
  ctx.translate(-960, -700);
  GLAD_LOOK[1] = lerp(3.5, -1, glad);
  GLAD.browTilt = lerp(0.25, 0.35, glad);
  GLAD.browL = 2 * glad;
  GLAD.browR = 2 * glad;
  GLAD.smile = 0.6 * glad;
  closeOnJoshua(f, GLAD);
  const y = lerp(930, 800, warm);
  // Already rising from "judicial", it swells as he is reclaimed.
  const lit = lerp(0.5, 1, warm);
  glow(ctx, 960, y, 360, C.glow, 0.85 * lit);
  glow(ctx, 960, y, 150, C.gold, 0.45 * lit);
  ctx.restore();
};

/** The icons' glow: faith kept from its section, the robe lighting; rewritten each frame, never made per frame. */
const ICONS_LIT: [number, number, number] = [ICON_KEPT, 0, 0];
/** The robe leading as it lights, the heart faded. */
const ICONS_LEAD: [number, number, number] = [0, 0, 0];
const ICONS_COUNT: Posed<IconCount> = { lead: ICONS_LEAD, dim: 1 };

/** E: after the quotation, pull back to the section head's icon row, the robe lit and leading. */
const iconsBack = (f: RobeFrame, toIcons: number) => {
  const { ctx, w, h, hand } = f;
  const pull = f.at('pullBack');
  const glowing = f.at('iconGlow');
  ICONS_LIT[1] = 0.4 + 0.6 * clamp(glowing);
  ICONS_LEAD[1] = glowing;
  const forgiven = f.at('forgiven');
  ctx.save();
  ctx.globalAlpha *= toIcons;
  sky(ctx, w, h, ICON_SKY);
  // The row rises as the callback opens under the robe, the robe itself left whole.
  const y = lerp(-160, ICON_ROW.y, pull) - RECALL_RISE * forgiven;
  at(ctx, { x: ICON_ROW.x, y, scale: lerp(ICON_ROW.close, ICON_ROW.scale, pull) }, () => {
    icons(ctx, hand, ICONS_LIT, undefined, ICONS_COUNT);
    at(ctx, { x: ICON_X[1], y: 0 }, () =>
      recall(
        ctx,
        hand,
        forgiven,
        () => temple(ctx, w, h, f.handsOf('woman'), COURT_FORGIVEN),
        ICONS_LEAD[1],
      ),
    );
  });
  ctx.restore();
};
