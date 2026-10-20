// The seed, drawn to its Board (`seed.label` try 4, `seed.folded` and
// `seed.life` try 3): word's page as word leaves it, the accused alone on it
// in the peach light, the dry fig leaves at his feet. The leaves blow aside
// and the camera pushes in on the gold wax seal on his tunic, in cold's shape
// and scale (CRAFT rule 8), as the tablets beside him fade off the page. On
// "label" the seal lifts off, its R to the front, flat as a sticker, nothing
// behind it, the stain still there under where it was; his eyes go with it,
// then come to us, worried. On `seed` the verse's full-screen card, "The seed
// is the word of God.", "seed" large in gold, and a hard cut back on its last
// word; the seal turns over in the air and its back is a seed, small and
// plain, its gold unlit, and he is not impressed. On `alive` it rises, grows
// and opens along its seam in cross-section, the camera going with it until
// it floats alone on the page; on `folded` the blade curled in its hollow
// swells, green, its root and first two leaves folded tight. On `life` a warm
// light wakes in its heart and its gold glows as it comes back to him, the
// camera back on the two of them, his face at a third of the frame; on "own"
// he tips his head, interested despite himself, and on "Take" he leans in to
// it. The narration's words are on the one card alone (CRAFT rule 1): the
// one letter in the picture is the R in the seal's wax.

import {
  type CardWord,
  at,
  camera,
  drawing,
  fullCard,
  knobCamera,
  pushInto,
  pushOn,
  rounded,
  shotPath,
} from '@bible/film/canvas';
import { lerp } from '@bible/film/core';
import { EASE, type Expression, type Pt, acted, boilTime } from '@bible/film/style';
import { CARD_STYLE } from '../card.ts';
import { COURT_RIGS, type SealPose, living, seal } from '../court-cast.ts';
import { PLACE, contact } from '../court-set.ts';
import { piece } from '../kit.ts';
import { PAGE, cast, leaf, shafts, standingTablets, tabletsAt } from '../page-set.ts';
import { type OpenSeedPose, openSeed } from '../props.ts';
import { LEAD, LEAD_KNOBS } from '../rigs/lead-rig.ts';
import { cold } from './cold.ts';
import { LAST_FRAME, onHim, word } from './word.ts';

// ─── the page as word leaves it ──────────────────────────────────────────────

const L = LAST_FRAME;

/** His breath's period and its offset, as word breathes him (`living`), and his hands' bob with it. */
const BREATH = { period: 4, offset: 2.1 } as const;

/** How the gust takes the dry leaves: how far out it blows each, how far up, how far it turns it, how upright it stands it in the air. */
const GUST = { reach: 560, lift: 70, spin: 2.6, lie: 0.9 } as const;

/** The tablets beside him, lit as word leaves them (scratch: their stone rewritten each frame). */
const TABS = tabletsAt(L.tablets[0], L.tablets[1]);
TABS.lit.fill(1);

// ─── the seal and the seed ───────────────────────────────────────────────────

/** Where a thing floats on the page, Board pixels, and how tall it stands. */
interface Float {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

/**
 * Lifted off the stain beside him, clear of his side (`seed.label`): where
 * the seal floats, its size there against the one pressed on him, and how
 * tall the plain seed stands when it has turned over.
 */
const UP = { x: 618, y: 605, scale: 1.15, size: 62 } as const;
/** Opened, alone on the page, out from him (`seed.folded`). */
const ALONE: Float = { x: 870, y: 520, size: 200 };
/** Back beside his face, lit (`seed.life`). */
const BESIDE: Float = { x: 704, y: 539, size: 228 };

/** How high the seal's path arcs as it lifts off, and how far it and the seed bob as they float. */
const ARC = 30;
const HOVER = 3;
/** The seed's sway as it floats, radians, and the lean it comes back to him with (`seed.life`). */
const SWAY = 0.04;
const TURN_BESIDE = 0.08;

/**
 * The seed's ink, Board pixels: the seal's line where it turns over (its 3
 * at the size it floats), then, once it has risen, the cast's, as heavy as
 * his outline beside it (`seed.life`).
 */
const SEED_LINE = { small: 3 * UP.scale, risen: 5 } as const;
/** How much more its light swells on the last words. */
const SWELL = 0.4;

/** The shadow the floating seed lays on the page, down and right of it: its middle and its reach as shares of its height, and how dark. */
const SEED_SHADOW = { x: 0.2, y: 0.55, r: 0.28, alpha: 0.7 } as const;

/** The seal as word left it, pressed on him (scratch: its place rewritten each frame). */
const SEAL: SealPose = { x: 0, y: 0, rot: 0, scale: 1, shown: 1, glint: 0 };
/** The seed it turns into (scratch). */
const SEED: OpenSeedPose = {
  x: 0,
  y: 0,
  rot: 0,
  size: UP.size,
  open: 0,
  grown: 0,
  glow: 0,
  line: SEED_LINE.small,
  shown: 1,
};

/**
 * `draw` squeezed across to `k` (0..1) about the upright line through `x`:
 * a flat thing turning over in the air, edge on at 0.
 */
const across = (ctx: CanvasRenderingContext2D, x: number, k: number, draw: () => void) => {
  if (k <= 0.02) return;
  ctx.save();
  ctx.translate(x, 0);
  ctx.scale(k, 1);
  ctx.translate(-x, 0);
  draw();
  ctx.restore();
};

// ─── the lead ────────────────────────────────────────────────────────────────

/** Where he looks, from his feet: at us, and down at the seal on his chest. */
const GAZE = {
  us: [LEAD_KNOBS.gazeX, LEAD_KNOBS.gazeY],
  chest: [-10, -150],
} as const satisfies Record<string, Pt>;

/** "But when God says righteous,": down at the seal on him, sober. */
const ON_IT: Expression = { ...EASE, browY: 0.6, browTilt: 0.22, eyes: 0.9, mouth: -0.3 };
/** "it isn't a label": it lifts off, his brows up after it. */
const AFTER_IT: Expression = { ...EASE, browY: -1.8, browTilt: 0.16, eyes: 1.15, mouth: -0.2 };
/** "on the outside.": at us, worried (`seed.label`). */
const WORRIED: Expression = { ...EASE, browY: -0.8, browTilt: 0.5, eyes: 1, mouth: -0.45 };
/** "Jesus said,": at the seal, curious. */
const CURIOUS: Expression = { ...EASE, browY: -1, browTilt: 0.2, eyes: 1.05, mouth: -0.2 };
/** "A seed looks like nothing.": not impressed, the lids heavy. */
const UNIMPRESSED: Expression = { ...EASE, browY: 0.9, browTilt: 0.06, eyes: 0.78, mouth: -0.5 };
/** "But it's alive.": his brows up, an "oh". */
const STIRRED: Expression = { ...EASE, browY: -2.2, browTilt: 0.2, eyes: 1.2, mouthOpen: 0.4 };
/** As its light wakes: intrigued (`seed.life`). */
const INTRIGUED: Expression = { ...EASE, browY: -1.4, browTilt: 0.14, eyes: 1.1, mouth: -0.15 };
/** "own": interested, despite himself. */
const INTERESTED: Expression = {
  ...EASE,
  browY: -1.7,
  browTilt: 0.06,
  eyes: 1.14,
  eyeW: 1.03,
  mouth: 0.1,
};
/** "Take in His word": drawn to it, the start of a smile. */
const DRAWN: Expression = { ...EASE, browY: -1.2, browTilt: 0.18, eyes: 1.1, mouth: 0.4 };

/** How far his head tips on "own" (radians; below 0 its top goes to the page's left, as `seed.life` tips it), and how far he leans in on "Take". */
const TIP = -0.1;
const LEAN_IN = 0.06;

/** His numbers (scratch: every one he moves is rewritten each frame). */
const LN: Record<keyof typeof LEAD_KNOBS, number> = { ...LEAD_KNOBS };

/** The card's words from the quotation's opening mark to its closing one: Jesus' words, without "Jesus said," before them. */
const quoted = (words: ReadonlyArray<CardWord>): ReadonlyArray<CardWord> => {
  const from = words.findIndex((w) => w.text.startsWith('“'));
  const to = words.findIndex((w) => w.text.endsWith('”'));
  return from < 0 || to < from ? words : words.slice(from, to + 1);
};

export const seed = drawing({
  timeline: {
    // The dry leaves blow aside off the page, one after another, as the camera pushes in on the
    // seal over his stain, in cold's shape and scale, landing as he looks down at it on
    // "righteous"; the tablets fade off the page beside him.
    gust: { at: 'start', dur: 1.6, stagger: 0.5, ease: 'inQuad', track: 'leaves' },
    push: { at: 'start', until: { cue: 'down' }, ease: 'inOutSine', track: 'camera' },
    fade: { at: 'start', offset: 0.4, dur: 1.6, ease: 'inOutSine', track: 'law' },
    hold: {
      after: 'push',
      until: { cue: 'toLabel', edge: 'start' },
      ease: 'linear',
      track: 'camera',
    },
    // "But when God says righteous,": he looks down at the seal on him.
    down: { mark: 'label', word: 'righteous', dur: 0.5, track: 'lead' },
    // "it isn't a label": it lifts off, its R to the front, flat as a sticker, the stain still
    // there under where it was; his eyes go with it, and the camera to the two of them, landing
    // as he looks at us, worried, on "outside" (seed.label).
    lift: { mark: 'label', word: 'label', dur: 0.9, ease: 'inOutSine', track: 'seal' },
    follow: { mark: 'label', word: 'label', offset: 0.1, dur: 0.5, track: 'lead' },
    toLabel: {
      mark: 'label',
      word: 'label',
      until: { cue: 'worry' },
      ease: 'inOutSine',
      track: 'camera',
    },
    worry: { mark: 'label', word: 'outside', dur: 0.6, track: 'lead' },
    onLabel: { after: 'toLabel', until: 'alive', ease: 'linear', track: 'camera' },
    // "Jesus said,": he looks at the seal.
    regard: { mark: 'seed', dur: 0.6, track: 'lead' },
    // “The seed is the word of God.”: the verse's card, cut back on its last word.
    card: { mark: 'seed', word: 'The', until: { cue: 'back', edge: 'start' }, track: 'card' },
    back: { mark: 'seed', word: 'God', offset: 0.6, dur: 0, track: 'card' },
    // The seal turns over in the air: its back is a seed, small and plain, its gold unlit.
    flip: { after: 'back', offset: 0.15, dur: 0.6, ease: 'inOutSine', track: 'seal' },
    // "A seed looks like nothing.": he is not impressed.
    meh: { mark: 'seed', word: 'looks', dur: 0.6, track: 'lead' },
    // "But it's alive.": it rises and grows, the camera going with it, and opens along its seam.
    rise: { mark: 'alive', until: 'folded', ease: 'inOutSine', track: 'seed' },
    open: { mark: 'alive', word: 'alive', dur: 0.9, ease: 'outCubic', track: 'seed' },
    stir: { mark: 'alive', word: 'alive', dur: 0.4, track: 'lead' },
    // "The life of the whole plant is folded up inside.": the blade in its hollow swells, folded
    // tight (seed.folded).
    unfold: { mark: 'folded', dur: 1.4, ease: 'inOutSine', track: 'seed' },
    onOpen: { after: 'rise', until: 'life', ease: 'linear', track: 'camera' },
    // "In the same way, every word God speaks carries His own life.": a warm light wakes in its
    // heart and its gold glows; it comes back to him, the camera with it to the two of them.
    wake: { mark: 'life', dur: 1.6, ease: 'inOutSine', track: 'seed' },
    come: { mark: 'life', dur: 2.2, ease: 'inOutSine', track: 'seed' },
    // "own": he tips his head, interested despite himself; "Take": he leans in to it.
    tip: { mark: 'life', word: 'own', dur: 0.7, track: 'lead' },
    lean: { mark: 'life', word: 'Take', dur: 0.9, track: 'lead' },
    // "and you take in His life.": its light swells.
    swell: { at: 'speechEnd', dur: 1.2, ends: true, ease: 'inOutSine', track: 'seed' },
    onLife: { after: 'come', until: { at: 'end' }, ease: 'linear', track: 'camera' },
  },
  knobs: {
    // How much closer the camera creeps while a framing holds.
    creep: 1.05,
    // The seal lifted off beside him, his face at a third of the frame (seed.label).
    label: [575, 584],
    labelZoom: 3.4,
    // The seed opened, alone on the page (seed.folded).
    folded: [870, 520],
    foldedZoom: 3.8,
    // Back on the two of them, wider than his label: his hands in, the seed lit beside him over its shadow (seed.life).
    life: [590, 561],
    lifeZoom: 2.5,
  },
  // The court's rigs: him and his hands.
  rigs: COURT_RIGS,
  // The page's own light, as word leaves it.
  light: L.light,
  draw: (f) => {
    const { ctx, w, h } = f;
    const [fx, fy] = L.lead;

    // ── the camera: from word's last framing in on the seal as cold frames it, then each
    // framing on its beat, a slow creep while one holds
    const creep = f.knob('creep');
    const wordShot = f.knobsOf(word);
    const coldShot = f.knobsOf(cold);
    const [sealX, sealY] = coldShot('seal');
    const onSeal = knobCamera(
      [fx + sealX - PLACE.lead[0], fy + sealY - PLACE.lead[1]],
      coldShot('sealZoom'),
    );
    const label = knobCamera(f.knob('label'), f.knob('labelZoom'));
    const folded = knobCamera(f.knob('folded'), f.knob('foldedZoom'));
    const life = knobCamera(f.knob('life'), f.knob('lifeZoom'));
    const cam = shotPath(knobCamera(wordShot('look'), wordShot('lookZoom')), [
      [f.at('push'), onSeal, pushInto],
      [f.at('hold'), pushOn(onSeal, creep, 1)],
      [f.at('toLabel'), label, pushInto],
      [f.at('onLabel'), pushOn(label, creep, 1)],
      // With the seed as it rises, and with it as it comes back.
      [f.at('rise'), folded],
      [f.at('onOpen'), pushOn(folded, creep, 1)],
      [f.at('come'), life],
      [f.at('onLife'), pushOn(life, creep, 1)],
    ]);

    // ── the seal: lifted off the stain on "label" to float beside him; turned over after the card,
    // it is the seed, which rises, grows and opens on `alive`, and comes back to him on `life`
    const lean = LEAN_IN * f.at('lean');
    const lifted = f.at('lift');
    const hovering = (amount: number) => amount * Math.sin(f.t * 1.3);
    const [stainX, stainY] = onHim([LEAD.stain.x, LEAD.stain.y], lean);
    SEAL.x = lerp(stainX, UP.x, lifted);
    SEAL.y =
      lerp(stainY, UP.y, lifted) - ARC * Math.sin(Math.PI * lifted) + hovering(HOVER * lifted);
    SEAL.scale = lerp(1, UP.scale, lifted);
    SEAL.rot = 0.12 * Math.sin(Math.PI * lifted);
    const rise = f.at('rise');
    const come = f.at('come');
    SEED.x = lerp(lerp(UP.x, ALONE.x, rise), BESIDE.x, come);
    SEED.y = lerp(lerp(UP.y, ALONE.y, rise), BESIDE.y, come) + hovering(HOVER);
    SEED.size = UP.size * (ALONE.size / UP.size) ** rise * (BESIDE.size / ALONE.size) ** come;
    SEED.rot = SWAY * Math.sin(f.t * 0.9) + TURN_BESIDE * come;
    SEED.line = lerp(SEED_LINE.small, SEED_LINE.risen, rise);
    SEED.open = f.at('open');
    SEED.grown = f.at('unfold');
    SEED.glow = f.at('wake') + SWELL * f.at('swell');
    // Face up, the seal; turned past edge on, the seed.
    const face = Math.cos(f.at('flip') * Math.PI);
    const thing: Pt = face > 0 ? [SEAL.x, SEAL.y] : [SEED.x, SEED.y];

    // ── the lead: his face and his eyes on each beat, his head, his lean
    acted(LN, L.face, [
      [ON_IT, f.at('down')],
      [AFTER_IT, f.at('follow')],
      [WORRIED, f.at('worry')],
      [CURIOUS, f.at('regard')],
      [UNIMPRESSED, f.at('meh')],
      [STIRRED, f.at('stir')],
      [INTRIGUED, f.at('wake')],
      [INTERESTED, f.at('tip')],
      [DRAWN, f.at('lean')],
    ]);
    const gaze = (axis: 0 | 1) => {
      const on = thing[axis] - L.lead[axis];
      let g: number = GAZE.us[axis];
      g = lerp(g, GAZE.chest[axis], f.at('down'));
      g = lerp(g, on, f.at('follow'));
      g = lerp(g, GAZE.us[axis], f.at('worry'));
      return lerp(g, on, f.at('regard'));
    };
    LN.gazeX = gaze(0);
    LN.gazeY = gaze(1);
    const looking = f.at('down') * (1 - f.at('follow'));
    LN.nod = 5 * looking;
    LN.faceY = 12 * looking;
    LN.lean = lean;
    LN.tilt = 0.05 * (1 - f.at('down')) + TIP * f.at('tip') + 0.012 * Math.sin(f.t * 0.7);

    // His hands, floating beside him, bobbing with his breath.
    const breathing = (f.t + BREATH.offset) * ((2 * Math.PI) / BREATH.period);
    const restOf = (side: Pt): Pt => {
      const [x, y] = onHim(side, lean);
      return [x, y + L.bob * Math.sin(breathing)];
    };
    const hand = (p: Pt) =>
      at(ctx, { x: p[0], y: p[1] }, () =>
        f.rive('leadHand', { timelines: [['boil', boilTime(f.boil)]], size: L.handScale }),
      );

    // ── the dry leaves, blown off the page one after another
    const leaves = () =>
      L.leaves.forEach((p, i) => {
        const k = f.stagger('gust', i, L.leaves.length);
        if (k >= 1) return;
        const side = p.at[0] < fx ? -1 : 1;
        leaf(ctx, {
          x: p.at[0] + side * GUST.reach * k,
          y: p.at[1] - GUST.lift * k,
          rot: p.rot + side * GUST.spin * k,
          scale: 1,
          curl: 1,
          lie: lerp(0.5, GUST.lie, k),
        });
      });

    // ── the seal or the seed, and the seed's shadow on the page
    TABS.stone = 1 - f.at('fade');
    const shadow = () => {
      if (face > 0 || !(rise > 0)) return;
      ctx.save();
      ctx.globalAlpha *= SEED_SHADOW.alpha * rise;
      contact(
        ctx,
        SEED.x + SEED_SHADOW.x * SEED.size,
        SEED.y + SEED_SHADOW.y * SEED.size,
        SEED_SHADOW.r * SEED.size,
      );
      ctx.restore();
    };
    const floating = () => {
      if (face > 0) across(ctx, SEAL.x, face, () => seal(ctx, SEAL));
      else across(ctx, SEED.x, -face, () => openSeed(ctx, SEED));
    };

    // ── the page, everything on it under the camera
    piece(ctx, rounded(w / 2, h / 2, L.sheet.w, L.sheet.h, 0), PAGE, f.handsOf(word)('page'), {
      role: 'scenery',
      kind: 'torn',
      torn: 4,
      shadow: 0,
    });
    shafts(ctx, w, h);
    camera(ctx, cam, w, h, () => {
      cast(ctx, fx - 46, fx + 46, fy, LEAD.height, 0.6);
      contact(ctx, fx, fy + 2, 95);
      standingTablets(ctx, TABS);
      shadow();
      at(ctx, { x: fx, y: fy }, () =>
        f.rive('lead', { timelines: living(f, BREATH.period, BREATH.offset), numbers: LN }),
      );
      leaves();
      floating();
      hand(restOf(L.hands.far));
      hand(restOf(L.hands.near));
    });
  },
  cards: [
    {
      cue: 'card',
      from: 'seed',
      to: 'alive',
      payoff: 'seed',
      draw: (f, words) => fullCard(f, quoted(words), CARD_STYLE),
    },
  ],
});
